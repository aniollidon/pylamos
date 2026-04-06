from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select, func as sqlfunc
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.user import User, UserRole
from app.models.topic import Topic
from app.models.exercise import Exercise
from app.models.material import Material
from app.schemas.topic import TopicCreate, TopicUpdate, TopicOut, TopicReorder, TopicImportRequest
from app.utils.security import get_current_user, require_role

router = APIRouter(prefix="/api", tags=["topics"])


@router.get("/classes/{class_id}/topics", response_model=list[TopicOut])
async def list_topics(
    class_id: int,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Topic).where(Topic.class_id == class_id).order_by(Topic.order_index)
    )
    return result.scalars().all()


@router.post("/classes/{class_id}/topics", response_model=TopicOut, status_code=status.HTTP_201_CREATED)
async def create_topic(
    class_id: int,
    body: TopicCreate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_role(UserRole.teacher, UserRole.admin)),
):
    topic = Topic(class_id=class_id, name=body.name, order_index=body.order_index)
    db.add(topic)
    await db.flush()
    await db.refresh(topic)
    return topic


@router.get("/topics/{topic_id}", response_model=TopicOut)
async def get_topic(
    topic_id: int,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    result = await db.execute(select(Topic).where(Topic.id == topic_id))
    topic = result.scalar_one_or_none()
    if not topic:
        raise HTTPException(status_code=404, detail="Topic not found")
    return topic


@router.put("/topics/{topic_id}", response_model=TopicOut)
async def update_topic(
    topic_id: int,
    body: TopicUpdate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_role(UserRole.teacher, UserRole.admin)),
):
    result = await db.execute(select(Topic).where(Topic.id == topic_id))
    topic = result.scalar_one_or_none()
    if not topic:
        raise HTTPException(status_code=404, detail="Topic not found")
    if body.name is not None:
        topic.name = body.name
    if body.order_index is not None:
        topic.order_index = body.order_index
    if body.unlock_mode is not None:
        topic.unlock_mode = body.unlock_mode
    await db.flush()
    await db.refresh(topic)
    return topic


@router.delete("/topics/{topic_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_topic(
    topic_id: int,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_role(UserRole.teacher, UserRole.admin)),
):
    result = await db.execute(select(Topic).where(Topic.id == topic_id))
    topic = result.scalar_one_or_none()
    if not topic:
        raise HTTPException(status_code=404, detail="Topic not found")
    await db.delete(topic)


@router.put("/classes/{class_id}/topics/reorder", response_model=list[TopicOut])
async def reorder_topics(
    class_id: int,
    body: TopicReorder,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_role(UserRole.teacher, UserRole.admin)),
):
    for idx, topic_id in enumerate(body.topic_ids):
        result = await db.execute(
            select(Topic).where(Topic.id == topic_id, Topic.class_id == class_id)
        )
        topic = result.scalar_one_or_none()
        if topic:
            topic.order_index = idx
    await db.flush()
    result = await db.execute(
        select(Topic).where(Topic.class_id == class_id).order_by(Topic.order_index)
    )
    return result.scalars().all()


@router.post("/classes/{class_id}/topics/import", response_model=TopicOut, status_code=status.HTTP_201_CREATED)
async def import_topic(
    class_id: int,
    body: TopicImportRequest,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_role(UserRole.teacher, UserRole.admin)),
):
    source_topic_result = await db.execute(select(Topic).where(Topic.id == body.source_topic_id))
    source_topic = source_topic_result.scalar_one_or_none()
    if not source_topic:
        raise HTTPException(status_code=404, detail="Source topic not found")

    max_order_result = await db.execute(
        select(sqlfunc.max(Topic.order_index)).where(Topic.class_id == class_id)
    )
    next_order = (max_order_result.scalar() or -1) + 1

    new_topic = Topic(
        class_id=class_id,
        name=source_topic.name,
        order_index=next_order,
    )
    db.add(new_topic)
    await db.flush()

    source_exercises_result = await db.execute(
        select(Exercise).where(Exercise.topic_id == source_topic.id).order_by(Exercise.order_index)
    )
    source_exercises = source_exercises_result.scalars().all()

    source_materials_result = await db.execute(
        select(Material).where(Material.topic_id == source_topic.id).order_by(Material.order_index)
    )
    source_materials = source_materials_result.scalars().all()

    for ex in source_exercises:
        db.add(Exercise(
            topic_id=new_topic.id,
            title=ex.title,
            description=ex.description,
            solution=ex.solution,
            system_prompt_override=ex.system_prompt_override,
            order_index=ex.order_index,
        ))

    for mat in source_materials:
        db.add(Material(
            topic_id=new_topic.id,
            title=mat.title,
            description=mat.description,
            content=mat.content,
            order_index=mat.order_index,
        ))

    await db.flush()
    await db.refresh(new_topic)
    return new_topic
