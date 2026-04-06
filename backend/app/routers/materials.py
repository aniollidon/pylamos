from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select, func as sqlfunc
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.user import User, UserRole
from app.models.material import Material, MaterialRead
from app.models.exercise import Exercise
from app.models.topic import Topic
from app.schemas.material import (
    MaterialCreate,
    MaterialUpdate,
    MaterialOut,
    MaterialDetailOut,
    MaterialReorder,
    MaterialImportRequest,
    MaterialReadOut,
)
from app.utils.security import get_current_user, require_role

router = APIRouter(prefix="/api", tags=["materials"])


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


@router.get("/topics/{topic_id}/materials", response_model=list[MaterialOut])
async def list_materials(
    topic_id: int,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Material).where(Material.topic_id == topic_id).order_by(Material.order_index)
    )
    return result.scalars().all()


@router.post("/topics/{topic_id}/materials", response_model=MaterialDetailOut, status_code=status.HTTP_201_CREATED)
async def create_material(
    topic_id: int,
    body: MaterialCreate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_role(UserRole.teacher, UserRole.admin)),
):
    next_order = await _next_topic_item_order(db, topic_id)
    material = Material(
        topic_id=topic_id,
        title=body.title,
        description=body.description,
        content=body.content,
        order_index=next_order,
    )
    db.add(material)
    await db.flush()
    await db.refresh(material)
    return material


@router.get("/materials/{material_id}", response_model=MaterialDetailOut)
async def get_material(
    material_id: int,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    result = await db.execute(select(Material).where(Material.id == material_id))
    material = result.scalar_one_or_none()
    if not material:
        raise HTTPException(status_code=404, detail="Material not found")
    return material


@router.put("/materials/{material_id}", response_model=MaterialDetailOut)
async def update_material(
    material_id: int,
    body: MaterialUpdate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_role(UserRole.teacher, UserRole.admin)),
):
    result = await db.execute(select(Material).where(Material.id == material_id))
    material = result.scalar_one_or_none()
    if not material:
        raise HTTPException(status_code=404, detail="Material not found")

    if body.topic_id is not None and body.topic_id != material.topic_id:
        topic_result = await db.execute(select(Topic).where(Topic.id == body.topic_id))
        target_topic = topic_result.scalar_one_or_none()
        if not target_topic:
            raise HTTPException(status_code=404, detail="Target topic not found")

        if body.order_index is None:
            material.order_index = await _next_topic_item_order(db, body.topic_id)

    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(material, field, value)

    await db.flush()
    await db.refresh(material)
    return material


@router.delete("/materials/{material_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_material(
    material_id: int,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_role(UserRole.teacher, UserRole.admin)),
):
    result = await db.execute(select(Material).where(Material.id == material_id))
    material = result.scalar_one_or_none()
    if not material:
        raise HTTPException(status_code=404, detail="Material not found")
    await db.delete(material)


@router.put("/topics/{topic_id}/materials/reorder", response_model=list[MaterialOut])
async def reorder_materials(
    topic_id: int,
    body: MaterialReorder,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_role(UserRole.teacher, UserRole.admin)),
):
    for idx, material_id in enumerate(body.material_ids):
        result = await db.execute(
            select(Material).where(Material.id == material_id, Material.topic_id == topic_id)
        )
        material = result.scalar_one_or_none()
        if material:
            material.order_index = idx

    await db.flush()
    result = await db.execute(
        select(Material).where(Material.topic_id == topic_id).order_by(Material.order_index)
    )
    return result.scalars().all()


@router.post("/topics/{topic_id}/materials/import", response_model=MaterialDetailOut, status_code=status.HTTP_201_CREATED)
async def import_material(
    topic_id: int,
    body: MaterialImportRequest,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_role(UserRole.teacher, UserRole.admin)),
):
    topic_result = await db.execute(select(Topic).where(Topic.id == topic_id))
    target_topic = topic_result.scalar_one_or_none()
    if not target_topic:
        raise HTTPException(status_code=404, detail="Target topic not found")

    source_result = await db.execute(select(Material).where(Material.id == body.source_material_id))
    source = source_result.scalar_one_or_none()
    if not source:
        raise HTTPException(status_code=404, detail="Source material not found")

    next_order = await _next_topic_item_order(db, topic_id)

    material = Material(
        topic_id=topic_id,
        title=source.title,
        description=source.description,
        content=source.content,
        order_index=next_order,
    )
    db.add(material)
    await db.flush()
    await db.refresh(material)
    return material


@router.get("/materials/{material_id}/read", response_model=MaterialReadOut)
async def get_material_read_status(
    material_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    material_result = await db.execute(select(Material).where(Material.id == material_id))
    material = material_result.scalar_one_or_none()
    if not material:
        raise HTTPException(status_code=404, detail="Material not found")

    read_result = await db.execute(
        select(MaterialRead).where(
            MaterialRead.material_id == material_id,
            MaterialRead.user_id == current_user.id,
        )
    )
    read = read_result.scalar_one_or_none()

    return MaterialReadOut(
        material_id=material_id,
        user_id=current_user.id,
        read=read is not None,
        read_at=read.read_at if read else None,
    )


@router.post("/materials/{material_id}/read", response_model=MaterialReadOut)
async def mark_material_as_read(
    material_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    material_result = await db.execute(select(Material).where(Material.id == material_id))
    material = material_result.scalar_one_or_none()
    if not material:
        raise HTTPException(status_code=404, detail="Material not found")

    read_result = await db.execute(
        select(MaterialRead).where(
            MaterialRead.material_id == material_id,
            MaterialRead.user_id == current_user.id,
        )
    )
    read = read_result.scalar_one_or_none()

    if not read:
        read = MaterialRead(material_id=material_id, user_id=current_user.id)
        db.add(read)
        await db.flush()
        await db.refresh(read)

    return MaterialReadOut(
        material_id=material_id,
        user_id=current_user.id,
        read=True,
        read_at=read.read_at,
    )
