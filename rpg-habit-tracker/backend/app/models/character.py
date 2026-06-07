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

    display_name = Column(String(100), nullable=False)
    character_name = Column(String(100), nullable=False)
    age_display = Column(Integer, default=1)
    gender = Column(SAEnum(Gender), nullable=False)

    level = Column(Integer, default=1)
    xp_total = Column(Integer, default=0)
    xp_current_level = Column(Integer, default=0)
    credits = Column(Integer, default=0)
    rank = Column(SAEnum(Rank), default=Rank.warrior)

    xp_earned_today = Column(Integer, default=0)
    xp_cap_reset_date = Column(DateTime, nullable=True)

    current_streak = Column(Integer, default=0)
    longest_streak = Column(Integer, default=0)
    last_streak_date = Column(DateTime, nullable=True)

    double_xp_active = Column(Boolean, default=False)
    double_xp_expires_at = Column(DateTime, nullable=True)
    freeze_available = Column(Boolean, default=False)

    active_theme = Column(String(100), default="default")
    active_background = Column(String(100), nullable=True)
    active_frame = Column(String(100), nullable=True)
    avatar_url = Column(String(500), nullable=True)

    pet_free_roam = Column(Boolean, default=True)
    pet_custom_phrases = Column(Text, nullable=True)
    pet_sleep_mode = Column(Boolean, default=False)

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    user = relationship("User", back_populates="character")
    equipped_items = relationship("CharacterEquipment", back_populates="character")