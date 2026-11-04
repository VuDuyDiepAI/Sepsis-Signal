from fastapi import HTTPException
from sqlalchemy import func, select

from backend.core.database import today
from backend.core.security import has_role
from backend.models.courses import CourseVersion, Lesson, QuizQuestion
from backend.models.documents import Document, DocumentChunk
from backend.models.identity import User
from backend.models.training import (
    CourseAssignment,
    LessonProgress,
    QuizAnswer,
    QuizAttempt,
)
from backend.modules.courses.access import course_access
from backend.modules.documents.serializers import citation


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


def own_assignment(db, user, aid):
    if not has_role(user, "STAFF"):
        raise HTTPException(403, "Chỉ Staff được sử dụng chức năng học tập cá nhân.")
    a = db.get(CourseAssignment, aid)
    if not a or a.user_id != user.id:
        raise HTTPException(404, "Không tìm thấy phân công học tập.")
    v = db.get(CourseVersion, a.course_version_id)
    course_access(db, user, v.course_id, v.id, learner=True)
    return a


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
