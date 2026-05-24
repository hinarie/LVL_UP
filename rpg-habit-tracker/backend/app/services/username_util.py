"""
Утилиты для работы с username:
- валидация формата
- авто-генерация для существующих пользователей (из email)
- проверка уникальности
"""

import re
import unicodedata
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.models.user import User


USERNAME_RE = re.compile(r"^[a-z0-9_]{3,30}$")
RESERVED_USERNAMES = {
    "admin", "root", "system", "support", "help", "api", "auth",
    "login", "register", "user", "users", "me", "settings", "shop",
    "feed", "profile", "anonymous", "null", "undefined", "claude",
}


def validate_username(username: str) -> tuple[bool, str]:
    """Возвращает (is_valid, error_message). Пустая ошибка = всё ок."""
    if not username:
        return False, "Username не может быть пустым"
    if len(username) < 3:
        return False, "Минимум 3 символа"
    if len(username) > 30:
        return False, "Максимум 30 символов"
    if not USERNAME_RE.match(username):
        return False, "Только латинские буквы, цифры и подчёркивание"
    if username.lower() in RESERVED_USERNAMES:
        return False, "Это имя зарезервировано"
    return True, ""


def slugify(s: str) -> str:
    """
    Превращает произвольную строку в кандидата на username:
    - транслитерация unicode (если возможно)
    - всё в нижний регистр
    - заменяет всё не [a-z0-9_] на _
    - убирает повторяющиеся _ и подрезает до 30 символов
    """
    if not s:
        return ""
    # Транслит: NFKD убирает диакритику (é → e), кириллица обычно остаётся
    norm = unicodedata.normalize("NFKD", s)
    ascii_only = norm.encode("ascii", "ignore").decode("ascii")
    if not ascii_only:
        ascii_only = s
    ascii_only = ascii_only.lower()
    ascii_only = re.sub(r"[^a-z0-9_]+", "_", ascii_only)
    ascii_only = re.sub(r"_+", "_", ascii_only).strip("_")
    return ascii_only[:30]


async def generate_username_from_email(db: AsyncSession, email: str) -> str:
    """
    Генерирует уникальный username из email-части до @.
    Если занят — добавляет 2, 3, ... до 9999, потом случайный 4-значный хвост.
    """
    import random

    base = slugify(email.split("@")[0]) or "user"
    if len(base) < 3:
        base = (base + "user")[:6]

    # Если базовое имя в резерве — добавим суффикс
    if base in RESERVED_USERNAMES:
        base = base + "_user"

    candidate = base
    for i in range(1, 100):
        # проверка уникальности
        res = await db.execute(select(User).where(User.username == candidate))
        if not res.scalar_one_or_none():
            return candidate
        candidate = f"{base}{i + 1}"
        if len(candidate) > 30:
            candidate = candidate[:30]

    # Аварийный путь — случайный хвост
    for _ in range(50):
        candidate = f"{base[:25]}{random.randint(1000, 9999)}"
        res = await db.execute(select(User).where(User.username == candidate))
        if not res.scalar_one_or_none():
            return candidate

    # Совсем плохо — добавляем больше энтропии
    return f"u{random.randint(10**10, 10**11 - 1)}"


async def ensure_username(db: AsyncSession, user: User) -> str:
    """
    Гарантирует, что у пользователя есть username.
    Если его нет — генерирует, сохраняет в БД, возвращает.
    """
    if user.username:
        return user.username
    new_username = await generate_username_from_email(db, user.email or "user")
    user.username = new_username
    await db.commit()
    return new_username


async def is_username_available(db: AsyncSession, username: str, exclude_user_id=None) -> bool:
    """Проверяет, свободен ли username (с учётом возможного исключения для текущего юзера)."""
    q = select(User).where(User.username == username)
    if exclude_user_id is not None:
        q = q.where(User.id != exclude_user_id)
    res = await db.execute(q)
    return res.scalar_one_or_none() is None


# ════════════════════════════════════════════════════════════════
# Кулдаун смены username — раз в 7 дней
# ════════════════════════════════════════════════════════════════
#
# Хранится в отдельной таблице UsernameChange (один ряд на юзера).
# Если строки нет — значит юзер ещё ни разу не менял username, смена разрешена.

from datetime import timedelta
from app.models.username_change import UsernameChange

USERNAME_CHANGE_COOLDOWN = timedelta(days=7)


async def get_username_change_record(db: AsyncSession, user_id) -> "UsernameChange | None":
    res = await db.execute(
        select(UsernameChange).where(UsernameChange.user_id == user_id)
    )
    return res.scalar_one_or_none()


async def get_username_cooldown(db: AsyncSession, user_id) -> dict:
    """
    Возвращает {can_change, next_change_at, last_changed_at, seconds_left}.
    Если юзер ещё ни разу не менял — can_change=True, остальное None/0.
    """
    rec = await get_username_change_record(db, user_id)
    from datetime import datetime as _dt
    now = _dt.utcnow()
    if not rec:
        return {
            "can_change": True,
            "last_changed_at": None,
            "next_change_at": None,
            "seconds_left": 0,
        }
    next_at = rec.changed_at + USERNAME_CHANGE_COOLDOWN
    if now >= next_at:
        return {
            "can_change": True,
            "last_changed_at": rec.changed_at,
            "next_change_at": next_at,
            "seconds_left": 0,
        }
    return {
        "can_change": False,
        "last_changed_at": rec.changed_at,
        "next_change_at": next_at,
        "seconds_left": int((next_at - now).total_seconds()),
    }


async def record_username_change(db: AsyncSession, user_id, new_username: str) -> None:
    """Апсёрт записи в username_changes. НЕ коммитит — это делает вызывающий."""
    from datetime import datetime as _dt
    rec = await get_username_change_record(db, user_id)
    if rec:
        rec.changed_at = _dt.utcnow()
        rec.new_username = new_username
    else:
        db.add(UsernameChange(
            user_id=user_id,
            changed_at=_dt.utcnow(),
            new_username=new_username,
        ))