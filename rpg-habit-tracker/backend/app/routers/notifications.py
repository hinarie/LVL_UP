import json
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update, func, and_

from app.database import get_db
from app.models.user import User
from app.models.character import Character
from app.models.notification import Notification
from app.core.deps import get_current_user

router = APIRouter(prefix="/notifications", tags=["notifications"])

def _parse_payload(raw: Optional[str]) -> dict:
    if not raw:
        return {}
    try:
        return json.loads(raw)
    except Exception:
        return {}

async def _attach_actor_info(db: AsyncSession, notifs: list) -> dict:
    actor_ids = list({n.actor_user_id for n in notifs if n.actor_user_id is not None})
    info: dict = {}
    if not actor_ids:
        return info

    users_q = await db.execute(select(User).where(User.id.in_(actor_ids)))
    chars_q = await db.execute(select(Character).where(Character.user_id.in_(actor_ids)))

    user_by_id = {str(u.id): u for u in users_q.scalars().all()}
    char_by_uid = {str(c.user_id): c for c in chars_q.scalars().all()}

    for aid in actor_ids:
        u = user_by_id.get(str(aid))
        c = char_by_uid.get(str(aid))
        info[str(aid)] = {
            "username": u.username if u else None,
            "display_name": c.display_name if c else None,
            "character_name": c.character_name if c else None,
            "avatar_url": c.avatar_url if c else None,
            "level": c.level if c else 1,
        }
    return info

def _serialize(n: Notification, actor_info: dict) -> dict:
    actor = actor_info.get(str(n.actor_user_id)) if n.actor_user_id else None
    return {
        "id": str(n.id),
        "type": n.type,
        "is_read": n.is_read,
        "created_at": n.created_at,
        "entity_id": n.entity_id,
        "actor": actor,
        "payload": _parse_payload(n.payload),
    }

@router.get("")
async def list_notifications(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    unread_only: bool = Query(False),
    limit: int = Query(30, ge=1, le=100),
):
    q = select(Notification).where(Notification.user_id == current_user.id)
    if unread_only:
        q = q.where(Notification.is_read == False)
    q = q.order_by(Notification.created_at.desc()).limit(limit)

    items = (await db.execute(q)).scalars().all()
    actor_info = await _attach_actor_info(db, items)

    unread_count = (await db.execute(
        select(func.count(Notification.id)).where(
            Notification.user_id == current_user.id,
            Notification.is_read == False,
        )
    )).scalar() or 0

    return {
        "items": [_serialize(n, actor_info) for n in items],
        "unread_count": unread_count,
    }

@router.get("/unread-count")
async def unread_count(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    count = (await db.execute(
        select(func.count(Notification.id)).where(
            Notification.user_id == current_user.id,
            Notification.is_read == False,
        )
    )).scalar() or 0
    return {"unread_count": count}

@router.post("/{notification_id}/read")
async def mark_read(
    notification_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    res = await db.execute(
        select(Notification).where(
            Notification.id == notification_id,
            Notification.user_id == current_user.id,
        )
    )
    n = res.scalar_one_or_none()
    if not n:
        raise HTTPException(404, "Уведомление не найдено")
    n.is_read = True
    await db.commit()
    return {"ok": True}

@router.post("/read-all")
async def mark_all_read(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await db.execute(
        update(Notification)
        .where(
            Notification.user_id == current_user.id,
            Notification.is_read == False,
        )
        .values(is_read=True)
    )
    await db.commit()
    return {"ok": True}

@router.delete("/{notification_id}")
async def delete_notification(
    notification_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    res = await db.execute(
        select(Notification).where(
            Notification.id == notification_id,
            Notification.user_id == current_user.id,
        )
    )
    n = res.scalar_one_or_none()
    if not n:
        raise HTTPException(404, "Уведомление не найдено")
    await db.delete(n)
    await db.commit()
    return {"ok": True}

@router.delete("")
async def clear_all(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    from sqlalchemy import delete as sa_delete
    await db.execute(
        sa_delete(Notification).where(Notification.user_id == current_user.id)
    )
    await db.commit()
    return {"ok": True}