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


class Gender(str, enum.Enum):
    male = "male"
    female = "female"


class Rank(str, enum.Enum):
    warrior = "Warrior"
    elite = "Elite"
    master = "Master"
    grandmaster = "Grandmaster"
    epic = "Epic"
    legend = "Legend"
    mythic = "Mythic"


class Character(Base):
    __tablename__ = "characters"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), unique=True, nullable=False)

    display_name = Column(String(100), nullable=False)       # имя пользователя
    character_name = Column(String(100), nullable=False)     # имя персонажа
    age_display = Column(Integer, default=1)                 # визуальный возраст = уровень
    gender = Column(SAEnum(Gender), nullable=False)

    # Прогресс
    level = Column(Integer, default=1)
    xp_total = Column(Integer, default=0)           # общий накопленный XP (не уменьшается)
    xp_current_level = Column(Integer, default=0)   # XP в рамках текущего уровня
    credits = Column(Integer, default=0)
    rank = Column(SAEnum(Rank), default=Rank.warrior)

    # Античит: дневной лимит XP
    xp_earned_today = Column(Integer, default=0)
    xp_cap_reset_date = Column(DateTime, nullable=True)  # дата последнего сброса

    # Стрик
    current_streak = Column(Integer, default=0)
    longest_streak = Column(Integer, default=0)
    last_streak_date = Column(DateTime, nullable=True)  # дата последнего зачёта стрика

    # Активные бонусы
    double_xp_active = Column(Boolean, default=False)
    double_xp_expires_at = Column(DateTime, nullable=True)
    freeze_available = Column(Boolean, default=False)  # есть ли зелье заморозки

    # Кастомизация сайта
    active_theme = Column(String(100), default="default")
    active_background = Column(String(100), nullable=True)
    active_frame = Column(String(100), nullable=True)
    avatar_url = Column(String(500), nullable=True)

    # Питомец (настройки)
    pet_free_roam = Column(Boolean, default=True)
    pet_custom_phrases = Column(Text, nullable=True)  # JSON строка со списком фраз
    pet_sleep_mode = Column(Boolean, default=False)

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    user = relationship("User", back_populates="character")
    equipped_items = relationship("CharacterEquipment", back_populates="character")