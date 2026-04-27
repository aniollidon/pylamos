from fastapi import HTTPException
from sqlalchemy import select, desc
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.class_ import ClassMember, MemberRole
from app.models.user import User, UserRole
from app.models.topic import Topic, TopicUnlock
from app.models.exercise import Exercise
from app.models.material import Material, MaterialRead
from app.models.submission import Submission, SubmissionStatus

COMPLETED_STATUSES = {SubmissionStatus.correct, SubmissionStatus.teacher_correct}


async def _all_topic_items_completed(db: AsyncSession, topic_id: int, user_id: int) -> bool:
    exercises_result = await db.execute(
        select(Exercise.id).where(Exercise.topic_id == topic_id, Exercise.is_hidden.is_(False))
    )
    exercise_ids = [row[0] for row in exercises_result.all()]
    for exercise_id in exercise_ids:
        sub_result = await db.execute(
            select(Submission)
            .where(
                Submission.exercise_id == exercise_id,
                Submission.user_id == user_id,
            )
            .order_by(desc(Submission.updated_at), desc(Submission.id))
            .limit(1)
        )
        latest_submission = sub_result.scalars().first()
        if not latest_submission or latest_submission.status not in COMPLETED_STATUSES:
            return False

    materials_result = await db.execute(
        select(Material.id).where(Material.topic_id == topic_id)
    )
    material_ids = [row[0] for row in materials_result.all()]
    for material_id in material_ids:
        read_result = await db.execute(
            select(MaterialRead).where(
                MaterialRead.material_id == material_id,
                MaterialRead.user_id == user_id,
            )
        )
        if not read_result.scalar_one_or_none():
            return False

    return True


async def _is_topic_unlocked_for_student(db: AsyncSession, topic: Topic, user_id: int) -> bool:
    mode = topic.unlock_mode or "auto"

    if mode == "open":
        return True

    manual_unlock_result = await db.execute(
        select(TopicUnlock).where(
            TopicUnlock.topic_id == topic.id,
            TopicUnlock.user_id == user_id,
        )
    )
    manually_unlocked = manual_unlock_result.scalar_one_or_none() is not None

    if mode == "locked":
        return manually_unlocked

    if manually_unlocked:
        return True

    topics_result = await db.execute(
        select(Topic)
        .where(Topic.class_id == topic.class_id, Topic.is_hidden.is_(False))
        .order_by(Topic.order_index)
    )
    ordered_topics = topics_result.scalars().all()

    current_idx = next((idx for idx, value in enumerate(ordered_topics) if value.id == topic.id), None)
    if current_idx is None:
        return False
    if current_idx == 0:
        return True

    prev_topic = ordered_topics[current_idx - 1]
    return await _all_topic_items_completed(db, prev_topic.id, user_id)


async def ensure_topic_access(
    db: AsyncSession,
    current_user: User,
    topic_id: int,
) -> Topic:
    topic_result = await db.execute(select(Topic).where(Topic.id == topic_id))
    topic = topic_result.scalar_one_or_none()
    if not topic:
        raise HTTPException(status_code=404, detail="Topic not found")

    if current_user.role != UserRole.student:
        return topic

    if topic.is_hidden:
        raise HTTPException(status_code=404, detail="Topic not found")

    membership_result = await db.execute(
        select(ClassMember).where(
            ClassMember.class_id == topic.class_id,
            ClassMember.user_id == current_user.id,
            ClassMember.role == MemberRole.student,
        )
    )
    if not membership_result.scalar_one_or_none():
        raise HTTPException(status_code=403, detail="Access denied")

    unlocked = await _is_topic_unlocked_for_student(db, topic, current_user.id)
    if not unlocked:
        raise HTTPException(status_code=403, detail="Topic is locked")

    return topic


async def ensure_exercise_access(
    db: AsyncSession,
    current_user: User,
    exercise_id: int,
) -> Exercise:
    exercise_result = await db.execute(select(Exercise).where(Exercise.id == exercise_id))
    exercise = exercise_result.scalar_one_or_none()
    if not exercise:
        raise HTTPException(status_code=404, detail="Exercise not found")

    await ensure_topic_access(db, current_user, exercise.topic_id)

    if current_user.role == UserRole.student and exercise.is_hidden:
        raise HTTPException(status_code=404, detail="Exercise not found")

    return exercise
