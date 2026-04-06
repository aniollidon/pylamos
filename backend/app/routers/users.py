from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.user import User, UserRole
from app.models.submission import Submission, SubmissionVersion
from app.models.chat import ChatConversation, ChatMessage
from app.models.topic import TopicUnlock
from app.models.class_ import ClassMember
from app.schemas.user import UserCreate, UserUpdate, UserOut
from app.utils.security import get_current_user, require_role, hash_password

router = APIRouter(prefix="/api/users", tags=["users"])


@router.get("", response_model=list[UserOut])
async def list_users(
    role: UserRole | None = None,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_role(UserRole.teacher, UserRole.admin)),
):
    query = select(User)
    if role:
        query = query.where(User.role == role)
    result = await db.execute(query.order_by(User.full_name))
    return result.scalars().all()


@router.post("", response_model=UserOut, status_code=status.HTTP_201_CREATED)
async def create_user(
    body: UserCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.teacher, UserRole.admin)),
):
    existing = await db.execute(select(User).where(User.username == body.username))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Username already exists")
    user = User(
        username=body.username,
        password_hash=hash_password(body.password),
        full_name=body.full_name,
        role=body.role,
        language=body.language,
    )
    db.add(user)
    await db.flush()
    await db.refresh(user)
    return user


@router.get("/{user_id}", response_model=UserOut)
async def get_user(
    user_id: int,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_role(UserRole.teacher, UserRole.admin)),
):
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user


@router.put("/{user_id}", response_model=UserOut)
async def update_user(
    user_id: int,
    body: UserUpdate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_role(UserRole.teacher, UserRole.admin)),
):
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if body.full_name is not None:
        user.full_name = body.full_name
    if body.role is not None:
        user.role = body.role
    if body.language is not None:
        user.language = body.language
    if body.password is not None:
        user.password_hash = hash_password(body.password)
    await db.flush()
    await db.refresh(user)
    return user


@router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_user(
    user_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.admin)),
):
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if user.id == current_user.id:
        raise HTTPException(status_code=400, detail="Cannot delete yourself")
    await db.delete(user)


@router.delete("/{user_id}/student-data")
async def purge_student_data(
    user_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.admin)),
):
    """Purge learning data while keeping the user account."""
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    submission_ids_result = await db.execute(
        select(Submission.id).where(Submission.user_id == user_id)
    )
    submission_ids = [row[0] for row in submission_ids_result.all()]

    versions_deleted = 0
    conversations_deleted = 0
    messages_deleted = 0
    submissions_deleted = 0

    if submission_ids:
        conversation_ids_result = await db.execute(
            select(ChatConversation.id).where(ChatConversation.submission_id.in_(submission_ids))
        )
        conversation_ids = [row[0] for row in conversation_ids_result.all()]

        if conversation_ids:
            messages_deleted = (await db.execute(
                delete(ChatMessage).where(ChatMessage.conversation_id.in_(conversation_ids))
            )).rowcount or 0

            conversations_deleted = (await db.execute(
                delete(ChatConversation).where(ChatConversation.id.in_(conversation_ids))
            )).rowcount or 0

        versions_deleted = (await db.execute(
            delete(SubmissionVersion).where(SubmissionVersion.submission_id.in_(submission_ids))
        )).rowcount or 0

        submissions_deleted = (await db.execute(
            delete(Submission).where(Submission.id.in_(submission_ids))
        )).rowcount or 0

    unlocks_deleted = (await db.execute(
        delete(TopicUnlock).where(TopicUnlock.user_id == user_id)
    )).rowcount or 0

    memberships_deleted = 0
    if user.role == UserRole.student:
        memberships_deleted = (await db.execute(
            delete(ClassMember).where(ClassMember.user_id == user_id)
        )).rowcount or 0

    return {
        "detail": "User learning data purged",
        "submissions_deleted": submissions_deleted,
        "submission_versions_deleted": versions_deleted,
        "chat_conversations_deleted": conversations_deleted,
        "chat_messages_deleted": messages_deleted,
        "topic_unlocks_deleted": unlocks_deleted,
        "class_memberships_deleted": memberships_deleted,
    }
