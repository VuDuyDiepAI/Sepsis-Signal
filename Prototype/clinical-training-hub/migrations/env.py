from alembic import context
from backend.db import engine, Base
from backend import models

with engine.connect() as connection:
    if engine.dialect.name == "sqlite":
        connection.exec_driver_sql("PRAGMA foreign_keys=OFF")
        connection.commit()
    context.configure(
        connection=connection,
        target_metadata=Base.metadata,
        render_as_batch=engine.dialect.name == "sqlite",
    )
    with context.begin_transaction():
        context.run_migrations()
    if engine.dialect.name == "sqlite":
        violations = connection.exec_driver_sql("PRAGMA foreign_key_check").fetchall()
        if violations:
            raise RuntimeError("Migration violated foreign keys.")
        connection.exec_driver_sql("PRAGMA foreign_keys=ON")
