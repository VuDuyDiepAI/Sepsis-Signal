"""Frozen initial schema 004. Add new revisions for changes."""

from alembic import op
from migrations.frozen import apply_schema, drop_schema

revision = "004"
down_revision = "003"


def upgrade():
    apply_schema(op, "004")


def downgrade():
    drop_schema(op, "004")
