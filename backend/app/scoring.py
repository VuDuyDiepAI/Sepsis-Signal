"""Load the frozen model once per worker; reuse the established inference core."""
from functools import lru_cache
from scripts.score_frontend_case import score
from src.mock_emr import load_bundle


@lru_cache(maxsize=1)
def bundle():
    return load_bundle('sepsis')


def predict(payload):
    return score(payload, bundle=bundle())


def process_one(store, runner=predict):
    import json
    job = store.claim_job()
    if not job:
        return False
    try:
        store.finish_job(job, runner(json.loads(job['input_json'])))
    except Exception:
        # Patient values and interpreter tracebacks are not logged to general logs.
        store.fail_job(job)
    return True
