from contextlib import asynccontextmanager

from backend.bootstrap.seed import seed
from backend.core.database import Session as DBSession


@asynccontextmanager
async def lifespan(app):
    with DBSession() as db:
        seed(db)
        from backend.bootstrap.demo import seed_content

        seed_content(db)
    from backend.infrastructure.handlers import register_handlers
    from backend.infrastructure.workers import start_worker

    register_handlers()
    stop, thread = start_worker()
    yield
    stop.set()
    thread.join(timeout=3)
