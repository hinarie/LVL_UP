from pydantic import BaseModel, validator
from typing import Optional, List
from enum import Enum


class HabitCategory(str, Enum):
    health     = "health"
    learning   = "learning"
    productive = "productive"
    creative   = "creative"
    social     = "social"
    other      = "other"


class HabitFrequency(str, Enum):
    daily   = "daily"
    weekdays = "weekdays"
    custom  = "custom"


class HabitCreate(BaseModel):
    title: str
    description: Optional[str] = None
    duration_minutes: Optional[int] = None
    category: HabitCategory = HabitCategory.other
    frequency: HabitFrequency = HabitFrequency.daily
    frequency_days: Optional[List[int]] = None  # [0,1,2,3,4,5,6] — 0=пн
    reminder_time: Optional[str] = None  # "morning" | "afternoon" | "evening"
    color: Optional[str] = None  # hex цвет

    @validator('title')
    def title_not_empty(cls, v):
        if not v.strip():
            raise ValueError('Название не может быть пустым')
        return v.strip()

    @validator('duration_minutes')
    def duration_positive(cls, v):
        if v is not None and v < 1:
            raise ValueError('Длительность должна быть больше 0')
        return v