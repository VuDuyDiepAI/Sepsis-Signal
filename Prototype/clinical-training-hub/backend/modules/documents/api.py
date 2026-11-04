import hashlib
from datetime import date

from fastapi import (
    APIRouter,
    BackgroundTasks,
    Depends,
    File,
    Form,
    HTTPException,
    Request,
    UploadFile,
)
from fastapi.responses import FileResponse
from sqlalchemy import func, select
from sqlalchemy.orm import Session

import backend.infrastructure.ai as ai
from backend.core.database import Base, get_db
from backend.core.security import (
    audit,
    can_inspect,
    can_review,
    current_user,
    ensure_scope,
    has_role,
    require,
)
from backend.infrastructure.storage import storage
from backend.infrastructure.workers import run_job
from backend.models.documents import (
    Document,
    DocumentChunk,
    DocumentReview,
    DocumentVersion,
)
from backend.models.identity import Department
from backend.models.jobs import BackgroundJob
from backend.modules.documents.access import (
    document_access,
    latest_approved,
    valid_active,
    version_access,
)
from backend.modules.documents.schemas import ReviewInput
from backend.modules.documents.serializers import citation, serialize_version

router = APIRouter(prefix="/api")


MAX_FILE = 15 * 1024 * 1024


@router.post("/documents/upload")
async def upload(
    background: BackgroundTasks,
    file: UploadFile = File(...),
    title: str = Form(..., min_length=3, max_length=240),
    department_id: str = Form("emergency"),
    scope: str = Form("DEPARTMENT"),
    document_id: str | None = Form(None),
    description: str = Form("", max_length=4000),
    effective_date: str | None = Form(None),
    review_date: str | None = Form(None),
    user=Depends(require("ADMIN")),
    db: Session = Depends(get_db),
):
    filename = (file.filename or "document").replace("\\", "/").split("/")[-1][:240]
    ensure_scope(user, department_id, "ADMIN")
    suffix = "." + filename.rsplit(".", 1)[-1].lower()
    if suffix not in (".pdf", ".docx", ".txt", ".md"):
        raise HTTPException(415, "Chỉ hỗ trợ PDF, DOCX, TXT và Markdown.")
    data = await file.read(MAX_FILE + 1)
    if not data or len(data) > MAX_FILE:
        raise HTTPException(413, "File rỗng hoặc vượt giới hạn 15 MB.")
    if suffix == ".pdf" and (not data.startswith(b"%PDF-")):
        raise HTTPException(415, "Nội dung file không phải PDF hợp lệ.")
    if suffix == ".docx" and (not data.startswith(b"PK")):
        raise HTTPException(415, "Nội dung file không phải DOCX hợp lệ.")
    if scope not in ("ALL", "DEPARTMENT", "RESTRICTED") or not db.get(
        Department, department_id
    ):
        raise HTTPException(422, "Phạm vi hoặc khoa/phòng không hợp lệ.")
    for value in (effective_date, review_date):
        if value:
            try:
                date.fromisoformat(value)
            except ValueError:
                raise HTTPException(422, "Ngày phải có định dạng YYYY-MM-DD.")
    if effective_date and review_date and (effective_date > review_date):
        raise HTTPException(422, "Ngày rà soát phải sau ngày hiệu lực.")
    doc = db.get(Document, document_id) if document_id else None
    if document_id and (not doc or not document_access(db, user, doc)):
        raise HTTPException(404, "Không tìm thấy tài liệu.")
    if doc:
        ensure_scope(user, doc.department_id, "ADMIN")
        if department_id != doc.department_id:
            raise HTTPException(
                422, "Phiên bản mới phải giữ nguyên khoa/phòng của tài liệu."
            )
    if not doc:
        doc = Document(
            title=title,
            description=description,
            department_id=department_id,
            scope=scope,
            creator_id=user.id,
            specialty={"emergency": "Cấp cứu", "icu": "Hồi sức tích cực"}.get(
                department_id, db.get(Department, department_id).name
            ),
        )
        db.add(doc)
        db.flush()
    number = (
        db.scalar(
            select(func.max(DocumentVersion.number)).where(
                DocumentVersion.document_id == doc.id
            )
        )
        or 0
    ) + 1
    key = storage.put(data, suffix)
    version = DocumentVersion(
        document_id=doc.id,
        number=number,
        file_key=key,
        filename=filename,
        sha256=hashlib.sha256(data).hexdigest(),
        uploader_id=user.id,
        effective_date=effective_date,
        review_date=review_date,
    )
    db.add(version)
    db.flush()
    job = BackgroundJob(user_id=user.id, kind="INGEST", target_id=version.id)
    db.add(job)
    db.flush()
    audit(db, user, "document.upload", version.id, department_id=doc.department_id)
    db.commit()
    background.add_task(run_job, job.id)
    return {
        "document_id": doc.id,
        "version": serialize_version(version),
        "job_id": job.id,
    }


@router.get("/documents")
def documents(
    search: str = "",
    department_id: str = "",
    status: str = "",
    user=Depends(current_user),
    db: Session = Depends(get_db),
):
    result = []
    for doc in db.scalars(select(Document).order_by(Document.created_at.desc())):
        if (
            not document_access(db, user, doc)
            or (department_id and doc.department_id != department_id)
            or (
                search
                and search.casefold()
                not in (doc.title + " " + doc.description).casefold()
            )
        ):
            continue
        v = (
            latest_approved(db, doc)
            if not can_inspect(user, doc)
            else db.scalar(
                select(DocumentVersion)
                .where(DocumentVersion.document_id == doc.id)
                .order_by(DocumentVersion.number.desc())
            )
        )
        if not v or (status and v.status != status):
            continue
        result.append(
            {
                "id": doc.id,
                "title": doc.title,
                "description": doc.description,
                "department_id": doc.department_id,
                "scope": doc.scope,
                "kind": doc.kind,
                "language": doc.language,
                "specialty": doc.specialty,
                "version": serialize_version(v),
                "can_manage": has_role(user, "ADMIN", department_id=doc.department_id),
                "can_review": can_review(user, doc),
            }
        )
    return result


@router.get("/documents/{doc_id}")
def document_detail(
    doc_id: str, user=Depends(current_user), db: Session = Depends(get_db)
):
    doc = db.get(Document, doc_id)
    if not document_access(db, user, doc):
        raise HTTPException(404, "Không tìm thấy tài liệu.")
    versions = [
        serialize_version(v)
        for v in db.scalars(
            select(DocumentVersion)
            .where(DocumentVersion.document_id == doc_id)
            .order_by(DocumentVersion.number.desc())
        )
        if can_inspect(user, doc) or valid_active(v)
    ]
    if not versions:
        raise HTTPException(404, "Không có phiên bản được cấp quyền.")
    return {
        "id": doc.id,
        "title": doc.title,
        "description": doc.description,
        "versions": versions,
        "can_manage": has_role(user, "ADMIN", department_id=doc.department_id),
        "can_review": can_review(user, doc),
        "can_approve": can_review(user, doc)
        and user.id
        not in (
            doc.creator_id,
            db.get(DocumentVersion, versions[0]["id"]).uploader_id,
            db.get(DocumentVersion, versions[0]["id"]).submitted_by,
        ),
    }


@router.get("/documents/{doc_id}/versions")
def versions(doc_id: str, user=Depends(current_user), db: Session = Depends(get_db)):
    return document_detail(doc_id, user, db)["versions"]


@router.post("/documents/{doc_id}/submit-review")
@router.post("/documents/{doc_id}/approve")
@router.post("/documents/{doc_id}/reject")
@router.post("/documents/{doc_id}/archive")
def review_document(
    doc_id: str,
    request: Request,
    body: ReviewInput,
    user=Depends(current_user),
    db: Session = Depends(get_db),
):
    action = request.url.path.rsplit("/", 1)[-1]
    v, doc = version_access(db, user, body.version_id)
    if doc.id != doc_id:
        raise HTTPException(404, "Phiên bản không thuộc tài liệu.")
    if action == "submit-review":
        ensure_scope(user, doc.department_id, "ADMIN")
        if v.status not in ("DRAFT", "REJECTED") or v.processing != "COMPLETED":
            raise HTTPException(409, "Tài liệu chưa sẵn sàng để gửi duyệt.")
        v.status = "PENDING_REVIEW"
        v.submitted_by = user.id
    elif action in ("approve", "reject"):
        if not can_review(user, doc) or user.id in (
            doc.creator_id,
            v.uploader_id,
            v.submitted_by,
        ):
            raise HTTPException(403, "Cần chuyên gia độc lập phê duyệt tài liệu.")
        if v.status != "PENDING_REVIEW":
            raise HTTPException(409, "Tài liệu không ở trạng thái chờ duyệt.")
        if action == "reject" and (not body.comment.strip()):
            raise HTTPException(422, "Vui lòng ghi lý do từ chối.")
        v.status = "APPROVED" if action == "approve" else "REJECTED"
        db.add(
            DocumentReview(
                version_id=v.id,
                reviewer_id=user.id,
                decision=v.status,
                comment=body.comment,
            )
        )
        if action == "approve":
            if "course_sources" in Base.metadata.tables:
                from backend.modules.courses.services import flag_source_change

                flag_source_change(db, doc.id, v.id)
    elif action == "archive":
        ensure_scope(user, doc.department_id, "ADMIN")
        v.status = "ARCHIVED"
        from backend.modules.courses.services import flag_source_change

        flag_source_change(db, doc.id, "")
    else:
        raise HTTPException(404, "Không tìm thấy thao tác.")
    audit(db, user, "document." + action, v.id, department_id=doc.department_id)
    db.commit()
    return serialize_version(v)


@router.get("/sources/{version_id}")
def source(version_id: str, user=Depends(current_user), db: Session = Depends(get_db)):
    v, doc = version_access(db, user, version_id)
    return {
        "title": doc.title,
        "version": serialize_version(v),
        "chunks": [
            citation(c, doc)
            for c in db.scalars(
                select(DocumentChunk)
                .where(DocumentChunk.version_id == v.id)
                .order_by(DocumentChunk.created_at, DocumentChunk.id)
            )
        ],
    }


@router.get("/sources/{version_id}/file")
def source_file(
    version_id: str, user=Depends(current_user), db: Session = Depends(get_db)
):
    v, _ = version_access(db, user, version_id)
    return FileResponse(
        storage.path(v.file_key), filename=v.filename, content_disposition_type="inline"
    )


@router.post("/documents/{doc_id}/summarize")
def summarize(
    doc_id: str, user=Depends(require("ADMIN", "STAFF")), db: Session = Depends(get_db)
):
    doc = db.get(Document, doc_id)
    if not document_access(db, user, doc):
        raise HTTPException(404, "Không tìm thấy tài liệu.")
    v = latest_approved(db, doc)
    if not v:
        raise HTTPException(409, "Chưa có tài liệu được duyệt còn hiệu lực.")
    chunks = list(
        db.scalars(select(DocumentChunk).where(DocumentChunk.version_id == v.id))
    )[:8]
    return {
        "mode": "demo-extractive",
        "summary": "\n\n".join((c.text[:400] for c in chunks)),
        "citations": [citation(c, doc) for c in chunks],
    }


@router.post("/documents/{doc_id}/translate")
def translate(
    doc_id: str, user=Depends(require("ADMIN", "STAFF")), db: Session = Depends(get_db)
):
    doc = db.get(Document, doc_id)
    if not document_access(db, user, doc):
        raise HTTPException(404, "Không tìm thấy tài liệu.")
    v = latest_approved(db, doc)
    if not v:
        raise HTTPException(409, "Chưa có tài liệu được duyệt.")
    sources = [
        citation(c, doc)
        for c in db.scalars(
            select(DocumentChunk).where(DocumentChunk.version_id == v.id)
        )
    ]
    result = ai.complete_json(
        'Dịch Anh–Việt, giữ thuật ngữ. Trả {"translation":string}.', sources
    )
    return {
        "translation": result.get("translation", ""),
        "status": "UNREVIEWED",
        "citations": sources,
    }
