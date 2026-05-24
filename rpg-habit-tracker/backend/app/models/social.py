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


class FriendshipStatus(str, enum.Enum):
    pending = "pending"
    accepted = "accepted"
    declined = "declined"
    blocked = "blocked"


class PostVisibility(str, enum.Enum):
    public = "public"
    friends = "friends"
    private = "private"


class Friendship(Base):
    __tablename__ = "friendships"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    requester_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    addressee_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    status = Column(SAEnum(FriendshipStatus), default=FriendshipStatus.pending)

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    requester = relationship("User", foreign_keys=[requester_id], back_populates="sent_friend_requests")
    addressee = relationship("User", foreign_keys=[addressee_id], back_populates="received_friend_requests")


class Post(Base):
    __tablename__ = "posts"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)

    content = Column(Text, nullable=True)
    image_url = Column(String(500), nullable=True)
    visibility = Column(SAEnum(PostVisibility), default=PostVisibility.public)

    # Автоматические посты (level up, победа в челлендже)
    is_auto_generated = Column(Boolean, default=False)
    auto_event_type = Column(String(100), nullable=True)  # "level_up", "challenge_win"
    auto_event_data = Column(Text, nullable=True)         # JSON с деталями события

    created_at = Column(DateTime, default=datetime.utcnow)

    user = relationship("User", back_populates="posts")
    reactions = relationship("PostReaction", back_populates="post", cascade="all, delete-orphan")
    comments = relationship("PostComment", back_populates="post", cascade="all, delete-orphan")


class PostReaction(Base):
    __tablename__ = "post_reactions"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    post_id = Column(UUID(as_uuid=True), ForeignKey("posts.id"), nullable=False)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    reaction_type = Column(String(50), default="like")  # like, fire, etc.

    created_at = Column(DateTime, default=datetime.utcnow)

    post = relationship("Post", back_populates="reactions")


class PostComment(Base):
    """Комментарий под постом глобальной ленты."""
    __tablename__ = "post_comments"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    post_id = Column(UUID(as_uuid=True), ForeignKey("posts.id"), nullable=False)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    content = Column(Text, nullable=False)

    created_at = Column(DateTime, default=datetime.utcnow)

    post = relationship("Post", back_populates="comments")


class MotivationalPing(Base):
    """Отправка мотивационного пинга другу"""
    __tablename__ = "motivational_pings"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    sender_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    receiver_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    message = Column(String(500), nullable=True)
    is_read = Column(Boolean, default=False)

    created_at = Column(DateTime, default=datetime.utcnow)