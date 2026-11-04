from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

import backend.infrastructure.ai as ai
from backend.core.database import get_db
from backend.core.security import require
from backend.models.assistant import ChatConversation, ChatMessage
from backend.models.documents import DocumentChunk, SourceCitation
from backend.modules.assistant.schemas import Query, Rating
from backend.modules.assistant.services import retrieve
from backend.modules.documents.access import version_access
from backend.modules.documents.serializers import citation

router = APIRouter(prefix="/api")


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
def conversation(
    cid: str, user=Depends(require("STAFF")), db: Session = Depends(get_db)
):
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
            + "\n\n".join((f"[{i + 1}] {v['text']}" for i, v in enumerate(citations)))
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


@router.post("/chat/messages/{mid}/rating")
def rate_message(
    mid: str,
    body: Rating,
    user=Depends(require("STAFF")),
    db: Session = Depends(get_db),
):
    m = db.get(ChatMessage, mid)
    c = db.get(ChatConversation, m.conversation_id) if m else None
    if not c or c.user_id != user.id:
        raise HTTPException(404, "Không tìm thấy câu trả lời.")
    m.helpful = body.helpful
    db.commit()
    return {"ok": True}
