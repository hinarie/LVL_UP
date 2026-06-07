from pydantic import BaseModel, validator
from typing import Optional
from enum import Enum
from datetime import datetime

class TaskDifficulty(str, Enum):
    easy = "easy"
    medium = "medium"
    hard = "hard"

class TaskCreate(BaseModel):
    title: str
    description: Optional[str] = None
    difficulty: TaskDifficulty

    @validator('title')
    def title_not_empty(cls, v):
        if not v.strip():
            raise ValueError('Название не может быть пустым')
        return v.strip()

class TaskResponse(BaseModel):
    id: str
    title: str
    description: Optional[str]
    difficulty: str
    xp_reward: int
    duration_minutes: int
    status: str
    timer_started_at: Optional[datetime]
    is_timer_running: bool
    completed_at: Optional[datetime]
    created_at: datetime

    class Config:
        from_attributes = True