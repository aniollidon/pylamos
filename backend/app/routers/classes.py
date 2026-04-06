from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.models.user import User, UserRole
from app.models.class_ import Class, ClassMember, MemberRole
from app.schemas.class_ import ClassCreate, ClassUpdate, ClassOut, ClassMemberAdd, ClassMemberOut
from app.utils.security import get_current_user, require_role

router = APIRouter(prefix="/api/classes", tags=["classes"])


@router.get("", response_model=list[ClassOut])
async def list_classes(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role in (UserRole.admin,):
        result = await db.execute(select(Class).order_by(Class.name))
    else:
        result = await db.execute(
            select(Class)
            .join(ClassMember, ClassMember.class_id == Class.id)
            .where(ClassMember.user_id == current_user.id)
            .order_by(Class.name)
        )
    return result.scalars().all()


@router.post("", response_model=ClassOut, status_code=status.HTTP_201_CREATED)
async def create_class(
    body: ClassCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.teacher, UserRole.admin)),
):
    cls = Class(name=body.name, created_by=current_user.id)
    db.add(cls)
    await db.flush()
    # Add creator as teacher member
    member = ClassMember(class_id=cls.id, user_id=current_user.id, role=MemberRole.teacher)
    db.add(member)
    await db.flush()
    await db.refresh(cls)
    return cls


@router.get("/{class_id}", response_model=ClassOut)
async def get_class(
    class_id: int,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    result = await db.execute(select(Class).where(Class.id == class_id))
    cls = result.scalar_one_or_none()
    if not cls:
        raise HTTPException(status_code=404, detail="Class not found")
    return cls


@router.put("/{class_id}", response_model=ClassOut)
async def update_class(
    class_id: int,
    body: ClassUpdate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_role(UserRole.teacher, UserRole.admin)),
):
    result = await db.execute(select(Class).where(Class.id == class_id))
    cls = result.scalar_one_or_none()
    if not cls:
        raise HTTPException(status_code=404, detail="Class not found")
    if body.name is not None:
        cls.name = body.name
    await db.flush()
    await db.refresh(cls)
    return cls


@router.delete("/{class_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_class(
    class_id: int,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_role(UserRole.teacher, UserRole.admin)),
):
    result = await db.execute(select(Class).where(Class.id == class_id))
    cls = result.scalar_one_or_none()
    if not cls:
        raise HTTPException(status_code=404, detail="Class not found")
    await db.delete(cls)


# --- Members ---

@router.get("/{class_id}/members", response_model=list[ClassMemberOut])
async def list_members(
    class_id: int,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    result = await db.execute(
        select(ClassMember)
        .options(selectinload(ClassMember.user))
        .where(ClassMember.class_id == class_id)
    )
    members = result.scalars().all()
    return [
        ClassMemberOut(
            id=m.id,
            class_id=m.class_id,
            user_id=m.user_id,
            role=m.role,
            user_full_name=m.user.full_name if m.user else None,
            user_username=m.user.username if m.user else None,
        )
        for m in members
    ]


@router.post("/{class_id}/members", response_model=ClassMemberOut, status_code=status.HTTP_201_CREATED)
async def add_member(
    class_id: int,
    body: ClassMemberAdd,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_role(UserRole.teacher, UserRole.admin)),
):
    # Check class exists
    cls_result = await db.execute(select(Class).where(Class.id == class_id))
    if not cls_result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Class not found")

    # If student, check not already in another class
    if body.role == MemberRole.student:
        existing = await db.execute(
            select(ClassMember).where(
                ClassMember.user_id == body.user_id,
                ClassMember.role == MemberRole.student,
            )
        )
        if existing.scalar_one_or_none():
            raise HTTPException(status_code=400, detail="Student already belongs to a class")

    # Check not already member of this class
    dup = await db.execute(
        select(ClassMember).where(
            ClassMember.class_id == class_id,
            ClassMember.user_id == body.user_id,
        )
    )
    if dup.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="User already in this class")

    member = ClassMember(class_id=class_id, user_id=body.user_id, role=body.role)
    db.add(member)
    await db.flush()
    await db.refresh(member)

    user_result = await db.execute(select(User).where(User.id == body.user_id))
    user = user_result.scalar_one_or_none()
    return ClassMemberOut(
        id=member.id,
        class_id=member.class_id,
        user_id=member.user_id,
        role=member.role,
        user_full_name=user.full_name if user else None,
        user_username=user.username if user else None,
    )


@router.delete("/{class_id}/members/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_member(
    class_id: int,
    user_id: int,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_role(UserRole.teacher, UserRole.admin)),
):
    result = await db.execute(
        select(ClassMember).where(
            ClassMember.class_id == class_id,
            ClassMember.user_id == user_id,
        )
    )
    member = result.scalar_one_or_none()
    if not member:
        raise HTTPException(status_code=404, detail="Member not found")
    await db.delete(member)
