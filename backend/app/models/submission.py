import enum
from datetime import datetime

from sqlalchemy import String, Integer, Text, ForeignKey, Enum, DateTime, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class SubmissionStatus(str, enum.Enum):
    in_progress = "in_progress"
    correct = "correct"
    incorrect = "incorrect"
    teacher_correct = "teacher_correct"
    teacher_incorrect = "teacher_incorrect"


class Submission(Base):
    __tablename__ = "submissions"

    id: Mapped[int] = mapped_column(primary_key=True)
    exercise_id: Mapped[int] = mapped_column(Integer, ForeignKey("exercises.id", ondelete="CASCADE"))
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id", ondelete="CASCADE"))
    status: Mapped[SubmissionStatus] = mapped_column(
        Enum(SubmissionStatus), default=SubmissionStatus.in_progress
    )
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())

    # Relationships
    exercise = relationship("Exercise", back_populates="submissions")
    user = relationship("User", back_populates="submissions")
    versions = relationship(
        "SubmissionVersion", back_populates="submission", cascade="all, delete-orphan",
        order_by="SubmissionVersion.version_number",
    )
    conversations = relationship(
        "ChatConversation", back_populates="submission", cascade="all, delete-orphan",
    )


class SubmissionVersion(Base):
    __tablename__ = "submission_versions"

    id: Mapped[int] = mapped_column(primary_key=True)
    submission_id: Mapped[int] = mapped_column(Integer, ForeignKey("submissions.id", ondelete="CASCADE"))
    code: Mapped[str] = mapped_column(Text, default="")
    version_number: Mapped[int] = mapped_column(Integer, default=1)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    # Relationships
    submission = relationship("Submission", back_populates="versions")
