from sqlalchemy import JSON, Boolean, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column

from backend.core.database import Base, Record


class StaffCredential(Record, Base):
    __tablename__ = "staff_credentials"
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    title: Mapped[str] = mapped_column(String(240))
    kind: Mapped[str] = mapped_column(String(120), default="Đào tạo nội bộ")
    issuer: Mapped[str] = mapped_column(String(240))
    issue_date: Mapped[str] = mapped_column(String(10))
    expiry_date: Mapped[str] = mapped_column(String(10), index=True)
    verified: Mapped[bool] = mapped_column(Boolean, default=False)
    reminder_days: Mapped[list] = mapped_column(JSON, default=lambda: [30, 14, 7])
    file_key: Mapped[str | None] = mapped_column(String(150), nullable=True)
