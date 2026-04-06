import enum
from datetime import datetime

from sqlalchemy import String, Integer, ForeignKey, Enum, DateTime, func, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class MemberRole(str, enum.Enum):
    student = "student"
    teacher = "teacher"


class Class(Base):
    __tablename__ = "classes"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(200))
    created_by: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    # Relationships
    creator = relationship("User", back_populates="created_classes")
    members = relationship("ClassMember", back_populates="class_", cascade="all, delete-orphan")
    topics = relationship("Topic", back_populates="class_", cascade="all, delete-orphan", order_by="Topic.order_index")


class ClassMember(Base):
    __tablename__ = "class_members"

    id: Mapped[int] = mapped_column(primary_key=True)
    class_id: Mapped[int] = mapped_column(Integer, ForeignKey("classes.id", ondelete="CASCADE"))
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id", ondelete="CASCADE"))
    role: Mapped[MemberRole] = mapped_column(Enum(MemberRole), default=MemberRole.student)

    __table_args__ = (
        UniqueConstraint("class_id", "user_id", name="uq_class_member"),
    )

    # Relationships
    class_ = relationship("Class", back_populates="members")
    user = relationship("User", back_populates="class_memberships")
