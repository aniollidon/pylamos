from datetime import datetime

from sqlalchemy import String, Integer, ForeignKey, DateTime, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Topic(Base):
    __tablename__ = "topics"

    id: Mapped[int] = mapped_column(primary_key=True)
    class_id: Mapped[int] = mapped_column(Integer, ForeignKey("classes.id", ondelete="CASCADE"))
    name: Mapped[str] = mapped_column(String(200))
    order_index: Mapped[int] = mapped_column(Integer, default=0)
    unlock_mode: Mapped[str] = mapped_column(String(20), server_default="auto")
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    # Relationships
    class_ = relationship("Class", back_populates="topics")
    exercises = relationship("Exercise", back_populates="topic", cascade="all, delete-orphan", order_by="Exercise.order_index")
    materials = relationship("Material", back_populates="topic", cascade="all, delete-orphan", order_by="Material.order_index")
    unlocks = relationship("TopicUnlock", back_populates="topic", cascade="all, delete-orphan")


class TopicUnlock(Base):
    __tablename__ = "topic_unlocks"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id", ondelete="CASCADE"))
    topic_id: Mapped[int] = mapped_column(Integer, ForeignKey("topics.id", ondelete="CASCADE"))
    unlocked_by: Mapped[int | None] = mapped_column(Integer, ForeignKey("users.id"), nullable=True)
    unlocked_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    # Relationships
    topic = relationship("Topic", back_populates="unlocks")
