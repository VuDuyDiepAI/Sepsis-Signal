from fastapi import HTTPException
from sqlalchemy import select

import backend.infrastructure.ai as ai
from backend.core.security import ensure_scope
from backend.models.courses import Course
from backend.models.documents import Document, DocumentChunk
from backend.models.identity import User
from backend.modules.courses.access import audit_course
from backend.modules.courses.content import demo_content, persist_content
from backend.modules.courses.schemas import ContentInput
from backend.modules.documents.access import valid_active, version_access
from backend.modules.documents.serializers import citation


def generate_job(db, job):
    versions = job.result.get("version_ids", [])
    user = db.get(User, job.user_id)
    chunks = []
    title = ""
    for vid in versions:
        v, doc = version_access(db, user, vid, True)
        ensure_scope(user, doc.department_id, "ADMIN")
        if not valid_active(v):
            raise HTTPException(
                409, "Tài liệu đã hết hiệu lực, không thể tạo học liệu."
            )
        chunks.extend(
            db.scalars(select(DocumentChunk).where(DocumentChunk.version_id == vid))
        )
        title = title or doc.title
    if not chunks:
        raise HTTPException(409, "Nguồn chưa có nội dung được trích xuất.")
    mode = "demo-template"
    if ai.provider() is None:
        content = demo_content(chunks, title)
    else:
        result = ai.complete_json(
            "Tạo học liệu theo JSON schema sau: "
            + str(ContentInput.model_json_schema())
            + " Có 3-5 bài, 5-10 câu, checklist và storyboard, mọi phần gắn citation_ids từ evidence. Không tự xác định bước quan trọng nếu nguồn không xác nhận.",
            [citation(c, db.get(Document, c.document_id)) for c in chunks][:35],
        )
        try:
            content = ContentInput.model_validate(result)
        except Exception:
            raise HTTPException(
                502, "AI tạo học liệu không đúng cấu trúc. Vui lòng thử lại."
            )
        mode = "provider"
    course = Course(creator_id=user.id)
    db.add(course)
    db.flush()
    v = persist_content(db, course, content, user.id, versions, mode)
    audit_course(db, user, "course.generate", course.id, v)
    return {"course_id": course.id, "version_id": v.id, "version_ids": versions}
