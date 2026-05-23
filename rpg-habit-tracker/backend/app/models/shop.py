import uuid
from datetime import datetime
from sqlalchemy import (
    Column, String, Integer, DateTime, ForeignKey,
    Boolean, Enum as SAEnum, Text
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from app.database import Base
import enum


class ItemCategory(str, enum.Enum):
    # Кастомизация сайта
    theme = "theme"
    background = "background"
    frame = "frame"
    # Кастомизация персонажа
    clothing = "clothing"
    emotion = "emotion"
    hairstyle = "hairstyle"
    face = "face"
    # Артефакты (функциональные)
    artifact = "artifact"


class ItemRarity(str, enum.Enum):
    common = "common"
    rare = "rare"
    epic = "epic"
    legendary = "legendary"


class ShopItem(Base):
    __tablename__ = "shop_items"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    category = Column(SAEnum(ItemCategory), nullable=False)
    rarity = Column(SAEnum(ItemRarity), default=ItemRarity.common)
    price_credits = Column(Integer, nullable=False)
    asset_key = Column(String(255), nullable=False)  # ключ для фронтенда (CSS класс, имя файла)
    is_available = Column(Boolean, default=True)

    # Для артефактов: эффект
    effect_type = Column(String(100), nullable=True)    # "freeze_streak", "double_xp"
    effect_duration = Column(Integer, nullable=True)    # в минутах (для double_xp)
    effect_value = Column(Integer, nullable=True)       # множитель или кол-во дней

    created_at = Column(DateTime, default=datetime.utcnow)

    purchases = relationship("InventoryItem", back_populates="shop_item")


class InventoryItem(Base):
    """Купленные предметы у пользователя"""
    __tablename__ = "inventory_items"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    shop_item_id = Column(UUID(as_uuid=True), ForeignKey("shop_items.id"), nullable=False)

    quantity = Column(Integer, default=1)    # для расходников (зелья, свитки)
    is_equipped = Column(Boolean, default=False)  # для косметики
    used_at = Column(DateTime, nullable=True)     # когда применён

    purchased_at = Column(DateTime, default=datetime.utcnow)

    user = relationship("User", back_populates="inventory")
    shop_item = relationship("ShopItem", back_populates="purchases")


class CharacterEquipment(Base):
    """Текущая экипировка персонажа (что надето)"""
    __tablename__ = "character_equipment"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    character_id = Column(UUID(as_uuid=True), ForeignKey("characters.id"), nullable=False)
    inventory_item_id = Column(UUID(as_uuid=True), ForeignKey("inventory_items.id"), nullable=False)
    slot = Column(String(50), nullable=False)  # "clothing", "hairstyle", "face", etc.

    character = relationship("Character", back_populates="equipped_items")