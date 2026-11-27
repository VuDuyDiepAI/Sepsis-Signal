import os
from pathlib import Path
from urllib.parse import urlsplit

import pytest
from sqlalchemy import create_engine
from backend.app.config import Settings
from backend.app.db.store import Store
from backend.app.db.tables import metadata


@pytest.fixture(params=['sqlite'] + (['postgres'] if os.getenv('SEPSIS_TEST_POSTGRES_URL') else []))
def store(request, tmp_path):
    if request.param == 'postgres':
        url=os.environ['SEPSIS_TEST_POSTGRES_URL']
        # A destructive test reset is never allowed against the live database.
        if not urlsplit(url).path.endswith('_test'):
            raise ValueError('PostgreSQL test database name must end in _test')
        engine=create_engine(url)
        with engine.begin() as conn:
            metadata.drop_all(conn)
        engine.dispose()
    else:
        url=f"sqlite:///{(tmp_path/'clinical.sqlite3').as_posix()}"
    instance=Store(Settings(url,demo_accounts=True,emr_key='test-emr-key-'+'x'*40))
    try:
        yield instance
    finally:
        instance.close()
