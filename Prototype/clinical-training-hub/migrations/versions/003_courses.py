"""Frozen initial schema 003. Add new revisions for changes."""

from alembic import op
from migrations.frozen import apply_schema, drop_schema

revision = "003"
down_revision = "002"


def upgrade():
    apply_schema(op, "003")


def downgrade():
    drop_schema(op, "003")
