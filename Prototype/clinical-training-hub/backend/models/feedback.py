from sqlalchemy import CheckConstraint, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from backend.core.database import Base, Record


class Feedback(Record, Base):
    __tablename__ = "feedback"
    department_id: Mapped[str | None] = mapped_column(
        ForeignKey("departments.id"), nullable=True, index=True
    )
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    feature: Mapped[str] = mapped_column(String(120))
    rating: Mapped[int] = mapped_column(Integer)
    positives: Mapped[str] = mapped_column(Text, default="")
    issues: Mapped[str] = mapped_column(Text, default="")
    suggestions: Mapped[str] = mapped_column(Text, default="")
    status: Mapped[str] = mapped_column(String(30), default="NEW")
    __table_args__ = (
        CheckConstraint("rating >= 1 AND rating <= 5"),
        CheckConstraint("status IN ('NEW','REVIEWING','RESOLVED')"),
    )
