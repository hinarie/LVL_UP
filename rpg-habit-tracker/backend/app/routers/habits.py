from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from datetime import datetime, date
import uuid

from app.database import get_db
from app.models.user import User
from app.models.habits import Habit, HabitCompletion
from app.models.character import Character
from app.schemas.habits import HabitCreate
from app.services.xp_service import award_xp, deduct_xp
from app.core.deps import get_current_user
from app.models.transactions import XPSource

router = APIRouter(prefix="/habits", tags=["habits"])


def habit_to_dict(habit: Habit, completed_today: bool, streak: int, calendar: list) -> dict:
    return {
        "id": str(habit.id),
        "title": habit.title,
        "description": habit.description,
        "duration_minutes": habit.duration_minutes,
        "xp_reward": habit.xp_reward,
        "is_active": habit.is_active,
        "completed_today": completed_today,
        "current_streak": streak,
        "calendar": calendar,
        "category": habit.category or "other",
        "frequency": habit.frequency or "daily",
        "frequency_days": habit.frequency_days,
        "reminder_time": habit.reminder_time,
        "color": habit.color or "#7c3aed",
        "created_at": habit.created_at,
    }


@router.get("/")
async def get_habits(
    tz_offset: int = 0,  # смещение в минутах, например +300 для UTC+5
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Habit)
        .where(Habit.user_id == current_user.id, Habit.is_active == True)
        .order_by(Habit.created_at.desc())
    )
    habits = result.scalars().all()

    # Вычисляем "сегодня" в часовом поясе пользователя
    from datetime import timezone, timedelta
    user_tz = timezone(timedelta(minutes=tz_offset))
    today = datetime.now(user_tz).date()

    response = []
    for habit in habits:
        completions = await db.execute(
            select(HabitCompletion)
            .where(HabitCompletion.habit_id == habit.id)
            .order_by(HabitCompletion.completed_date.desc())
        )
        comp_list = completions.scalars().all()
        comp_dates = {c.completed_date for c in comp_list}

        completed_today = today in comp_dates

        # Стрик
        streak = 0
        check = today
        while check in comp_dates:
            streak += 1
            check = check - timedelta(days=1)

        # Дата создания привычки в часовом поясе пользователя
        habit_created = habit.created_at.replace(
            tzinfo=timezone.utc
        ).astimezone(user_tz).date()

        # Calendar — 90 дней с учётом часового пояса
        calendar = []
        for i in range(89, -1, -1):
            d = today - timedelta(days=i)
            if d < habit_created:
                continue
            calendar.append({
                "date": d.isoformat(),
                "done": d in comp_dates,
            })

        response.append(habit_to_dict(habit, completed_today, streak, calendar))

    return response


@router.post("/", status_code=201)
async def create_habit(
    data: HabitCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # Конвертируем список дней в строку для хранения
    freq_days = None
    if data.frequency == "custom" and data.frequency_days:
        freq_days = ",".join(str(d) for d in data.frequency_days)
    elif data.frequency == "weekdays":
        freq_days = "0,1,2,3,4"
    elif data.frequency == "daily":
        freq_days = "0,1,2,3,4,5,6"

    habit = Habit(
        id=uuid.uuid4(),
        user_id=current_user.id,
        title=data.title,
        description=data.description,
        duration_minutes=data.duration_minutes,
        xp_reward=5,
        is_active=True,
        category=data.category.value if hasattr(data.category, 'value') else str(data.category),
        frequency=data.frequency.value if hasattr(data.frequency, 'value') else str(data.frequency),
        frequency_days=freq_days,
        reminder_time=data.reminder_time,
        color=data.color or "#7c3aed",
    )
    db.add(habit)
    await db.commit()
    await db.refresh(habit)
    return habit_to_dict(habit, False, 0, [])


@router.post("/{habit_id}/complete")
async def complete_habit(
    habit_id: str,
    tz_offset: int = 0,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Habit).where(Habit.id == habit_id, Habit.user_id == current_user.id)
    )
    habit = result.scalar_one_or_none()
    if not habit:
        raise HTTPException(status_code=404, detail="Привычка не найдена")

    from datetime import timezone, timedelta
    user_tz = timezone(timedelta(minutes=tz_offset))
    today = datetime.now(user_tz).date()

    existing = await db.execute(
        select(HabitCompletion).where(
            HabitCompletion.habit_id == habit_id,
            HabitCompletion.completed_date == today,
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Привычка уже выполнена сегодня")

    completion = HabitCompletion(
        id=uuid.uuid4(),
        habit_id=habit.id,
        user_id=current_user.id,
        completed_date=today,
        completed_at=datetime.utcnow(),
    )
    db.add(completion)

    char_result = await db.execute(
        select(Character).where(Character.user_id == current_user.id)
    )
    character = char_result.scalar_one_or_none()

    xp_result = await award_xp(
        db=db,
        character=character,
        amount=habit.xp_reward,
        source=XPSource.habit,
        source_id=habit.id,
        description=f"Привычка: {habit.title}",
    )

    await db.commit()
    return {"message": "Привычка выполнена!", "xp_result": xp_result}


@router.post("/{habit_id}/uncomplete")
async def uncomplete_habit(
    habit_id: str,
    tz_offset: int = 0,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Habit).where(Habit.id == habit_id, Habit.user_id == current_user.id)
    )
    habit = result.scalar_one_or_none()
    if not habit:
        raise HTTPException(status_code=404, detail="Привычка не найдена")

    from datetime import timezone, timedelta
    user_tz = timezone(timedelta(minutes=tz_offset))
    today = datetime.now(user_tz).date()

    existing = await db.execute(
        select(HabitCompletion).where(
            HabitCompletion.habit_id == habit_id,
            HabitCompletion.completed_date == today,
        )
    )
    completion = existing.scalar_one_or_none()
    if not completion:
        raise HTTPException(status_code=400, detail="Привычка не была выполнена сегодня")

    await db.delete(completion)

    char_result = await db.execute(
        select(Character).where(Character.user_id == current_user.id)
    )
    character = char_result.scalar_one_or_none()
    if character:
        await deduct_xp(
            db=db,
            character=character,
            amount=habit.xp_reward,
            source=XPSource.habit,
            source_id=habit.id,
        )

    await db.commit()
    return {"message": "Выполнение отменено"}


@router.delete("/{habit_id}")
async def delete_habit(
    habit_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Habit).where(Habit.id == habit_id, Habit.user_id == current_user.id)
    )
    habit = result.scalar_one_or_none()
    if not habit:
        raise HTTPException(status_code=404, detail="Привычка не найдена")
    habit.is_active = False
    await db.commit()
    return {"message": "Привычка удалена"}