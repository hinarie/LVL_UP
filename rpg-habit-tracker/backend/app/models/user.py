import uuid
from datetime import datetime
from sqlalchemy import (
    Column, String, Boolean, DateTime, Integer,
    ForeignKey, Text, Enum as SAEnum
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from app.database import Base
import enum


class OAuthProvider(str, enum.Enum):
    email = "email"
    google = "google"
    github = "github"


class User(Base):
    __tablename__ = "users"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    email = Column(String(255), unique=True, nullable=False, index=True)
    hashed_password = Column(String(255), nullable=True)  # null для OAuth
    oauth_provider = Column(SAEnum(OAuthProvider), default=OAuthProvider.email)
    oauth_provider_id = Column(String(255), nullable=True)

    is_verified = Column(Boolean, default=False)
    is_active = Column(Boolean, default=True)
    is_onboarded = Column(Boolean, default=False)  # прошёл ли онбординг

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # OTP для верификации email
    otp_code = Column(String(6), nullable=True)
    otp_expires_at = Column(DateTime, nullable=True)

    # Relationships
    character = relationship("Character", back_populates="user", uselist=False)
    daily_tasks = relationship("DailyTask", back_populates="user")
    goals = relationship("Goal", back_populates="user")
    habits = relationship("Habit", back_populates="user")
    inventory = relationship("InventoryItem", back_populates="user")
    credit_transactions = relationship("CreditTransaction", back_populates="user")
    xp_transactions = relationship("XPTransaction", back_populates="user")
    posts = relationship("Post", back_populates="user")
    sent_friend_requests = relationship(
        "Friendship", foreign_keys="Friendship.requester_id", back_populates="requester"
    )
    received_friend_requests = relationship(
        "Friendship", foreign_keys="Friendship.addressee_id", back_populates="addressee"
    )
    challenge_participations = relationship("ChallengeParticipant", back_populates="user")