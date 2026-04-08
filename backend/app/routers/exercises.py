from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select, func as sqlfunc
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.user import User, UserRole
from app.models.exercise import Exercise
from app.models.material import Material
from app.models.topic import Topic
from app.schemas.exercise import (
    ExerciseCreate, ExerciseUpdate, ExerciseOut, ExerciseDetailOut, ExerciseReorder, ExerciseImportRequest,
)
from app.utils.security import get_current_user, require_role
from app.utils.topic_access import ensure_topic_access

router = APIRouter(prefix="/api", tags=["exercises"])


async def _next_topic_item_order(db: AsyncSession, topic_id: int) -> int:
    ex_max_result = await db.execute(
        select(sqlfunc.max(Exercise.order_index)).where(Exercise.topic_id == topic_id)
    )
    mat_max_result = await db.execute(
        select(sqlfunc.max(Material.order_index)).where(Material.topic_id == topic_id)
    )
    ex_max = ex_max_result.scalar()
    mat_max = mat_max_result.scalar()
    return max(ex_max if ex_max is not None else -1, mat_max if mat_max is not None else -1) + 1


@router.get("/topics/{topic_id}/exercises", response_model=list[ExerciseOut])
async def list_exercises(
    topic_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await ensure_topic_access(db, current_user, topic_id)
    result = await db.execute(
        select(Exercise).where(Exercise.topic_id == topic_id).order_by(Exercise.order_index)
    )
    return result.scalars().all()


@router.post("/topics/{topic_id}/exercises", response_model=ExerciseDetailOut, status_code=status.HTTP_201_CREATED)
async def create_exercise(
    topic_id: int,
    body: ExerciseCreate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_role(UserRole.teacher, UserRole.admin)),
):
    next_order = await _next_topic_item_order(db, topic_id)
    exercise = Exercise(
        topic_id=topic_id,
        title=body.title,
        description=body.description,
        solution=body.solution,
        system_prompt_override=body.system_prompt_override,
        order_index=next_order,
    )
    db.add(exercise)
    await db.flush()
    await db.refresh(exercise)
    return exercise


@router.get("/exercises/{exercise_id}", response_model=ExerciseOut | ExerciseDetailOut)
async def get_exercise(
    exercise_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(select(Exercise).where(Exercise.id == exercise_id))
    exercise = result.scalar_one_or_none()
    if not exercise:
        raise HTTPException(status_code=404, detail="Exercise not found")

    await ensure_topic_access(db, current_user, exercise.topic_id)

    # Teachers can see solution
    if current_user.role in (UserRole.teacher, UserRole.admin):
        return ExerciseDetailOut.model_validate(exercise)
    return exercise


@router.put("/exercises/{exercise_id}", response_model=ExerciseDetailOut)
async def update_exercise(
    exercise_id: int,
    body: ExerciseUpdate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_role(UserRole.teacher, UserRole.admin)),
):
    result = await db.execute(select(Exercise).where(Exercise.id == exercise_id))
    exercise = result.scalar_one_or_none()
    if not exercise:
        raise HTTPException(status_code=404, detail="Exercise not found")

    if body.topic_id is not None and body.topic_id != exercise.topic_id:
        topic_result = await db.execute(select(Topic).where(Topic.id == body.topic_id))
        target_topic = topic_result.scalar_one_or_none()
        if not target_topic:
            raise HTTPException(status_code=404, detail="Target topic not found")

        if body.order_index is None:
            exercise.order_index = await _next_topic_item_order(db, body.topic_id)

    for field, value in body.model_dump(exclude_unset=True).items():
        # Normalize empty string to None for nullable text fields
        if field == 'system_prompt_override' and value == '':
            value = None
        setattr(exercise, field, value)
    await db.flush()
    await db.refresh(exercise)
    return exercise


@router.delete("/exercises/{exercise_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_exercise(
    exercise_id: int,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_role(UserRole.teacher, UserRole.admin)),
):
    result = await db.execute(select(Exercise).where(Exercise.id == exercise_id))
    exercise = result.scalar_one_or_none()
    if not exercise:
        raise HTTPException(status_code=404, detail="Exercise not found")
    await db.delete(exercise)


@router.put("/topics/{topic_id}/exercises/reorder", response_model=list[ExerciseOut])
async def reorder_exercises(
    topic_id: int,
    body: ExerciseReorder,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_role(UserRole.teacher, UserRole.admin)),
):
    for idx, exercise_id in enumerate(body.exercise_ids):
        result = await db.execute(
            select(Exercise).where(Exercise.id == exercise_id, Exercise.topic_id == topic_id)
        )
        exercise = result.scalar_one_or_none()
        if exercise:
            exercise.order_index = idx
    await db.flush()
    result = await db.execute(
        select(Exercise).where(Exercise.topic_id == topic_id).order_by(Exercise.order_index)
    )
    return result.scalars().all()


@router.post("/topics/{topic_id}/exercises/import", response_model=ExerciseDetailOut, status_code=status.HTTP_201_CREATED)
async def import_exercise(
    topic_id: int,
    body: ExerciseImportRequest,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_role(UserRole.teacher, UserRole.admin)),
):
    topic_result = await db.execute(select(Topic).where(Topic.id == topic_id))
    target_topic = topic_result.scalar_one_or_none()
    if not target_topic:
        raise HTTPException(status_code=404, detail="Target topic not found")

    source_result = await db.execute(select(Exercise).where(Exercise.id == body.source_exercise_id))
    source = source_result.scalar_one_or_none()
    if not source:
        raise HTTPException(status_code=404, detail="Source exercise not found")

    next_order = await _next_topic_item_order(db, topic_id)

    exercise = Exercise(
        topic_id=topic_id,
        title=source.title,
        description=source.description,
        solution=source.solution,
        system_prompt_override=source.system_prompt_override,
        order_index=next_order,
    )
    db.add(exercise)
    await db.flush()
    await db.refresh(exercise)
    return exercise
