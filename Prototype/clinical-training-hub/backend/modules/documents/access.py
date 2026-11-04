from fastapi import HTTPException
from sqlalchemy import select

from backend.core.database import today as local_today
from backend.core.security import can_inspect, has_role
from backend.models.documents import Document, DocumentPermission, DocumentVersion


def document_access(db, user, doc):
    if not doc:
        return False
    if can_inspect(user, doc):
        return True
    if not has_role(user, "STAFF"):
        return False
    if doc.scope == "ALL" or (
        doc.scope == "DEPARTMENT"
        and has_role(user, "STAFF", department_id=doc.department_id)
    ):
        return True
    return db.get(DocumentPermission, (doc.id, user.id)) is not None


def version_access(db, user, version_id, approved=False):
    v = db.get(DocumentVersion, version_id)
    doc = db.get(Document, v.document_id) if v else None
    if (
        not v
        or not document_access(db, user, doc)
        or ((not can_inspect(user, doc) or approved) and v.status != "APPROVED")
    ):
        raise HTTPException(
            404, "Không tìm thấy tài liệu hoặc bạn chưa được cấp quyền."
        )
    return (v, doc)


def valid_active(v):
    today = local_today().isoformat()
    return (
        v.status == "APPROVED"
        and v.processing == "COMPLETED"
        and (not v.effective_date or v.effective_date <= today)
        and (not v.review_date or v.review_date >= today)
    )


def latest_approved(db, doc):
    return next(
        (
            v
            for v in db.scalars(
                select(DocumentVersion)
                .where(DocumentVersion.document_id == doc.id)
                .order_by(DocumentVersion.number.desc())
            )
            if valid_active(v)
        ),
        None,
    )
