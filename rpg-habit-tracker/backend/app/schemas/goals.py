from pydantic import BaseModel, validator
from typing import Optional
from datetime import datetime
from enum import Enum


class GoalRarity(str, Enum):
    common    = "common"
    rare      = "rare"
    epic      = "epic"
    legendary = "legendary"


class GoalCategory(str, Enum):
    health     = "health"
    career     = "career"
    learning   = "learning"
    finance    = "finance"
    creative   = "creative"
    social     = "social"
    travel     = "travel"
    other      = "other"


class GoalCreate(BaseModel):
    title: str
    description: Optional[str] = None
    category: GoalCategory = GoalCategory.other
    emoji: Optional[str] = None
    rarity: GoalRarity = GoalRarity.common
    deadline: Optional[datetime] = None
    is_main_quest: bool = False

    @validator('title')
    def title_not_empty(cls, v):
        if not v.strip():
            raise ValueError('Название не может быть пустым')
        return v.strip()


class SubTaskCreate(BaseModel):
    title: str
    xp_reward: int = 10
    duration_minutes: Optional[int] = None

    @validator('xp_reward')
    def xp_range(cls, v):
        if v < 1:
            raise ValueError('XP должно быть больше 0')
        return v


class DeadlineExtendRequest(BaseModel):
    new_deadline: datetime