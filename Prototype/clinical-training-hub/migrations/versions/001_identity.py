"""Frozen initial schema 001. Add new revisions for changes."""

from alembic import op
from migrations.frozen import apply_schema, drop_schema

revision = "001"
down_revision = None


def upgrade():
    apply_schema(op, "001")


def downgrade():
    drop_schema(op, "001")
