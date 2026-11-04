from fastapi import HTTPException
from sqlalchemy import select

from backend.core.database import Base
from backend.core.security import audit, can_review, has_role
from backend.models.courses import Course, CourseSourceDocument, CourseVersion
from backend.models.documents import Document, DocumentChunk, DocumentVersion
from backend.modules.documents.access import version_access


def latest_course(db, cid):
    return db.scalar(
        select(CourseVersion)
        .where(CourseVersion.course_id == cid)
        .order_by(CourseVersion.number.desc())
    )


def source_chunks(db, v):
    ids = list(
        db.scalars(
            select(CourseSourceDocument.document_version_id).where(
                CourseSourceDocument.course_version_id == v.id
            )
        )
    )
    return list(
        db.scalars(select(DocumentChunk).where(DocumentChunk.version_id.in_(ids)))
    )


def course_capabilities(db, user, v):
    docs = list(
        db.scalars(
            select(Document)
            .join(DocumentVersion, Document.id == DocumentVersion.document_id)
            .join(
                CourseSourceDocument,
                DocumentVersion.id == CourseSourceDocument.document_version_id,
            )
            .where(CourseSourceDocument.course_version_id == v.id)
        )
    )
    return {
        "can_manage": bool(docs)
        and all((has_role(user, "ADMIN", department_id=d.department_id) for d in docs)),
        "can_review": bool(docs) and all((can_review(user, d) for d in docs)),
    }


def audit_course(db, user, action, target, v):
    deps = set(
        db.scalars(
            select(Document.department_id)
            .join(DocumentVersion, Document.id == DocumentVersion.document_id)
            .join(
                CourseSourceDocument,
                DocumentVersion.id == CourseSourceDocument.document_version_id,
            )
            .where(CourseSourceDocument.course_version_id == v.id)
        )
    )
    for dep in deps:
        audit(db, user, action, target, department_id=dep)


def course_access(db, user, cid, version_id=None, learner=False):
    if learner and (not has_role(user, "STAFF")):
        raise HTTPException(403, "Chỉ Staff được sử dụng chức năng học tập cá nhân.")
    course = db.get(Course, cid)
    v = db.get(CourseVersion, version_id) if version_id else latest_course(db, cid)
    if not course or not v or v.course_id != cid:
        raise HTTPException(404, "Không tìm thấy khóa học.")
    privileged = course_capabilities(db, user, v)
    if learner or not (privileged["can_manage"] or privileged["can_review"]):
        if not has_role(user, "STAFF"):
            raise HTTPException(
                404, "Không tìm thấy khóa học trong phạm vi được cấp quyền."
            )
        if "course_assignments" not in Base.metadata.tables:
            raise HTTPException(404, "Bạn chưa được phân công khóa học này.")
        from backend.models.training import CourseAssignment

        if not version_id:
            a = db.scalar(
                select(CourseAssignment)
                .join(
                    CourseVersion,
                    CourseAssignment.course_version_id == CourseVersion.id,
                )
                .where(
                    CourseAssignment.user_id == user.id, CourseVersion.course_id == cid
                )
                .order_by(CourseAssignment.created_at.desc())
            )
            v = db.get(CourseVersion, a.course_version_id) if a else None
        if (
            not v
            or v.status != "PUBLISHED"
            or (
                not db.scalar(
                    select(CourseAssignment.id).where(
                        CourseAssignment.user_id == user.id,
                        CourseAssignment.course_version_id == v.id,
                    )
                )
            )
        ):
            raise HTTPException(404, "Bạn chưa được phân công khóa học này.")
    for s in db.scalars(
        select(CourseSourceDocument).where(
            CourseSourceDocument.course_version_id == v.id
        )
    ):
        version_access(
            db,
            user,
            s.document_version_id,
            approved=learner
            or not (privileged["can_manage"] or privileged["can_review"]),
        )
    return (course, v)
