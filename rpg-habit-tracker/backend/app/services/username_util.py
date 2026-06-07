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
    if not s:
        return ""
    norm = unicodedata.normalize("NFKD", s)
    ascii_only = norm.encode("ascii", "ignore").decode("ascii")
    if not ascii_only:
        ascii_only = s
    ascii_only = ascii_only.lower()
    ascii_only = re.sub(r"[^a-z0-9_]+", "_", ascii_only)
    ascii_only = re.sub(r"_+", "_", ascii_only).strip("_")
    return ascii_only[:30]

async def generate_username_from_email(db: AsyncSession, email: str) -> str:
    import random

    base = slugify(email.split("@")[0]) or "user"
    if len(base) < 3:
        base = (base + "user")[:6]

    if base in RESERVED_USERNAMES:
        base = base + "_user"

    candidate = base
    for i in range(1, 100):
        res = await db.execute(select(User).where(User.username == candidate))
        if not res.scalar_one_or_none():
            return candidate
        candidate = f"{base}{i + 1}"
        if len(candidate) > 30:
            candidate = candidate[:30]

    for _ in range(50):
        candidate = f"{base[:25]}{random.randint(1000, 9999)}"
        res = await db.execute(select(User).where(User.username == candidate))
        if not res.scalar_one_or_none():
            return candidate

    return f"u{random.randint(10**10, 10**11 - 1)}"

async def ensure_username(db: AsyncSession, user: User) -> str:
    if user.username:
        return user.username
    new_username = await generate_username_from_email(db, user.email or "user")
    user.username = new_username
    await db.commit()
    return new_username

async def is_username_available(db: AsyncSession, username: str, exclude_user_id=None) -> bool:
    q = select(User).where(User.username == username)
    if exclude_user_id is not None:
        q = q.where(User.id != exclude_user_id)
    res = await db.execute(q)
    return res.scalar_one_or_none() is None

from datetime import timedelta
from app.models.username_change import UsernameChange

USERNAME_CHANGE_COOLDOWN = timedelta(days=7)

async def get_username_change_record(db: AsyncSession, user_id) -> "UsernameChange | None":
    res = await db.execute(
        select(UsernameChange).where(UsernameChange.user_id == user_id)
    )
    return res.scalar_one_or_none()

async def get_username_cooldown(db: AsyncSession, user_id) -> dict:
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