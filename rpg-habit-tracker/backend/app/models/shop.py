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
    theme = "theme"
    background = "background"
    frame = "frame"
    clothing = "clothing"
    emotion = "emotion"
    hairstyle = "hairstyle"
    face = "face"
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
    asset_key = Column(String(255), nullable=False)
    is_available = Column(Boolean, default=True)

    effect_type = Column(String(100), nullable=True)
    effect_duration = Column(Integer, nullable=True)
    effect_value = Column(Integer, nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow)

    purchases = relationship("InventoryItem", back_populates="shop_item")

class InventoryItem(Base):
    __tablename__ = "inventory_items"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    shop_item_id = Column(UUID(as_uuid=True), ForeignKey("shop_items.id"), nullable=False)

    quantity = Column(Integer, default=1)
    is_equipped = Column(Boolean, default=False)
    used_at = Column(DateTime, nullable=True)

    purchased_at = Column(DateTime, default=datetime.utcnow)

    user = relationship("User", back_populates="inventory")
    shop_item = relationship("ShopItem", back_populates="purchases")

class CharacterEquipment(Base):
    __tablename__ = "character_equipment"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    character_id = Column(UUID(as_uuid=True), ForeignKey("characters.id"), nullable=False)
    inventory_item_id = Column(UUID(as_uuid=True), ForeignKey("inventory_items.id"), nullable=False)
    slot = Column(String(50), nullable=False)

    character = relationship("Character", back_populates="equipped_items")