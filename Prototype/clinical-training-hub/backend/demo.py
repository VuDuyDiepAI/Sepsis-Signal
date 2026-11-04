import os, hashlib
from datetime import timedelta
from sqlalchemy import select
from .models import *
from .db import today, now
from .storage import storage
from .knowledge import ingest
from .courses import demo_content, persist_content
from .training import CredentialInput, save_credential


def seed_content(db):
    if (
        os.getenv("DEMO_MODE", "true").lower() != "true"
        or os.getenv("SEED_CONTENT", "true") == "false"
        or db.get(Setting, "demo_content_v1")
    ):
        return
    manager = db.get(User, "manager")
    reviewer = db.get(User, "reviewer")
    if not manager or not reviewer:
        return
    from scripts.create_samples import create_samples

    pdf, docx = create_samples()
    sources = []
    for i, (path, title, status) in enumerate(
        [
            (pdf, "Bàn giao người bệnh — tình huống giả lập", "APPROVED"),
            (docx, "Hướng dẫn thực hành bàn giao — bản DOCX", "APPROVED"),
            (pdf, "Bàn giao mô phỏng — bản chờ rà soát", "PENDING_REVIEW"),
        ]
    ):
        doc = Document(
            title=title,
            description="Tài liệu giả lập tự tạo để thử phần mềm, không phải hướng dẫn chuyên môn chính thức.",
            department_id="emergency",
            scope="DEPARTMENT",
            creator_id=manager.id,
        )
        db.add(doc)
        db.flush()
        data = path.read_bytes()
        v = DocumentVersion(
            document_id=doc.id,
            number=1,
            status=status,
            file_key=storage.put(data, path.suffix),
            filename=path.name,
            sha256=hashlib.sha256(data).hexdigest(),
            uploader_id=manager.id,
            effective_date=today().isoformat(),
            review_date=(today() + timedelta(days=90)).isoformat(),
        )
        db.add(v)
        db.flush()
        j = BackgroundJob(
            user_id=manager.id,
            kind="INGEST",
            target_id=v.id,
            status="COMPLETED",
            attempts=1,
        )
        db.add(j)
        db.flush()
        j.result = ingest(db, j)
        if status == "APPROVED":
            db.add(
                DocumentReview(
                    version_id=v.id,
                    reviewer_id=reviewer.id,
                    decision="APPROVED",
                    comment="Nguồn giả lập để chạy thử phần mềm.",
                )
            )
        if i == 0:
            sources = [v.id]
    db.flush()
    chunks = list(
        db.scalars(select(DocumentChunk).where(DocumentChunk.version_id == sources[0]))
    )
    content = demo_content(chunks, "Bàn giao giả lập cho điều dưỡng mới")
    course = Course(creator_id=manager.id)
    db.add(course)
    db.flush()
    v = persist_content(db, course, content, manager.id, sources)
    v.status = "PUBLISHED"
    db.add(
        ContentApproval(
            course_version_id=v.id,
            reviewer_id=reviewer.id,
            decision="APPROVED",
            comment="Phê duyệt dữ liệu giả lập cho kịch bản pilot phần mềm.",
        )
    )
    for uid in ("staff", "staff2"):
        a = CourseAssignment(
            course_version_id=v.id,
            user_id=uid,
            assigned_by=manager.id,
            due_date=(today() + timedelta(days=7)).isoformat(),
        )
        db.add(a)
        db.flush()
        db.add(
            Reminder(
                user_id=uid,
                assignment_id=a.id,
                scheduled_date=(today() - timedelta(days=1)).isoformat(),
                message="Nhắc học: Bàn giao giả lập cho điều dưỡng mới",
            )
        )
        if uid == "staff2":
            a.started_at = now() - timedelta(days=1)
            first = db.scalar(
                select(Lesson)
                .where(Lesson.course_version_id == v.id)
                .order_by(Lesson.position)
            )
            db.add(LessonProgress(assignment_id=a.id, lesson_id=first.id))
    pending = Course(creator_id=manager.id)
    db.add(pending)
    db.flush()
    content.title = "Thực hành đối soát thông tin bàn giao"
    pv = persist_content(db, pending, content, manager.id, sources)
    pv.status = "PENDING_REVIEW"
    db.add(
        TrainingEvent(
            title="Thực hành bàn giao giả lập — điều dưỡng mới",
            starts_at=now() + timedelta(days=2),
            department_id="emergency",
            group_id="new-nurses",
            location="Phòng đào tạo mô phỏng · Tầng 2",
            creator_id=manager.id,
        )
    )
    db.flush()
    for uid, days in [("staff", 12), ("staff2", 26)]:
        save_credential(
            db,
            CredentialInput(
                user_id=uid,
                title="Thực hành bàn giao — chứng nhận GIẢ LẬP",
                issuer="Trung tâm đào tạo thử nghiệm",
                issue_date=today() - timedelta(days=330),
                expiry_date=today() + timedelta(days=days),
                verified=False,
            ),
            manager,
        )
    db.add(Setting(key="demo_content_v1", value={"seeded": True}))
    db.commit()
