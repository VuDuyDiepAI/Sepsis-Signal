import io
import re
import zipfile

from docx import Document as Docx
from pypdf import PdfReader
from sqlalchemy import delete

import backend.infrastructure.ai as ai
from backend.infrastructure.storage import storage
from backend.models.documents import DocumentChunk, DocumentVersion


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
            for block in re.split("\\n\\s*\\n", text):
                if block.strip():
                    parts.append((i + 1, f"Trang {i + 1}", block.strip()))
    elif suffix == ".docx":
        with zipfile.ZipFile(io.BytesIO(data)) as z:
            if sum((x.file_size for x in z.infolist())) > 50 * 1024 * 1024:
                raise ValueError("Zip too large")
            if any((x.filename.endswith("vbaProject.bin") for x in z.infolist())):
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
                        " | ".join((c.text for c in row.cells)),
                    )
                )
    else:
        text = data.decode("utf-8-sig")
        section = "Nội dung"
        for i, block in enumerate(re.split("\\n\\s*\\n", text)):
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
    if not chunks or sum((len(c[2]) for c in chunks)) < 30:
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
        from backend.core.database import now

        job.updated_at = now()
        db.commit()
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
