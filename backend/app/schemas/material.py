from datetime import datetime
from pydantic import BaseModel


class MaterialBase(BaseModel):
    title: str
    description: str
    content: str
    order_index: int = 0


class MaterialCreate(MaterialBase):
    pass


class MaterialUpdate(BaseModel):
    title: str | None = None
    description: str | None = None
    content: str | None = None
    order_index: int | None = None
    topic_id: int | None = None


class MaterialOut(BaseModel):
    id: int
    topic_id: int
    title: str
    description: str
    order_index: int
    created_at: datetime

    model_config = {"from_attributes": True}


class MaterialDetailOut(MaterialOut):
    content: str


class MaterialReorder(BaseModel):
    material_ids: list[int]


class MaterialImportRequest(BaseModel):
    source_material_id: int


class MaterialReadOut(BaseModel):
    material_id: int
    user_id: int
    read: bool
    read_at: datetime | None = None
