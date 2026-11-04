import os
from pathlib import Path
from datetime import datetime, timezone
from sqlalchemy import create_engine, event, String, DateTime
from sqlalchemy.orm import DeclarativeBase, sessionmaker, Mapped, mapped_column

ROOT = Path(__file__).resolve().parents[1]
DATA = Path(os.getenv("DATA_DIR", str(ROOT / "data")))
DATA.mkdir(parents=True, exist_ok=True)
DATABASE_URL = os.getenv("DATABASE_URL", f"sqlite:///{DATA / 'hub.db'}")
engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False}
    if DATABASE_URL.startswith("sqlite")
    else {},
    pool_pre_ping=True,
)
if DATABASE_URL.startswith("sqlite"):

    @event.listens_for(engine, "connect")
    def sqlite_config(conn, _):
        conn.execute("PRAGMA foreign_keys=ON")
        conn.execute("PRAGMA journal_mode=WAL")


Session = sessionmaker(engine, expire_on_commit=False)


def now():
    return datetime.now(timezone.utc).replace(tzinfo=None)


def today():
    from zoneinfo import ZoneInfo

    return datetime.now(ZoneInfo("Asia/Ho_Chi_Minh")).date()


class Base(DeclarativeBase):
    pass


class Record:
    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: __import__("uuid").uuid4().hex
    )
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)


def get_db():
    with Session() as db:
        yield db
