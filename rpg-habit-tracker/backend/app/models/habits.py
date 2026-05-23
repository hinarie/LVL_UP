import uuid
from datetime import datetime, date
from sqlalchemy import (
    Column, String, Integer, DateTime, ForeignKey,
    Boolean, Date, Text
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from app.database import Base


class Habit(Base):
    __tablename__ = "habits"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)

    title = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    duration_minutes = Column(Integer, nullable=True)
    xp_reward = Column(Integer, default=5)
    is_active = Column(Boolean, default=True)

    # Новые поля
    category = Column(String(50), default="other")
    frequency = Column(String(20), default="daily")
    frequency_days = Column(String(20), nullable=True)  # "0,1,2,3,4" — пн-пт
    reminder_time = Column(String(20), nullable=True)   # morning/afternoon/evening
    color = Column(String(7), nullable=True)            # #hex

    created_at = Column(DateTime, default=datetime.utcnow)

    user = relationship("User", back_populates="habits")
    completions = relationship(
        "HabitCompletion", back_populates="habit", cascade="all, delete-orphan"
    )


class HabitCompletion(Base):
    __tablename__ = "habit_completions"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    habit_id = Column(UUID(as_uuid=True), ForeignKey("habits.id"), nullable=False)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)

    completed_date = Column(Date, nullable=False)
    completed_at = Column(DateTime, default=datetime.utcnow)

    habit = relationship("Habit", back_populates="completions")