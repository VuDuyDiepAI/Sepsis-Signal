"""Frozen initial schema 002. Add new revisions for changes."""

from alembic import op
from migrations.frozen import apply_schema, drop_schema

revision = "002"
down_revision = "001"


def upgrade():
    if op.get_bind().dialect.name == "postgresql":
        op.execute("CREATE EXTENSION IF NOT EXISTS vector")
    apply_schema(op, "002")


def downgrade():
    drop_schema(op, "002")
