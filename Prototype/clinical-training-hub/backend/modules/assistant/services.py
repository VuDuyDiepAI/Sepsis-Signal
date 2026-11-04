from sqlalchemy import select

import backend.infrastructure.ai as ai
from backend.models.documents import Document, DocumentChunk
from backend.modules.documents.access import document_access, latest_approved


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
            if (
                model == "demo-hash-v1"
                and len(overlap) >= min(2, len(query_tokens))
                and (lexical >= 0.35)
                or (model != "demo-hash-v1" and semantic >= 0.6)
            ):
                found.append((0.7 * lexical + 0.3 * semantic, c, doc))
    return sorted(found, key=lambda x: x[0], reverse=True)[:4]
