from datetime import datetime
from pydantic import BaseModel
from app.models.submission import SubmissionStatus


class SubmissionCreate(BaseModel):
    code: str = ""


class SubmissionVersionOut(BaseModel):
    id: int
    version_number: int
    code: str
    created_at: datetime

    model_config = {"from_attributes": True}


class SubmissionOut(BaseModel):
    id: int
    exercise_id: int
    user_id: int
    status: SubmissionStatus
    chat_blocked: bool = False
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class SubmissionDetailOut(SubmissionOut):
    versions: list[SubmissionVersionOut] = []


class SubmissionOverride(BaseModel):
    status: SubmissionStatus


class SaveCodeRequest(BaseModel):
    code: str
