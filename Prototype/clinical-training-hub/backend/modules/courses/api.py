from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.core.database import get_db
from backend.core.security import current_user, ensure_scope, require
from backend.infrastructure.workers import run_job
from backend.models.courses import ContentApproval, Course, CourseSourceDocument
from backend.models.documents import DocumentChunk
from backend.models.jobs import BackgroundJob
from backend.modules.courses.access import (
    audit_course,
    course_access,
    course_capabilities,
)
from backend.modules.courses.content import demo_content, persist_content
from backend.modules.courses.schemas import ApprovalInput, ContentInput, Generate
from backend.modules.courses.serializers import serialize_course
from backend.modules.documents.access import (
    latest_approved,
    valid_active,
    version_access,
)

router = APIRouter(prefix="/api")


@router.post("/ai/generate-course")
def generate(
    body: Generate,
    background: BackgroundTasks,
    user=Depends(require("ADMIN")),
    db: Session = Depends(get_db),
):
    for vid in body.version_ids:
        v, source_doc = version_access(db, user, vid, True)
        ensure_scope(user, source_doc.department_id, "ADMIN")
        if not valid_active(v):
            raise HTTPException(409, "Nguồn không còn hiệu lực.")
    job = BackgroundJob(
        user_id=user.id,
        kind="GENERATE_COURSE",
        target_id="",
        result={"version_ids": list(dict.fromkeys(body.version_ids))},
    )
    db.add(job)
    db.commit()
    background.add_task(run_job, job.id)
    return {"job_id": job.id}


@router.get("/courses")
def courses(
    status: str = "", user=Depends(current_user), db: Session = Depends(get_db)
):
    result = []
    for c in db.scalars(select(Course).order_by(Course.created_at.desc())):
        try:
            _, v = course_access(db, user, c.id)
            if not status or v.status == status:
                result.append(serialize_course(db, user, c, v))
        except HTTPException:
            continue
    return result


@router.get("/courses/{cid}")
def course_detail(
    cid: str,
    version_id: str | None = None,
    learner: bool = False,
    user=Depends(current_user),
    db: Session = Depends(get_db),
):
    c, v = course_access(db, user, cid, version_id, learner)
    return serialize_course(db, user, c, v, True, learner)


@router.put("/courses/{cid}")
def edit_course(
    cid: str,
    body: ContentInput,
    user=Depends(require("ADMIN")),
    db: Session = Depends(get_db),
):
    c, v = course_access(db, user, cid)
    if body.expected_version_id != v.id:
        raise HTTPException(409, "Học liệu đã thay đổi. Hãy tải lại trước khi lưu.")
    capabilities = course_capabilities(db, user, v)
    if not capabilities["can_manage"]:
        raise HTTPException(403, "Bạn không có quyền biên tập học liệu này.")
    if v.status == "PENDING_REVIEW" and (not capabilities["can_review"]):
        raise HTTPException(
            409, "Nội dung đang chờ duyệt. Cần chuyên gia trả lại trước khi chỉnh sửa."
        )
    source_ids = list(
        db.scalars(
            select(CourseSourceDocument.document_version_id).where(
                CourseSourceDocument.course_version_id == v.id
            )
        )
    )
    new = persist_content(db, c, body, user.id, source_ids, v.mode)
    audit_course(db, user, "course.edit", new.id, new)
    db.commit()
    return serialize_course(db, user, c, new, True)


@router.post("/courses/{cid}/{action}")
def transition(
    cid: str,
    action: str,
    body: ApprovalInput,
    user=Depends(current_user),
    db: Session = Depends(get_db),
):
    c, v = course_access(db, user, cid)
    if body.version_id != v.id:
        raise HTTPException(409, "Phiên bản đã thay đổi. Vui lòng tải lại.")
    if action == "submit-review":
        if not course_capabilities(db, user, v)["can_manage"]:
            raise HTTPException(403, "Bạn không có quyền gửi duyệt.")
        if v.status not in ("DRAFT", "REJECTED"):
            raise HTTPException(
                409, "Chỉ bản nháp hoặc nội dung bị trả lại mới được gửi duyệt."
            )
        v.status = "PENDING_REVIEW"
        v.submitted_by = user.id
    elif action in ("approve", "reject"):
        if not course_capabilities(db, user, v)["can_review"] or user.id in (
            c.creator_id,
            v.author_id,
            v.submitted_by,
        ):
            raise HTTPException(
                403,
                "Cần một chuyên gia độc lập; người tạo hoặc sửa bản nháp không được tự phê duyệt.",
            )
        if v.status != "PENDING_REVIEW":
            raise HTTPException(409, "Nội dung chưa ở trạng thái chờ duyệt.")
        if action == "reject" and (not body.comment.strip()):
            raise HTTPException(422, "Vui lòng nhập lý do từ chối.")
        v.status = "APPROVED" if action == "approve" else "REJECTED"
        db.add(
            ContentApproval(
                course_version_id=v.id,
                reviewer_id=user.id,
                decision=v.status,
                comment=body.comment,
            )
        )
    elif action == "publish":
        if not course_capabilities(db, user, v)["can_manage"]:
            raise HTTPException(403, "Bạn không có quyền xuất bản khóa học.")
        if v.status != "APPROVED":
            raise HTTPException(
                409, "Chỉ nội dung được chuyên gia phê duyệt mới có thể xuất bản."
            )
        for s in db.scalars(
            select(CourseSourceDocument).where(
                CourseSourceDocument.course_version_id == v.id
            )
        ):
            dv, doc = version_access(db, user, s.document_version_id, True)
            latest = latest_approved(db, doc)
            if not latest or latest.id != dv.id:
                raise HTTPException(
                    409,
                    "Tài liệu nguồn đã thay đổi hoặc hết hiệu lực. Hãy tạo học liệu mới và duyệt lại.",
                )
        v.status = "PUBLISHED"
        c.needs_review = False
    else:
        raise HTTPException(404, "Không tìm thấy thao tác.")
    audit_course(db, user, "course." + action, v.id, v)
    db.commit()
    return serialize_course(db, user, c, v, True)


@router.post("/ai/generate-{kind}")
def generate_part(
    kind: str,
    body: Generate,
    user=Depends(require("ADMIN")),
    db: Session = Depends(get_db),
):
    if kind not in ("checklist", "quiz", "storyboard"):
        raise HTTPException(404, "Không tìm thấy tính năng.")
    chunks = []
    title = ""
    for vid in body.version_ids:
        v, d = version_access(db, user, vid, True)
        ensure_scope(user, d.department_id, "ADMIN")
        if not valid_active(v):
            raise HTTPException(409, "Nguồn không còn hiệu lực.")
        chunks.extend(
            db.scalars(select(DocumentChunk).where(DocumentChunk.version_id == vid))
        )
        title = d.title
    content = demo_content(chunks, title)
    return {
        "mode": "demo-template",
        "content": content.model_dump()[
            {"checklist": "checklist", "quiz": "questions", "storyboard": "storyboard"}[
                kind
            ]
        ],
        "status": "DRAFT",
    }
