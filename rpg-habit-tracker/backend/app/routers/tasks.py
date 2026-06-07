from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from datetime import datetime, timedelta
import uuid

from app.database import get_db
from app.models.user import User
from app.models.tasks import DailyTask, TaskStatus
from app.models.character import Character
from app.schemas.tasks import TaskCreate, TaskResponse, TaskDifficulty
from app.services.xp_service import award_xp, deduct_xp, DIFFICULTY_CONFIG
from app.core.deps import get_current_user
from app.models.transactions import XPSource
from app.models.challenges import (
    Challenge, ChallengeTask, ChallengeTaskCompletion,
    ChallengeParticipant, ChallengeStatus, TaskRepeatType,
)

router = APIRouter(prefix="/tasks", tags=["tasks"])

def task_to_response(task: DailyTask) -> dict:
    return {
        "id": str(task.id),
        "title": task.title,
        "description": task.description,
        "difficulty": task.difficulty.value,
        "xp_reward": task.xp_reward,
        "duration_minutes": task.duration_minutes,
        "status": task.status.value,
        "timer_started_at": task.timer_started_at,
        "is_timer_running": task.is_timer_running,
        "completed_at": task.completed_at,
        "created_at": task.created_at,
    }

@router.get("/")
async def get_tasks(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(DailyTask)
        .where(DailyTask.user_id == current_user.id)
        .where(DailyTask.status != TaskStatus.archived)
        .order_by(DailyTask.created_at.desc())
    )
    tasks = result.scalars().all()
    response = [task_to_response(t) for t in tasks]

    parts_result = await db.execute(
        select(ChallengeParticipant).where(
            ChallengeParticipant.user_id == current_user.id
        )
    )
    participations = parts_result.scalars().all()

    now = datetime.utcnow()
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    today_weekday = now.weekday()

    for p in participations:
        ch_result = await db.execute(
            select(Challenge).where(
                Challenge.id == p.challenge_id,
                Challenge.status == ChallengeStatus.active,
            )
        )
        challenge = ch_result.scalar_one_or_none()
        if not challenge:
            continue

        tasks_result = await db.execute(
            select(ChallengeTask).where(ChallengeTask.challenge_id == challenge.id)
            .order_by(ChallengeTask.order_index)
        )
        ch_tasks = tasks_result.scalars().all()

        for ct in ch_tasks:
            if ct.repeat_type.value == "custom_days" and ct.custom_days:
                allowed = [int(d) for d in ct.custom_days.split(",") if d.strip().isdigit()]
                if today_weekday not in allowed:
                    continue

            is_done = False
            timer_started_at = None
            completion_id = None
            if ct.repeat_type.value in ("daily", "custom_days"):
                comp_result = await db.execute(
                    select(ChallengeTaskCompletion).where(
                        ChallengeTaskCompletion.challenge_task_id == ct.id,
                        ChallengeTaskCompletion.participant_id == p.id,
                        ChallengeTaskCompletion.completed_date >= today_start,
                    )
                )
                comp = comp_result.scalar_one_or_none()
                if comp:
                    is_done = bool(comp.completed_at)
                    timer_started_at = comp.timer_started_at
                    completion_id = str(comp.id)
            elif ct.repeat_type.value == "once":
                comp_result = await db.execute(
                    select(ChallengeTaskCompletion).where(
                        ChallengeTaskCompletion.challenge_task_id == ct.id,
                        ChallengeTaskCompletion.participant_id == p.id,
                    )
                )
                comp = comp_result.scalar_one_or_none()
                if comp:
                    is_done = bool(comp.completed_at)
                    timer_started_at = comp.timer_started_at
                    completion_id = str(comp.id)

            in_window = True
            if ct.available_from_hour is not None and ct.available_until_hour is not None:
                in_window = ct.available_from_hour <= now.hour < ct.available_until_hour

            response.append({
                "id": str(ct.id),
                "title": ct.title,
                "description": ct.description,
                "difficulty": "medium",
                "xp_reward": ct.xp_reward,
                "duration_minutes": ct.duration_minutes,
                "status": "done" if is_done else "active",
                "timer_started_at": timer_started_at.isoformat() if timer_started_at else None,
                "is_timer_running": bool(timer_started_at and not is_done),
                "completed_at": None,
                "created_at": ct.created_at.isoformat(),
                "source": "challenge",
                "challenge_id": str(challenge.id),
                "challenge_title": challenge.title,
                "challenge_emoji": challenge.banner_emoji or "🏆",
                "score_value": ct.score_value,
                "in_window": in_window,
                "participant_id": str(p.id),
                "completion_id": completion_id,
            })

    return response

@router.post("/", status_code=201)
async def create_task(
    data: TaskCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    config = DIFFICULTY_CONFIG[data.difficulty.value]
    task = DailyTask(
        id=uuid.uuid4(),
        user_id=current_user.id,
        title=data.title,
        description=data.description,
        difficulty=data.difficulty,
        xp_reward=config["xp"],
        duration_minutes=config["minutes"],
        status=TaskStatus.active,
        is_timer_running=False,
    )
    db.add(task)
    await db.commit()
    await db.refresh(task)
    return task_to_response(task)

@router.post("/{task_id}/start-timer")
async def start_timer(
    task_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(DailyTask).where(
            DailyTask.id == task_id,
            DailyTask.user_id == current_user.id,
        )
    )
    task = result.scalar_one_or_none()
    if not task:
        raise HTTPException(status_code=404, detail="Задача не найдена")
    if task.status != TaskStatus.active:
        raise HTTPException(status_code=400, detail="Задача уже завершена")
    if task.is_timer_running:
        raise HTTPException(status_code=400, detail="Таймер уже запущен")

    task.timer_started_at = datetime.utcnow()
    task.is_timer_running = True
    await db.commit()
    return {"message": "Таймер запущен", "started_at": task.timer_started_at}

@router.post("/{task_id}/complete")
async def complete_task(
    task_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(DailyTask).where(
            DailyTask.id == task_id,
            DailyTask.user_id == current_user.id,
        )
    )
    task = result.scalar_one_or_none()
    if not task:
        raise HTTPException(status_code=404, detail="Задача не найдена")
    if task.status == TaskStatus.done:
        raise HTTPException(status_code=400, detail="Задача уже выполнена")

    if task.timer_started_at:
        elapsed = datetime.utcnow() - task.timer_started_at
        required = timedelta(minutes=task.duration_minutes)
        if elapsed < required:
            remaining_seconds = int((required - elapsed).total_seconds())
            raise HTTPException(
                status_code=400,
                detail=f"Время ещё не вышло! Осталось {remaining_seconds // 60} мин {remaining_seconds % 60} сек",
            )

    char_result = await db.execute(
        select(Character).where(Character.user_id == current_user.id)
    )
    character = char_result.scalar_one_or_none()
    if not character:
        raise HTTPException(status_code=404, detail="Персонаж не найден")

    task.status = TaskStatus.done
    task.completed_at = datetime.utcnow()
    task.is_timer_running = False
    task.xp_granted = True

    xp_result = await award_xp(
        db=db,
        character=character,
        amount=task.xp_reward,
        source=XPSource.daily_task,
        source_id=task.id,
        description=f"Задача: {task.title}",
    )

    await db.commit()
    return {**task_to_response(task), "xp_result": xp_result}

@router.post("/{task_id}/undone")
async def undone_task(
    task_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(DailyTask).where(
            DailyTask.id == task_id,
            DailyTask.user_id == current_user.id,
        )
    )
    task = result.scalar_one_or_none()
    if not task:
        raise HTTPException(status_code=404, detail="Задача не найдена")
    if task.status != TaskStatus.done:
        raise HTTPException(status_code=400, detail="Задача не выполнена")

    char_result = await db.execute(
        select(Character).where(Character.user_id == current_user.id)
    )
    character = char_result.scalar_one_or_none()

    if task.xp_granted:
        await deduct_xp(
            db=db,
            character=character,
            amount=task.xp_reward,
            source=XPSource.daily_task,
            source_id=task.id,
        )

    task.status = TaskStatus.active
    task.completed_at = None
    task.xp_granted = False
    task.timer_started_at = None
    task.is_timer_running = False

    await db.commit()
    return {"message": "Задача возвращена в активные", **task_to_response(task)}

@router.delete("/{task_id}")
async def delete_task(
    task_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(DailyTask).where(
            DailyTask.id == task_id,
            DailyTask.user_id == current_user.id,
        )
    )
    task = result.scalar_one_or_none()
    if not task:
        raise HTTPException(status_code=404, detail="Задача не найдена")

    task.status = TaskStatus.archived
    await db.commit()
    return {"message": "Задача удалена"}