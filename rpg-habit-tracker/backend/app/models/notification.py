"""
Уведомления — отдельная таблица. На стороне фронта показываются в колокольчике
в хедере. Создаются автоматически при социальных и игровых событиях:
запрос в друзья, лайк, комментарий, пинг, level up и т.п.

Не блокирующая фича: ошибки в создании уведомления НЕ должны валить основное
действие (см. notification_service.create_safe).
"""
import uuid
from datetime import datetime
from sqlalchemy import Column, String, Boolean, DateTime, ForeignKey, Text, Index
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from app.database import Base


# Типы уведомлений — строкой, чтобы легко добавлять новые без миграций enum'а
class NotificationType:
    FRIEND_REQUEST   = "friend_request"
    FRIEND_ACCEPTED  = "friend_accepted"
    PING_RECEIVED    = "ping_received"
    POST_LIKED       = "post_liked"
    POST_COMMENTED   = "post_commented"
    LEVEL_UP         = "level_up"
    RANK_UP          = "rank_up"


class Notification(Base):
    __tablename__ = "notifications"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)

    # Получатель — кому показывать в колокольчике
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True)

    # Тип события (см. NotificationType)
    type = Column(String(50), nullable=False)

    # Инициатор события (другой юзер, который лайкнул/добавил и т.п.).
    # NULL для системных типов (level_up, rank_up).
    actor_user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)

    # ID связанной сущности — пост, дружба, и т.д. (для deep-link).
    # Строкой, чтобы не плодить FK к каждому типу.
    entity_id = Column(String(64), nullable=True)

    # Произвольные доп.данные в JSON-строке (новый уровень, превью комментария…)
    payload = Column(Text, nullable=True)

    is_read = Column(Boolean, default=False, nullable=False, index=True)

    created_at = Column(DateTime, default=datetime.utcnow, nullable=False, index=True)


# Композитный индекс под основной запрос: «непрочитанные у юзера, сортируя по времени»
Index("ix_notifications_user_read_created", Notification.user_id, Notification.is_read, Notification.created_at)