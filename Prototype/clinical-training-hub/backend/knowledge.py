import hashlib, io, re, zipfile
from datetime import date
from fastapi import (
    APIRouter,
    Depends,
    HTTPException,
    UploadFile,
    File,
    Form,
    BackgroundTasks,
    Request,
)
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field
from sqlalchemy import select, func, delete
from sqlalchemy.orm import Session
from pypdf import PdfReader
from docx import Document as Docx
from .db import get_db, today as local_today
from .models import *
from .auth import (
    current_user,
    require,
    audit,
    has_role,
    can_review,
    can_inspect,
    ensure_scope,
    departments_for,
)
from .storage import storage
from . import ai
from .jobs import handlers, run_job

router = APIRouter(prefix="/api")
MAX_FILE = 15 * 1024 * 1024


def document_access(db, user, doc):
    if not doc:
        return False
    if can_inspect(user, doc):
        return True
    if not has_role(user,"STAFF"):
        return False
    if doc.scope == "ALL" or (
        doc.scope == "DEPARTMENT"
        and has_role(user, "STAFF", department_id=doc.department_id)
    ):
        return True
    return db.get(DocumentPermission, (doc.id, user.id)) is not None


def version_access(db, user, version_id, approved=False):
    v = db.get(DocumentVersion, version_id)
    doc = db.get(Document, v.document_id) if v else None
    if (
        not v
        or not document_access(db, user, doc)
        or ((not can_inspect(user, doc) or approved) and v.status != "APPROVED")
    ):
        raise HTTPException(
            404, "Không tìm thấy tài liệu hoặc bạn chưa được cấp quyền."
        )
    return v, doc


def valid_active(v):
    today = local_today().isoformat()
    return (
        v.status == "APPROVED"
        and v.processing == "COMPLETED"
        and (not v.effective_date or v.effective_date <= today)
        and (not v.review_date or v.review_date >= today)
    )


def latest_approved(db, doc):
    return next(
        (
            v
            for v in db.scalars(
                select(DocumentVersion)
                .where(DocumentVersion.document_id == doc.id)
                .order_by(DocumentVersion.number.desc())
            )
            if valid_active(v)
        ),
        None,
    )


def serialize_version(v):
    return {
        k: getattr(v, k)
        for k in (
            "id",
            "document_id",
            "number",
            "status",
            "processing",
            "filename",
            "created_at",
            "error",
            "effective_date",
            "review_date",
        )
    }


def parse_file(data, suffix):
    parts = []
    if suffix == ".pdf":
        if not data.startswith(b"%PDF-"):
            raise ValueError("PDF signature")
        reader = PdfReader(io.BytesIO(data))
        if len(reader.pages) > 300:
            raise ValueError("Too many pages")
        for i, page in enumerate(reader.pages):
            text = page.extract_text() or ""
            for block in re.split(r"\n\s*\n", text):
                if block.strip():
                    parts.append((i + 1, f"Trang {i + 1}", block.strip()))
    elif suffix == ".docx":
        with zipfile.ZipFile(io.BytesIO(data)) as z:
            if sum(x.file_size for x in z.infolist()) > 50 * 1024 * 1024:
                raise ValueError("Zip too large")
            if any(x.filename.endswith("vbaProject.bin") for x in z.infolist()):
                raise ValueError("Macro forbidden")
        d = Docx(io.BytesIO(data))
        section = "Nội dung"
        for i, p in enumerate(d.paragraphs):
            if not p.text.strip():
                continue
            if p.style.name.startswith("Heading"):
                section = p.text
            else:
                parts.append((None, f"{section} · Đoạn {i + 1}", p.text.strip()))
        for ti, table in enumerate(d.tables):
            for ri, row in enumerate(table.rows):
                parts.append(
                    (
                        None,
                        f"Bảng {ti + 1} · Hàng {ri + 1}",
                        " | ".join(c.text for c in row.cells),
                    )
                )
    else:
        text = data.decode("utf-8-sig")
        section = "Nội dung"
        for i, block in enumerate(re.split(r"\n\s*\n", text)):
            if not block.strip():
                continue
            if block.startswith("#"):
                section = block.splitlines()[0].lstrip("# ").strip()
                if len(block.splitlines()) == 1:
                    continue
            parts.append((None, section, block.strip()))
    chunks = []
    for page, section, text in parts:
        for offset in range(0, len(text), 1000):
            chunk = text[offset : offset + 1200].strip()
            if chunk:
                chunks.append((page, section, chunk))
    if not chunks or sum(len(c[2]) for c in chunks) < 30:
        raise ValueError("No extractable text")
    return chunks


def ingest(db, job):
    v = db.get(DocumentVersion, job.target_id)
    parts = parse_file(
        storage.path(v.file_key).read_bytes(), storage.path(v.file_key).suffix
    )
    prepared = []
    for page, section, text in parts:
        vector, model = ai.embed(text)
        prepared.append((page, section, text, vector, model))
        from .db import now

        job.updated_at = now()
        db.commit()  # Heartbeat before the final short write transaction.
    db.execute(delete(DocumentChunk).where(DocumentChunk.version_id == v.id))
    for page, section, text, vector, model in prepared:
        db.add(
            DocumentChunk(
                document_id=v.document_id,
                version_id=v.id,
                page=page,
                section=section[:240],
                text=text,
                embedding=vector,
                embedding_model=model,
            )
        )
    v.processing = "COMPLETED"
    v.error = ""
    db.flush()
    return {"version_id": v.id, "chunks": len(parts)}


handlers["INGEST"] = ingest


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
    if suffix == ".pdf" and not data.startswith(b"%PDF-"):
        raise HTTPException(415, "Nội dung file không phải PDF hợp lệ.")
    if suffix == ".docx" and not data.startswith(b"PK"):
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
    if effective_date and review_date and effective_date > review_date:
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
                "can_manage": has_role(
                    user, "ADMIN", department_id=doc.department_id
                ),
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


class ReviewInput(BaseModel):
    version_id: str
    comment: str = Field(default="", max_length=4000)


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
        if action == "reject" and not body.comment.strip():
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
            # Imported lazily: Phase 3 adds source-version review flags.
            if "course_sources" in Base.metadata.tables:
                from .courses import flag_source_change

                flag_source_change(db, doc.id, v.id)
    elif action == "archive":
        ensure_scope(user, doc.department_id, "ADMIN")
        v.status = "ARCHIVED"
        from .courses import flag_source_change

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


def citation(chunk, doc):
    return {
        "id": chunk.id,
        "document_id": doc.id,
        "version_id": chunk.version_id,
        "title": doc.title,
        "page": chunk.page,
        "section": chunk.section,
        "text": chunk.text,
    }


class Query(BaseModel):
    question: str = Field(min_length=2, max_length=2000)
    conversation_id: str | None = None
    document_id: str | None = None
    department_id: str | None = None
    topic: str | None = None


def retrieve(db, user, body):
    query_tokens = set(ai.tokens(body.question))
    if not query_tokens:
        return []
    qvec, model = ai.embed(body.question)
    found = []
    for doc in db.scalars(select(Document)):
        if (
            not document_access(db, user, doc)
            or (body.document_id and doc.id != body.document_id)
            or (body.department_id and doc.department_id != body.department_id)
        ):
            continue
        v = latest_approved(db, doc)
        if not v:
            continue
        for c in db.scalars(
            select(DocumentChunk).where(DocumentChunk.version_id == v.id)
        ):
            if (
                body.topic
                and body.topic.casefold() not in (c.section + " " + c.text).casefold()
            ):
                continue
            ct = set(ai.tokens(c.text))
            overlap = query_tokens & ct
            lexical = len(overlap) / len(query_tokens)
            semantic = ai.cosine(qvec, c.embedding) if c.embedding_model == model else 0
            # Demo is explicitly lexical+hash, never presented as semantic understanding.
            if (
                model == "demo-hash-v1"
                and len(overlap) >= min(2, len(query_tokens))
                and lexical >= 0.35
            ) or (model != "demo-hash-v1" and semantic >= 0.6):
                found.append((0.7 * lexical + 0.3 * semantic, c, doc))
    return sorted(found, key=lambda x: x[0], reverse=True)[:4]


@router.post("/chat/conversations")
def create_conversation(user=Depends(require("STAFF")), db: Session = Depends(get_db)):
    c = ChatConversation(user_id=user.id)
    db.add(c)
    db.commit()
    return {"id": c.id, "title": c.title}


@router.get("/chat/conversations")
def conversations(user=Depends(require("STAFF")), db: Session = Depends(get_db)):
    return [
        {"id": c.id, "title": c.title}
        for c in db.scalars(
            select(ChatConversation)
            .where(ChatConversation.user_id == user.id)
            .order_by(ChatConversation.created_at.desc())
        )
    ]


@router.get("/chat/conversations/{cid}")
def conversation(cid: str, user=Depends(require("STAFF")), db: Session = Depends(get_db)):
    c = db.get(ChatConversation, cid)
    if not c or c.user_id != user.id:
        raise HTTPException(404, "Không tìm thấy hội thoại.")
    messages = []
    for m in db.scalars(
        select(ChatMessage)
        .where(ChatMessage.conversation_id == cid)
        .order_by(ChatMessage.created_at)
    ):
        citations = []
        for chunk_id in m.citation_ids:
            chunk = db.get(DocumentChunk, chunk_id)
            if chunk:
                try:
                    _, doc = version_access(db, user, chunk.version_id, True)
                    citations.append(citation(chunk, doc))
                except HTTPException:
                    pass
        # Never leak a saved assistant excerpt when its source permission has been revoked.
        content = (
            m.content
            if m.role == "user" or len(citations) == len(m.citation_ids)
            else "Nguồn không còn được cấp quyền. Vui lòng tra cứu lại."
        )
        messages.append(
            {
                "id": m.id,
                "role": m.role,
                "content": content,
                "citations": citations,
                "helpful": m.helpful,
            }
        )
    return {"id": c.id, "title": c.title, "messages": messages}


@router.post("/chat/query")
def query(body: Query, user=Depends(require("STAFF")), db: Session = Depends(get_db)):
    c = (
        db.get(ChatConversation, body.conversation_id)
        if body.conversation_id
        else ChatConversation(user_id=user.id, title=body.question[:100])
    )
    if not c or c.user_id != user.id:
        raise HTTPException(404, "Không tìm thấy hội thoại.")
    if not body.conversation_id:
        db.add(c)
        db.flush()
    found = retrieve(db, user, body)
    citations = [citation(chunk, doc) for _, chunk, doc in found]
    mode = "demo" if ai.provider() is None else "provider"
    if not citations:
        answer = "Tài liệu được phê duyệt hiện không cung cấp đủ thông tin để trả lời câu hỏi này. Vui lòng hỏi chuyên gia hoặc bổ sung nguồn đã kiểm duyệt."
    elif mode == "demo":
        answer = (
            "Trích xuất ở chế độ demo — các đoạn nguồn liên quan:\n\n"
            + "\n\n".join(f"[{i + 1}] {v['text']}" for i, v in enumerate(citations))
        )
    else:
        result = ai.complete_json(
            'Trả {"answer":string,"citation_ids":string[]}. Chỉ trả lời điều có trong bằng chứng. Nếu thiếu, answer nói không đủ thông tin và citation_ids rỗng.',
            {"question": body.question, "evidence": citations},
        )
        ids = result.get("citation_ids", [])
        if not isinstance(ids, list) or not set(ids).issubset(
            {x["id"] for x in citations}
        ):
            raise HTTPException(
                502, "AI trả trích dẫn không hợp lệ. Kết quả đã bị chặn."
            )
        answer = result.get("answer", "")
        if not isinstance(answer, str) or not answer or (not ids):
            answer = "Tài liệu được phê duyệt hiện không cung cấp đủ thông tin để trả lời câu hỏi này."
            citations = []
        else:
            citations = [x for x in citations if x["id"] in ids]
    db.add(ChatMessage(conversation_id=c.id, role="user", content=body.question))
    m = ChatMessage(
        conversation_id=c.id,
        role="assistant",
        content=answer,
        citation_ids=[x["id"] for x in citations],
    )
    db.add(m)
    for x in citations:
        db.add(SourceCitation(chunk_id=x["id"], user_id=user.id, purpose="CHAT"))
    db.commit()
    return {
        "id": m.id,
        "conversation_id": c.id,
        "answer": answer,
        "citations": citations,
        "mode": mode,
        "abstained": not bool(citations),
    }


class Rating(BaseModel):
    helpful: bool


@router.post("/chat/messages/{mid}/rating")
def rate_message(
    mid: str, body: Rating, user=Depends(require("STAFF")), db: Session = Depends(get_db)
):
    m = db.get(ChatMessage, mid)
    c = db.get(ChatConversation, m.conversation_id) if m else None
    if not c or c.user_id != user.id:
        raise HTTPException(404, "Không tìm thấy câu trả lời.")
    m.helpful = body.helpful
    db.commit()
    return {"ok": True}


@router.post("/documents/{doc_id}/summarize")
def summarize(doc_id: str, user=Depends(require("ADMIN","STAFF")), db: Session = Depends(get_db)):
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
        "summary": "\n\n".join(c.text[:400] for c in chunks),
        "citations": [citation(c, doc) for c in chunks],
    }


@router.post("/documents/{doc_id}/translate")
def translate(doc_id: str, user=Depends(require("ADMIN","STAFF")), db: Session = Depends(get_db)):
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


def job_departments(db, j):
    if j.kind == "INGEST":
        v = db.get(DocumentVersion, j.target_id)
        if v:
            return {db.get(Document, v.document_id).department_id}
    deps = {
        db.get(Document, db.get(DocumentVersion, vid).document_id).department_id
        for vid in j.result.get("version_ids", [])
        if db.get(DocumentVersion, vid)
    }
    owner = db.get(User, j.user_id)
    return deps or ({owner.department_id} if owner else set())


def job_access(db, user, j):
    deps = job_departments(db, j)
    return bool(deps) and all(has_role(user,"ADMIN",department_id=d) for d in deps)


@router.get("/ai/jobs/{job_id}")
def job_detail(job_id: str, user=Depends(require("ADMIN")), db: Session = Depends(get_db)):
    j = db.get(BackgroundJob, job_id)
    if not j or not job_access(db, user, j):
        raise HTTPException(404, "Không tìm thấy tác vụ.")
    return {
        k: getattr(j, k)
        for k in ("id", "kind", "status", "error", "attempts", "result")
    }


@router.get("/ai/jobs")
def job_list(user=Depends(require("ADMIN")), db: Session = Depends(get_db)):
    query = select(BackgroundJob).order_by(BackgroundJob.created_at.desc()).limit(100)
    return [
        {
            k: getattr(j, k)
            for k in (
                "id",
                "kind",
                "status",
                "error",
                "attempts",
                "result",
                "created_at",
            )
        }
        for j in db.scalars(query)
        if job_access(db, user, j)
    ]


@router.post("/ai/jobs/{job_id}/retry")
def retry_job(
    job_id: str,
    background: BackgroundTasks,
    user=Depends(require("ADMIN")),
    db: Session = Depends(get_db),
):
    j = db.get(BackgroundJob, job_id)
    if not j or not job_access(db, user, j):
        raise HTTPException(404, "Không tìm thấy tác vụ.")
    for dep in job_departments(db, j):
        ensure_scope(user, dep, "ADMIN")
    if j.status != "FAILED" or j.attempts >= 5:
        raise HTTPException(409, "Tác vụ chưa lỗi hoặc đã thử lại 5 lần.")
    j.status = "QUEUED"
    j.error = ""
    db.commit()
    background.add_task(run_job, j.id)
    return {"id": j.id, "status": j.status}
