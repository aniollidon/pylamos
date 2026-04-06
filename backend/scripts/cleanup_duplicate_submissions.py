import argparse
import asyncio
import sys
from pathlib import Path

from sqlalchemy import delete, desc, func, select, update

# Ensure `app` imports work when running this script directly.
ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from app.database import async_session  # noqa: E402
from app.models.chat import ChatConversation  # noqa: E402
from app.models.submission import Submission, SubmissionVersion  # noqa: E402


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Cleanup duplicated submissions by (exercise_id, user_id)."
    )
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Apply changes. Without this flag, script runs in dry-run mode.",
    )
    return parser.parse_args()


async def cleanup_duplicates(apply_changes: bool) -> int:
    total_groups = 0
    total_duplicates = 0
    total_versions_moved = 0
    total_conversations_moved = 0
    total_versions_renumbered = 0

    async with async_session() as db:
        dup_groups_result = await db.execute(
            select(
                Submission.exercise_id,
                Submission.user_id,
                func.count(Submission.id).label("cnt"),
            )
            .group_by(Submission.exercise_id, Submission.user_id)
            .having(func.count(Submission.id) > 1)
            .order_by(Submission.exercise_id, Submission.user_id)
        )
        dup_groups = dup_groups_result.all()

        if not dup_groups:
            print("No duplicated submissions found.")
            if apply_changes:
                await db.commit()
            else:
                await db.rollback()
            return 0

        print(
            f"Found {len(dup_groups)} duplicated group(s). "
            f"Mode: {'APPLY' if apply_changes else 'DRY-RUN'}"
        )

        for exercise_id, user_id, cnt in dup_groups:
            total_groups += 1
            submissions_result = await db.execute(
                select(Submission)
                .where(
                    Submission.exercise_id == exercise_id,
                    Submission.user_id == user_id,
                )
                .order_by(desc(Submission.updated_at), desc(Submission.id))
            )
            submissions = submissions_result.scalars().all()

            keeper = submissions[0]
            duplicates = submissions[1:]
            duplicate_ids = [s.id for s in duplicates]
            total_duplicates += len(duplicate_ids)

            print(
                "- group exercise_id={} user_id={} count={} | keep={} delete={}".format(
                    exercise_id,
                    user_id,
                    cnt,
                    keeper.id,
                    duplicate_ids,
                )
            )

            if duplicate_ids:
                move_versions_result = await db.execute(
                    update(SubmissionVersion)
                    .where(SubmissionVersion.submission_id.in_(duplicate_ids))
                    .values(submission_id=keeper.id)
                )
                moved_versions = move_versions_result.rowcount or 0
                total_versions_moved += moved_versions

                move_conversations_result = await db.execute(
                    update(ChatConversation)
                    .where(ChatConversation.submission_id.in_(duplicate_ids))
                    .values(submission_id=keeper.id)
                )
                moved_conversations = move_conversations_result.rowcount or 0
                total_conversations_moved += moved_conversations

                await db.execute(delete(Submission).where(Submission.id.in_(duplicate_ids)))

            merged_versions_result = await db.execute(
                select(SubmissionVersion)
                .where(SubmissionVersion.submission_id == keeper.id)
                .order_by(SubmissionVersion.created_at, SubmissionVersion.id)
            )
            merged_versions = merged_versions_result.scalars().all()
            for index, version in enumerate(merged_versions, start=1):
                if version.version_number != index:
                    version.version_number = index
                    total_versions_renumbered += 1

        if apply_changes:
            await db.commit()
            print("Changes committed.")
        else:
            await db.rollback()
            print("Dry-run complete. No changes were committed.")

    print("Summary:")
    print(f"- duplicated groups: {total_groups}")
    print(f"- duplicate submissions removed: {total_duplicates}")
    print(f"- submission versions moved: {total_versions_moved}")
    print(f"- conversations moved: {total_conversations_moved}")
    print(f"- version rows renumbered: {total_versions_renumbered}")

    return total_duplicates


def main() -> None:
    args = parse_args()
    asyncio.run(cleanup_duplicates(apply_changes=args.apply))


if __name__ == "__main__":
    main()
