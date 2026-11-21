"""Copy an existing web SQLite database to an empty PostgreSQL database.

The source is opened read-only and backed up consistently, including WAL.
No overwrite mode: an occupied destination is always rejected.
"""
import argparse
import json
from pathlib import Path
import sqlite3
from contextlib import closing
from tempfile import TemporaryDirectory
from sqlalchemy import select, insert, delete, func

from backend.app.config import Settings
from backend.app.db.store import Store
from backend.app.db import tables as t


def migrate(source, target_url):
    source = Path(source).resolve()
    if not source.is_file():
        raise ValueError('Source file does not exist')
    target = Store(Settings(target_url))
    try:
        with TemporaryDirectory(prefix='sepsis-migrate-') as directory:
            backup = Path(directory)/'source.sqlite3'
            with closing(sqlite3.connect(source.as_uri()+'?mode=ro',uri=True)) as old, closing(sqlite3.connect(backup)) as copy:
                old.backup(copy)
            with closing(sqlite3.connect(backup)) as old, target.transaction() as c:
                old.row_factory = sqlite3.Row
                if old.execute('PRAGMA user_version').fetchone()[0] not in (2,3):
                    raise ValueError('Expected a v2/v3 web database')
                if old.execute('PRAGMA integrity_check').fetchone()[0] != 'ok':
                    raise ValueError('Source integrity check failed')
                for table in (t.cases,t.users,t.reviews,t.queue,t.emr):
                    if c.execute(select(func.count()).select_from(table)).scalar_one():
                        raise ValueError('Destination is not empty; refusing to overwrite data')
                c.execute(delete(t.predictions))
                names={r[0] for r in old.execute("SELECT name FROM sqlite_master WHERE type='table'")}
                counts={}
                for table in t.metadata.sorted_tables:
                    if table.name not in names or table.name in ('schema_migrations','review_order'):
                        continue
                    records=[dict(r) for r in old.execute(f'SELECT * FROM "{table.name}"')]
                    for row in records:
                        c.execute(insert(table).values(**{k:v for k,v in row.items() if k in table.c}))
                    copied=[dict(r) for r in c.execute(select(table)).mappings()]
                    # Compare every original column/value, not only row counts.
                    columns=list(records[0]) if records else []
                    canonical=lambda values:sorted(json.dumps({k:r.get(k) for k in columns},sort_keys=True,ensure_ascii=False) for r in values)
                    if canonical(records)!=canonical(copied):
                        raise ValueError(f'Migration comparison failed: {table.name}')
                    counts[table.name]=len(records)
                for r in old.execute('SELECT id FROM review_events ORDER BY timestamp,rowid'):
                    c.execute(insert(t.review_order).values(event_id=r[0]))
        target.sync_fixtures()
        return counts
    finally:
        target.close()


if __name__ == '__main__':
    parser=argparse.ArgumentParser()
    parser.add_argument('source')
    args=parser.parse_args()
    print(json.dumps(migrate(args.source,Settings.from_env().database_url),indent=2))
