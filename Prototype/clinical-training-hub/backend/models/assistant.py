from sqlalchemy import JSON, Boolean, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from backend.core.database import Base, Record


class ChatConversation(Record, Base):
    __tablename__ = "chat_conversations"
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    title: Mapped[str] = mapped_column(String(150), default="Hội thoại mới")


class ChatMessage(Record, Base):
    __tablename__ = "chat_messages"
    conversation_id: Mapped[str] = mapped_column(
        ForeignKey("chat_conversations.id"), index=True
    )
    role: Mapped[str] = mapped_column(String(20))
    content: Mapped[str] = mapped_column(Text)
    citation_ids: Mapped[list] = mapped_column(JSON, default=list)
    helpful: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
