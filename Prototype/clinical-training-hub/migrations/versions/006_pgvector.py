"""Enable vector storage for PostgreSQL; SQLite keeps JSON."""

from alembic import op

revision = "006"
down_revision = "005"


def upgrade():
    if op.get_bind().dialect.name == "postgresql":
        op.execute("CREATE EXTENSION IF NOT EXISTS vector")
        op.execute(
            "ALTER TABLE document_chunks ALTER COLUMN embedding TYPE vector USING embedding::text::vector"
        )


def downgrade():
    if op.get_bind().dialect.name == "postgresql":
        op.execute(
            "ALTER TABLE document_chunks ALTER COLUMN embedding TYPE json USING embedding::text::json"
        )
