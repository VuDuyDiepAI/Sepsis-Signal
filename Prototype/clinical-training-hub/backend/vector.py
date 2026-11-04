"""pgvector in PostgreSQL, JSON vectors in SQLite. Dimensionality follows configured model."""

import json
from sqlalchemy.types import UserDefinedType, JSON


class PgVector(UserDefinedType):
    cache_ok = True

    def get_col_spec(self, **kw):
        return "VECTOR"

    def bind_processor(self, dialect):
        return lambda value: json.dumps(value) if value is not None else None

    def result_processor(self, dialect, coltype):
        return lambda value: json.loads(value) if isinstance(value, str) else value


VectorStorage = JSON().with_variant(PgVector(), "postgresql")
