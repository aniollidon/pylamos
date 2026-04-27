from datetime import datetime
from pydantic import BaseModel


class TopicBase(BaseModel):
    name: str
    order_index: int = 0
    unlock_mode: str = "auto"
    is_hidden: bool = False


class TopicCreate(TopicBase):
    pass


class TopicUpdate(BaseModel):
    name: str | None = None
    order_index: int | None = None
    unlock_mode: str | None = None
    is_hidden: bool | None = None


class TopicOut(TopicBase):
    id: int
    class_id: int
    created_at: datetime

    model_config = {"from_attributes": True}


class TopicReorder(BaseModel):
    topic_ids: list[int]


class TopicImportRequest(BaseModel):
    source_topic_id: int
