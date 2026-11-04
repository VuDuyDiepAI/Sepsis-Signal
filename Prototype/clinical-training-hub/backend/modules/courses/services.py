from sqlalchemy import select

from backend.models.courses import Course, CourseSourceDocument, CourseVersion
from backend.models.documents import DocumentVersion


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
