from sqlalchemy import ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column

from backend.core.database import Base, Record


class Reminder(Record, Base):
    __tablename__ = "reminders"
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    credential_id: Mapped[str | None] = mapped_column(
        ForeignKey("staff_credentials.id"), nullable=True
    )
    assignment_id: Mapped[str | None] = mapped_column(
        ForeignKey("course_assignments.id"), nullable=True
    )
    scheduled_date: Mapped[str] = mapped_column(String(10), index=True)
    message: Mapped[str] = mapped_column(String(300))
