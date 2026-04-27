from datetime import datetime

from sqlalchemy import String, Integer, Text, ForeignKey, DateTime, func, Boolean
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Exercise(Base):
    __tablename__ = "exercises"

    id: Mapped[int] = mapped_column(primary_key=True)
    topic_id: Mapped[int] = mapped_column(Integer, ForeignKey("topics.id", ondelete="CASCADE"))
    title: Mapped[str] = mapped_column(String(300))
    description: Mapped[str] = mapped_column(Text)
    solution: Mapped[str] = mapped_column(Text)
    system_prompt_override: Mapped[str | None] = mapped_column(Text, nullable=True)
    order_index: Mapped[int] = mapped_column(Integer, default=0)
    is_hidden: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="0")
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    # Relationships
    topic = relationship("Topic", back_populates="exercises")
    submissions = relationship("Submission", back_populates="exercise", cascade="all, delete-orphan")
