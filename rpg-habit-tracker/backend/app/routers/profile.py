from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, or_
from datetime import datetime, timedelta
from pydantic import BaseModel, Field
from typing import Optional

from app.database import get_db
from app.models.user import User
from app.models.character import Character
from app.models.transactions import XPTransaction, CreditTransaction
from app.models.tasks import DailyTask, TaskStatus
from app.models.habits import Habit, HabitCompletion
from app.models.goals import Goal, GoalStatus
from app.models.social import Post, PostReaction, PostComment, Friendship, FriendshipStatus
from app.models.shop import InventoryItem, ShopItem
from app.models.challenges import ChallengeParticipant
from app.core.deps import get_current_user
from app.services.xp_service import XP_PER_LEVEL, DAILY_XP_CAP
from app.services.username_util import (
    validate_username, is_username_available, ensure_username,
    get_username_cooldown, record_username_change,
)

router = APIRouter(prefix="/profile", tags=["profile"])

class ProfileUpdate(BaseModel):
    display_name:    Optional[str] = Field(None, min_length=1, max_length=100)
    character_name:  Optional[str] = Field(None, min_length=1, max_length=100)
    avatar_url:      Optional[str] = Field(None, max_length=500)
    username:        Optional[str] = Field(None, min_length=3, max_length=30)


@router.patch("")
async def update_profile(
    data: ProfileUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    res = await db.execute(select(Character).where(Character.user_id == current_user.id))
    char = res.scalar_one_or_none()
    if not char:
        raise HTTPException(404, "Персонаж не найден")

    if data.username is not None:
        new_username = data.username.strip().lower()
        if new_username != (current_user.username or ""):
            cooldown = await get_username_cooldown(db, current_user.id)
            if not cooldown["can_change"]:
                seconds_left = cooldown["seconds_left"]
                days = seconds_left // 86400
                hours = (seconds_left % 86400) // 3600
                if days > 0:
                    when = f"{days} дн. {hours} ч."
                elif hours > 0:
                    minutes = (seconds_left % 3600) // 60
                    when = f"{hours} ч. {minutes} мин."
                else:
                    minutes = max(1, seconds_left // 60)
                    when = f"{minutes} мин."
                raise HTTPException(
                    400,
                    f"Менять @username можно раз в 7 дней. Попробуйте через {when}."
                )

            ok, err = validate_username(new_username)
            if not ok:
                raise HTTPException(400, err)
            if not await is_username_available(db, new_username, exclude_user_id=current_user.id):
                raise HTTPException(400, "Этот username уже занят")
            current_user.username = new_username
            await record_username_change(db, current_user.id, new_username)

    if data.display_name is not None:
        char.display_name = data.display_name.strip()
    if data.character_name is not None:
        char.character_name = data.character_name.strip()
    if data.avatar_url is not None:
        char.avatar_url = data.avatar_url.strip() or None

    char.updated_at = datetime.utcnow()
    await db.commit()
    await db.refresh(char)

    return {
        "display_name":   char.display_name,
        "character_name": char.character_name,
        "avatar_url":     char.avatar_url,
        "username":       current_user.username,
    }


# ════════════════════════════════════════════════════════════════
# GET /profile/username/check — проверка доступности
# ════════════════════════════════════════════════════════════════

@router.get("/username/check")
async def check_username(
    username: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Проверяет: валиден ли формат и свободен ли username."""
    username = username.strip().lower()
    ok, err = validate_username(username)
    if not ok:
        return {"available": False, "valid": False, "error": err}

    # Не считаем "занятым" свой собственный username
    available = await is_username_available(db, username, exclude_user_id=current_user.id)
    return {
        "available": available,
        "valid": True,
        "error": "" if available else "Этот username уже занят",
    }


# ════════════════════════════════════════════════════════════════
# GET /profile/username/cooldown — статус «когда можно менять снова»
# ════════════════════════════════════════════════════════════════

@router.get("/username/cooldown")
async def username_cooldown(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Возвращает {can_change, last_changed_at, next_change_at, seconds_left}.
    Используется фронтом, чтобы показать таймер до следующей возможной смены.
    """
    return await get_username_cooldown(db, current_user.id)



# ════════════════════════════════════════════════════════════════
# GET /profile/stats — расширенная статистика
# ════════════════════════════════════════════════════════════════

@router.get("/stats")
async def get_stats(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    uid = current_user.id

    char_res = await db.execute(select(Character).where(Character.user_id == uid))
    char = char_res.scalar_one_or_none()
    if not char:
        raise HTTPException(404, "Персонаж не найден")

    # Задачи: сколько всего выполнено
    tasks_done_res = await db.execute(
        select(func.count(DailyTask.id)).where(
            DailyTask.user_id == uid,
            DailyTask.status == TaskStatus.done,
        )
    )
    tasks_done = tasks_done_res.scalar() or 0

    # Привычки: сколько всего, сколько активных, сколько отметок всего
    habits_total_res = await db.execute(
        select(func.count(Habit.id)).where(Habit.user_id == uid)
    )
    habits_total = habits_total_res.scalar() or 0

    habits_active_res = await db.execute(
        select(func.count(Habit.id)).where(
            Habit.user_id == uid,
            Habit.is_active == True,  # noqa: E712
        )
    )
    habits_active = habits_active_res.scalar() or 0

    habit_marks_res = await db.execute(
        select(func.count(HabitCompletion.id))
        .join(Habit, HabitCompletion.habit_id == Habit.id)
        .where(Habit.user_id == uid)
    )
    habit_marks = habit_marks_res.scalar() or 0

    # Цели: всего, завершено
    goals_total_res = await db.execute(
        select(func.count(Goal.id)).where(Goal.user_id == uid)
    )
    goals_total = goals_total_res.scalar() or 0

    goals_done_res = await db.execute(
        select(func.count(Goal.id)).where(
            Goal.user_id == uid,
            Goal.status == GoalStatus.completed,
        )
    )
    goals_done = goals_done_res.scalar() or 0

    # Посты
    posts_res = await db.execute(
        select(func.count(Post.id)).where(Post.user_id == uid)
    )
    posts_count = posts_res.scalar() or 0

    # Друзья
    friends_res = await db.execute(
        select(func.count(Friendship.id)).where(
            Friendship.status == FriendshipStatus.accepted,
            or_(
                Friendship.requester_id == uid,
                Friendship.addressee_id == uid,
            )
        )
    )
    friends_count = friends_res.scalar() or 0

    # Ивенты
    ch_part_res = await db.execute(
        select(func.count(ChallengeParticipant.id)).where(
            ChallengeParticipant.user_id == uid
        )
    )
    challenges_joined = ch_part_res.scalar() or 0

    # Инвентарь: сколько уникальных вещей куплено
    inv_res = await db.execute(
        select(func.count(InventoryItem.id)).where(InventoryItem.user_id == uid)
    )
    items_owned = inv_res.scalar() or 0

    # Прогресс уровня
    xp_to_next = XP_PER_LEVEL - char.xp_current_level
    xp_progress_pct = int((char.xp_current_level / XP_PER_LEVEL) * 100)

    return {
        "level":            char.level,
        "rank":             char.rank.value,
        "xp_total":         char.xp_total,
        "xp_current_level": char.xp_current_level,
        "xp_per_level":     XP_PER_LEVEL,
        "xp_to_next_level": xp_to_next,
        "xp_progress_pct":  xp_progress_pct,
        "xp_earned_today":  char.xp_earned_today,
        "daily_xp_cap":     DAILY_XP_CAP,
        "credits":          char.credits,
        "current_streak":   char.current_streak,
        "longest_streak":   char.longest_streak,
        "counts": {
            "tasks_done":        tasks_done,
            "habits_total":      habits_total,
            "habits_active":     habits_active,
            "habit_marks":       habit_marks,
            "goals_total":       goals_total,
            "goals_done":        goals_done,
            "posts":             posts_count,
            "friends":           friends_count,
            "challenges_joined": challenges_joined,
            "items_owned":       items_owned,
        },
        "member_since": char.created_at,
    }


# ════════════════════════════════════════════════════════════════
# GET /profile/history — история XP / кредитов
# ════════════════════════════════════════════════════════════════

@router.get("/history")
async def get_history(
    type: str = "xp",         # xp | credits
    days: int = 30,           # за сколько дней
    limit: int = 100,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if type not in ("xp", "credits"):
        raise HTTPException(400, "type должен быть 'xp' или 'credits'")
    days = max(1, min(days, 365))
    limit = max(1, min(limit, 500))

    since = datetime.utcnow() - timedelta(days=days)
    uid = current_user.id

    if type == "xp":
        res = await db.execute(
            select(XPTransaction)
            .where(
                XPTransaction.user_id == uid,
                XPTransaction.created_at >= since,
            )
            .order_by(XPTransaction.created_at.desc())
            .limit(limit)
        )
        rows = res.scalars().all()
        items = [{
            "id":          str(r.id),
            "amount":      r.amount,
            "source":      r.source.value,
            "description": r.description or "",
            "created_at":  r.created_at,
        } for r in rows]
    else:
        res = await db.execute(
            select(CreditTransaction)
            .where(
                CreditTransaction.user_id == uid,
                CreditTransaction.created_at >= since,
            )
            .order_by(CreditTransaction.created_at.desc())
            .limit(limit)
        )
        rows = res.scalars().all()
        items = [{
            "id":            str(r.id),
            "amount":        r.amount,
            "source":        r.source.value,
            "description":   r.description or "",
            "balance_after": r.balance_after,
            "created_at":    r.created_at,
        } for r in rows]

    # Сводка по дням для графика
    by_day = {}
    for r in items:
        d = r["created_at"].date().isoformat() if hasattr(r["created_at"], "date") else str(r["created_at"])[:10]
        by_day[d] = by_day.get(d, 0) + r["amount"]

    chart = [{"date": d, "value": v} for d, v in sorted(by_day.items())]

    return {
        "type":  type,
        "days":  days,
        "items": items,
        "chart": chart,
        "total": sum(r["amount"] for r in items),
    }


# ════════════════════════════════════════════════════════════════
# GET /profile/achievements — вычисляемые достижения
# ════════════════════════════════════════════════════════════════
#
# Достижения хранятся НЕ в БД, а вычисляются на лету из существующих
# счётчиков. Так не нужно делать миграции — но есть минус: историчность
# (когда именно открыто) отсутствует. Если позже захочется хранить
# дату открытия — добавим таблицу UserAchievement.

ACHIEVEMENT_DEFS = [
    # (id, icon, title, description, метрика, порог)
    # Уровни
    ("lvl_5",    "🌱", "Росток",         "Достичь 5 уровня",         "level", 5),
    ("lvl_10",   "🌿", "Стажёр",         "Достичь 10 уровня",        "level", 10),
    ("lvl_25",   "🌳", "Ветеран",        "Достичь 25 уровня",        "level", 25),
    ("lvl_50",   "🌟", "Эксперт",        "Достичь 50 уровня",        "level", 50),
    ("lvl_100",  "👑", "Легенда",        "Достичь 100 уровня",       "level", 100),
    # Стрики
    ("streak_3",   "🔥",  "Разгон",      "Стрик 3 дня",              "longest_streak", 3),
    ("streak_7",   "🔥🔥","Неделя силы", "Стрик 7 дней",             "longest_streak", 7),
    ("streak_30",  "🌋",  "Безостановочный","Стрик 30 дней",         "longest_streak", 30),
    ("streak_100", "💥",  "Феникс",      "Стрик 100 дней",           "longest_streak", 100),
    # Задачи
    ("tasks_10",   "⚔️", "Первая кровь", "Выполнить 10 задач",       "tasks_done", 10),
    ("tasks_100",  "🗡",  "Сотня",        "Выполнить 100 задач",      "tasks_done", 100),
    ("tasks_500",  "⚜️",  "Машина",       "Выполнить 500 задач",      "tasks_done", 500),
    # Привычки
    ("habits_3",   "🌱",  "Зерно дисциплины","3 активных привычки",   "habits_active", 3),
    ("habit_marks_100", "📅", "Постоянство","100 отметок привычек",   "habit_marks", 100),
    # Цели
    ("goals_1",    "🎯",  "Первая цель",  "Завершить 1 цель",         "goals_done", 1),
    ("goals_10",   "🏔",  "Покоритель",   "Завершить 10 целей",       "goals_done", 10),
    # Социалка
    ("friends_1",  "🤝",  "Не один",      "Завести 1 друга",          "friends", 1),
    ("friends_10", "👥",  "Команда",      "10 друзей",                "friends", 10),
    ("posts_10",   "📝",  "Блогер",       "Опубликовать 10 постов",   "posts", 10),
    # Магазин
    ("items_1",    "🛍",  "Шопер",        "Купить первый предмет",    "items_owned", 1),
    ("items_10",   "🎒",  "Коллекционер","Купить 10 предметов",       "items_owned", 10),
    # Ивенты
    ("challenges_1","🏆", "Участник",     "Принять участие в ивенте","challenges_joined", 1),
]


@router.get("/achievements")
async def get_achievements(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Возвращает список достижений с прогрессом и флагом unlocked."""
    uid = current_user.id

    char_res = await db.execute(select(Character).where(Character.user_id == uid))
    char = char_res.scalar_one_or_none()
    if not char:
        raise HTTPException(404, "Персонаж не найден")

    # Собираем те же метрики, что и /stats (упрощённо — отдельные запросы)
    metrics = {"level": char.level, "longest_streak": char.longest_streak}

    metrics["tasks_done"] = (await db.execute(
        select(func.count(DailyTask.id)).where(
            DailyTask.user_id == uid, DailyTask.status == TaskStatus.done
        )
    )).scalar() or 0

    metrics["habits_active"] = (await db.execute(
        select(func.count(Habit.id)).where(
            Habit.user_id == uid, Habit.is_active == True  # noqa: E712
        )
    )).scalar() or 0

    metrics["habit_marks"] = (await db.execute(
        select(func.count(HabitCompletion.id))
        .join(Habit, HabitCompletion.habit_id == Habit.id)
        .where(Habit.user_id == uid)
    )).scalar() or 0

    metrics["goals_done"] = (await db.execute(
        select(func.count(Goal.id)).where(
            Goal.user_id == uid, Goal.status == GoalStatus.completed
        )
    )).scalar() or 0

    metrics["friends"] = (await db.execute(
        select(func.count(Friendship.id)).where(
            Friendship.status == FriendshipStatus.accepted,
            or_(
                Friendship.requester_id == uid,
                Friendship.addressee_id == uid,
            )
        )
    )).scalar() or 0

    metrics["posts"] = (await db.execute(
        select(func.count(Post.id)).where(Post.user_id == uid)
    )).scalar() or 0

    metrics["items_owned"] = (await db.execute(
        select(func.count(InventoryItem.id)).where(InventoryItem.user_id == uid)
    )).scalar() or 0

    metrics["challenges_joined"] = (await db.execute(
        select(func.count(ChallengeParticipant.id)).where(
            ChallengeParticipant.user_id == uid
        )
    )).scalar() or 0

    achievements = []
    unlocked_count = 0
    for ach_id, icon, title, desc, metric, threshold in ACHIEVEMENT_DEFS:
        current = metrics.get(metric, 0)
        unlocked = current >= threshold
        if unlocked:
            unlocked_count += 1
        achievements.append({
            "id":          ach_id,
            "icon":        icon,
            "title":       title,
            "description": desc,
            "metric":      metric,
            "threshold":   threshold,
            "current":     current,
            "unlocked":    unlocked,
            "progress_pct": min(100, int((current / threshold) * 100)) if threshold else 0,
        })

    return {
        "total":          len(ACHIEVEMENT_DEFS),
        "unlocked_count": unlocked_count,
        "achievements":   achievements,
    }


# ════════════════════════════════════════════════════════════════
# GET /profile/user/{username} — публичный профиль другого юзера
# ════════════════════════════════════════════════════════════════
#
# Возвращает то, что не приватно: уровень, ранг, стрик, достижения,
# счётчики, посты public/friends-если-друг, надетые предметы.
# НЕ возвращает: email, историю транзакций, инвентарь, дневные лимиты,
# чужие настройки, кастомные фразы питомца.

@router.get("/user/{username}")
async def get_public_profile(
    username: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    username = username.strip().lower()

    user_res = await db.execute(select(User).where(User.username == username))
    target = user_res.scalar_one_or_none()
    if not target:
        raise HTTPException(404, "Пользователь не найден")

    # Свой профиль — отдадим как чужой, но клиент сам поймёт по флагу is_self
    is_self = str(target.id) == str(current_user.id)

    char_res = await db.execute(select(Character).where(Character.user_id == target.id))
    char = char_res.scalar_one_or_none()
    if not char:
        raise HTTPException(404, "Персонаж не найден")

    # Статус дружбы
    if is_self:
        friendship_status = "self"
    else:
        fr_res = await db.execute(
            select(Friendship).where(
                or_(
                    (Friendship.requester_id == current_user.id) & (Friendship.addressee_id == target.id),
                    (Friendship.requester_id == target.id) & (Friendship.addressee_id == current_user.id),
                )
            )
        )
        fr = fr_res.scalar_one_or_none()
        if not fr:
            friendship_status = "none"
        elif fr.status == FriendshipStatus.accepted:
            friendship_status = "friends"
        elif fr.status == FriendshipStatus.pending:
            # Кто отправил?
            if str(fr.requester_id) == str(current_user.id):
                friendship_status = "request_sent"
            else:
                friendship_status = "request_received"
        else:
            friendship_status = "none"

    is_friend = friendship_status == "friends"

    # Счётчики (публичные)
    uid = target.id

    tasks_done = (await db.execute(
        select(func.count(DailyTask.id)).where(
            DailyTask.user_id == uid, DailyTask.status == TaskStatus.done
        )
    )).scalar() or 0

    habits_active = (await db.execute(
        select(func.count(Habit.id)).where(
            Habit.user_id == uid, Habit.is_active == True  # noqa
        )
    )).scalar() or 0

    habit_marks = (await db.execute(
        select(func.count(HabitCompletion.id))
        .join(Habit, HabitCompletion.habit_id == Habit.id)
        .where(Habit.user_id == uid)
    )).scalar() or 0

    goals_done = (await db.execute(
        select(func.count(Goal.id)).where(
            Goal.user_id == uid, Goal.status == GoalStatus.completed
        )
    )).scalar() or 0

    friends_count = (await db.execute(
        select(func.count(Friendship.id)).where(
            Friendship.status == FriendshipStatus.accepted,
            or_(
                Friendship.requester_id == uid,
                Friendship.addressee_id == uid,
            )
        )
    )).scalar() or 0

    challenges_joined = (await db.execute(
        select(func.count(ChallengeParticipant.id)).where(
            ChallengeParticipant.user_id == uid
        )
    )).scalar() or 0

    posts_count = (await db.execute(
        select(func.count(Post.id)).where(Post.user_id == uid)
    )).scalar() or 0

    # Посты: публичные всегда, friends-only если current друг
    visibility_filter = ["public"]
    if is_self:
        visibility_filter.append("private")
        visibility_filter.append("friends")
    elif is_friend:
        visibility_filter.append("friends")

    posts_res = await db.execute(
        select(Post)
        .where(Post.user_id == uid, Post.visibility.in_(visibility_filter))
        .order_by(Post.created_at.desc())
        .limit(20)
    )
    posts = posts_res.scalars().all()

    post_list = []
    post_ids = [p.id for p in posts]

    # Реакции/комментарии батчем
    likes_by_post, dislikes_by_post, my_reaction_by_post = {}, {}, {}
    if post_ids:
        rs = await db.execute(select(PostReaction).where(PostReaction.post_id.in_(post_ids)))
        for r in rs.scalars().all():
            pid = str(r.post_id)
            if r.reaction_type == "dislike":
                dislikes_by_post[pid] = dislikes_by_post.get(pid, 0) + 1
            else:
                likes_by_post[pid] = likes_by_post.get(pid, 0) + 1
            if str(r.user_id) == str(current_user.id):
                my_reaction_by_post[pid] = r.reaction_type

        cs = await db.execute(select(PostComment).where(PostComment.post_id.in_(post_ids)))
        comments_by_post = {}
        for c in cs.scalars().all():
            pid = str(c.post_id)
            comments_by_post[pid] = comments_by_post.get(pid, 0) + 1
    else:
        comments_by_post = {}

    for post in posts:
        pid = str(post.id)
        post_list.append({
            "id": pid,
            "content": post.content,
            "image_url": post.image_url,
            "visibility": post.visibility.value if hasattr(post.visibility, "value") else post.visibility,
            "is_auto_generated": post.is_auto_generated,
            "auto_event_type": post.auto_event_type,
            "auto_event_data": post.auto_event_data,
            "created_at": post.created_at,
            "author_id": str(post.user_id),
            "author": {
                "character_name": char.character_name,
                "display_name":   char.display_name,
                "username":       target.username,
                "level":          char.level,
                "rank":           char.rank.value,
                "avatar_url":     char.avatar_url,
                "active_frame":   char.active_frame,
                "current_streak": char.current_streak,
            },
            "my_reaction":   my_reaction_by_post.get(pid),
            "liked":         my_reaction_by_post.get(pid) == "like",
            "likes":         likes_by_post.get(pid, 0),
            "dislikes":      dislikes_by_post.get(pid, 0),
            "comments_count": comments_by_post.get(pid, 0),
        })

    # Надетые предметы (для отображения «что носит»)
    equipped_res = await db.execute(
        select(InventoryItem, ShopItem)
        .join(ShopItem, InventoryItem.shop_item_id == ShopItem.id)
        .where(
            InventoryItem.user_id == uid,
            InventoryItem.is_equipped == True,  # noqa
        )
    )
    equipped = []
    for inv, item in equipped_res.all():
        equipped.append({
            "category":  item.category.value if hasattr(item.category, "value") else item.category,
            "name":      item.name,
            "rarity":    item.rarity.value if hasattr(item.rarity, "value") else item.rarity,
            "asset_key": item.asset_key,
        })

    # Достижения (тот же расчёт, что и у себя — но это публично, ок)
    metrics_for_ach = {
        "level": char.level,
        "longest_streak": char.longest_streak,
        "tasks_done": tasks_done,
        "habits_active": habits_active,
        "habit_marks": habit_marks,
        "goals_done": goals_done,
        "friends": friends_count,
        "posts": posts_count,
        "challenges_joined": challenges_joined,
        "items_owned": (await db.execute(
            select(func.count(InventoryItem.id)).where(InventoryItem.user_id == uid)
        )).scalar() or 0,
    }
    achievements = []
    unlocked_count = 0
    for ach_id, icon, title, desc, metric, threshold in ACHIEVEMENT_DEFS:
        current = metrics_for_ach.get(metric, 0)
        unlocked = current >= threshold
        if unlocked:
            unlocked_count += 1
        achievements.append({
            "id": ach_id, "icon": icon, "title": title, "description": desc,
            "current": current, "threshold": threshold, "unlocked": unlocked,
            "progress_pct": min(100, int((current / threshold) * 100)) if threshold else 0,
        })

    return {
        "is_self":           is_self,
        "friendship_status": friendship_status,  # self | none | friends | request_sent | request_received
        "user": {
            "id":       str(target.id),
            "username": target.username,
            "member_since": char.created_at,
        },
        "character": {
            "character_name": char.character_name,
            "display_name":   char.display_name,
            "username":       target.username,
            "level":          char.level,
            "rank":           char.rank.value,
            "xp_total":       char.xp_total,
            "avatar_url":     char.avatar_url,
            "active_frame":   char.active_frame,
            "active_background": char.active_background,
            "active_theme":   char.active_theme,
            "current_streak": char.current_streak,
            "longest_streak": char.longest_streak,
        },
        "counts": {
            "tasks_done":        tasks_done,
            "habits_active":     habits_active,
            "habit_marks":       habit_marks,
            "goals_done":        goals_done,
            "posts":             posts_count,
            "friends":           friends_count,
            "challenges_joined": challenges_joined,
        },
        "achievements": {
            "total":          len(ACHIEVEMENT_DEFS),
            "unlocked_count": unlocked_count,
            "items":          achievements,
        },
        "equipped": equipped,
        "posts":    post_list,
    }