from datetime import datetime

from sqlalchemy import JSON, Boolean, DateTime, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from backend.core.database import Base, Record


class Role(Base):
    __tablename__ = "roles"
    id: Mapped[str] = mapped_column(String(30), primary_key=True)
    name: Mapped[str] = mapped_column(String(100))


class Department(Record, Base):
    __tablename__ = "departments"
    name: Mapped[str] = mapped_column(String(120), unique=True)


class StaffGroup(Record, Base):
    __tablename__ = "staff_groups"
    name: Mapped[str] = mapped_column(String(120))
    department_id: Mapped[str] = mapped_column(ForeignKey("departments.id"))


class User(Record, Base):
    __tablename__ = "users"
    email: Mapped[str] = mapped_column(String(254), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(120))
    staff_code: Mapped[str] = mapped_column(String(50), unique=True)
    title: Mapped[str] = mapped_column(String(120), default="Nhân viên")
    password_hash: Mapped[str] = mapped_column(String(300))
    role: Mapped[str] = mapped_column(ForeignKey("roles.id"), default="STAFF")
    department_id: Mapped[str] = mapped_column(ForeignKey("departments.id"))
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    role_grants: Mapped[list["UserRole"]] = relationship(
        lazy="selectin", cascade="all, delete-orphan"
    )


class UserRole(Base):
    __tablename__ = "user_roles"
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), primary_key=True)
    role_id: Mapped[str] = mapped_column(ForeignKey("roles.id"), primary_key=True)
    department_id: Mapped[str] = mapped_column(
        ForeignKey("departments.id"), primary_key=True
    )
    review_specialties: Mapped[list] = mapped_column(JSON, default=list)


class GroupMembership(Base):
    __tablename__ = "group_memberships"
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), primary_key=True)
    group_id: Mapped[str] = mapped_column(
        ForeignKey("staff_groups.id"), primary_key=True
    )


class AuthSession(Record, Base):
    __tablename__ = "auth_sessions"
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime)
