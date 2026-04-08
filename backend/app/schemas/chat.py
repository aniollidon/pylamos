from datetime import datetime
from typing import Literal
from pydantic import BaseModel
from app.models.chat import ConversationType, ConversationStatus, MessageRole, MessageVerdict
from app.schemas.submission import SubmissionVersionOut


class ExecutionInfo(BaseModel):
    status: Literal["ok", "compile_ok", "compile_error", "runtime_error", "stdin_needed"]
    compiled: bool
    executed: bool
    can_mark_resolved: bool
    line: int | None = None
    error_type: str | None = None
    error_message: str | None = None


class ConversationCreate(BaseModel):
    type: ConversationType
    code: str
    execution: ExecutionInfo | None = None


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
    execution: ExecutionInfo | None = None


class MessageOut(BaseModel):
    id: int
    conversation_id: int
    role: MessageRole
    content: str
    verdict: MessageVerdict | None = None
    code_snapshot: str | None = None
    version_id: int | None = None
    version: SubmissionVersionOut | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


class ConversationDetailOut(ConversationOut):
    messages: list[MessageOut] = []
