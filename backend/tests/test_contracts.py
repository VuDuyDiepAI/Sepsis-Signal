import hashlib
import json
from pathlib import Path
from copy import deepcopy
from datetime import datetime, timezone
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select, update, insert, func

from backend.app.main import create_app
from backend.app.auth import Auth, verify_password, token_hash, password_hash, SESSION_SECONDS
from backend.app.db import tables as t
from backend.app.db.store import ClinicalError
from backend.app.schemas import ScoreInput
from backend.app.scoring import predict, process_one
from backend.app.identity import fixture_prediction
from backend.app.emr import EMREvent, ingest, UNITS

ROOT=Path(__file__).resolve().parents[2]
GOLDEN=json.loads((ROOT/'tests/fixtures/sepsis_scoring_golden.json').read_text(encoding='utf-8'))
BASE=GOLDEN['cases'][0]['input']


def prepared(store):
    store.create(BASE['profile'])
    return store.save_input(BASE['profile']['id'],0,BASE['entries'][0] | {'hour':1})


def login(client,name='bacsi.demo1'):
    r=client.post('/api/auth/login',json={'username':name,'password':'SepsisDemo2026!'})
    assert r.status_code==200,r.text
    return r.json()['user']


def test_fixture_identities_match_legacy_node(store):
    reference=json.loads((ROOT/'tests/fixtures/legacy_web_identity.json').read_text())
    assert {p['id']:fixture_prediction(p,store.source['provenance']['sourceSha256'])['id']
            for p in store.source['predictions']} == reference['fixtureIds']
    assert verify_password(reference['password'],reference['passwordHash'])


def test_authentication_expiry_revocation_and_roles(store):
    auth=Auth(store)
    result=auth.login('BACSI.DEMO1','SepsisDemo2026!',1000)
    assert auth.session(result['token'],1001)['id']==result['user']['id']
    assert auth.session(result['token'],1000+SESSION_SECONDS*1000) is None
    auth.logout(result['token'])
    assert auth.session(result['token'],1001) is None
    auth.provision('viewer.a','Strong-test-2026!','Read only',role='viewer')
    with TestClient(create_app(store.settings,store),base_url='http://127.0.0.1:3100') as client:
        assert client.post('/api/auth/login',json={'username':'viewer.a','password':'Strong-test-2026!'}).status_code==200
        assert client.get('/api/clinical-state').status_code==200
        assert client.post('/api/cases',json=BASE['profile']).status_code==403


def test_failed_logins_commit_and_lock_across_auth_instances(store):
    auth=Auth(store)
    for _ in range(5):
        with pytest.raises(ClinicalError) as error:
            auth.login('bacsi.demo1','wrong',1000)
        assert error.value.status==401
    with pytest.raises(ClinicalError) as error:
        Auth(store).login('bacsi.demo1','SepsisDemo2026!',1001)
    assert error.value.status==429
    assert auth.login('bacsi.demo1','SepsisDemo2026!',301001)['user']['username']=='bacsi.demo1'


def test_cookie_origin_unauthenticated_and_stale_actor_guards(store):
    with TestClient(create_app(store.settings,store),base_url='http://127.0.0.1:3100') as client:
        assert client.get('/api/clinical-state').status_code==401
        assert client.post('/api/cases',json={}).status_code==401
        actor=login(client)
        cookie=client.cookies.get('sepsis_session')
        assert cookie and len(cookie)==43
        assert client.post('/api/cases',json=BASE['profile'],headers={'origin':'https://foreign.example'}).status_code==403
        assert client.post('/api/cases',json=BASE['profile'],headers={'X-Sepsis-User':'stale-user'}).status_code==409
        assert client.post('/api/cases',json=BASE['profile'],headers={'X-Sepsis-User':actor['id']}).status_code==201
        assert client.post('/api/auth/logout').status_code==200
        assert client.get('/api/clinical-state',headers={'cookie':f'sepsis_session={cookie}'}).status_code==401


@pytest.mark.parametrize('fixture',GOLDEN['cases'],ids=lambda f:f['name'])
def test_http_scoring_matches_golden(store,fixture):
    with TestClient(create_app(store.settings,store),base_url='http://127.0.0.1:3100') as client:
        login(client)
        response=client.post('/api/manual-score',json=fixture['input'])
        assert response.status_code==200,response.text
        actual=response.json()
        assert sorted(actual['errors'],key=int)==fixture['expected']['errorHours']
        assert len(actual['predictions'])==len(fixture['expected']['predictions'])
        for p,expected in zip(actual['predictions'],fixture['expected']['predictions']):
            assert p['score']==pytest.approx(expected['score'],abs=1e-12,rel=0)
            assert (p['score']>=p['threshold'])==expected['alert']
            for key in ('hour','threshold','modelVersion','featureHash','department','availableFeatures'):
                assert p[key]==expected[key]


def test_temporal_validation_and_body_limits(store):
    with TestClient(create_app(store.settings,store),base_url='http://127.0.0.1:3100') as client:
        login(client)
        bad=deepcopy(BASE)
        bad['entries'][0]['measuredAt']='2026-01-01T09:00'
        bad['entries'][0]['availableAt']='2026-01-01T09:00'
        assert client.post('/api/manual-score',json=bad).status_code==400
        bad=deepcopy(BASE)
        bad['entries'][0]['labAvailableAt']='2026-01-01T07:00'
        assert client.post('/api/manual-score',json=bad).status_code==400
        assert client.post('/api/cases',content='x'*200001).status_code==413
        assert client.get('/api/does-not-exist').status_code==404


def test_inputs_and_jobs_commit_together_and_survive_failed_worker(store):
    record=prepared(store)
    assert record['predictions']==[] and record['scoringStatus']=='pending'
    with store.transaction() as c:
        assert c.execute(select(func.count()).select_from(t.queue)).scalar_one()==1
    process_one(store,lambda _:(_ for _ in ()).throw(RuntimeError('interrupted')))
    current=store.get_case(record['profile']['id'])
    assert current['entries']==record['entries'] and current['predictions']==[]
    with store.transaction() as c:
        c.execute(update(t.queue).values(available_at=0))
    assert process_one(store)
    assert store.get_case(record['profile']['id'])['scoringStatus']=='ready'


def test_concurrent_save_and_stale_worker_cannot_commit(store):
    record=prepared(store)
    job=store.claim_job(now=10**15)
    changed=store.save_input(record['profile']['id'],record['revision'],record['entries'][0] | {'labs':{'CRP':100}})
    assert store.finish_job(job,predict(json.loads(job['input_json']))) is False
    with pytest.raises(ClinicalError):
        store.save_input(record['profile']['id'],record['revision'],record['entries'][0])
    assert store.get_case(record['profile']['id'])['revision']==changed['revision']


def test_lease_recovery_rejects_old_attempt_and_bounds_retries(store):
    prepared(store)
    first=store.claim_job(now=10**15)
    assert store.claim_job(now=10**15+1000) is None
    recovered=store.claim_job(now=10**15+121000)
    assert recovered['attempt_id']!=first['attempt_id']
    result=predict(json.loads(first['input_json']))
    assert store.finish_job(first,result) is False
    store.fail_job(first)
    assert store.finish_job(recovered,result) is True


def test_review_history_and_ids_survive_unchanged_missing_and_restored_results(store):
    record=prepared(store)
    process_one(store)
    first=store.get_case(record['profile']['id'])['predictions'][0]
    actor=Auth(store).login('bacsi.demo1','SepsisDemo2026!')['user']
    review={'predictionId':first['id'],'revision':first['revision'],'requestId':str(uuid4()),'note':'First'}
    rid=store.record_review(review,actor)
    assert store.record_review(review,actor)==rid
    store.save_input(record['profile']['id'],1,record['entries'][0]); process_one(store)
    assert store.get_case(record['profile']['id'])['predictions'][0]['id']==first['id']
    missing=store.save_input(record['profile']['id'],2,record['entries'][0] | {'vitals':None}); process_one(store)
    assert store.get_case(record['profile']['id'])['predictions']==[]
    with pytest.raises(ClinicalError):
        store.record_review(review | {'requestId':str(uuid4())},actor)
    store.save_input(record['profile']['id'],3,record['entries'][0]); process_one(store)
    fresh=store.get_case(record['profile']['id'])['predictions'][0]
    assert fresh['id']!=first['id'] and fresh['revision']==4
    assert first['id'] in store.snapshot()['reviews'] and fresh['id'] not in store.snapshot()['reviews']


def test_multiple_reviewers_and_spoofed_identity(store):
    auth=Auth(store)
    first,second=[auth.login(f'bacsi.demo{i}','SepsisDemo2026!')['user'] for i in (1,2)]
    p=store.snapshot()['fixturePredictions'][0]
    value={'predictionId':p['id'],'revision':p['revision'],'note':'A','requestId':str(uuid4())}
    store.record_review(value,first)
    store.record_review(value | {'note':'B','requestId':str(uuid4())},second)
    assert store.snapshot()['reviews'][p['id']]['reviewerId']==first['id']
    assert len(store.snapshot()['reviewHistory'])==2
    with TestClient(create_app(store.settings,store),base_url='http://127.0.0.1:3100') as client:
        login(client)
        assert client.post('/api/reviews',json=value | {'reviewer':'Forged'}).status_code==400


def test_emr_units_receipt_time_idempotency_and_corrections(store):
    received=datetime(2026,1,1,2,30,tzinfo=timezone.utc)  # 09:30 local, T0+1.5h
    raw={'source':'mock-emr','eventId':'obs-1','eventVersion':1,'encounterId':BASE['profile']['id'],
         'profile':BASE['profile'],'entry':BASE['entries'][0] | {'labs':{'creatinine':88.4}},'units':{'creatinine':'umol/L'}}
    value=EMREvent.model_validate(raw)
    first=ingest(store,value,received)
    assert first['hour']==2
    assert ingest(store,value,received)['duplicate']
    assert store.get_case(value.encounterId)['revision']==1
    event=store.get_case(value.encounterId)['entries'][0]
    assert event['labs']['creatinine']==1
    assert event['labAvailableAt']=='2026-01-01T09:30:00'
    with pytest.raises(ClinicalError):
        ingest(store,EMREvent.model_validate(raw | {'units':{'creatinine':'unknown'}}),received)
    corrected=deepcopy(raw); corrected['eventVersion']=2; corrected['entry']['labs']['creatinine']=176.8
    assert ingest(store,EMREvent.model_validate(corrected),received)['revision']==2
    assert len(store.get_case(value.encounterId)['entries'])==1
    assert process_one(store)
    assert store.get_case(value.encounterId)['predictions'][0]['hour']==2


def test_login_rate_limit_and_foreign_host(store):
    with TestClient(create_app(store.settings,store),base_url='http://127.0.0.1:3100') as client:
        for _ in range(30):
            assert client.post('/api/auth/login',json={'username':'bacsi.demo1','password':'SepsisDemo2026!'}).status_code==200
        assert client.post('/api/auth/login',json={'username':'bacsi.demo1','password':'SepsisDemo2026!'}).status_code==429
        assert client.get('/api/auth/session',headers={'host':'foreign.example'}).status_code==403


def test_duplicate_import_does_not_overwrite_newer_server_data(store):
    raw={'input':BASE | {'hours':[1]},'predictions':[],'reviews':[]}
    store.import_case(raw)
    record=store.get_case(BASE['profile']['id'])
    store.save_input(BASE['profile']['id'],record['revision'],BASE['entries'][0] | {'hour':1,'labs':{'CRP':200}})
    store.import_case(raw)
    assert store.get_case(BASE['profile']['id'])['revision']==record['revision']+1
    assert store.get_case(BASE['profile']['id'])['entries'][-1]['labs']['CRP']==200


def test_fixture_content_change_creates_new_id_without_rewriting_review_history(store):
    actor=Auth(store).login('bacsi.demo1','SepsisDemo2026!')['user']
    original=store.snapshot()['fixturePredictions'][0]
    store.record_review({'predictionId':original['id'],'revision':original['revision'],'note':'Original','requestId':str(uuid4())},actor)
    source=deepcopy(store.source)
    selected=next(p for p in source['predictions'] if p['encounterId']==original['encounterId'] and p['hour']==original['hour'])
    selected['score']=0.99 if selected['score']!=0.99 else 0.98
    store.source=source; store.sync_fixtures()
    fresh=next(p for p in store.snapshot()['fixturePredictions'] if p['encounterId']==original['encounterId'] and p['hour']==original['hour'])
    assert fresh['id']!=original['id']
    assert fresh['id'] not in store.snapshot()['reviews']
    assert store.snapshot()['reviews'][original['id']]['prediction']['score']==original['score']


def test_reading_obsolete_policy_is_allowed_but_review_is_rejected(store):
    actor=Auth(store).login('bacsi.demo1','SepsisDemo2026!')['user']
    record=prepared(store); job=store.claim_job(now=10**15)
    output=predict(json.loads(job['input_json']))
    store.finish_job(job,output)
    p=store.get_case(record['profile']['id'])['predictions'][0]
    store.source=deepcopy(store.source)
    store.source['models']['sepsis']['model_version']='changed-policy'
    with pytest.raises(ClinicalError):
        store.record_review({'predictionId':p['id'],'revision':p['revision'],'note':'','requestId':str(uuid4())},actor)


def test_evaluation_metadata_preserves_episode_denominators(store):
    model=store.policy
    assert model['threshold_selection']['branch']=='patient_episode_recall'
    assert model['threshold_selection']['validation_encounter_recall']>=0.8
    for metrics in (model['validation_synthetic_metrics'],model['temporal_holdout_synthetic_metrics']):
        assert metrics['alert_episodes']==metrics['true_alert_episodes']+metrics['false_alert_episodes']
        assert metrics['episode_ppv']==pytest.approx(metrics['true_alert_episodes']/metrics['alert_episodes'])
        assert metrics['bootstrap']['unit']=='encounter'


def test_sqlite_v2_migration_preserves_accounts_sessions_predictions_and_reviews(store,tmp_path):
    import sqlite3
    from backend.scripts.migrate_sqlite import migrate
    source=tmp_path/'old-web.sqlite3'
    reference=json.loads((ROOT/'tests/fixtures/legacy_web_identity.json').read_text())
    profile=BASE['profile']; prediction=GOLDEN['cases'][0]['expected']['predictions'][0].copy(); prediction.pop('alert')
    prediction |= {'id':profile['id']+':1:1','encounterId':profile['id'],'revision':1,'timestamp':'2026-01-01T02:00:00.000Z'}
    at='2026-01-01T00:00:00.000Z'
    with sqlite3.connect(source) as db:
        db.executescript((ROOT/'backend/app/db/legacy_v1.sql').read_text())
        db.executescript((ROOT/'backend/app/db/legacy_v2.sql').read_text())
        db.execute('PRAGMA user_version=2')
        db.execute("INSERT INTO auth_users VALUES('legacy-user','legacy.doctor','Legacy doctor',?,'doctor',0,0)",(reference['passwordHash'],))
        db.execute("INSERT INTO auth_sessions VALUES(?,'legacy-user',9999999999999,1000)",(token_hash('A'*43),))
        db.execute("INSERT INTO manual_cases VALUES(?,?,1,1,'[1]','{}',?,?,'ready',NULL)",(profile['id'],json.dumps(profile),at,at))
        db.execute('INSERT INTO manual_entries VALUES(?,?,?)',(profile['id'],0,json.dumps(BASE['entries'][0])))
        db.execute("INSERT INTO predictions VALUES(?,?,?,?,1,'manual',?,?)",(prediction['id'],profile['id'],1,1,json.dumps(prediction),at))
        db.execute("INSERT INTO review_events VALUES('legacy-review',?,1,'legacy-user','Legacy doctor','Saved review',?,'legacy-request','authenticated')",(prediction['id'],at))
    counts=migrate(source,store.settings.database_url)
    assert counts['manual_cases']==1 and counts['auth_users']==1
    assert Auth(store).session('A'*43)['id']=='legacy-user'
    assert store.get_case(profile['id'])['predictions'][0]['id']==prediction['id']
    assert store.snapshot()['reviews'][prediction['id']]['timestamp']==at
    with sqlite3.connect(source) as db:
        assert db.execute('PRAGMA user_version').fetchone()[0]==2
    with pytest.raises(ValueError,match='not empty'):
        migrate(source,store.settings.database_url)


def test_parallel_workers_claim_exactly_one_attempt(store):
    from concurrent.futures import ThreadPoolExecutor
    prepared(store)
    with ThreadPoolExecutor(max_workers=2) as pool:
        jobs=list(pool.map(lambda _:store.claim_job(now=10**15),range(2)))
    assert sum(j is not None for j in jobs)==1


def test_job_insert_failure_rolls_back_input_and_revision(store,monkeypatch):
    store.create(BASE['profile'])
    def fail(*args):
        raise RuntimeError('transaction interrupted')
    monkeypatch.setattr(store,'_enqueue',fail)
    with pytest.raises(RuntimeError):
        store.save_input(BASE['profile']['id'],0,BASE['entries'][0] | {'hour':1})
    record=store.get_case(BASE['profile']['id'])
    assert record['entries']==[] and record['revision']==0
    with store.transaction() as c:
        assert c.execute(select(func.count()).select_from(t.queue)).scalar_one()==0
        assert c.execute(select(func.count()).select_from(t.history)).scalar_one()==0


def test_bounded_retries_can_be_explicitly_requeued(store):
    record=prepared(store)
    for _ in range(3):
        job=store.claim_job(now=10**15)
        assert job
        store.fail_job(job)
    assert store.claim_job(now=10**15) is None
    assert store.get_case(record['profile']['id'])['scoringStatus']=='error'
    store.request_rescore(record['profile']['id'],record['revision'])
    assert process_one(store)
    assert store.get_case(record['profile']['id'])['scoringStatus']=='ready'


def test_changed_policy_rescore_creates_new_revision_and_preserves_history(store):
    record=prepared(store); process_one(store)
    original=store.get_case(record['profile']['id'])['predictions'][0]
    actor=Auth(store).login('bacsi.demo1','SepsisDemo2026!')['user']
    store.record_review({'predictionId':original['id'],'revision':original['revision'],'note':'Old policy','requestId':str(uuid4())},actor)
    store.source=deepcopy(store.source)
    store.source['models']['sepsis']['threshold']=0.5
    store.request_rescore(record['profile']['id'],record['revision'])
    changed=store.get_case(record['profile']['id'])
    assert changed['revision']==record['revision']+1 and changed['predictions']==[]
    job=store.claim_job(now=10**15)
    result=predict(json.loads(job['input_json']))
    result['predictions'][0]['threshold']=0.5
    store.finish_job(job,result)
    fresh=store.get_case(record['profile']['id'])['predictions'][0]
    assert fresh['id']!=original['id'] and fresh['threshold']==0.5
    assert original['id'] in store.snapshot()['reviews']


def test_concurrent_emr_delivery_is_idempotent(store):
    from concurrent.futures import ThreadPoolExecutor
    raw={'source':'mock-emr','eventId':'parallel','eventVersion':1,'encounterId':BASE['profile']['id'],
         'profile':BASE['profile'],'entry':BASE['entries'][0],'units':UNITS}
    value=EMREvent.model_validate(raw)
    received=datetime(2026,1,1,2,30,tzinfo=timezone.utc)
    with ThreadPoolExecutor(max_workers=2) as pool:
        results=list(pool.map(lambda _:ingest(store,value,received),range(2)))
    assert sum(not r.get('duplicate',False) for r in results)==1
    assert store.get_case(value.encounterId)['revision']==1


def test_policy_change_marks_old_queued_job_actionable(store):
    record=prepared(store)
    store.source=deepcopy(store.source)
    store.source['models']['sepsis']['threshold']=0.5
    assert store.claim_job(now=10**15) is None
    assert store.get_case(record['profile']['id'])['scoringStatus']=='error'
    store.request_rescore(record['profile']['id'],record['revision'])
    assert store.get_case(record['profile']['id'])['revision']==record['revision']+1
