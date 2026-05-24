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


def _recalc_progress_from_total(character: Character):
    """
    Пересчитывает level / xp_current_level / age_display / rank из xp_total.
    xp_total — единственный источник истины, поэтому после любого изменения
    XP прогресс восстанавливается детерминированно. Используется и в award_xp,
    и в deduct_xp, поэтому начисление и откат полностью симметричны:
    уровень и ранг корректно повышаются и понижаются.
    """
    total = max(0, character.xp_total)

    # Уровень начинается с 1; каждые XP_PER_LEVEL — +1 уровень
    character.level = total // XP_PER_LEVEL + 1
    character.xp_current_level = total % XP_PER_LEVEL
    character.age_display = character.level

    # Ранг: каждые XP_PER_RANK — следующий ранг (но не выше максимального)
    earned_ranks = total // XP_PER_RANK
    target_rank_index = min(earned_ranks, len(RANK_ORDER) - 1)
    character.rank = RANK_ORDER[target_rank_index]


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

    # Запоминаем состояние до пересчёта, чтобы определить факт level up / rank up
    prev_level = character.level
    prev_rank = character.rank

    # Пересчитываем уровень / прогресс / ранг из xp_total (источник истины).
    # Тот же механизм используется в deduct_xp — начисление и откат симметричны.
    _recalc_progress_from_total(character)

    leveled_up = character.level > prev_level
    new_rank = character.rank.value if character.rank != prev_rank else None

    # Уведомления о прогрессии (НЕ блокирующие — service сам ловит исключения)
    if leveled_up or new_rank:
        from app.services import notification_service as notif_svc
        if leveled_up:
            await notif_svc.notify_level_up(
                db, user_id=character.user_id, new_level=character.level
            )
        if new_rank:
            await notif_svc.notify_rank_up(
                db, user_id=character.user_id, new_rank=new_rank
            )

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
    """Откат XP (кнопка Undone). Симметричен award_xp: пересчитывает
    уровень и ранг из xp_total, поэтому уровень/ранг корректно понижаются."""
    character.xp_total = max(0, character.xp_total - amount)
    character.xp_earned_today = max(0, character.xp_earned_today - amount)

    # Пересчитываем уровень, прогресс уровня и ранг из обновлённого xp_total
    _recalc_progress_from_total(character)

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