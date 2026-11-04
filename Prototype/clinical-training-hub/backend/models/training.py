from datetime import datetime

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column

from backend.core.database import Base, Record


class CourseAssignment(Record, Base):
    __tablename__ = "course_assignments"
    course_version_id: Mapped[str] = mapped_column(
        ForeignKey("course_versions.id"), index=True
    )
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    assigned_by: Mapped[str] = mapped_column(ForeignKey("users.id"))
    due_date: Mapped[str] = mapped_column(String(10), index=True)
    started_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    best_score: Mapped[float | None] = mapped_column(Float, nullable=True)
    __table_args__ = (UniqueConstraint("course_version_id", "user_id"),)


class LessonProgress(Record, Base):
    __tablename__ = "lesson_progress"
    assignment_id: Mapped[str] = mapped_column(
        ForeignKey("course_assignments.id"), index=True
    )
    lesson_id: Mapped[str] = mapped_column(ForeignKey("lessons.id"))
    __table_args__ = (UniqueConstraint("assignment_id", "lesson_id"),)


class QuizAttempt(Record, Base):
    __tablename__ = "quiz_attempts"
    assignment_id: Mapped[str] = mapped_column(
        ForeignKey("course_assignments.id"), index=True
    )
    quiz_id: Mapped[str] = mapped_column(ForeignKey("quizzes.id"))
    score: Mapped[float] = mapped_column(Float)
    passed: Mapped[bool] = mapped_column(Boolean)


class QuizAnswer(Record, Base):
    __tablename__ = "quiz_answers"
    attempt_id: Mapped[str] = mapped_column(ForeignKey("quiz_attempts.id"), index=True)
    question_id: Mapped[str] = mapped_column(ForeignKey("quiz_questions.id"))
    selected: Mapped[int] = mapped_column(Integer)
    correct: Mapped[bool] = mapped_column(Boolean)
    __table_args__ = (
        UniqueConstraint("attempt_id", "question_id"),
        CheckConstraint("selected >= 0 AND selected <= 3"),
    )
