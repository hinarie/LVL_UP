from datetime import datetime
from sqlalchemy import Column, DateTime, ForeignKey, String
from sqlalchemy.dialects.postgresql import UUID
from app.database import Base

class UsernameChange(Base):
    __tablename__ = "username_changes"
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), primary_key=True)
    changed_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    new_username = Column(String(30), nullable=True)