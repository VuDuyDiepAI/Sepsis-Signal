from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column

from backend.core.database import Base, Record


class TrainingEvent(Record, Base):
    __tablename__ = "training_events"
    title: Mapped[str] = mapped_column(String(240))
    starts_at: Mapped[datetime] = mapped_column(DateTime, index=True)
    location: Mapped[str] = mapped_column(String(240), default="")
    department_id: Mapped[str] = mapped_column(ForeignKey("departments.id"))
    group_id: Mapped[str | None] = mapped_column(
        ForeignKey("staff_groups.id"), nullable=True
    )
    creator_id: Mapped[str] = mapped_column(ForeignKey("users.id"))
