from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select, desc
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.models.user import User, UserRole
from app.models.submission import Submission, SubmissionVersion, SubmissionStatus
from app.models.exercise import Exercise
from app.schemas.submission import (
    SubmissionOut, SubmissionDetailOut,
    SubmissionOverride, SaveCodeRequest, SubmissionVersionOut,
)
from app.utils.security import get_current_user, require_role
from app.utils.topic_access import ensure_topic_access
from app.utils.submission_utils import save_code_version

router = APIRouter(prefix="/api", tags=["submissions"])


@router.post("/exercises/{exercise_id}/submissions", response_model=SubmissionOut)
async def create_or_get_submission(
    exercise_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get existing submission or create a new one."""
    exercise_result = await db.execute(select(Exercise).where(Exercise.id == exercise_id))
    exercise = exercise_result.scalar_one_or_none()
    if not exercise:
        raise HTTPException(status_code=404, detail="Exercise not found")

    await ensure_topic_access(db, current_user, exercise.topic_id)

    result = await db.execute(
        select(Submission).where(
            Submission.exercise_id == exercise_id,
            Submission.user_id == current_user.id,
        ).order_by(desc(Submission.updated_at), desc(Submission.id)).limit(1)
    )
    submission = result.scalars().first()
    if submission:
        return submission

    submission = Submission(
        exercise_id=exercise_id,
        user_id=current_user.id,
        status=SubmissionStatus.in_progress,
    )
    db.add(submission)
    await db.flush()

    # Create initial version
    version = SubmissionVersion(submission_id=submission.id, code="", version_number=1)
    db.add(version)
    await db.flush()
    await db.refresh(submission)
    return submission


@router.get("/submissions/{submission_id}", response_model=SubmissionDetailOut)
async def get_submission(
    submission_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Submission)
        .options(selectinload(Submission.versions))
        .where(Submission.id == submission_id)
    )
    submission = result.scalar_one_or_none()
    if not submission:
        raise HTTPException(status_code=404, detail="Submission not found")
    # Students can only see their own
    if current_user.role == UserRole.student and submission.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Access denied")
    return submission


@router.post("/submissions/{submission_id}/save", response_model=SubmissionVersionOut)
async def save_code(
    submission_id: int,
    body: SaveCodeRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Submission).where(Submission.id == submission_id)
    )
    submission = result.scalar_one_or_none()
    if not submission:
        raise HTTPException(status_code=404, detail="Submission not found")
    if current_user.role == UserRole.student and submission.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Access denied")

    version = await save_code_version(db, submission_id, body.code)
    await db.refresh(version)
    return version


@router.post("/submissions/{submission_id}/override", response_model=SubmissionOut)
async def override_submission(
    submission_id: int,
    body: SubmissionOverride,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_role(UserRole.teacher, UserRole.admin)),
):
    result = await db.execute(
        select(Submission).where(Submission.id == submission_id)
    )
    submission = result.scalar_one_or_none()
    if not submission:
        raise HTTPException(status_code=404, detail="Submission not found")
    submission.status = body.status
    await db.flush()
    await db.refresh(submission)
    return submission


@router.get("/exercises/{exercise_id}/submissions/all", response_model=list[SubmissionOut])
async def list_submissions_for_exercise(
    exercise_id: int,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_role(UserRole.teacher, UserRole.admin)),
):
    """List all student submissions for an exercise (teacher view)."""
    result = await db.execute(
        select(Submission)
        .where(Submission.exercise_id == exercise_id)
        .order_by(desc(Submission.updated_at), desc(Submission.id))
    )
    return result.scalars().all()


@router.delete("/submissions/{submission_id}", status_code=204)
async def delete_submission(
    submission_id: int,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_role(UserRole.teacher, UserRole.admin)),
):
    """Delete a student's submission (and all versions/conversations) for an exercise."""
    result = await db.execute(
        select(Submission).where(Submission.id == submission_id)
    )
    submission = result.scalar_one_or_none()
    if not submission:
        raise HTTPException(status_code=404, detail="Submission not found")
    await db.delete(submission)
    await db.commit()
