from sqlalchemy import (
    JSON,
    Boolean,
    CheckConstraint,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column

from backend.core.database import Base, Record


class Course(Record, Base):
    __tablename__ = "courses"
    creator_id: Mapped[str] = mapped_column(ForeignKey("users.id"))
    needs_review: Mapped[bool] = mapped_column(Boolean, default=False)


class CourseVersion(Record, Base):
    __tablename__ = "course_versions"
    course_id: Mapped[str] = mapped_column(ForeignKey("courses.id"), index=True)
    number: Mapped[int] = mapped_column(Integer)
    title: Mapped[str] = mapped_column(String(240))
    description: Mapped[str] = mapped_column(Text, default="")
    audience: Mapped[str] = mapped_column(String(240), default="Nhân viên y tế")
    objectives: Mapped[list] = mapped_column(JSON, default=list)
    duration: Mapped[int] = mapped_column(Integer, default=20)
    pass_score: Mapped[int] = mapped_column(Integer, default=80)
    status: Mapped[str] = mapped_column(String(30), default="DRAFT", index=True)
    author_id: Mapped[str] = mapped_column(ForeignKey("users.id"))
    submitted_by: Mapped[str | None] = mapped_column(
        ForeignKey("users.id"), nullable=True
    )
    mode: Mapped[str] = mapped_column(String(40), default="demo-template")
    storyboard: Mapped[list] = mapped_column(JSON, default=list)
    __table_args__ = (
        UniqueConstraint("course_id", "number"),
        CheckConstraint(
            "status IN ('DRAFT','PENDING_REVIEW','APPROVED','PUBLISHED','REJECTED')"
        ),
    )


class CourseSourceDocument(Base):
    __tablename__ = "course_sources"
    course_version_id: Mapped[str] = mapped_column(
        ForeignKey("course_versions.id"), primary_key=True
    )
    document_version_id: Mapped[str] = mapped_column(
        ForeignKey("document_versions.id"), primary_key=True
    )


class Lesson(Record, Base):
    __tablename__ = "lessons"
    course_version_id: Mapped[str] = mapped_column(
        ForeignKey("course_versions.id"), index=True
    )
    position: Mapped[int] = mapped_column(Integer)
    title: Mapped[str] = mapped_column(String(240))
    objective: Mapped[str] = mapped_column(Text)
    content: Mapped[str] = mapped_column(Text)
    key_points: Mapped[list] = mapped_column(JSON, default=list)
    citation_ids: Mapped[list] = mapped_column(JSON)


class Checklist(Record, Base):
    __tablename__ = "checklists"
    course_version_id: Mapped[str] = mapped_column(
        ForeignKey("course_versions.id"), unique=True
    )


class ChecklistItem(Record, Base):
    __tablename__ = "checklist_items"
    checklist_id: Mapped[str] = mapped_column(ForeignKey("checklists.id"), index=True)
    position: Mapped[int] = mapped_column(Integer)
    title: Mapped[str] = mapped_column(String(240))
    description: Mapped[str] = mapped_column(Text)
    critical: Mapped[bool] = mapped_column(Boolean, default=False)
    citation_ids: Mapped[list] = mapped_column(JSON)


class Quiz(Record, Base):
    __tablename__ = "quizzes"
    course_version_id: Mapped[str] = mapped_column(
        ForeignKey("course_versions.id"), unique=True
    )


class QuizQuestion(Record, Base):
    __tablename__ = "quiz_questions"
    quiz_id: Mapped[str] = mapped_column(ForeignKey("quizzes.id"), index=True)
    position: Mapped[int] = mapped_column(Integer)
    question: Mapped[str] = mapped_column(Text)
    correct: Mapped[int] = mapped_column(Integer)
    explanation: Mapped[str] = mapped_column(Text)
    difficulty: Mapped[str] = mapped_column(String(40), default="Cơ bản")
    citation_ids: Mapped[list] = mapped_column(JSON)
    __table_args__ = (CheckConstraint("correct >= 0 AND correct <= 3"),)


class AnswerOption(Record, Base):
    __tablename__ = "answer_options"
    question_id: Mapped[str] = mapped_column(
        ForeignKey("quiz_questions.id"), index=True
    )
    position: Mapped[int] = mapped_column(Integer)
    text: Mapped[str] = mapped_column(Text)


class ContentApproval(Record, Base):
    __tablename__ = "content_approvals"
    course_version_id: Mapped[str] = mapped_column(ForeignKey("course_versions.id"))
    reviewer_id: Mapped[str] = mapped_column(ForeignKey("users.id"))
    decision: Mapped[str] = mapped_column(String(30))
    comment: Mapped[str] = mapped_column(Text, default="")
