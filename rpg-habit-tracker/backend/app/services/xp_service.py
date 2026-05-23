from datetime import datetime, date
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.models.character import Character, Rank
from app.models.transactions import XPTransaction, CreditTransaction, XPSource, CreditSource
import uuid

# Настройки сложности
DIFFICULTY_CONFIG = {
    "easy":   {"xp": 10,  "minutes": 5},
    "medium": {"xp": 25,  "minutes": 15},
    "hard":   {"xp": 50,  "minutes": 60},
}

DAILY_XP_CAP = 200
XP_PER_LEVEL = 1000
XP_PER_RANK  = 2000

RANK_ORDER = [
    Rank.warrior, Rank.elite, Rank.master,
    Rank.grandmaster, Rank.epic, Rank.legend, Rank.mythic
]


async def award_xp(
    db: AsyncSession,
    character: Character,
    amount: int,
    source: XPSource,
    source_id=None,
    description: str = "",
) -> dict:
    """
    Начисляет XP с учётом дневного лимита и двойного опыта.
    Возвращает словарь с результатом.
    """
    today = date.today()

    # Сброс дневного счётчика
    if not character.xp_cap_reset_date or character.xp_cap_reset_date.date() < today:
        character.xp_earned_today = 0
        character.xp_cap_reset_date = datetime.utcnow()

    # Проверяем дневной лимит
    remaining_cap = DAILY_XP_CAP - character.xp_earned_today
    if remaining_cap <= 0:
        return {"xp_gained": 0, "capped": True, "leveled_up": False, "new_rank": None}

    # Применяем двойной опыт
    if character.double_xp_active and character.double_xp_expires_at:
        if character.double_xp_expires_at > datetime.utcnow():
            amount = amount * 2
        else:
            character.double_xp_active = False

    actual_xp = min(amount, remaining_cap)
    character.xp_earned_today += actual_xp
    character.xp_total += actual_xp
    character.xp_current_level += actual_xp

    # Начисляем кредиты (10 XP = 1 кредит)
    credits_earned = actual_xp // 10
    if credits_earned > 0:
        character.credits += credits_earned
        credit_tx = CreditTransaction(
            id=uuid.uuid4(),
            user_id=character.user_id,
            amount=credits_earned,
            source=CreditSource.xp_conversion,
            description=f"За {actual_xp} XP",
            balance_after=character.credits,
        )
        db.add(credit_tx)

    # Проверяем повышение уровня
    leveled_up = False
    while character.xp_current_level >= XP_PER_LEVEL:
        character.xp_current_level -= XP_PER_LEVEL
        character.level += 1
        character.age_display = character.level
        leveled_up = True

    # Проверяем повышение ранга
    new_rank = None
    rank_index = RANK_ORDER.index(character.rank)
    earned_ranks = character.xp_total // XP_PER_RANK
    target_rank_index = min(earned_ranks, len(RANK_ORDER) - 1)
    if target_rank_index > rank_index:
        character.rank = RANK_ORDER[target_rank_index]
        new_rank = character.rank.value

    # Логируем транзакцию XP
    xp_tx = XPTransaction(
        id=uuid.uuid4(),
        user_id=character.user_id,
        amount=actual_xp,
        source=source,
        source_id=source_id,
        description=description,
    )
    db.add(xp_tx)

    return {
        "xp_gained": actual_xp,
        "capped": actual_xp < amount,
        "leveled_up": leveled_up,
        "new_level": character.level if leveled_up else None,
        "new_rank": new_rank,
        "credits_earned": credits_earned,
    }


async def deduct_xp(
    db: AsyncSession,
    character: Character,
    amount: int,
    source: XPSource,
    source_id=None,
):
    """Откат XP (кнопка Undone)."""
    character.xp_total = max(0, character.xp_total - amount)
    character.xp_current_level = max(0, character.xp_current_level - amount)
    character.xp_earned_today = max(0, character.xp_earned_today - amount)

    # Откатываем кредиты
    credits_to_remove = amount // 10
    character.credits = max(0, character.credits - credits_to_remove)

    xp_tx = XPTransaction(
        id=uuid.uuid4(),
        user_id=character.user_id,
        amount=-amount,
        source=source,
        source_id=source_id,
        description="Откат (Undone)",
    )
    db.add(xp_tx)