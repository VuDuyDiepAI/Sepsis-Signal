"""Meaningful as-of and revision checks for the manual demo path."""
from datetime import datetime, timedelta

import pandas as pd
import pytest

from src.manual_cases import (build_features, create_case, event_rows,
    case_overview, delete_case, init_db, prediction_history, record_review,
    recompute_scored_hours, review_history, save_entry, score_hour)
from src.mock_emr import load_bundle


@pytest.fixture
def setup_case(tmp_path):
    path = tmp_path / 'manual.sqlite3'
    t0 = datetime(2026, 1, 1, 8)
    case_id = create_case(path=path, triage_completed_at=t0,
                          age_years=65, sex='F', comorbidities={'diabetes': True})
    models = {target: load_bundle(target) for target in ('sepsis', 'shock')}
    return path, t0, case_id, models


def test_delayed_lab_is_hidden_until_available_and_both_models_score(setup_case):
    path, t0, case_id, models = setup_case
    t1, t2 = t0 + timedelta(hours=1), t0 + timedelta(hours=2)
    save_entry(case_id, path=path, measured_at=t1, vital_available_at=t1,
               vitals={'heart_rate_bpm': 100, 'respiratory_rate_per_min': 24,
                       'sbp_mmhg': 105, 'dbp_mmhg': 65, 'spo2_pct': 94},
               lab_collected_at=t1, lab_available_at=t2,
               labs={'creatinine': 1.8})
    features1 = build_features(case_id, t1, path)
    features2 = build_features(case_id, t2, path)
    assert pd.isna(features1.iloc[0]['creatinine_last_mg_dL'])
    assert features1.iloc[0]['creatinine_measured_since_t0'] == 0
    assert features2.iloc[0]['creatinine_last_mg_dL'] == 1.8
    assert features2.iloc[0]['map_last_mmhg'] == 78.3
    first = score_hour(case_id, 1, path=path, bundles=models)
    second = score_hour(case_id, 2, path=path, bundles=models)
    assert set(first) >= {'sepsis', 'shock'}
    assert set(second) >= {'sepsis', 'shock'}
    assert len(prediction_history(case_id, path=path)) == 4
    score_hour(case_id, 2, path=path, bundles=models)
    assert len(prediction_history(case_id, path=path, include_revisions=True)) == 4


def test_correction_recomputes_existing_hours_and_preserves_revisions(setup_case):
    path, t0, case_id, models = setup_case
    t1 = t0 + timedelta(hours=1)
    save_entry(case_id, path=path, measured_at=t1, vital_available_at=t1,
               vitals={'heart_rate_bpm': 80, 'respiratory_rate_per_min': 18,
                       'sbp_mmhg': 130})
    score_hour(case_id, 1, path=path, bundles=models)
    changed = save_entry(case_id, path=path, measured_at=t1, vital_available_at=t1,
                         vitals={'heart_rate_bpm': 140, 'respiratory_rate_per_min': 30,
                                 'sbp_mmhg': 80})
    assert recompute_scored_hours(case_id, changed, path=path, bundles=models) == 1
    assert len(event_rows(case_id, 'vitals', path, include_revisions=True)) == 2
    assert len(event_rows(case_id, 'vitals', path)) == 1
    assert len(prediction_history(case_id, path=path)) == 2
    assert len(prediction_history(case_id, path=path, include_revisions=True)) == 4


def test_invalid_temporal_order_and_missing_vitals_rejected(setup_case):
    path, t0, case_id, models = setup_case
    t1 = t0 + timedelta(hours=1)
    with pytest.raises(ValueError, match='sinh hiệu'):
        save_entry(case_id, path=path, measured_at=t1, vital_available_at=t0,
                   vitals={'heart_rate_bpm': 100, 'respiratory_rate_per_min': 20,
                           'sbp_mmhg': 110})
    with pytest.raises(ValueError, match='Chưa có sinh hiệu'):
        score_hour(case_id, 1, path=path, bundles=models)


def test_delayed_correction_invalidates_ineligible_hours_and_recovers(setup_case):
    path,t0,eid,models = setup_case
    t1,t2,t3 = [t0+timedelta(hours=h) for h in (1,2,3)]
    vitals={'heart_rate_bpm':90,'respiratory_rate_per_min':20,'sbp_mmhg':115}
    save_entry(eid,path=path,measured_at=t1,vital_available_at=t1,vitals=vitals)
    score_hour(eid,1,path=path,bundles=models)
    score_hour(eid,2,path=path,bundles=models)
    first = next(r for r in prediction_history(eid,path=path) if r['target']=='sepsis')
    review_args=dict(result_key=f'manual:{first["id"]}',encounter_id=eid,
                     prediction_at=first['prediction_at'],model_version=first['model_version'],
                     reviewed_by='Bác sĩ A',prediction_id=first['id'],path=path)
    record_review(**review_args)
    changed=save_entry(eid,path=path,measured_at=t1,vital_available_at=t2,vitals=vitals)
    assert changed==t1
    assert prediction_history(eid,path=path)==[]  # Invalidated in the same transaction as the edit.
    with pytest.raises(ValueError,match='hết hiệu lực'):
        record_review(**review_args)
    assert recompute_scored_hours(eid,changed,path=path,bundles=models)==2
    assert {r['prediction_at'] for r in prediction_history(eid,path=path)}=={t2.isoformat()}
    invalid=next(r for r in prediction_history(eid,path=path,include_invalid=True)
                 if r['prediction_at']==t1.isoformat())
    assert not invalid['valid'] and 'Chưa có sinh hiệu' in invalid['invalid_reason']
    changed=save_entry(eid,path=path,measured_at=t1,vital_available_at=t3,vitals=vitals)
    recompute_scored_hours(eid,changed,path=path,bundles=models)
    assert prediction_history(eid,path=path)==[]
    overview=case_overview(path)[0]
    assert overview['latest'] is None and overview['hour']==2
    assert overview['status']=='Không đủ dữ liệu'
    assert overview['review'] is None
    changed=save_entry(eid,path=path,measured_at=t1,vital_available_at=t1,vitals=vitals)
    recompute_scored_hours(eid,changed,path=path,bundles=models)
    assert len(prediction_history(eid,path=path))==4
    assert all(r['valid'] and r['revision']>=2 for r in prediction_history(eid,path=path))
    assert len(review_history(eid,path))==1  # Original acknowledgement is audit history only.
    assert case_overview(path)[0]['review_status']=='Chờ xem xét'


def test_review_persists_and_a_new_revision_requires_its_own_review(setup_case):
    path, t0, case_id, models = setup_case
    t1 = t0 + timedelta(hours=1)
    save_entry(case_id, path=path, measured_at=t1, vital_available_at=t1,
               vitals={'heart_rate_bpm': 100, 'respiratory_rate_per_min': 24, 'sbp_mmhg': 105})
    score_hour(case_id, 1, path=path, bundles=models)
    prediction = next(p for p in prediction_history(case_id, path=path) if p['target'] == 'sepsis')
    args = dict(result_key=f'manual:{prediction["id"]}', encounter_id=case_id,
                prediction_at=prediction['prediction_at'], model_version=prediction['model_version'],
                reviewed_by='Bác sĩ A', prediction_id=prediction['id'], path=path)
    first = record_review(**args, note='Đã xem sinh hiệu')
    second = record_review(**{**args, 'reviewed_by': 'Bác sĩ B'})
    assert second == first
    init_db(path)
    assert case_overview(path)[0]['review']['reviewed_by'] == 'Bác sĩ A'
    save_entry(case_id, path=path, measured_at=t1, vital_available_at=t1,
               vitals={'heart_rate_bpm': 140, 'respiratory_rate_per_min': 32, 'sbp_mmhg': 80})
    score_hour(case_id, 1, path=path, bundles=models)
    assert case_overview(path)[0]['review_status'] == 'Chờ xem xét'
    assert review_history(case_id, path) == [first]
    with pytest.raises(ValueError, match='bản tính mới'):
        record_review(**args)
    delete_case(case_id, path)
    assert review_history(case_id, path) == []


def test_sample_reviews_are_isolated_by_result_key_and_validate_reviewer(tmp_path):
    path = tmp_path / 'reviews.sqlite3'
    args = dict(encounter_id='E0009', prediction_at='2026-01-01T09:00:00',
                model_version='sample-v1', reviewed_by='Người xem', path=path)
    with pytest.raises(ValueError, match='người ghi nhận'):
        record_review(**{**args, 'reviewed_by': ' '}, result_key='sample:first')
    record_review(**args, result_key='sample:first')
    record_review(**args, result_key='sample:second')
    assert len(review_history('E0009', path)) == 2
    assert review_history('E0010', path) == []


def test_concurrent_review_keeps_one_acknowledgement(tmp_path):
    from concurrent.futures import ThreadPoolExecutor

    path = tmp_path / 'concurrent.sqlite3'
    init_db(path)
    def submit(name):
        return record_review(result_key='sample:concurrent', encounter_id='E0009',
                             prediction_at='2026-01-01T09:00:00', model_version='v1',
                             reviewed_by=name, path=path)
    with ThreadPoolExecutor(max_workers=2) as pool:
        saved = list(pool.map(submit, ['Người A', 'Người B']))
    assert saved[0] == saved[1]
    assert len(review_history('E0009', path)) == 1


def test_baseline_data_carries_to_first_score_without_future_lab_leakage(setup_case):
    path, t0, case_id, models = setup_case
    t1, t2 = t0 + timedelta(hours=1), t0 + timedelta(hours=2)
    save_entry(case_id, path=path, measured_at=t0, vital_available_at=t0,
               vitals={'heart_rate_bpm': 95, 'respiratory_rate_per_min': 22, 'sbp_mmhg': 110},
               lab_collected_at=t0, lab_available_at=t2, labs={'creatinine': 1.8})
    baseline = build_features(case_id, t0, path).iloc[0]
    assert baseline['heart_rate_last_bpm'] == 95
    assert pd.isna(baseline['creatinine_last_mg_dL'])
    assert case_overview(path)[0]['hour'] == 0
    assert prediction_history(case_id, path=path) == []
    with pytest.raises(ValueError, match=r'T0\+1'):
        score_hour(case_id, 0, path=path, bundles=models)
    with pytest.raises(ValueError, match='trước T0'):
        build_features(case_id, t0 - timedelta(minutes=1), path)
    score_hour(case_id, 1, path=path, bundles=models)
    first = build_features(case_id, t1, path).iloc[0]
    assert first['heart_rate_last_bpm'] == 95
    assert first['vital_observation_count_since_t0'] == 1
    assert pd.isna(first['creatinine_last_mg_dL'])
    assert build_features(case_id, t2, path).iloc[0]['creatinine_last_mg_dL'] == 1.8


def test_expanding_history_keeps_baseline_after_six_and_twenty_four_hours(tmp_path):
    path = tmp_path / 'long.sqlite3'
    t0 = datetime(2026,1,1,8)
    eid = create_case(path=path, triage_completed_at=t0, age_years=50, sex='F')
    save_entry(eid, path=path, measured_at=t0, vital_available_at=t0,
               vitals={'heart_rate_bpm':80,'respiratory_rate_per_min':18,'sbp_mmhg':120,
                       'spo2_pct':97,'temperature_c':36.8},
               lab_collected_at=t0, lab_available_at=t0, labs={'creatinine':1.4})
    t7 = t0 + timedelta(hours=7)
    save_entry(eid,path=path,measured_at=t7,vital_available_at=t7,
               vitals={'heart_rate_bpm':120,'respiratory_rate_per_min':25,'sbp_mmhg':90})
    other = create_case(path=path,triage_completed_at=t0,age_years=60,sex='M')
    save_entry(other,path=path,measured_at=t7,vital_available_at=t7,
               vitals={'heart_rate_bpm':200,'respiratory_rate_per_min':40,'sbp_mmhg':60})
    for hour in [7,25,36]:
        row = build_features(eid,t0+timedelta(hours=hour),path).iloc[0]
        assert row['vital_observation_count_since_t0'] == 2
        assert row['heart_rate_delta_since_t0_bpm'] == 40
        assert row['heart_rate_mean_since_t0_bpm'] == 100
        assert row['creatinine_last_mg_dL'] == 1.4
        assert row['creatinine_measured_since_t0'] == 1
        assert row['hours_since_creatinine_result'] == hour
        assert row['spo2_last_pct'] == 97
        assert row['temperature_last_c'] == 36.8


def test_delayed_older_measurement_does_not_override_newer_sample(tmp_path):
    path = tmp_path / 'delayed.sqlite3'
    t0 = datetime(2026,1,1,8)
    eid = create_case(path=path,triage_completed_at=t0,age_years=50,sex='F')
    t7,t8,t10=[t0+timedelta(hours=h) for h in (7,8,10)]
    save_entry(eid,path=path,measured_at=t0,vital_available_at=t10,
               vitals={'heart_rate_bpm':80,'respiratory_rate_per_min':18,'sbp_mmhg':120,
                       'spo2_pct':97,'temperature_c':36.8},
               lab_collected_at=t0,lab_available_at=t10,labs={'creatinine':1.0})
    save_entry(eid,path=path,measured_at=t7,vital_available_at=t7,
               vitals={'heart_rate_bpm':120,'respiratory_rate_per_min':25,'sbp_mmhg':90},
               lab_collected_at=t7,lab_available_at=t7,labs={'creatinine':2.0})
    before = build_features(eid,t8,path).iloc[0]
    after = build_features(eid,t10,path).iloc[0]
    assert before['vital_observation_count_since_t0'] == 1
    assert after['vital_observation_count_since_t0'] == 2
    assert after['heart_rate_last_bpm'] == before['heart_rate_last_bpm'] == 120
    assert after['creatinine_last_mg_dL'] == before['creatinine_last_mg_dL'] == 2.0
    assert after['heart_rate_delta_since_t0_bpm'] == 40
    assert after['hours_since_creatinine_result'] == 3


def test_prediction_error_does_not_reactivate_invalidated_scores(setup_case):
    path,t0,eid,models=setup_case
    t1=t0+timedelta(hours=1)
    save_entry(eid,path=path,measured_at=t0,vital_available_at=t0,
               vitals={'heart_rate_bpm':90,'respiratory_rate_per_min':20,'sbp_mmhg':115})
    score_hour(eid,1,path=path,bundles=models)
    changed=save_entry(eid,path=path,lab_collected_at=t0,lab_available_at=t0,labs={'creatinine':2})
    class BrokenModel:
        def predict_proba(self,frame):
            raise RuntimeError('model error')
    with pytest.raises(RuntimeError,match='model error'):
        recompute_scored_hours(eid,changed,path=path,bundles={'sepsis':(BrokenModel(),models['sepsis'][1])})
    assert prediction_history(eid,path=path)==[]
    assert len(prediction_history(eid,path=path,include_revisions=True))==2
    assert case_overview(path)[0]['latest'] is None


def test_concurrent_edit_cannot_commit_a_stale_prediction(setup_case):
    path,t0,eid,models=setup_case
    values={'heart_rate_bpm':90,'respiratory_rate_per_min':20,'sbp_mmhg':115}
    save_entry(eid,path=path,measured_at=t0,vital_available_at=t0,vitals=values)
    score_hour(eid,1,path=path,bundles={'sepsis':models['sepsis']})
    class EditingModel:
        def predict_proba(self,frame):
            save_entry(eid,path=path,measured_at=t0,vital_available_at=t0,
                       vitals={**values,'heart_rate_bpm':140})
            return models['sepsis'][0].predict_proba(frame)
    with pytest.raises(ValueError,match='vừa thay đổi'):
        score_hour(eid,1,path=path,bundles={'sepsis':(EditingModel(),models['sepsis'][1])})
    assert prediction_history(eid,path=path)==[]
    assert len(prediction_history(eid,path=path,include_revisions=True))==1
