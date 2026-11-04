from datetime import datetime
from sqlalchemy import (
    String,
    Text,
    ForeignKey,
    JSON,
    Boolean,
    Integer,
    Float,
    DateTime,
    UniqueConstraint,
    CheckConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship
from .db import Base, Record
from .vector import VectorStorage


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
    role: Mapped[str] = mapped_column(
        ForeignKey("roles.id"), default="STAFF"
    )  # Legacy, never authorizes.
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


class AuditLog(Record, Base):
    __tablename__ = "audit_logs"
    user_id: Mapped[str | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    action: Mapped[str] = mapped_column(String(100))
    target_id: Mapped[str] = mapped_column(String(36), default="")
    detail: Mapped[str] = mapped_column(String(300), default="")
    department_id: Mapped[str | None] = mapped_column(
        ForeignKey("departments.id"), nullable=True, index=True
    )


class Setting(Base):
    __tablename__ = "settings"
    key: Mapped[str] = mapped_column(String(80), primary_key=True)
    value: Mapped[dict] = mapped_column(JSON)


class Document(Record, Base):
    __tablename__ = "documents"
    title: Mapped[str] = mapped_column(String(240))
    description: Mapped[str] = mapped_column(Text, default="")
    department_id: Mapped[str] = mapped_column(ForeignKey("departments.id"), index=True)
    specialty: Mapped[str] = mapped_column(String(120), default="Cấp cứu")
    kind: Mapped[str] = mapped_column(String(80), default="Quy trình")
    language: Mapped[str] = mapped_column(String(10), default="vi")
    scope: Mapped[str] = mapped_column(String(20), default="DEPARTMENT")
    creator_id: Mapped[str] = mapped_column(ForeignKey("users.id"))
    __table_args__ = (CheckConstraint("scope IN ('ALL','DEPARTMENT','RESTRICTED')"),)


class DocumentPermission(Base):
    __tablename__ = "document_permissions"
    document_id: Mapped[str] = mapped_column(
        ForeignKey("documents.id"), primary_key=True
    )
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), primary_key=True)


class DocumentVersion(Record, Base):
    __tablename__ = "document_versions"
    document_id: Mapped[str] = mapped_column(ForeignKey("documents.id"), index=True)
    number: Mapped[int] = mapped_column(Integer)
    status: Mapped[str] = mapped_column(String(30), default="DRAFT", index=True)
    processing: Mapped[str] = mapped_column(String(30), default="QUEUED")
    file_key: Mapped[str] = mapped_column(String(150))
    filename: Mapped[str] = mapped_column(String(240))
    sha256: Mapped[str] = mapped_column(String(64))
    uploader_id: Mapped[str] = mapped_column(ForeignKey("users.id"))
    submitted_by: Mapped[str | None] = mapped_column(
        ForeignKey("users.id"), nullable=True
    )
    effective_date: Mapped[str | None] = mapped_column(String(10), nullable=True)
    review_date: Mapped[str | None] = mapped_column(String(10), nullable=True)
    error: Mapped[str] = mapped_column(String(300), default="")
    __table_args__ = (
        UniqueConstraint("document_id", "number"),
        CheckConstraint(
            "status IN ('DRAFT','PENDING_REVIEW','APPROVED','ARCHIVED','REJECTED')"
        ),
    )


class DocumentChunk(Record, Base):
    __tablename__ = "document_chunks"
    document_id: Mapped[str] = mapped_column(ForeignKey("documents.id"), index=True)
    version_id: Mapped[str] = mapped_column(
        ForeignKey("document_versions.id"), index=True
    )
    page: Mapped[int | None] = mapped_column(Integer, nullable=True)
    section: Mapped[str] = mapped_column(String(240))
    text: Mapped[str] = mapped_column(Text)
    embedding: Mapped[list] = mapped_column(VectorStorage, default=list)
    embedding_model: Mapped[str] = mapped_column(String(150), default="demo-hash-v1")


class SourceCitation(Record, Base):
    __tablename__ = "source_citations"
    chunk_id: Mapped[str] = mapped_column(ForeignKey("document_chunks.id"))
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"))
    purpose: Mapped[str] = mapped_column(String(40))


class DocumentReview(Record, Base):
    __tablename__ = "document_reviews"
    version_id: Mapped[str] = mapped_column(ForeignKey("document_versions.id"))
    reviewer_id: Mapped[str] = mapped_column(ForeignKey("users.id"))
    decision: Mapped[str] = mapped_column(String(30))
    comment: Mapped[str] = mapped_column(Text, default="")


class ChatConversation(Record, Base):
    __tablename__ = "chat_conversations"
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    title: Mapped[str] = mapped_column(String(150), default="Hội thoại mới")


class ChatMessage(Record, Base):
    __tablename__ = "chat_messages"
    conversation_id: Mapped[str] = mapped_column(
        ForeignKey("chat_conversations.id"), index=True
    )
    role: Mapped[str] = mapped_column(String(20))
    content: Mapped[str] = mapped_column(Text)
    citation_ids: Mapped[list] = mapped_column(JSON, default=list)
    helpful: Mapped[bool | None] = mapped_column(Boolean, nullable=True)


class BackgroundJob(Record, Base):
    __tablename__ = "background_jobs"
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"))
    kind: Mapped[str] = mapped_column(String(40))
    target_id: Mapped[str] = mapped_column(String(36))
    status: Mapped[str] = mapped_column(String(30), default="QUEUED", index=True)
    error: Mapped[str] = mapped_column(String(300), default="")
    attempts: Mapped[int] = mapped_column(Integer, default=0)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=__import__("backend.db", fromlist=["now"]).now
    )
    result: Mapped[dict] = mapped_column(JSON, default=dict)


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
