from pydantic import BaseModel, validator, Field
from typing import Optional, List
from datetime import datetime
from enum import Enum


# ─── Enums (зеркало моделей) ──────────────────────────────────────────────────

class ChallengeType(str, Enum):
    public  = "public"
    friends = "friends"
    private = "private"


class TaskRepeatType(str, Enum):
    daily       = "daily"
    once        = "once"
    custom_days = "custom_days"


class PostReactionEmoji(str, Enum):
    fire   = "fire"
    muscle = "muscle"
    star   = "star"
    like   = "like"


# ─── ChallengeTask schemas ────────────────────────────────────────────────────

class ChallengeTaskCreate(BaseModel):
    title:               str
    description:         Optional[str] = None
    xp_reward:           int = Field(25, ge=5, le=200)
    duration_minutes:    int = Field(15, ge=1, le=480)
    available_from_hour: Optional[int] = Field(None, ge=0, le=23)
    available_until_hour:Optional[int] = Field(None, ge=0, le=23)
    repeat_type:         TaskRepeatType = TaskRepeatType.daily
    custom_days:         Optional[str] = None
    score_value:         int = Field(10, ge=1, le=100)

    @validator('title')
    def title_not_empty(cls, v):
        if not v.strip():
            raise ValueError('Название задачи не может быть пустым')
        return v.strip()

    @validator('available_until_hour')
    def window_valid(cls, v, values):
        frm = values.get('available_from_hour')
        if frm is not None and v is not None and v <= frm:
            raise ValueError('available_until_hour должен быть больше available_from_hour')
        return v


# ─── Challenge schemas ────────────────────────────────────────────────────────

class ChallengeCreate(BaseModel):
    title:                  str
    description:            Optional[str] = None
    banner_emoji:           str = "🏆"
    challenge_type:         ChallengeType = ChallengeType.public
    required_rank:          Optional[str] = None
    initial_stake_credits:  int
    prize_split_1st:        int = Field(50, ge=0, le=100)
    prize_split_2nd:        int = Field(30, ge=0, le=100)
    prize_split_3rd:        int = Field(20, ge=0, le=100)
    starts_at:              datetime
    ends_at:                datetime
    # Задачи создаются вместе с ивентом
    tasks:                  List[ChallengeTaskCreate] = Field(default_factory=list, max_items=10)

    @validator('title')
    def title_not_empty(cls, v):
        if not v.strip():
            raise ValueError('Название не может быть пустым')
        return v.strip()

    @validator('initial_stake_credits')
    def stake_positive(cls, v):
        if v < 10:
            raise ValueError('Минимальная ставка — 10 кредитов')
        return v

    @validator('ends_at')
    def ends_after_starts(cls, v, values):
        if 'starts_at' in values and v <= values['starts_at']:
            raise ValueError('Дата окончания должна быть позже даты начала')
        return v

    @validator('prize_split_3rd')
    def splits_sum_100(cls, v, values):
        s1 = values.get('prize_split_1st', 0)
        s2 = values.get('prize_split_2nd', 0)
        if s1 + s2 + v != 100:
            raise ValueError('Сумма долей призового фонда должна равняться 100')
        return v

    @validator('required_rank')
    def rank_valid(cls, v):
        valid = {None, "Warrior", "Elite", "Master", "Grandmaster", "Epic", "Legend", "Mythic"}
        if v not in valid:
            raise ValueError(f'Недопустимый ранг: {v}')
        return v

    @validator('starts_at', 'ends_at', pre=True)
    def strip_tz(cls, v):
        """Убираем timezone — БД хранит TIMESTAMP WITHOUT TIME ZONE."""
        if hasattr(v, 'tzinfo') and v.tzinfo is not None:
            return v.replace(tzinfo=None)
        return v

    @validator('tasks')
    def at_least_one_task(cls, v):
        if len(v) == 0:
            raise ValueError('Создайте хотя бы одну задачу для ивента')
        return v


# ─── Post schemas ─────────────────────────────────────────────────────────────

class ChallengePostCreate(BaseModel):
    content:    str
    image_url:  Optional[str] = None
    cross_post: bool = False

    @validator('content')
    def content_not_empty(cls, v):
        v = v.strip()
        if not v:
            raise ValueError('Пост не может быть пустым')
        if len(v) > 500:
            raise ValueError('Максимум 500 символов')
        return v


class ReactionCreate(BaseModel):
    emoji: PostReactionEmoji = PostReactionEmoji.fire