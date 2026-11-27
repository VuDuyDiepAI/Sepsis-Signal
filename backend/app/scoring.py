"""Load the frozen model once per worker; reuse the established inference core."""
from functools import lru_cache
import time
from scripts.score_frontend_case import score
from src.mock_emr import load_bundle


@lru_cache(maxsize=1)
def bundle():
    return load_bundle('sepsis', require_source=False)


def model_status():
    try:
        _, meta = bundle()
        return {
            'ready': True,
            'modelVersion': meta['model_version'],
            'threshold': meta['threshold'],
        }
    except Exception:
        return {'ready': False, 'modelVersion': None, 'threshold': None}


def predict(payload):
    return score(payload, bundle=bundle())


def process_one(store, runner=predict):
    import json
    job = store.claim_job()
    if not job:
        return False
    started = time.perf_counter()
    try:
        output = runner(json.loads(job['input_json']))
        duration_ms = max(0, round((time.perf_counter() - started) * 1000))
        store.finish_job(job, output, duration_ms=duration_ms)
    except Exception:
        # Patient values and interpreter tracebacks are not logged to general logs.
        duration_ms = max(0, round((time.perf_counter() - started) * 1000))
        store.fail_job(job, duration_ms=duration_ms)
    return True
