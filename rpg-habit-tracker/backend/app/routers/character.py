from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.database import get_db
from app.models.user import User
from app.models.character import Character
from app.core.deps import get_current_user
from app.services.xp_service import XP_PER_LEVEL, DAILY_XP_CAP

router = APIRouter(prefix="/character", tags=["character"])

@router.get("/")
async def get_character(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Character).where(Character.user_id == current_user.id)
    )
    char = result.scalar_one_or_none()
    if not char:
        raise HTTPException(status_code=404, detail="Персонаж не найден")

    xp_to_next = XP_PER_LEVEL - char.xp_current_level
    xp_progress_pct = int((char.xp_current_level / XP_PER_LEVEL) * 100)

    return {
        "id": str(char.id),
        "display_name": char.display_name,
        "character_name": char.character_name,
        "gender": char.gender.value,
        "level": char.level,
        "xp_total": char.xp_total,
        "xp_current_level": char.xp_current_level,
        "xp_to_next_level": xp_to_next,
        "xp_progress_pct": xp_progress_pct,
        "credits": char.credits,
        "rank": char.rank.value,
        "current_streak": char.current_streak,
        "longest_streak": char.longest_streak,
        "xp_earned_today": char.xp_earned_today,
        "daily_xp_cap": DAILY_XP_CAP,
        "double_xp_active": char.double_xp_active,
        "active_theme": char.active_theme,
        "active_background": char.active_background,
        "active_frame": char.active_frame,
        "avatar_url": char.avatar_url,
    }