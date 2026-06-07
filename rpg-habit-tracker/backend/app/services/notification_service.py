import json
import uuid
import logging
from datetime import datetime, timedelta
from typing import Optional, Any

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_

from app.models.notification import Notification, NotificationType

log = logging.getLogger(__name__)

DEDUP_WINDOW_HOURS = 6

async def create_safe(
    db: AsyncSession,
    *,
    user_id,
    type: str,
    actor_user_id=None,
    entity_id: Optional[str] = None,
    payload: Optional[dict] = None,
    dedup: bool = True,
) -> Optional[Notification]:
    try:
        if actor_user_id is not None and str(actor_user_id) == str(user_id):
            return None

        if dedup and actor_user_id is not None:
            cutoff = datetime.utcnow() - timedelta(hours=DEDUP_WINDOW_HOURS)
            q = select(Notification).where(
                Notification.user_id == user_id,
                Notification.type == type,
                Notification.actor_user_id == actor_user_id,
                Notification.created_at >= cutoff,
            )
            if entity_id is not None:
                q = q.where(Notification.entity_id == str(entity_id))
            existing = (await db.execute(q)).scalar_one_or_none()
            if existing:
                existing.created_at = datetime.utcnow()
                existing.is_read = False
                if payload is not None:
                    existing.payload = json.dumps(payload, ensure_ascii=False, default=str)
                return existing

        notif = Notification(
            id=uuid.uuid4(),
            user_id=user_id,
            type=type,
            actor_user_id=actor_user_id,
            entity_id=str(entity_id) if entity_id is not None else None,
            payload=json.dumps(payload, ensure_ascii=False, default=str) if payload else None,
            is_read=False,
            created_at=datetime.utcnow(),
        )
        db.add(notif)
        return notif
    except Exception as e:
        log.warning("Не удалось создать уведомление type=%s user=%s: %s",
                    type, user_id, e)
        return None

async def notify_friend_request(db, *, receiver_id, sender_id, sender_username, sender_name):
    return await create_safe(
        db,
        user_id=receiver_id,
        type=NotificationType.FRIEND_REQUEST,
        actor_user_id=sender_id,
        entity_id=str(sender_id),
        payload={"sender_username": sender_username, "sender_name": sender_name},
    )

async def notify_friend_accepted(db, *, receiver_id, accepter_id, accepter_username, accepter_name):
    return await create_safe(
        db,
        user_id=receiver_id,
        type=NotificationType.FRIEND_ACCEPTED,
        actor_user_id=accepter_id,
        entity_id=str(accepter_id),
        payload={"accepter_username": accepter_username, "accepter_name": accepter_name},
    )

async def notify_ping(db, *, receiver_id, sender_id, sender_username, sender_name, message):
    return await create_safe(
        db,
        user_id=receiver_id,
        type=NotificationType.PING_RECEIVED,
        actor_user_id=sender_id,
        entity_id=str(sender_id),
        payload={
            "sender_username": sender_username,
            "sender_name": sender_name,
            "message": message,
        },
    )

async def notify_post_liked(db, *, post_owner_id, liker_id, liker_username, liker_name, post_id, post_preview):
    return await create_safe(
        db,
        user_id=post_owner_id,
        type=NotificationType.POST_LIKED,
        actor_user_id=liker_id,
        entity_id=str(post_id),
        payload={
            "liker_username": liker_username,
            "liker_name": liker_name,
            "post_preview": (post_preview or "")[:80],
        },
    )

async def notify_post_commented(db, *, post_owner_id, commenter_id, commenter_username,
                                commenter_name, post_id, comment_preview):
    return await create_safe(
        db,
        user_id=post_owner_id,
        type=NotificationType.POST_COMMENTED,
        actor_user_id=commenter_id,
        entity_id=str(post_id),
        payload={
            "commenter_username": commenter_username,
            "commenter_name": commenter_name,
            "comment_preview": (comment_preview or "")[:120],
        },
        dedup=False,
    )

async def notify_level_up(db, *, user_id, new_level):
    return await create_safe(
        db,
        user_id=user_id,
        type=NotificationType.LEVEL_UP,
        actor_user_id=None,
        entity_id=None,
        payload={"new_level": new_level},
        dedup=False,
    )

async def notify_rank_up(db, *, user_id, new_rank):
    return await create_safe(
        db,
        user_id=user_id,
        type=NotificationType.RANK_UP,
        actor_user_id=None,
        entity_id=None,
        payload={"new_rank": new_rank},
        dedup=False,
    )