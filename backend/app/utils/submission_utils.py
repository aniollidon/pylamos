from sqlalchemy import select, desc
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.submission import SubmissionVersion


async def save_code_version(
    db: AsyncSession,
    submission_id: int,
    code: str,
) -> SubmissionVersion:
    """Save a new code version only if the code changed. Returns the version (new or existing)."""
    latest_result = await db.execute(
        select(SubmissionVersion)
        .where(SubmissionVersion.submission_id == submission_id)
        .order_by(desc(SubmissionVersion.version_number), desc(SubmissionVersion.id))
        .limit(1)
    )
    latest = latest_result.scalars().first()

    if latest and latest.code == code:
        return latest

    version = SubmissionVersion(
        submission_id=submission_id,
        code=code,
        version_number=(latest.version_number + 1) if latest else 1,
    )
    db.add(version)
    await db.flush()
    return version
