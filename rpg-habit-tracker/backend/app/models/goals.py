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

class GoalStatus(str, enum.Enum):
    active = "active"
    completed = "completed"
    failed = "failed"
    archived = "archived"

class GoalRarity(str, enum.Enum):
    common = "common"
    rare = "rare"
    epic = "epic"
    legendary = "legendary"

class Goal(Base):
    __tablename__ = "goals"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)

    title = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    category = Column(String(50), nullable=True)
    emoji = Column(String(10), nullable=True)
    rarity = Column(SAEnum(GoalRarity), default=GoalRarity.common)
    status = Column(SAEnum(GoalStatus), default=GoalStatus.active)
    is_main_quest = Column(Boolean, default=False)

    deadline = Column(DateTime, nullable=True)
    deadline_extensions = Column(Integer, default=0)
    max_deadline_extensions = Column(Integer, default=3)

    progress_percent = Column(Integer, default=0)

    max_subtasks = Column(Integer, default=20)
    subtasks_completed_today = Column(Integer, default=0)
    subtasks_cap_reset_date = Column(DateTime, nullable=True)

    completion_xp_bonus = Column(Integer, default=0)
    completion_xp_granted = Column(Boolean, default=False)

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    completed_at = Column(DateTime, nullable=True)
    failed_at = Column(DateTime, nullable=True)

    user = relationship("User", back_populates="goals")
    subtasks = relationship(
        "SubTask", back_populates="goal",
        cascade="all, delete-orphan",
        order_by="SubTask.order_index"
    )

RARITY_COMPLETION_BONUS = {
    GoalRarity.common: 60,
    GoalRarity.rare: 100,
    GoalRarity.epic: 180,
    GoalRarity.legendary: 300,
}

RARITY_SUBTASK_MAX_XP = {
    GoalRarity.common: 5,
    GoalRarity.rare: 8,
    GoalRarity.epic: 10,
    GoalRarity.legendary: 12,
}

RARITY_MAX_SUBTASKS = {
    GoalRarity.common: 10,
    GoalRarity.rare: 15,
    GoalRarity.epic: 20,
    GoalRarity.legendary: 25,
}

RARITY_MIN_DEADLINE_DAYS = {
    GoalRarity.common: 3,
    GoalRarity.rare: 7,
    GoalRarity.epic: 14,
    GoalRarity.legendary: 30,
}

class SubTask(Base):
    __tablename__ = "subtasks"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    goal_id = Column(UUID(as_uuid=True), ForeignKey("goals.id"), nullable=False)

    title = Column(String(255), nullable=False)
    xp_reward = Column(Integer, default=10)

    is_completed = Column(Boolean, default=False)
    completed_at = Column(DateTime, nullable=True)

    duration_minutes = Column(Integer, nullable=True)
    timer_started_at = Column(DateTime, nullable=True)
    is_timer_running = Column(Boolean, default=False)

    order_index = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)

    goal = relationship("Goal", back_populates="subtasks")