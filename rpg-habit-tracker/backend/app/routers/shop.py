from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from datetime import datetime, timedelta
import uuid

from app.database import get_db
from app.models.user import User
from app.models.shop import ShopItem, InventoryItem, ItemCategory
from app.models.character import Character
from app.models.transactions import CreditTransaction, CreditSource
from app.core.deps import get_current_user

router = APIRouter(prefix="/shop", tags=["shop"])

def shop_item_to_dict(item: ShopItem) -> dict:
    return {
        "id": str(item.id),
        "name": item.name,
        "description": item.description,
        "category": item.category.value,
        "rarity": item.rarity.value,
        "price_credits": item.price_credits,
        "asset_key": item.asset_key,
        "effect_type": item.effect_type,
        "effect_duration": item.effect_duration,
        "effect_value": item.effect_value,
        "is_available": item.is_available,
    }

def inv_item_to_dict(inv: InventoryItem, item: ShopItem) -> dict:
    return {
        "id": str(inv.id),
        "shop_item_id": str(inv.shop_item_id),
        "name": item.name,
        "description": item.description,
        "category": item.category.value,
        "asset_key": item.asset_key,
        "quantity": inv.quantity,
        "is_equipped": inv.is_equipped,
        "effect_type": item.effect_type,
        "rarity": item.rarity.value,
    }

@router.get("/items")
async def get_shop_items(
    category: str = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = select(ShopItem).where(ShopItem.is_available == True)
    if category:
        try:
            cat = ItemCategory(category)
            query = query.where(ShopItem.category == cat)
        except ValueError:
            pass
    result = await db.execute(query.order_by(ShopItem.price_credits))
    items = result.scalars().all()

    inv_result = await db.execute(
        select(InventoryItem).where(InventoryItem.user_id == current_user.id)
    )
    owned_ids = {str(inv.shop_item_id) for inv in inv_result.scalars().all()}

    return [
        {**shop_item_to_dict(item), "owned": str(item.id) in owned_ids}
        for item in items
    ]

@router.post("/buy/{item_id}")
async def buy_item(
    item_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    item_result = await db.execute(
        select(ShopItem).where(ShopItem.id == item_id, ShopItem.is_available == True)
    )
    item = item_result.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="Товар не найден")

    char_result = await db.execute(
        select(Character).where(Character.user_id == current_user.id)
    )
    character = char_result.scalar_one_or_none()
    if not character:
        raise HTTPException(status_code=404, detail="Персонаж не найден")

    if character.credits < item.price_credits:
        raise HTTPException(
            status_code=400,
            detail=f"Недостаточно кредитов. Нужно: {item.price_credits}, есть: {character.credits}"
        )

    if item.category != ItemCategory.artifact:
        existing = await db.execute(
            select(InventoryItem).where(
                InventoryItem.user_id == current_user.id,
                InventoryItem.shop_item_id == item.id,
            )
        )
        if existing.scalar_one_or_none():
            raise HTTPException(status_code=400, detail="Уже куплено")

    character.credits -= item.price_credits

    inv_item = InventoryItem(
        id=uuid.uuid4(),
        user_id=current_user.id,
        shop_item_id=item.id,
        quantity=1,
        is_equipped=False,
    )
    db.add(inv_item)

    tx = CreditTransaction(
        id=uuid.uuid4(),
        user_id=current_user.id,
        amount=-item.price_credits,
        source=CreditSource.shop_purchase,
        source_id=item.id,
        description=f"Покупка: {item.name}",
        balance_after=character.credits,
    )
    db.add(tx)
    await db.commit()

    return {
        "message": f"Куплено: {item.name}",
        "credits_left": character.credits,
        "item": inv_item_to_dict(inv_item, item),
    }

@router.get("/inventory")
async def get_inventory(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(InventoryItem).where(InventoryItem.user_id == current_user.id)
    )
    inv_items = result.scalars().all()

    response = []
    for inv in inv_items:
        item_result = await db.execute(
            select(ShopItem).where(ShopItem.id == inv.shop_item_id)
        )
        item = item_result.scalar_one_or_none()
        if item and item.is_available:
            response.append(inv_item_to_dict(inv, item))
    return response

@router.post("/use/{inv_item_id}")
async def use_item(
    inv_item_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    inv_result = await db.execute(
        select(InventoryItem).where(
            InventoryItem.id == inv_item_id,
            InventoryItem.user_id == current_user.id,
        )
    )
    inv = inv_result.scalar_one_or_none()
    if not inv:
        raise HTTPException(status_code=404, detail="Предмет не найден")
    if inv.quantity < 1:
        raise HTTPException(status_code=400, detail="Предмет закончился")

    item_result = await db.execute(select(ShopItem).where(ShopItem.id == inv.shop_item_id))
    item = item_result.scalar_one_or_none()

    char_result = await db.execute(
        select(Character).where(Character.user_id == current_user.id)
    )
    character = char_result.scalar_one_or_none()

    message = "Предмет использован"

    if item.effect_type == "freeze_streak":
        if character.freeze_available:
            raise HTTPException(400, "Зелье заморозки уже активно ❄️")
        character.freeze_available = True
        message = "Зелье заморозки активировано! Стрик защищён на 1 день ❄️"

    elif item.effect_type == "double_xp":
        if character.double_xp_active and character.double_xp_expires_at and \
           character.double_xp_expires_at > datetime.utcnow():
            raise HTTPException(400, "Бонус XP уже активен ⚡")
        character.double_xp_active = True
        duration = item.effect_duration or 60
        character.double_xp_expires_at = datetime.utcnow() + timedelta(minutes=duration)
        if duration >= 60:
            t = f"{duration // 60} ч." if duration % 60 == 0 else f"{duration // 60} ч. {duration % 60} мин."
        else:
            t = f"{duration} мин."
        message = f"x2 XP активирован на {t}! ⚡"

    inv.quantity -= 1
    inv.used_at = datetime.utcnow()
    if inv.quantity == 0:
        await db.delete(inv)

    await db.commit()
    return {"message": message}

@router.post("/equip/{inv_item_id}")
async def equip_item(
    inv_item_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    inv_result = await db.execute(
        select(InventoryItem).where(
            InventoryItem.id == inv_item_id,
            InventoryItem.user_id == current_user.id,
        )
    )
    inv = inv_result.scalar_one_or_none()
    if not inv:
        raise HTTPException(status_code=404, detail="Предмет не найден")

    item_result = await db.execute(select(ShopItem).where(ShopItem.id == inv.shop_item_id))
    item = item_result.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="Товар не найден")

    char_result = await db.execute(
        select(Character).where(Character.user_id == current_user.id)
    )
    character = char_result.scalar_one_or_none()
    if not character:
        raise HTTPException(status_code=404, detail="Персонаж не найден")

    if item.category == ItemCategory.artifact:
        raise HTTPException(400, "Артефакты используются, а не надеваются")

    same_cat_result = await db.execute(
        select(InventoryItem)
        .join(ShopItem, InventoryItem.shop_item_id == ShopItem.id)
        .where(
            InventoryItem.user_id == current_user.id,
            InventoryItem.is_equipped == True,
            ShopItem.category == item.category,
            InventoryItem.id != inv.id,
        )
    )
    for old_inv in same_cat_result.scalars().all():
        old_inv.is_equipped = False

    inv.is_equipped = not inv.is_equipped

    if item.category == ItemCategory.theme:
        character.active_theme = item.asset_key if inv.is_equipped else "default"
    elif item.category == ItemCategory.background:
        character.active_background = item.asset_key if inv.is_equipped else None
    elif item.category == ItemCategory.frame:
        character.active_frame = item.asset_key if inv.is_equipped else None

    await db.commit()
    return {
        "message": "Надето" if inv.is_equipped else "Снято",
        "is_equipped": inv.is_equipped,
    }