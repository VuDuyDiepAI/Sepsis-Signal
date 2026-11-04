from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from pydantic import BaseModel, Field
from sqlalchemy import select, func
from sqlalchemy.orm import Session
from .models import *
from .db import get_db
from .auth import (
    require,
    current_user,
    audit,
    has_role,
    can_review,
    ensure_scope,
    departments_for,
)
from .knowledge import version_access, valid_active, latest_approved, citation
from .jobs import handlers, run_job
from . import ai

router = APIRouter(prefix="/api")


class LessonInput(BaseModel):
    title: str = Field(min_length=1, max_length=240)
    objective: str = Field(min_length=1, max_length=4000)
    content: str = Field(min_length=1, max_length=20000)
    key_points: list[str] = Field(default_factory=list, max_length=20)
    citation_ids: list[str] = Field(min_length=1, max_length=20)


class ChecklistInput(BaseModel):
    title: str = Field(min_length=1, max_length=240)
    description: str = Field(min_length=1, max_length=4000)
    critical: bool = False
    citation_ids: list[str] = Field(min_length=1, max_length=20)


class QuestionInput(BaseModel):
    question: str = Field(min_length=1, max_length=4000)
    options: list[str] = Field(min_length=4, max_length=4)
    correct: int = Field(ge=0, le=3)
    explanation: str = Field(min_length=1, max_length=4000)
    difficulty: str = "Cơ bản"
    citation_ids: list[str] = Field(min_length=1, max_length=20)


class ContentInput(BaseModel):
    title: str = Field(min_length=3, max_length=240)
    description: str = Field(max_length=4000)
    audience: str = Field(max_length=240)
    objectives: list[str] = Field(min_length=1, max_length=20)
    duration: int = Field(ge=1, le=600)
    pass_score: int = Field(default=80, ge=1, le=100)
    lessons: list[LessonInput] = Field(min_length=1, max_length=30)
    checklist: list[ChecklistInput] = Field(min_length=1, max_length=100)
    questions: list[QuestionInput] = Field(min_length=1, max_length=50)
    storyboard: list[dict] = Field(default_factory=list, max_length=30)
    expected_version_id: str | None = None


class Generate(BaseModel):
    version_ids: list[str] = Field(min_length=1, max_length=5)


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
        and all(has_role(user, "ADMIN", department_id=d.department_id) for d in docs),
        "can_review": bool(docs) and all(can_review(user, d) for d in docs),
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
    if learner and not has_role(user,"STAFF"):
        raise HTTPException(403,"Chỉ Staff được sử dụng chức năng học tập cá nhân.")
    course = db.get(Course, cid)
    v = db.get(CourseVersion, version_id) if version_id else latest_course(db, cid)
    if not course or not v or v.course_id != cid:
        raise HTTPException(404, "Không tìm thấy khóa học.")
    privileged = course_capabilities(db, user, v)
    if learner or not (privileged["can_manage"] or privileged["can_review"]):
        if not has_role(user,"STAFF"):
            raise HTTPException(404,"Không tìm thấy khóa học trong phạm vi được cấp quyền.")
        if "course_assignments" not in Base.metadata.tables:
            raise HTTPException(404, "Bạn chưa được phân công khóa học này.")
        from .training import CourseAssignment

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
            or not db.scalar(
                select(CourseAssignment.id).where(
                    CourseAssignment.user_id == user.id,
                    CourseAssignment.course_version_id == v.id,
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
    return course, v


def validate_citations(db, content, source_ids):
    allowed = set(
        db.scalars(
            select(DocumentChunk.id).where(DocumentChunk.version_id.in_(source_ids))
        )
    )
    for item in [*content.lessons, *content.checklist, *content.questions]:
        if not set(item.citation_ids).issubset(allowed):
            raise HTTPException(
                422,
                "Trích dẫn không thuộc phiên bản tài liệu nguồn. Không thể lưu học liệu.",
            )
    for scene in content.storyboard:
        if (
            not isinstance(scene.get("citation_ids"), list)
            or not scene["citation_ids"]
            or not set(scene["citation_ids"]).issubset(allowed)
        ):
            raise HTTPException(422, "Kịch bản video phải có trích dẫn thuộc nguồn.")
    if any(
        not x.strip() or len(x) > 5000 for q in content.questions for x in q.options
    ):
        raise HTTPException(422, "Các phương án trả lời phải có nội dung hợp lệ.")


def persist_content(db, course, content, user_id, source_ids, mode="demo-template"):
    validate_citations(db, content, source_ids)
    number = (
        db.scalar(
            select(func.max(CourseVersion.number)).where(
                CourseVersion.course_id == course.id
            )
        )
        or 0
    ) + 1
    v = CourseVersion(
        course_id=course.id,
        number=number,
        author_id=user_id,
        mode=mode,
        **content.model_dump(
            exclude={"lessons", "checklist", "questions", "expected_version_id"}
        ),
    )
    db.add(v)
    db.flush()
    db.add_all(
        CourseSourceDocument(course_version_id=v.id, document_version_id=s)
        for s in source_ids
    )
    for i, l in enumerate(content.lessons):
        db.add(Lesson(course_version_id=v.id, position=i, **l.model_dump()))
    checklist = Checklist(course_version_id=v.id)
    quiz = Quiz(course_version_id=v.id)
    db.add_all([checklist, quiz])
    db.flush()
    for i, item in enumerate(content.checklist):
        db.add(
            ChecklistItem(checklist_id=checklist.id, position=i, **item.model_dump())
        )
    for i, q in enumerate(content.questions):
        question = QuizQuestion(
            quiz_id=quiz.id, position=i, **q.model_dump(exclude={"options"})
        )
        db.add(question)
        db.flush()
        db.add_all(
            AnswerOption(question_id=question.id, position=j, text=text)
            for j, text in enumerate(q.options)
        )
    db.flush()
    return v


def demo_content(chunks, title):
    chosen = [chunks[i % len(chunks)] for i in range(min(5, max(3, len(chunks))))]
    lessons = [
        {
            "title": f"Bài {i + 1}: {c.section[:150]}",
            "objective": "Đọc và đối soát thông tin trong nguồn đào tạo giả lập.",
            "content": c.text,
            "key_points": [c.text[:250]],
            "citation_ids": [c.id],
        }
        for i, c in enumerate(chosen)
    ]
    checklist = [
        {
            "title": c.section[:240],
            "description": c.text[:2000],
            "critical": False,
            "citation_ids": [c.id],
        }
        for c in chosen
    ]
    questions = []
    for i in range(max(5, len(chosen))):
        c = chosen[i % len(chosen)]
        correct = i % 4
        options = [
            "Không cần đối chiếu tài liệu nguồn.",
            "Thông tin không được mô tả trong mục được trích dẫn.",
            "Bỏ qua nội dung tài liệu trong buổi học.",
        ]
        options.insert(correct, c.text[:500])
        questions.append(
            {
                "question": f"Câu {i + 1}: Đoạn nào phản ánh nội dung được ghi tại “{c.section[:150]}”?",
                "options": options,
                "correct": correct,
                "explanation": "Đối chiếu nguyên văn nguồn: " + c.text[:2000],
                "citation_ids": [c.id],
            }
        )
    return ContentInput(
        title="Đào tạo: " + title[:220],
        description="Học liệu demo từ tài liệu giả lập. Chỉ phục vụ thử nghiệm; cần chuyên gia kiểm duyệt.",
        audience="Điều dưỡng mới · Khoa Cấp cứu",
        objectives=[
            "Nhận diện nội dung được ghi trong tài liệu.",
            "Đối soát bằng chứng và thực hành bài tập giả lập.",
        ],
        duration=20,
        lessons=lessons,
        checklist=checklist,
        questions=questions,
        storyboard=[
            {
                "title": "Đọc và đối soát nguồn",
                "narration": chosen[0].text,
                "visual": "Hiển thị tài liệu nguồn và phần được trích dẫn.",
                "duration_seconds": 60,
                "citation_ids": [chosen[0].id],
            }
        ],
    )


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


handlers["GENERATE_COURSE"] = generate_job


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


def serialize_course(db, user, course, v, full=False, learner=False):
    sources = []
    for vid in db.scalars(
        select(CourseSourceDocument.document_version_id).where(
            CourseSourceDocument.course_version_id == v.id
        )
    ):
        dv = db.get(DocumentVersion, vid)
        doc = db.get(Document, dv.document_id)
        sources.append(
            {
                "version_id": vid,
                "document_id": doc.id,
                "title": doc.title,
                "number": dv.number,
            }
        )
    result = {
        k: getattr(v, k)
        for k in (
            "title",
            "description",
            "audience",
            "objectives",
            "duration",
            "pass_score",
            "status",
            "number",
            "mode",
            "storyboard",
            "created_at",
        )
    }
    result.update(
        id=course.id, version_id=v.id, needs_review=course.needs_review, sources=sources
    )
    result.update(course_capabilities(db, user, v))
    result["can_approve"] = result["can_review"] and user.id not in (
        course.creator_id,
        v.author_id,
        v.submitted_by,
    )
    if not full:
        return result
    chunks = {c.id: c for c in source_chunks(db, v)}

    def cites(ids):
        return [
            citation(chunks[i], db.get(Document, chunks[i].document_id))
            for i in ids
            if i in chunks
        ]

    lessons = list(
        db.scalars(
            select(Lesson)
            .where(Lesson.course_version_id == v.id)
            .order_by(Lesson.position)
        )
    )
    result["lessons"] = [
        {
            "id": l.id,
            "title": l.title,
            "objective": l.objective,
            "content": l.content,
            "key_points": l.key_points,
            "citation_ids": l.citation_ids,
            "citations": cites(l.citation_ids),
        }
        for l in lessons
    ]
    ck = db.scalar(select(Checklist).where(Checklist.course_version_id == v.id))
    result["checklist"] = [
        {
            "id": x.id,
            "title": x.title,
            "description": x.description,
            "critical": x.critical,
            "citation_ids": x.citation_ids,
            "citations": cites(x.citation_ids),
        }
        for x in db.scalars(
            select(ChecklistItem)
            .where(ChecklistItem.checklist_id == ck.id)
            .order_by(ChecklistItem.position)
        )
    ]
    quiz = db.scalar(select(Quiz).where(Quiz.course_version_id == v.id))
    result["quiz_id"] = quiz.id
    questions = []
    for q in db.scalars(
        select(QuizQuestion)
        .where(QuizQuestion.quiz_id == quiz.id)
        .order_by(QuizQuestion.position)
    ):
        item = {
            "id": q.id,
            "question": q.question,
            "options": [
                o.text
                for o in db.scalars(
                    select(AnswerOption)
                    .where(AnswerOption.question_id == q.id)
                    .order_by(AnswerOption.position)
                )
            ],
            "difficulty": q.difficulty,
            "citation_ids": q.citation_ids,
        }
        if not learner and (result["can_manage"] or result["can_review"]):
            item.update(
                correct=q.correct,
                explanation=q.explanation,
                citations=cites(q.citation_ids),
            )
        questions.append(item)
    result["questions"] = questions
    result["approvals"] = [
        {
            "reviewer_id": a.reviewer_id,
            "decision": a.decision,
            "comment": a.comment,
            "created_at": a.created_at,
        }
        for a in db.scalars(
            select(ContentApproval).where(ContentApproval.course_version_id == v.id)
        )
    ]
    return result


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
    if v.status == "PENDING_REVIEW" and not capabilities["can_review"]:
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


class ApprovalInput(BaseModel):
    version_id: str
    comment: str = Field(default="", max_length=4000)


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
        if action == "reject" and not body.comment.strip():
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


def flag_source_change(db, document_id, new_version_id):
    rows = db.execute(
        select(CourseSourceDocument, CourseVersion, DocumentVersion)
        .join(CourseVersion, CourseVersion.id == CourseSourceDocument.course_version_id)
        .join(
            DocumentVersion,
            DocumentVersion.id == CourseSourceDocument.document_version_id,
        )
        .where(
            DocumentVersion.document_id == document_id,
            DocumentVersion.id != new_version_id,
        )
    )
    for source, version, doc in rows:
        db.get(Course, version.course_id).needs_review = True


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
