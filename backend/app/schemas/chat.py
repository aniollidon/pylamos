from datetime import datetime
from pydantic import BaseModel
from app.models.chat import ConversationType, ConversationStatus, MessageRole, MessageVerdict


class ConversationCreate(BaseModel):
    type: ConversationType
    code: str


class ConversationOut(BaseModel):
    id: int
    submission_id: int
    type: ConversationType
    status: ConversationStatus
    created_at: datetime

    model_config = {"from_attributes": True}


class MessageCreate(BaseModel):
    content: str
    code: str | None = None


class MessageOut(BaseModel):
    id: int
    conversation_id: int
    role: MessageRole
    content: str
    verdict: MessageVerdict | None = None
    code_snapshot: str | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


class ConversationDetailOut(ConversationOut):
    messages: list[MessageOut] = []
