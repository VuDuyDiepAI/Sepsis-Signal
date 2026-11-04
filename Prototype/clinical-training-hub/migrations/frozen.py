"""Immutable DDL snapshots. Future model changes must use new Alembic revisions."""

import json
from pathlib import Path


def apply_schema(op, revision):
    snapshot = json.loads(
        (Path(__file__).parent / "snapshots" / f"{revision}.json").read_text(
            encoding="utf-8"
        )
    )
    for statement in snapshot[op.get_bind().dialect.name]:
        op.execute(statement)


def drop_schema(op, revision):
    snapshot = json.loads(
        (Path(__file__).parent / "snapshots" / f"{revision}.json").read_text(
            encoding="utf-8"
        )
    )
    for name in reversed(snapshot["tables"]):
        op.drop_table(name)
