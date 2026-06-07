import uuid
from datetime import datetime
from sqlalchemy import (
    Column, String, Integer, DateTime, ForeignKey,
    Boolean, Enum as SAEnum, Text
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from app.database import Base
import enum

class TaskDifficulty(str, enum.Enum):
    easy = "easy"
    medium = "medium"
    hard = "hard"

class TaskStatus(str, enum.Enum):
    active = "active"
    done = "done"
    archived = "archived"

class DailyTask(Base):
    __tablename__ = "daily_tasks"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)

    title = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    difficulty = Column(SAEnum(TaskDifficulty), nullable=False)
    xp_reward = Column(Integer, nullable=False)

    duration_minutes = Column(Integer, nullable=False)
    timer_started_at = Column(DateTime, nullable=True)
    is_timer_running = Column(Boolean, default=False)

    status = Column(SAEnum(TaskStatus), default=TaskStatus.active)
    completed_at = Column(DateTime, nullable=True)
    archived_at = Column(DateTime, nullable=True)

    xp_granted = Column(Boolean, default=False)

    created_at = Column(DateTime, default=datetime.utcnow)

    user = relationship("User", back_populates="daily_tasks")