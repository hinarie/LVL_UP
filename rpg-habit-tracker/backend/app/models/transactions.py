import uuid
from datetime import datetime
from sqlalchemy import Column, String, Integer, DateTime, ForeignKey, Enum as SAEnum
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from app.database import Base
import enum

class XPSource(str, enum.Enum):
    daily_task = "daily_task"
    subtask = "subtask"
    habit = "habit"
    challenge = "challenge"
    mini_game = "mini_game"
    admin = "admin"

class CreditSource(str, enum.Enum):
    xp_conversion = "xp_conversion"
    shop_purchase = "shop_purchase"
    challenge_entry = "challenge_entry"
    challenge_prize = "challenge_prize"
    admin = "admin"

class XPTransaction(Base):
    __tablename__ = "xp_transactions"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    amount = Column(Integer, nullable=False)
    source = Column(SAEnum(XPSource), nullable=False)
    source_id = Column(UUID(as_uuid=True), nullable=True)
    description = Column(String(255), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    user = relationship("User", back_populates="xp_transactions")

class CreditTransaction(Base):
    __tablename__ = "credit_transactions"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    amount = Column(Integer, nullable=False)
    source = Column(SAEnum(CreditSource), nullable=False)
    source_id = Column(UUID(as_uuid=True), nullable=True)
    description = Column(String(255), nullable=True)
    balance_after = Column(Integer, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    user = relationship("User", back_populates="credit_transactions")