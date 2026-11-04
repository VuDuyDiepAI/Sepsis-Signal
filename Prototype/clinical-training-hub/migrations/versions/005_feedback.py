"""Frozen initial schema 005. Add new revisions for changes."""

from alembic import op
from migrations.frozen import apply_schema, drop_schema

revision = "005"
down_revision = "004"


def upgrade():
    apply_schema(op, "005")


def downgrade():
    drop_schema(op, "005")
