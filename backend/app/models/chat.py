import enum
from datetime import datetime

from sqlalchemy import String, Integer, Text, ForeignKey, Enum, DateTime, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class ConversationType(str, enum.Enum):
    evaluate = "evaluate"
    help = "help"


class ConversationStatus(str, enum.Enum):
    open = "open"
    closed = "closed"
    reopened = "reopened"


class MessageRole(str, enum.Enum):
    system = "system"
    assistant = "assistant"
    user = "user"
    teacher = "teacher"


class MessageVerdict(str, enum.Enum):
    correct = "correct"
    incorrect = "incorrect"


class ChatConversation(Base):
    __tablename__ = "chat_conversations"

    id: Mapped[int] = mapped_column(primary_key=True)
    submission_id: Mapped[int] = mapped_column(Integer, ForeignKey("submissions.id", ondelete="CASCADE"))
    type: Mapped[ConversationType] = mapped_column(Enum(ConversationType))
    status: Mapped[ConversationStatus] = mapped_column(
        Enum(ConversationStatus), default=ConversationStatus.open
    )
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    # Relationships
    submission = relationship("Submission", back_populates="conversations")
    messages = relationship(
        "ChatMessage", back_populates="conversation", cascade="all, delete-orphan",
        order_by="ChatMessage.created_at",
    )


class ChatMessage(Base):
    __tablename__ = "chat_messages"

    id: Mapped[int] = mapped_column(primary_key=True)
    conversation_id: Mapped[int] = mapped_column(Integer, ForeignKey("chat_conversations.id", ondelete="CASCADE"))
    role: Mapped[MessageRole] = mapped_column(Enum(MessageRole))
    content: Mapped[str] = mapped_column(Text)
    verdict: Mapped[MessageVerdict | None] = mapped_column(Enum(MessageVerdict), nullable=True)
    code_snapshot: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    # Relationships
    conversation = relationship("ChatConversation", back_populates="messages")
