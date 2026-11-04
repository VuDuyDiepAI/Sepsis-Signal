from datetime import date, datetime, timedelta, timezone
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, model_validator
from sqlalchemy import select, func, delete
from sqlalchemy.orm import Session
from .models import *
from .db import get_db, now, today
from .auth import require, current_user, audit, has_role, ensure_scope, departments_for
from .courses import course_access, serialize_course, course_capabilities
from .knowledge import version_access, latest_approved, citation

router = APIRouter(prefix="/api")


def assignment_status(a):
    if a.completed_at:
        return "COMPLETED"
    if a.due_date < today().isoformat():
        return "OVERDUE"
    return "IN_PROGRESS" if a.started_at else "NOT_STARTED"


def serialize_assignment(db, a):
    v = db.get(CourseVersion, a.course_version_id)
    u = db.get(User, a.user_id)
    total = (
        db.scalar(
            select(func.count())
            .select_from(Lesson)
            .where(Lesson.course_version_id == v.id)
        )
        or 1
    )
    done = list(
        db.scalars(
            select(LessonProgress.lesson_id).where(LessonProgress.assignment_id == a.id)
        )
    )
    return {
        "id": a.id,
        "course_id": v.course_id,
        "version_id": v.id,
        "title": v.title,
        "duration": v.duration,
        "user_id": u.id,
        "name": u.name,
        "department_id": u.department_id,
        "due_date": a.due_date,
        "status": assignment_status(a),
        "progress": 100 if a.completed_at else round(len(done) / total * 90),
        "completed_lessons": done,
        "lesson_count": total,
        "best_score": a.best_score,
        "started_at": a.started_at,
        "completed_at": a.completed_at,
        "attempt_count": db.scalar(
            select(func.count())
            .select_from(QuizAttempt)
            .where(QuizAttempt.assignment_id == a.id)
        ),
    }


class AssignmentInput(BaseModel):
    course_id: str
    user_ids: list[str] = Field(default_factory=list, max_length=300)
    group_id: str | None = None
    department_id: str | None = None
    due_date: date

    @model_validator(mode="after")
    def one_target(self):
        if (
            sum([bool(self.user_ids), bool(self.group_id), bool(self.department_id)])
            != 1
        ):
            raise ValueError("Chọn một loại đối tượng phân công.")
        return self


@router.post("/training/assignments")
def assign(
    body: AssignmentInput,
    user=Depends(require("ADMIN")),
    db: Session = Depends(get_db),
):
    c, v = course_access(db, user, body.course_id)
    if not course_capabilities(db, user, v)["can_manage"]:
        raise HTTPException(403, "Bạn không có quyền phân công khóa học này.")
    if v.status != "PUBLISHED" or c.needs_review:
        raise HTTPException(
            409, "Chỉ phân công khóa học đã xuất bản và không có cảnh báo cần rà soát."
        )
    if body.due_date < today():
        raise HTTPException(422, "Hạn hoàn thành phải từ hôm nay trở đi.")
    ids = body.user_ids
    if body.group_id:
        group = db.get(StaffGroup, body.group_id)
        if group:
            ensure_scope(user, group.department_id, "ADMIN")
        if not group:
            raise HTTPException(404, "Không tìm thấy nhóm đào tạo.")
        ids = list(
            db.scalars(
                select(GroupMembership.user_id).where(
                    GroupMembership.group_id == body.group_id
                )
            )
        )
    if body.department_id:
        ensure_scope(user, body.department_id, "ADMIN")
        if not db.get(Department, body.department_id):
            raise HTTPException(404, "Không tìm thấy khoa/phòng.")
        ids = list(
            db.scalars(
                select(User.id).where(
                    User.department_id == body.department_id,
                    User.active == True,
                )
            )
        )
    if body.group_id or body.department_id:
        ids=[uid for uid in ids if (target:=db.get(User,uid)) and target.active and has_role(target,"STAFF",department_id=target.department_id)]
    if not ids:
        raise HTTPException(422, "Không có Staff phù hợp để phân công.")
    sources = list(
        db.scalars(
            select(CourseSourceDocument.document_version_id).where(
                CourseSourceDocument.course_version_id == v.id
            )
        )
    )
    for uid in set(ids):
        learner = db.get(User, uid)
        if learner:
            ensure_scope(user, learner.department_id, "ADMIN")
        if (
            not learner
            or not learner.active
            or not has_role(learner, "STAFF", department_id=learner.department_id)
        ):
            raise HTTPException(422, "Đối tượng học không hợp lệ.")
        for vid in sources:
            dv, doc = version_access(db, learner, vid, True)
            latest = latest_approved(db, doc)
            if not latest or latest.id != dv.id:
                raise HTTPException(
                    409,
                    "Nguồn của khóa học không còn là phiên bản được duyệt hiện hành.",
                )
    assigned = []
    for uid in set(ids):
        existing = db.scalar(
            select(CourseAssignment).where(
                CourseAssignment.course_version_id == v.id,
                CourseAssignment.user_id == uid,
            )
        )
        if existing:
            assigned.append(existing)
            continue
        a = CourseAssignment(
            course_version_id=v.id,
            user_id=uid,
            assigned_by=user.id,
            due_date=body.due_date.isoformat(),
        )
        db.add(a)
        db.flush()
        db.add(
            Reminder(
                user_id=uid,
                assignment_id=a.id,
                scheduled_date=(body.due_date - timedelta(days=3)).isoformat(),
                message="Sắp đến hạn khóa học: " + v.title[:240],
            )
        )
        assigned.append(a)
    for dep in {db.get(User, a.user_id).department_id for a in assigned}:
        audit(
            db,
            user,
            "training.assign",
            v.id,
            detail=str(len(assigned)) + " assignments",
            department_id=dep,
        )
    db.commit()
    return [serialize_assignment(db, a) for a in assigned]


@router.get("/training/my-courses")
def my_courses(user=Depends(require("STAFF")), db: Session = Depends(get_db)):
    result = []
    for a in db.scalars(
        select(CourseAssignment)
        .where(CourseAssignment.user_id == user.id)
        .order_by(CourseAssignment.created_at.desc())
    ):
        try:
            course_access(
                db,
                user,
                db.get(CourseVersion, a.course_version_id).course_id,
                a.course_version_id,
                learner=True,
            )
        except HTTPException:
            continue
        result.append(serialize_assignment(db, a))
    return result


def own_assignment(db, user, aid):
    if not has_role(user,"STAFF"):
        raise HTTPException(403,"Chỉ Staff được sử dụng chức năng học tập cá nhân.")
    a = db.get(CourseAssignment, aid)
    if not a or a.user_id != user.id:
        raise HTTPException(404, "Không tìm thấy phân công học tập.")
    v = db.get(CourseVersion, a.course_version_id)
    course_access(db, user, v.course_id, v.id, learner=True)
    return a


class ProgressInput(BaseModel):
    assignment_id: str
    lesson_id: str


@router.post("/training/assignments/{aid}/start")
def start_learning(aid: str, user=Depends(require("STAFF")), db: Session = Depends(get_db)):
    a = own_assignment(db, user, aid)
    a.started_at = a.started_at or now()
    db.commit()
    return serialize_assignment(db, a)


@router.post("/training/progress")
def progress(
    body: ProgressInput, user=Depends(require("STAFF")), db: Session = Depends(get_db)
):
    a = own_assignment(db, user, body.assignment_id)
    l = db.get(Lesson, body.lesson_id)
    if not l or l.course_version_id != a.course_version_id:
        raise HTTPException(422, "Bài học không thuộc phiên bản khóa học được giao.")
    if not db.scalar(
        select(LessonProgress.id).where(
            LessonProgress.assignment_id == a.id, LessonProgress.lesson_id == l.id
        )
    ):
        db.add(LessonProgress(assignment_id=a.id, lesson_id=l.id))
    a.started_at = a.started_at or now()
    db.commit()
    return serialize_assignment(db, a)


class SubmitQuiz(BaseModel):
    assignment_id: str
    answers: dict[str, int]


def attempt_result(db, attempt):
    result = []
    for a in db.scalars(select(QuizAnswer).where(QuizAnswer.attempt_id == attempt.id)):
        q = db.get(QuizQuestion, a.question_id)
        sources = []
        for chunk_id in q.citation_ids:
            chunk = db.get(DocumentChunk, chunk_id)
            if chunk:
                sources.append(citation(chunk, db.get(Document, chunk.document_id)))
        result.append(
            {
                "question_id": q.id,
                "question": q.question,
                "selected": a.selected,
                "correct": q.correct,
                "is_correct": a.correct,
                "explanation": q.explanation,
                "citations": sources,
            }
        )
    return {
        "id": attempt.id,
        "score": attempt.score,
        "passed": attempt.passed,
        "created_at": attempt.created_at,
        "answers": result,
    }


@router.post("/training/quizzes/{qid}/submit")
def submit_quiz(
    qid: str,
    body: SubmitQuiz,
    user=Depends(require("STAFF")),
    db: Session = Depends(get_db),
):
    a = own_assignment(db, user, body.assignment_id)
    quiz = db.get(Quiz, qid)
    if not quiz or quiz.course_version_id != a.course_version_id:
        raise HTTPException(422, "Bài kiểm tra không thuộc khóa học được giao.")
    lessons = list(
        db.scalars(
            select(Lesson.id).where(Lesson.course_version_id == a.course_version_id)
        )
    )
    done = set(
        db.scalars(
            select(LessonProgress.lesson_id).where(LessonProgress.assignment_id == a.id)
        )
    )
    if not set(lessons).issubset(done):
        raise HTTPException(
            409, "Vui lòng hoàn thành tất cả bài học trước khi làm kiểm tra."
        )
    questions = list(
        db.scalars(
            select(QuizQuestion)
            .where(QuizQuestion.quiz_id == qid)
            .order_by(QuizQuestion.position)
        )
    )
    if set(body.answers) != set(q.id for q in questions) or any(
        type(v) != int or v not in range(4) for v in body.answers.values()
    ):
        raise HTTPException(
            422, "Cần trả lời đủ câu hỏi, mỗi câu chọn một trong bốn phương án."
        )
    score = round(
        sum(body.answers[q.id] == q.correct for q in questions) / len(questions) * 100,
        2,
    )
    passed = score >= db.get(CourseVersion, a.course_version_id).pass_score
    attempt = QuizAttempt(assignment_id=a.id, quiz_id=qid, score=score, passed=passed)
    db.add(attempt)
    db.flush()
    for q in questions:
        db.add(
            QuizAnswer(
                attempt_id=attempt.id,
                question_id=q.id,
                selected=body.answers[q.id],
                correct=body.answers[q.id] == q.correct,
            )
        )
    a.started_at = a.started_at or now()
    a.best_score = max(a.best_score or 0, score)
    if passed:
        a.completed_at = a.completed_at or now()
    audit(db, user, "training.quiz-submit", attempt.id)
    db.commit()
    return {**attempt_result(db, attempt), "assignment": serialize_assignment(db, a)}


@router.get("/training/assignments/{aid}/attempts")
def attempts(aid: str, user=Depends(require("STAFF")), db: Session = Depends(get_db)):
    a = own_assignment(db, user, aid)
    return [
        attempt_result(db, t)
        for t in db.scalars(
            select(QuizAttempt)
            .where(QuizAttempt.assignment_id == a.id)
            .order_by(QuizAttempt.created_at.desc())
        )
    ]


@router.get("/training/dashboard")
def dashboard(
    department_id: str = "",
    group_id: str = "",
    course_id: str = "",
    user=Depends(require("ADMIN")),
    db: Session = Depends(get_db),
):
    if department_id:
        ensure_scope(user, department_id, "ADMIN")
    if group_id:
        group = db.get(StaffGroup, group_id)
        if not group:
            raise HTTPException(404, "Không tìm thấy nhóm.")
        ensure_scope(user, group.department_id, "ADMIN")
    assignments = []
    members = (
        set(
            db.scalars(
                select(GroupMembership.user_id).where(
                    GroupMembership.group_id == group_id
                )
            )
        )
        if group_id
        else None
    )
    for a in db.scalars(select(CourseAssignment)):
        u = db.get(User, a.user_id)
        if not has_role(user, "ADMIN", department_id=u.department_id):
            continue
        v = db.get(CourseVersion, a.course_version_id)
        if department_id and u.department_id != department_id:
            continue
        if members is not None and u.id not in members:
            continue
        if course_id and v.course_id != course_id:
            continue
        assignments.append(serialize_assignment(db, a))
    count = len(assignments)
    completed = sum(a["status"] == "COMPLETED" for a in assignments)
    started = sum(a["started_at"] is not None for a in assignments)
    scores = [a["best_score"] for a in assignments if a["best_score"] is not None]
    return {
        "total_staff": len({a["user_id"] for a in assignments}),
        "total_assignments": count,
        "started": started,
        "completed": completed,
        "completion_rate": round(completed / count * 100, 1) if count else 0,
        "average_score": round(sum(scores) / len(scores), 1) if scores else None,
        "overdue": sum(a["status"] == "OVERDUE" for a in assignments),
        "assignments": assignments,
        "upcoming_credentials": [
            credential_dict(db, c)
            for c in db.scalars(select(StaffCredential))
            if (
                not department_id
                or db.get(User, c.user_id).department_id == department_id
            )
            and has_role(
                user, "ADMIN", department_id=db.get(User, c.user_id).department_id
            )
            and (members is None or c.user_id in members)
            and (date.fromisoformat(c.expiry_date) - today()).days
            <= max(c.reminder_days or [30])
        ],
    }


class EventInput(BaseModel):
    title: str = Field(min_length=3, max_length=240)
    starts_at: datetime
    location: str = Field(default="", max_length=240)
    department_id: str = "emergency"
    group_id: str | None = None


@router.post("/training/events")
def create_event(
    body: EventInput,
    user=Depends(require("ADMIN")),
    db: Session = Depends(get_db),
):
    ensure_scope(user, body.department_id, "ADMIN")
    if not db.get(Department, body.department_id):
        raise HTTPException(422, "Khoa/phòng không hợp lệ.")
    if body.group_id:
        group = db.get(StaffGroup, body.group_id)
        if not group or group.department_id != body.department_id:
            raise HTTPException(422, "Nhóm không thuộc khoa/phòng này.")
    starts = body.starts_at
    if starts.tzinfo is None:
        from zoneinfo import ZoneInfo

        starts = starts.replace(tzinfo=ZoneInfo("Asia/Ho_Chi_Minh"))
    event = TrainingEvent(
        **body.model_dump(exclude={"starts_at"}),
        starts_at=starts.astimezone(timezone.utc).replace(tzinfo=None),
        creator_id=user.id,
    )
    db.add(event)
    db.flush()
    audit(db, user, "training.event-create", event.id, department_id=body.department_id)
    db.commit()
    return {"id": event.id}


@router.get("/training/calendar")
def calendar(user=Depends(require("ADMIN","STAFF")), db: Session = Depends(get_db)):
    result = []
    groups = set(
        db.scalars(
            select(GroupMembership.group_id).where(GroupMembership.user_id == user.id)
        )
    )
    for e in db.scalars(select(TrainingEvent)):
        if has_role(user, "ADMIN", department_id=e.department_id) or (
            e.department_id == user.department_id
            and (not e.group_id or e.group_id in groups)
        ):
            result.append(
                {
                    "id": e.id,
                    "type": "event",
                    "title": e.title,
                    "date": e.starts_at.isoformat() + "Z",
                    "location": e.location,
                }
            )
    for a in db.scalars(select(CourseAssignment)):
        if (
            has_role(
                user, "ADMIN", department_id=db.get(User, a.user_id).department_id
            )
            or a.user_id == user.id
        ):
            result.append(
                {
                    "id": a.id,
                    "type": "assignment",
                    "title": "Hạn học: "
                    + db.get(CourseVersion, a.course_version_id).title,
                    "date": a.due_date,
                    "status": assignment_status(a),
                }
            )
    for c in db.scalars(select(StaffCredential)):
        if (
            has_role(
                user, "ADMIN", department_id=db.get(User, c.user_id).department_id
            )
            or c.user_id == user.id
        ):
            result.append(
                {
                    "id": c.id,
                    "type": "credential",
                    "title": "Hết hạn: " + c.title,
                    "date": c.expiry_date,
                }
            )
    return sorted(result, key=lambda x: x["date"])


class CredentialInput(BaseModel):
    user_id: str
    title: str = Field(min_length=3, max_length=240)
    kind: str = Field(default="Đào tạo nội bộ", max_length=120)
    issuer: str = Field(min_length=2, max_length=240)
    issue_date: date
    expiry_date: date
    verified: bool = False
    reminder_days: list[int] = Field(default=[30, 14, 7], min_length=1, max_length=10)

    @model_validator(mode="after")
    def validate_dates(self):
        if self.expiry_date <= self.issue_date or any(
            d < 1 or d > 365 for d in self.reminder_days
        ):
            raise ValueError("Ngày hết hạn hoặc mốc nhắc không hợp lệ.")
        return self


def credential_dict(db, c):
    days = (date.fromisoformat(c.expiry_date) - today()).days
    return {
        "id": c.id,
        "user_id": c.user_id,
        "name": db.get(User, c.user_id).name,
        "title": c.title,
        "kind": c.kind,
        "issuer": c.issuer,
        "issue_date": c.issue_date,
        "expiry_date": c.expiry_date,
        "verified": c.verified,
        "days_left": days,
        "reminder_days": c.reminder_days,
        "reminder_dates": [
            (date.fromisoformat(c.expiry_date) - timedelta(days=d)).isoformat()
            for d in c.reminder_days
        ],
        "alert": days <= max(c.reminder_days),
    }


def save_credential(db, body, user, c=None):
    target = db.get(User, body.user_id)
    if not target:
        raise HTTPException(422, "Nhân viên không tồn tại.")
    ensure_scope(user, target.department_id, "ADMIN")
    if c:
        ensure_scope(user, db.get(User, c.user_id).department_id, "ADMIN")
    values = body.model_dump()
    values.update(
        issue_date=body.issue_date.isoformat(),
        expiry_date=body.expiry_date.isoformat(),
        reminder_days=sorted(set(body.reminder_days), reverse=True),
    )
    if not c:
        c = StaffCredential(**values)
        db.add(c)
        db.flush()
    else:
        for key, value in values.items():
            setattr(c, key, value)
        db.execute(delete(Reminder).where(Reminder.credential_id == c.id))
    for days in c.reminder_days:
        db.add(
            Reminder(
                user_id=c.user_id,
                credential_id=c.id,
                scheduled_date=(
                    date.fromisoformat(c.expiry_date) - timedelta(days=days)
                ).isoformat(),
                message="Chứng chỉ sắp hết hạn: " + c.title[:240],
            )
        )
    audit(db, user, "credential.save", c.id, department_id=target.department_id)
    db.commit()
    return credential_dict(db, c)


@router.get("/credentials")
def credentials(user=Depends(require("ADMIN","STAFF")), db: Session = Depends(get_db)):
    return [
        credential_dict(db, c)
        for c in db.scalars(
            select(StaffCredential).order_by(StaffCredential.expiry_date)
        )
        if has_role(
            user, "ADMIN", department_id=db.get(User, c.user_id).department_id
        )
        or c.user_id == user.id
    ]


@router.post("/credentials")
def create_credential(
    body: CredentialInput,
    user=Depends(require("ADMIN")),
    db: Session = Depends(get_db),
):
    return save_credential(db, body, user)


@router.put("/credentials/{cid}")
def edit_credential(
    cid: str,
    body: CredentialInput,
    user=Depends(require("ADMIN")),
    db: Session = Depends(get_db),
):
    c = db.get(StaffCredential, cid)
    if not c:
        raise HTTPException(404, "Không tìm thấy chứng chỉ.")
    return save_credential(db, body, user, c)


@router.get("/reminders")
def reminders(user=Depends(require("ADMIN","STAFF")), db: Session = Depends(get_db)):
    result = []
    for r in db.scalars(
        select(Reminder)
        .where(Reminder.scheduled_date <= today().isoformat())
        .order_by(Reminder.scheduled_date.desc())
    ):
        if (
            not has_role(
                user, "ADMIN", department_id=db.get(User, r.user_id).department_id
            )
            and r.user_id != user.id
        ):
            continue
        if r.assignment_id and db.get(CourseAssignment, r.assignment_id).completed_at:
            continue
        result.append(
            {
                "id": r.id,
                "title": r.message,
                "date": r.scheduled_date,
                "user_id": r.user_id,
            }
        )
    return result
