from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, desc
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.user import User, UserRole
from app.models.topic import Topic, TopicUnlock
from app.models.exercise import Exercise
from app.models.material import Material, MaterialRead
from app.models.submission import Submission, SubmissionStatus
from app.utils.security import get_current_user, require_role

router = APIRouter(prefix="/api", tags=["progress"])

COMPLETED_STATUSES = {SubmissionStatus.correct, SubmissionStatus.teacher_correct}


@router.get("/classes/{class_id}/progress")
async def get_class_progress(
    class_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get progress for the current user (student) or all users (teacher) in a class."""
    topics_result = await db.execute(
        select(Topic).where(Topic.class_id == class_id).order_by(Topic.order_index)
    )
    topics = topics_result.scalars().all()

    target_user_id = current_user.id

    progress = []
    for i, topic in enumerate(topics):
        unlocked = await _compute_unlock(db, topic, i, topics, target_user_id)

        # Get exercises status
        exercises_result = await db.execute(
            select(Exercise).where(Exercise.topic_id == topic.id).order_by(Exercise.order_index)
        )
        exercises = exercises_result.scalars().all()

        exercise_progress = []
        for ex in exercises:
            sub_result = await db.execute(
                select(Submission).where(
                    Submission.exercise_id == ex.id,
                    Submission.user_id == target_user_id,
                ).order_by(desc(Submission.updated_at), desc(Submission.id)).limit(1)
            )
            sub = sub_result.scalars().first()
            exercise_progress.append({
                "exercise_id": ex.id,
                "title": ex.title,
                "order_index": ex.order_index,
                "status": sub.status.value if sub else "not_started",
            })

        materials_result = await db.execute(
            select(Material).where(Material.topic_id == topic.id).order_by(Material.order_index)
        )
        materials = materials_result.scalars().all()

        material_progress = []
        for mat in materials:
            read_result = await db.execute(
                select(MaterialRead).where(
                    MaterialRead.material_id == mat.id,
                    MaterialRead.user_id == target_user_id,
                )
            )
            read = read_result.scalar_one_or_none()
            material_progress.append({
                "material_id": mat.id,
                "title": mat.title,
                "order_index": mat.order_index,
                "status": "read" if read else "not_read",
            })

        progress.append({
            "topic_id": topic.id,
            "name": topic.name,
            "order_index": topic.order_index,
            "unlock_mode": topic.unlock_mode,
            "unlocked": unlocked,
            "exercises": exercise_progress,
            "materials": material_progress,
        })

    return progress


async def _compute_unlock(db: AsyncSession, topic: Topic, i: int, topics: list, user_id: int) -> bool:
    mode = topic.unlock_mode or "auto"

    if mode == "open":
        return True

    if mode == "locked":
        # Only unlocked if teacher manually unlocked for this user
        unlock_result = await db.execute(
            select(TopicUnlock).where(
                TopicUnlock.topic_id == topic.id,
                TopicUnlock.user_id == user_id,
            )
        )
        return unlock_result.scalar_one_or_none() is not None

    # mode == "auto"
    if i == 0:
        return True

    # Check manual unlock
    unlock_result = await db.execute(
        select(TopicUnlock).where(
            TopicUnlock.topic_id == topic.id,
            TopicUnlock.user_id == user_id,
        )
    )
    if unlock_result.scalar_one_or_none():
        return True

    # Auto-unlock: all exercises of previous topic completed
    prev_topic = topics[i - 1]
    return await _all_topic_items_completed(db, prev_topic.id, user_id)


async def _all_topic_items_completed(db: AsyncSession, topic_id: int, user_id: int) -> bool:
    exercises_result = await db.execute(
        select(Exercise.id).where(Exercise.topic_id == topic_id)
    )
    exercise_ids = [row[0] for row in exercises_result.all()]
    for eid in exercise_ids:
        sub_result = await db.execute(
            select(Submission).where(
                Submission.exercise_id == eid,
                Submission.user_id == user_id,
            ).order_by(desc(Submission.updated_at), desc(Submission.id)).limit(1)
        )
        sub = sub_result.scalars().first()
        if not sub or sub.status not in COMPLETED_STATUSES:
            return False

    materials_result = await db.execute(
        select(Material.id).where(Material.topic_id == topic_id)
    )
    material_ids = [row[0] for row in materials_result.all()]
    for mid in material_ids:
        read_result = await db.execute(
            select(MaterialRead).where(
                MaterialRead.material_id == mid,
                MaterialRead.user_id == user_id,
            )
        )
        if not read_result.scalar_one_or_none():
            return False

    return True


@router.post("/topics/{topic_id}/unlock/{user_id}")
async def unlock_topic(
    topic_id: int,
    user_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.teacher, UserRole.admin)),
):
    # Check if already unlocked
    existing = await db.execute(
        select(TopicUnlock).where(
            TopicUnlock.topic_id == topic_id,
            TopicUnlock.user_id == user_id,
        )
    )
    if existing.scalar_one_or_none():
        return {"detail": "Already unlocked"}

    unlock = TopicUnlock(
        topic_id=topic_id,
        user_id=user_id,
        unlocked_by=current_user.id,
    )
    db.add(unlock)
    await db.flush()
    return {"detail": "Topic unlocked"}


@router.get("/classes/{class_id}/progress/all")
async def get_all_students_progress(
    class_id: int,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_role(UserRole.teacher, UserRole.admin)),
):
    """Teacher view: progress matrix for all students in a class (exercise level)."""
    from app.models.class_ import ClassMember, MemberRole

    members_result = await db.execute(
        select(ClassMember).where(
            ClassMember.class_id == class_id,
            ClassMember.role == MemberRole.student,
        )
    )
    members = members_result.scalars().all()

    topics_result = await db.execute(
        select(Topic).where(Topic.class_id == class_id).order_by(Topic.order_index)
    )
    topics = topics_result.scalars().all()

    exercises = []
    materials = []
    for topic in topics:
        ex_result = await db.execute(
            select(Exercise).where(Exercise.topic_id == topic.id).order_by(Exercise.order_index)
        )
        for ex in ex_result.scalars().all():
            exercises.append({"id": ex.id, "title": ex.title, "topic_name": topic.name, "order_index": ex.order_index})
        mat_result = await db.execute(
            select(Material).where(Material.topic_id == topic.id).order_by(Material.order_index)
        )
        for mat in mat_result.scalars().all():
            materials.append({"id": mat.id, "title": mat.title, "topic_name": topic.name, "order_index": mat.order_index})

    from app.models.user import User as UserModel
    students_progress = []
    for member in members:
        user_result = await db.execute(select(UserModel).where(UserModel.id == member.user_id))
        user = user_result.scalar_one()
        statuses = {}
        for ex in exercises:
            sub_result = await db.execute(
                select(Submission).where(
                    Submission.exercise_id == ex["id"],
                    Submission.user_id == member.user_id,
                ).order_by(desc(Submission.updated_at), desc(Submission.id)).limit(1)
            )
            sub = sub_result.scalars().first()
            statuses[ex["id"]] = sub.status.value if sub else "not_started"

        material_statuses = {}
        for mat in materials:
            read_result = await db.execute(
                select(MaterialRead).where(
                    MaterialRead.material_id == mat["id"],
                    MaterialRead.user_id == member.user_id,
                )
            )
            material_statuses[mat["id"]] = "read" if read_result.scalar_one_or_none() else "not_read"

        students_progress.append({
            "user_id": member.user_id,
            "full_name": user.full_name,
            "username": user.username,
            "exercises": statuses,
            "materials": material_statuses,
        })

    return {
        "exercises": exercises,
        "materials": materials,
        "students": students_progress,
    }


@router.get("/classes/{class_id}/progress/topics")
async def get_topics_progress(
    class_id: int,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_role(UserRole.teacher, UserRole.admin)),
):
    """Teacher view: per-topic progress matrix for all students in a class."""
    from app.models.class_ import ClassMember, MemberRole
    from app.models.user import User as UserModel

    members_result = await db.execute(
        select(ClassMember).where(
            ClassMember.class_id == class_id,
            ClassMember.role == MemberRole.student,
        )
    )
    members = members_result.scalars().all()

    topics_result = await db.execute(
        select(Topic).where(Topic.class_id == class_id).order_by(Topic.order_index)
    )
    topics = topics_result.scalars().all()

    # Build topic → exercises map
    topic_exercises: dict[int, list] = {}
    topic_materials: dict[int, list] = {}
    for topic in topics:
        ex_result = await db.execute(
            select(Exercise).where(Exercise.topic_id == topic.id).order_by(Exercise.order_index)
        )
        topic_exercises[topic.id] = ex_result.scalars().all()
        mat_result = await db.execute(
            select(Material).where(Material.topic_id == topic.id).order_by(Material.order_index)
        )
        topic_materials[topic.id] = mat_result.scalars().all()

    students_progress = []
    for member in members:
        user_result = await db.execute(select(UserModel).where(UserModel.id == member.user_id))
        user = user_result.scalar_one()
        topics_data: dict[str, list] = {}
        for topic in topics:
            exercises_progress = []
            for ex in topic_exercises[topic.id]:
                sub_result = await db.execute(
                    select(Submission).where(
                        Submission.exercise_id == ex.id,
                        Submission.user_id == member.user_id,
                    ).order_by(desc(Submission.updated_at), desc(Submission.id)).limit(1)
                )
                sub = sub_result.scalars().first()
                exercises_progress.append({
                    "exercise_id": ex.id,
                    "title": ex.title,
                    "order_index": ex.order_index,
                    "status": sub.status.value if sub else "not_started",
                })

            materials_progress = []
            for mat in topic_materials[topic.id]:
                read_result = await db.execute(
                    select(MaterialRead).where(
                        MaterialRead.material_id == mat.id,
                        MaterialRead.user_id == member.user_id,
                    )
                )
                materials_progress.append({
                    "material_id": mat.id,
                    "title": mat.title,
                    "order_index": mat.order_index,
                    "status": "read" if read_result.scalar_one_or_none() else "not_read",
                })

            topics_data[str(topic.id)] = {
                "exercises": exercises_progress,
                "materials": materials_progress,
            }
        students_progress.append({
            "user_id": member.user_id,
            "full_name": user.full_name,
            "username": user.username,
            "topics": topics_data,
        })

    return {
        "topics": [{"id": t.id, "name": t.name} for t in topics],
        "students": students_progress,
    }
