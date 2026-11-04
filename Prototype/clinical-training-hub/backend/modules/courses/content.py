from fastapi import HTTPException
from sqlalchemy import func, select

from backend.models.courses import (
    AnswerOption,
    Checklist,
    ChecklistItem,
    CourseSourceDocument,
    CourseVersion,
    Lesson,
    Quiz,
    QuizQuestion,
)
from backend.models.documents import DocumentChunk
from backend.modules.courses.schemas import ContentInput


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
            or (not set(scene["citation_ids"]).issubset(allowed))
        ):
            raise HTTPException(422, "Kịch bản video phải có trích dẫn thuộc nguồn.")
    if any(
        (not x.strip() or len(x) > 5000 for q in content.questions for x in q.options)
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
        (
            CourseSourceDocument(course_version_id=v.id, document_version_id=s)
            for s in source_ids
        )
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
            (
                AnswerOption(question_id=question.id, position=j, text=text)
                for j, text in enumerate(q.options)
            )
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
