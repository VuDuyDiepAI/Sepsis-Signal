from sqlalchemy import select

from backend.models.courses import (
    AnswerOption,
    Checklist,
    ChecklistItem,
    ContentApproval,
    CourseSourceDocument,
    Lesson,
    Quiz,
    QuizQuestion,
)
from backend.models.documents import Document, DocumentVersion
from backend.modules.courses.access import course_capabilities, source_chunks
from backend.modules.documents.serializers import citation


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
