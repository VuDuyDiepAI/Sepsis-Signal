"""Browser-test reset outside HTTP; refuses every non-test database."""
import os
from urllib.parse import urlsplit
from sqlalchemy import delete
from backend.app.config import Settings
from backend.app.db.store import Store
from backend.app.db import tables as t


if __name__=='__main__':
    settings=Settings.from_env()
    name=urlsplit(settings.database_url).path
    if os.getenv('SEPSIS_TESTING')!='1' or not (name.endswith('_test') or name.endswith('frontend_e2e.sqlite3')):
        raise RuntimeError('Refusing to reset a non-test database')
    store=Store(settings)
    try:
        with store.transaction() as c:
            for table in [t.review_order,t.reviews,t.legacy_reviews,t.emr,t.queue,t.entries,t.history,t.scoring_jobs,t.imports]:
                c.execute(delete(table))
            c.execute(delete(t.predictions).where(t.predictions.c.source=='manual'))
            c.execute(delete(t.cases))
    finally:
        store.close()
