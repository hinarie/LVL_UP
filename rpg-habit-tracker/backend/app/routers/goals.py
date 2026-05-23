from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from datetime import datetime, timedelta, timezone
import uuid
import math

from app.database import get_db
from app.models.user import User
from app.models.goals import (
    Goal, SubTask, GoalStatus, GoalRarity,
    RARITY_COMPLETION_BONUS, RARITY_SUBTASK_MAX_XP,
    RARITY_MAX_SUBTASKS, RARITY_MIN_DEADLINE_DAYS
)
from app.models.character import Character
from app.schemas.goals import GoalCreate, SubTaskCreate, DeadlineExtendRequest
from app.services.xp_service import award_xp, deduct_xp
from app.core.deps import get_current_user
from app.models.transactions import XPSource

router = APIRouter(prefix="/goals", tags=["goals"])

MAX_ACTIVE_GOALS = 10
MAX_SUBTASKS_PER_HOUR = 5


def naive_utc(dt: datetime) -> datetime:
    """Конвертирует datetime в naive UTC."""
    if dt is None:
        return None
    if dt.tzinfo is not None:
        return dt.astimezone(timezone.utc).replace(tzinfo=None)
    return dt


def calc_subtask_xp(goal: Goal, total_subtasks: int) -> int:
    """
    50% бонуса делится ПОРОВНУ на количество подзадач.
    1 подзадача = 30 XP
    2 подзадачи = 15 XP каждая
    3 подзадачи = 10 XP каждая
    и т.д.
    """
    if total_subtasks == 0:
        return 0
    half_bonus = RARITY_COMPLETION_BONUS[goal.rarity] // 2
    return max(1, half_bonus // total_subtasks)


def goal_status_color(goal: Goal) -> str:
    if goal.status != GoalStatus.active:
        return "gray"
    if not goal.deadline:
        return "green"

    now       = datetime.utcnow()
    created   = goal.created_at
    deadline  = goal.deadline
    total_days = (deadline - created).days
    days_left  = (deadline - now).days
    pct        = goal.progress_percent

    if total_days <= 0:
        return "red"

    # Прошло больше половины срока
    half_time_passed = (now - created).days > (total_days / 2)
    # Выполнено меньше половины подзадач
    half_done = pct >= 50

    if days_left < 1:
        return "red"  # дедлайн завтра или уже прошёл
    if half_time_passed and not half_done:
        return "red"  # прошло >50% времени, сделано <50% задач
    if days_left <= 3:
        return "yellow"  # осталось мало дней
    if half_time_passed and half_done:
        return "yellow"  # прошло >50% времени, но прогресс есть
    return "green"


def subtask_to_dict(s: SubTask) -> dict:
    return {
        "id":            str(s.id),
        "goal_id":       str(s.goal_id),
        "title":         s.title,
        "xp_reward":     s.xp_reward,
        "is_completed":  s.is_completed,
        "completed_at":  s.completed_at,
        "order_index":   s.order_index,
    }


def goal_to_dict(goal: Goal) -> dict:
    rarity        = goal.rarity
    total         = len(goal.subtasks)
    done          = sum(1 for s in goal.subtasks if s.is_completed)
    # XP берём из первой невыполненной подзадачи (они все одинаковые)
    # Если подзадач нет — показываем потенциальный
    current_subtask_xp = next(
        (s.xp_reward for s in goal.subtasks if not s.is_completed),
        calc_subtask_xp(goal, total) if total > 0
            else RARITY_SUBTASK_MAX_XP[rarity]
    )

    return {
        "id":                    str(goal.id),
        "title":                 goal.title,
        "description":           goal.description,
        "category":              goal.category,
        "emoji":                 goal.emoji,
        "rarity":                rarity.value,
        "status":                goal.status.value,
        "is_main_quest":         goal.is_main_quest,
        "deadline":              goal.deadline,
        "deadline_extensions":   goal.deadline_extensions,
        "max_deadline_extensions": goal.max_deadline_extensions,
        "extensions_left":       goal.max_deadline_extensions - goal.deadline_extensions,
        "progress_percent":      goal.progress_percent,
        "status_color":          goal_status_color(goal),
        "completion_xp_bonus":   goal.completion_xp_bonus,
        "subtask_xp": calc_subtask_xp(goal, total) if total > 0 
                    else RARITY_COMPLETION_BONUS[rarity] // 2,
        "subtask_xp_max":        RARITY_SUBTASK_MAX_XP[rarity],
        "completion_xp_granted": goal.completion_xp_granted,
        "max_subtasks":          goal.max_subtasks,
        "min_deadline_days":     RARITY_MIN_DEADLINE_DAYS[rarity],
        "subtasks_count":        total,
        "subtasks_done":         done,
        "created_at":            goal.created_at,
        "completed_at":          goal.completed_at,
        "subtasks":              [subtask_to_dict(s) for s in goal.subtasks],
    }


async def _update_goal_progress(db: AsyncSession, goal: Goal):
    """Обновляет прогресс. НЕ завершает цель автоматически."""
    total = len(goal.subtasks)
    done  = sum(1 for s in goal.subtasks if s.is_completed)
    goal.progress_percent = int((done / total) * 100) if total > 0 else 0
    # Автозавершения НЕТ — только вручную через /complete


@router.get("/")
async def get_goals(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Goal)
        .where(Goal.user_id == current_user.id, Goal.status != GoalStatus.archived)
        .order_by(Goal.is_main_quest.desc(), Goal.created_at.desc())
    )
    goals = result.scalars().all()
    for g in goals:
        await db.refresh(g, ['subtasks'])
    return [goal_to_dict(g) for g in goals]


@router.post("/", status_code=201)
async def create_goal(
    data: GoalCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # Лимит активных целей
    cnt = await db.execute(
        select(func.count(Goal.id)).where(
            Goal.user_id == current_user.id,
            Goal.status == GoalStatus.active,
        )
    )
    if cnt.scalar() >= MAX_ACTIVE_GOALS:
        raise HTTPException(400, f"Максимум {MAX_ACTIVE_GOALS} активных целей")

    # Только один главный квест
    if data.is_main_quest:
        mq = await db.execute(
            select(Goal).where(
                Goal.user_id == current_user.id,
                Goal.is_main_quest == True,
                Goal.status == GoalStatus.active,
            )
        )
        if mq.scalar_one_or_none():
            raise HTTPException(400, "Главный квест уже существует")

    rarity   = GoalRarity(data.rarity.value)
    min_days = RARITY_MIN_DEADLINE_DAYS[rarity]

    # Проверка минимального дедлайна
    deadline = naive_utc(data.deadline)
    if deadline is not None:
        min_deadline = datetime.utcnow() + timedelta(days=min_days)
        if deadline < min_deadline:
            raise HTTPException(
                400,
                f"Минимальный дедлайн для {rarity.value}: {min_days} дн. "
                f"(не раньше {min_deadline.strftime('%d.%m.%Y')})"
            )

    goal = Goal(
        id=uuid.uuid4(),
        user_id=current_user.id,
        title=data.title,
        description=data.description,
        category=data.category.value if data.category else "other",
        emoji=data.emoji,
        rarity=rarity,
        is_main_quest=data.is_main_quest,
        deadline=deadline,
        status=GoalStatus.active,
        progress_percent=0,
        completion_xp_bonus=RARITY_COMPLETION_BONUS[rarity] // 2,
        max_subtasks=RARITY_MAX_SUBTASKS[rarity],
    )
    db.add(goal)
    await db.commit()
    await db.refresh(goal, ['subtasks'])
    return goal_to_dict(goal)


@router.post("/{goal_id}/subtasks", status_code=201)
async def add_subtask(
    goal_id: str,
    data: SubTaskCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Goal).where(Goal.id == goal_id, Goal.user_id == current_user.id)
    )
    goal = result.scalar_one_or_none()
    if not goal:
        raise HTTPException(404, "Цель не найдена")
    if goal.status != GoalStatus.active:
        raise HTTPException(400, "Цель завершена")

    await db.refresh(goal, ['subtasks'])

    if len(goal.subtasks) >= goal.max_subtasks:
        raise HTTPException(400, f"Максимум {goal.max_subtasks} подзадач")

    # Античит: лимит создания в час
    one_hour_ago = datetime.utcnow() - timedelta(hours=1)
    recent = await db.execute(
        select(func.count(SubTask.id)).where(
            SubTask.goal_id == goal_id,
            SubTask.created_at >= one_hour_ago,
        )
    )
    if recent.scalar() >= MAX_SUBTASKS_PER_HOUR:
        raise HTTPException(429, f"Максимум {MAX_SUBTASKS_PER_HOUR} подзадач в час")

    # Новое количество подзадач после добавления
    new_total = len(goal.subtasks) + 1
    new_xp    = calc_subtask_xp(goal, new_total)

    # Пересчитываем XP для всех существующих невыполненных подзадач
    for s in goal.subtasks:
        if not s.is_completed:
            s.xp_reward = new_xp

    subtask = SubTask(
        id=uuid.uuid4(),
        goal_id=goal.id,
        title=data.title,
        xp_reward=new_xp,
        is_completed=False,
        order_index=len(goal.subtasks),
    )
    db.add(subtask)
    await db.commit()
    await db.refresh(goal, ['subtasks'])
    await _update_goal_progress(db, goal)
    await db.commit()
    return subtask_to_dict(subtask)


@router.post("/{goal_id}/subtasks/{subtask_id}/complete")
async def complete_subtask(
    goal_id: str,
    subtask_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(SubTask).where(SubTask.id == subtask_id, SubTask.goal_id == goal_id)
    )
    subtask = result.scalar_one_or_none()
    if not subtask:
        raise HTTPException(404, "Подзадача не найдена")
    if subtask.is_completed:
        raise HTTPException(400, "Уже выполнена")

    # Лимит подзадач в час (античит)
    one_hour_ago = datetime.utcnow() - timedelta(hours=1)
    recent = await db.execute(
        select(func.count(SubTask.id)).where(
            SubTask.goal_id == goal_id,
            SubTask.is_completed == True,
            SubTask.completed_at >= one_hour_ago,
        )
    )
    if recent.scalar() >= MAX_SUBTASKS_PER_HOUR:
        raise HTTPException(
            429,
            f"Слишком быстро! Максимум {MAX_SUBTASKS_PER_HOUR} выполнений в час"
        )

    subtask.is_completed = True
    subtask.completed_at = datetime.utcnow()

    char = await db.execute(select(Character).where(Character.user_id == current_user.id))
    character = char.scalar_one_or_none()
    if not character:
        raise HTTPException(404, "Персонаж не найден")

    xp_result = await award_xp(
        db=db, character=character,
        amount=subtask.xp_reward,
        source=XPSource.subtask,
        source_id=subtask.id,
        description=f"Подзадача: {subtask.title}",
    )

    goal_res = await db.execute(select(Goal).where(Goal.id == goal_id))
    goal = goal_res.scalar_one_or_none()
    await db.refresh(goal, ['subtasks'])
    await _update_goal_progress(db, goal)

    # Бонус за завершение цели (50% от total)
    bonus_result = None
    if goal.status == GoalStatus.completed and not goal.completion_xp_granted:
        goal.completion_xp_granted = True
        bonus_result = await award_xp(
            db=db, character=character,
            amount=goal.completion_xp_bonus,
            source=XPSource.daily_task,
            source_id=goal.id,
            description=f"Цель завершена: {goal.title} [{goal.rarity.value}]",
        )

    await db.commit()
    return {
        "subtask":       subtask_to_dict(subtask),
        "xp_result":     xp_result,
        "goal_completed": goal.status == GoalStatus.completed,
        "bonus_xp":      bonus_result,
    }


@router.post("/{goal_id}/subtasks/{subtask_id}/uncomplete")
async def uncomplete_subtask(
    goal_id: str,
    subtask_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(SubTask).where(SubTask.id == subtask_id, SubTask.goal_id == goal_id)
    )
    subtask = result.scalar_one_or_none()
    if not subtask or not subtask.is_completed:
        raise HTTPException(400, "Подзадача не найдена или не выполнена")

    subtask.is_completed = False
    subtask.completed_at = None

    char = await db.execute(select(Character).where(Character.user_id == current_user.id))
    character = char.scalar_one_or_none()

    await deduct_xp(
        db=db, character=character,
        amount=subtask.xp_reward,
        source=XPSource.subtask,
        source_id=subtask.id,
    )

    goal_res = await db.execute(select(Goal).where(Goal.id == goal_id))
    goal = goal_res.scalar_one_or_none()

    if goal.status == GoalStatus.completed:
        goal.status = GoalStatus.active
        goal.completed_at = None
        if goal.completion_xp_granted:
            goal.completion_xp_granted = False
            await deduct_xp(
                db=db, character=character,
                amount=goal.completion_xp_bonus,
                source=XPSource.subtask,
                source_id=goal.id,
            )

    await db.refresh(goal, ['subtasks'])
    await _update_goal_progress(db, goal)
    await db.commit()
    return {"message": "Отменено", "subtask": subtask_to_dict(subtask)}


@router.post("/{goal_id}/complete")
async def complete_goal(
    goal_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Goal).where(Goal.id == goal_id, Goal.user_id == current_user.id)
    )
    goal = result.scalar_one_or_none()
    if not goal:
        raise HTTPException(404, "Цель не найдена")
    if goal.status != GoalStatus.active:
        raise HTTPException(400, "Цель уже завершена")

    await db.refresh(goal, ['subtasks'])

    # Античит: нельзя завершить если не все подзадачи выполнены
    if len(goal.subtasks) == 0:
        raise HTTPException(400, "Нельзя завершить цель без подзадач")

    undone = [s for s in goal.subtasks if not s.is_completed]
    if undone:
        raise HTTPException(
            400,
            f"Осталось выполнить {len(undone)} подзадач прежде чем завершить цель"
        )

    # Античит: минимальное время жизни цели
    min_days  = RARITY_MIN_DEADLINE_DAYS[goal.rarity]
    min_age   = timedelta(days=min_days // 2)  # хотя бы половину минимального срока
    age       = datetime.utcnow() - goal.created_at
    if age < min_age:
        raise HTTPException(
            400,
            f"Цель должна существовать минимум {min_age.days} дней перед завершением"
        )

    # Античит: нельзя завершить раньше дедлайна если он очень скоро
    # (защита от создания цели с дедлайном завтра и сразу завершения)
    if goal.deadline:
        days_to_deadline = (goal.deadline - datetime.utcnow()).days
        if days_to_deadline > 0 and goal.progress_percent < 100:
            pass  # всё ок, дедлайн ещё не наступил и прогресс 100%

    goal.status       = GoalStatus.completed
    goal.completed_at = datetime.utcnow()

    char = await db.execute(select(Character).where(Character.user_id == current_user.id))
    character = char.scalar_one_or_none()

    bonus_result = None
    if not goal.completion_xp_granted:
        goal.completion_xp_granted = True
        bonus_result = await award_xp(
            db=db, character=character,
            amount=goal.completion_xp_bonus,
            source=XPSource.daily_task,
            source_id=goal.id,
            description=f"Цель завершена: {goal.title} [{goal.rarity.value}]",
        )

    await db.commit()
    return {
        "message":  "Цель завершена! 🎉",
        "bonus_xp": bonus_result,
    }


@router.delete("/{goal_id}/subtasks/{subtask_id}")
async def delete_subtask(
    goal_id: str,
    subtask_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(SubTask).where(SubTask.id == subtask_id, SubTask.goal_id == goal_id)
    )
    subtask = result.scalar_one_or_none()
    if not subtask:
        raise HTTPException(404, "Подзадача не найдена")

    if subtask.is_completed:
        char = await db.execute(select(Character).where(Character.user_id == current_user.id))
        character = char.scalar_one_or_none()
        await deduct_xp(
            db=db, character=character,
            amount=subtask.xp_reward,
            source=XPSource.subtask,
            source_id=subtask.id,
        )

    await db.delete(subtask)
    goal_res = await db.execute(select(Goal).where(Goal.id == goal_id))
    goal = goal_res.scalar_one_or_none()
    await db.refresh(goal, ['subtasks'])
    await _update_goal_progress(db, goal)
    await db.commit()
    return {"message": "Удалено"}


@router.post("/{goal_id}/extend-deadline")
async def extend_deadline(
    goal_id: str,
    data: DeadlineExtendRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Goal).where(Goal.id == goal_id, Goal.user_id == current_user.id)
    )
    goal = result.scalar_one_or_none()
    if not goal:
        raise HTTPException(404, "Цель не найдена")
    if goal.deadline_extensions >= goal.max_deadline_extensions:
        raise HTTPException(400, "Лимит переносов исчерпан")

    new_dl = naive_utc(data.new_deadline)
    if new_dl <= datetime.utcnow():
        raise HTTPException(400, "Новый дедлайн должен быть в будущем")

    # Минимальный перенос — хотя бы на min_deadline_days от сейчас
    min_days = RARITY_MIN_DEADLINE_DAYS[goal.rarity]
    min_new  = datetime.utcnow() + timedelta(days=min_days)
    if new_dl < min_new:
        raise HTTPException(
            400,
            f"Минимальный перенос для {goal.rarity.value}: на {min_days} дней вперёд"
        )

    goal.deadline = new_dl
    goal.deadline_extensions += 1
    await db.commit()
    await db.refresh(goal, ['subtasks'])
    return goal_to_dict(goal)


@router.delete("/{goal_id}")
async def delete_goal(
    goal_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Goal).where(Goal.id == goal_id, Goal.user_id == current_user.id)
    )
    goal = result.scalar_one_or_none()
    if not goal:
        raise HTTPException(404, "Цель не найдена")
    goal.status = GoalStatus.archived
    await db.commit()
    return {"message": "Цель удалена"}