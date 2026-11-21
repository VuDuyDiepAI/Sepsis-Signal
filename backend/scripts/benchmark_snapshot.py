"""Measure full snapshot cost in a disposable PostgreSQL *_test database."""
import json
import os
import statistics
import time
from copy import deepcopy
from urllib.parse import urlsplit
from sqlalchemy import create_engine, event, insert
from backend.app.config import Settings, REPO
from backend.app.db.store import Store, dump
from backend.app.db import tables as t
from backend.app.identity import now_iso


def measure(url):
    if not url.startswith('postgresql') or not urlsplit(url).path.endswith('_test'):
        raise ValueError('Only a disposable PostgreSQL *_test database is allowed')
    reference=json.loads((REPO/'tests/fixtures/sepsis_scoring_golden.json').read_text())['cases'][0]
    output=[]
    for size in (10,100,300):
        engine=create_engine(url)
        with engine.begin() as c:
            t.metadata.drop_all(c)
        engine.dispose()
        store=Store(Settings(url))
        now=now_iso()
        with store.transaction() as c:
            for i in range(size):
                profile=reference['input']['profile'] | {'id':f'HS-{i:08X}'}
                c.execute(insert(t.cases).values(id=profile['id'],profile=dump(profile),revision=1,current_hour=1,
                    attempted_hours='[1]',errors='{}',created_at=now,updated_at=now,scoring_status='ready'))
                c.execute(insert(t.entries).values(encounter_id=profile['id'],hour=1,data=dump(reference['input']['entries'][0])))
                p=deepcopy(reference['expected']['predictions'][0]);p.pop('alert')
                p |= {'id':profile['id']+':1:1','encounterId':profile['id'],'revision':1,'timestamp':now}
                c.execute(insert(t.predictions).values(id=p['id'],encounter_id=profile['id'],hour=1,revision=1,
                    source='manual',active=1,data=dump(p),created_at=now))
        queries=[0]
        def count(*args):queries[0]+=1
        event.listen(store.engine,'before_cursor_execute',count)
        store.snapshot()  # Warm connection and cache; exclude setup.
        samples=[]
        for _ in range(10):
            queries[0]=0;start=time.perf_counter()
            payload=json.dumps(store.snapshot(),ensure_ascii=False).encode()
            samples.append((time.perf_counter()-start)*1000)
        output.append({'cases':size,'entries_per_case':1,'predictions_per_case':1,'samples':10,
            'p50_ms':round(statistics.median(samples),2),'p95_ms':round(sorted(samples)[-1],2),
            'sql_statements':queries[0],'response_bytes':len(payload)})
        store.close()
    return {'database':'PostgreSQL 17, local Docker Windows','includes':'SQL + snapshot assembly + JSON encoding',
        'excludes':'HTTP, browser, authentication; not a clinical load test','results':output}


if __name__=='__main__':
    print(json.dumps(measure(os.environ['SEPSIS_BENCHMARK_DATABASE_URL']),indent=2))
