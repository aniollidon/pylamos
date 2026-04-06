from datetime import datetime
from pydantic import BaseModel


class ExerciseBase(BaseModel):
    title: str
    description: str
    solution: str
    system_prompt_override: str | None = None
    order_index: int = 0


class ExerciseCreate(ExerciseBase):
    pass


class ExerciseUpdate(BaseModel):
    title: str | None = None
    description: str | None = None
    solution: str | None = None
    system_prompt_override: str | None = None
    order_index: int | None = None
    topic_id: int | None = None


class ExerciseOut(BaseModel):
    id: int
    topic_id: int
    title: str
    description: str
    order_index: int
    created_at: datetime

    model_config = {"from_attributes": True}


class ExerciseDetailOut(ExerciseOut):
    """Includes solution — only for teachers."""
    solution: str
    system_prompt_override: str | None = None


class ExerciseReorder(BaseModel):
    exercise_ids: list[int]


class ExerciseImportRequest(BaseModel):
    source_exercise_id: int
