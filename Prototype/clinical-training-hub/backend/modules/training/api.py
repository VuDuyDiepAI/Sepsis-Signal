from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.core.database import get_db, now, today
from backend.core.security import audit, ensure_scope, has_role, require
from backend.models.courses import (
    CourseSourceDocument,
    CourseVersion,
    Lesson,
    Quiz,
    QuizQuestion,
)
from backend.models.identity import Department, GroupMembership, StaffGroup, User
from backend.models.notifications import Reminder
from backend.models.training import (
    CourseAssignment,
    LessonProgress,
    QuizAnswer,
    QuizAttempt,
)
from backend.modules.courses.access import course_access, course_capabilities
from backend.modules.documents.access import latest_approved, version_access
from backend.modules.training.schemas import AssignmentInput, ProgressInput, SubmitQuiz
from backend.modules.training.services import (
    attempt_result,
    own_assignment,
    serialize_assignment,
)

router = APIRouter(prefix="/api")


@router.post("/training/assignments")
def assign(
    body: AssignmentInput, user=Depends(require("ADMIN")), db: Session = Depends(get_db)
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
                    User.department_id == body.department_id, User.active == True
                )
            )
        )
    if body.group_id or body.department_id:
        ids = [
            uid
            for uid in ids
            if (target := db.get(User, uid))
            and target.active
            and has_role(target, "STAFF", department_id=target.department_id)
        ]
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
            or (not has_role(learner, "STAFF", department_id=learner.department_id))
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


@router.post("/training/assignments/{aid}/start")
def start_learning(
    aid: str, user=Depends(require("STAFF")), db: Session = Depends(get_db)
):
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
    if set(body.answers) != set((q.id for q in questions)) or any(
        (type(v) != int or v not in range(4) for v in body.answers.values())
    ):
        raise HTTPException(
            422, "Cần trả lời đủ câu hỏi, mỗi câu chọn một trong bốn phương án."
        )
    score = round(
        sum((body.answers[q.id] == q.correct for q in questions))
        / len(questions)
        * 100,
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
