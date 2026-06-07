import uuid
from datetime import datetime
from sqlalchemy import (
    Column, String, Integer, DateTime, ForeignKey,
    Boolean, Enum as SAEnum, Text, SmallInteger
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from app.database import Base
import enum

class ChallengeType(str, enum.Enum):
    public = "public"
    friends = "friends"
    private = "private"

class ChallengeStatus(str, enum.Enum):
    upcoming = "upcoming"
    active = "active"
    finished = "finished"

class TaskRepeatType(str, enum.Enum):
    daily = "daily"
    once = "once"
    custom_days = "custom_days"

class PostReactionEmoji(str, enum.Enum):
    fire = "fire"
    muscle = "muscle"
    star = "star"
    like = "like"

RANK_ORDER = {
    "Warrior": 0,
    "Elite": 1,
    "Master": 2,
    "Grandmaster": 3,
    "Epic": 4,
    "Legend": 5,
    "Mythic": 6,
}

class Challenge(Base):
    __tablename__ = "challenges"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    creator_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)

    title = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    banner_emoji = Column(String(8), default="🏆")

    challenge_type = Column(SAEnum(ChallengeType), nullable=False, default=ChallengeType.public)
    status = Column(SAEnum(ChallengeStatus), default=ChallengeStatus.upcoming)

    required_rank = Column(String(50), nullable=True)

    initial_stake_credits = Column(Integer, nullable=False)
    entry_fee_credits = Column(Integer, nullable=False)
    prize_pool_credits = Column(Integer, default=0)

    prize_split_1st = Column(Integer, default=50)
    prize_split_2nd = Column(Integer, default=30)
    prize_split_3rd = Column(Integer, default=20)

    starts_at = Column(DateTime, nullable=False)
    ends_at = Column(DateTime, nullable=False)

    invite_code = Column(String(16), nullable=True, unique=True)

    created_at = Column(DateTime, default=datetime.utcnow)

    creator = relationship("User", foreign_keys=[creator_id])
    participants = relationship("ChallengeParticipant", back_populates="challenge",
                            cascade="all, delete-orphan")
    tasks = relationship("ChallengeTask", back_populates="challenge",
                            cascade="all, delete-orphan", order_by="ChallengeTask.order_index")
    posts = relationship("ChallengePost", back_populates="challenge",
                            cascade="all, delete-orphan")
    

class ChallengeTask(Base):
    __tablename__ = "challenge_tasks"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    challenge_id = Column(UUID(as_uuid=True), ForeignKey("challenges.id"), nullable=False)

    title = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)

    xp_reward = Column(Integer, nullable=False, default=25)

    duration_minutes = Column(Integer, nullable=False, default=15)

    available_from_hour = Column(SmallInteger, nullable=True)
    available_until_hour = Column(SmallInteger, nullable=True)

    repeat_type = Column(SAEnum(TaskRepeatType), default=TaskRepeatType.daily)

    score_value = Column(Integer, default=10)

    custom_days = Column(String(20), nullable=True)

    order_index = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)

    challenge = relationship("Challenge", back_populates="tasks")
    completions = relationship("ChallengeTaskCompletion", back_populates="task",
                            cascade="all, delete-orphan")

class ChallengeTaskCompletion(Base):
    __tablename__ = "challenge_task_completions"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    challenge_task_id = Column(UUID(as_uuid=True), ForeignKey("challenge_tasks.id"), nullable=False)
    participant_id = Column(UUID(as_uuid=True), ForeignKey("challenge_participants.id"), nullable=False)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)

    completed_date = Column(DateTime, nullable=False)
    completed_at = Column(DateTime, nullable=True)

    timer_started_at = Column(DateTime, nullable=True)
    hold_started_at = Column(DateTime, nullable=True)
    xp_granted = Column(Boolean, default=False)

    task = relationship("ChallengeTask", back_populates="completions")
    participant = relationship("ChallengeParticipant", back_populates="task_completions")

class ChallengeParticipant(Base):
    __tablename__ = "challenge_participants"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    challenge_id = Column(UUID(as_uuid=True), ForeignKey("challenges.id"), nullable=False)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)

    score = Column(Integer, default=0)
    fee_paid = Column(Boolean, default=False)

    cooldown_until = Column(DateTime, nullable=True)

    final_rank = Column(Integer, nullable=True)
    prize_earned = Column(Integer, nullable=True)

    joined_at = Column(DateTime, default=datetime.utcnow)

    challenge = relationship("Challenge", back_populates="participants")
    user = relationship("User", back_populates="challenge_participations")
    task_completions = relationship("ChallengeTaskCompletion", back_populates="participant",
                                   cascade="all, delete-orphan")

class ChallengePost(Base):
    __tablename__ = "challenge_posts"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    challenge_id = Column(UUID(as_uuid=True), ForeignKey("challenges.id"), nullable=False)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)

    content = Column(Text, nullable=False)
    image_url = Column(String(500), nullable=True)

    cross_posted = Column(Boolean, default=False)
    cross_post_id = Column(UUID(as_uuid=True), nullable=True)

    is_auto_generated = Column(Boolean, default=False)
    auto_event_type = Column(String(50), nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow)

    challenge = relationship("Challenge", back_populates="posts")
    reactions = relationship("ChallengePostReaction", back_populates="post",
                            cascade="all, delete-orphan")

class ChallengePostReaction(Base):
    __tablename__ = "challenge_post_reactions"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    post_id = Column(UUID(as_uuid=True), ForeignKey("challenge_posts.id"), nullable=False)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    emoji = Column(SAEnum(PostReactionEmoji), default=PostReactionEmoji.fire)

    created_at = Column(DateTime, default=datetime.utcnow)

    post = relationship("ChallengePost", back_populates="reactions")

class ChallengePostComment(Base):
    __tablename__ = "challenge_post_comments"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    post_id = Column(UUID(as_uuid=True), ForeignKey("challenge_posts.id"), nullable=False)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    content = Column(Text, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)