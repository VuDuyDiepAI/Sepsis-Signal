from sqlalchemy import (
    CheckConstraint,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column

from backend.core.database import Base, Record
from backend.infrastructure.vectors import VectorStorage


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
