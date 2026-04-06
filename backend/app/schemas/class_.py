from datetime import datetime
from pydantic import BaseModel
from app.models.class_ import MemberRole


class ClassBase(BaseModel):
    name: str


class ClassCreate(ClassBase):
    pass


class ClassUpdate(BaseModel):
    name: str | None = None


class ClassOut(ClassBase):
    id: int
    created_by: int
    created_at: datetime

    model_config = {"from_attributes": True}


class ClassMemberAdd(BaseModel):
    user_id: int
    role: MemberRole = MemberRole.student


class ClassMemberOut(BaseModel):
    id: int
    class_id: int
    user_id: int
    role: MemberRole
    user_full_name: str | None = None
    user_username: str | None = None

    model_config = {"from_attributes": True}
