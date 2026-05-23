from pydantic import BaseModel
from typing import Optional


class ShopItemResponse(BaseModel):
    id: str
    name: str
    description: Optional[str]
    category: str
    rarity: str
    price_credits: int
    asset_key: str
    effect_type: Optional[str]
    effect_duration: Optional[int]
    effect_value: Optional[int]
    is_available: bool

    class Config:
        from_attributes = True


class InventoryItemResponse(BaseModel):
    id: str
    shop_item_id: str
    name: str
    description: Optional[str]
    category: str
    asset_key: str
    quantity: int
    is_equipped: bool
    effect_type: Optional[str]

    class Config:
        from_attributes = True