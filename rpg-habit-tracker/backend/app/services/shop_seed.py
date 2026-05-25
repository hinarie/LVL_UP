import uuid
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.models.shop import ShopItem, ItemCategory, ItemRarity

INITIAL_ITEMS = [
    {"name": "Тема: Cyber Pink", "category": ItemCategory.theme, "rarity": ItemRarity.rare,
     "price_credits": 100, "asset_key": "theme-cyber-pink",
     "description": "Розово-неоновая киберпанк-палитра"},
    {"name": "Тема: Ocean Dark", "category": ItemCategory.theme, "rarity": ItemRarity.rare,
     "price_credits": 100, "asset_key": "theme-ocean-dark",
     "description": "Глубокие сине-бирюзовые тона"},
    {"name": "Тема: Emerald Forest", "category": ItemCategory.theme, "rarity": ItemRarity.epic,
     "price_credits": 175, "asset_key": "theme-emerald",
     "description": "Изумрудно-лесные оттенки"},
    {"name": "Тема: Sunset Glow", "category": ItemCategory.theme, "rarity": ItemRarity.epic,
     "price_credits": 175, "asset_key": "theme-sunset",
     "description": "Тёплые закатные градиенты"},
    {"name": "Тема: Midnight Gold", "category": ItemCategory.theme, "rarity": ItemRarity.legendary,
     "price_credits": 300, "asset_key": "theme-midnight-gold",
     "description": "Чёрный с золотыми акцентами"},

    {"name": "Фон: Звёздное небо", "category": ItemCategory.background, "rarity": ItemRarity.common,
     "price_credits": 50, "asset_key": "bg-stars",
     "description": "Мерцающие звёзды на тёмном фоне"},
    {"name": "Фон: Северное сияние", "category": ItemCategory.background, "rarity": ItemRarity.rare,
     "price_credits": 90, "asset_key": "bg-aurora",
     "description": "Плавно переливающееся сияние"},
    {"name": "Фон: Матрица", "category": ItemCategory.background, "rarity": ItemRarity.rare,
     "price_credits": 90, "asset_key": "bg-matrix",
     "description": "Падающие зелёные символы"},
    {"name": "Фон: Космос", "category": ItemCategory.background, "rarity": ItemRarity.epic,
     "price_credits": 160, "asset_key": "bg-cosmos",
     "description": "Туманности и далёкие галактики"},
    {"name": "Фон: Закатный градиент", "category": ItemCategory.background, "rarity": ItemRarity.epic,
     "price_credits": 160, "asset_key": "bg-sunset",
     "description": "Тёплый анимированный закат"},

    {"name": "Рамка: Серебряная", "category": ItemCategory.frame, "rarity": ItemRarity.common,
     "price_credits": 60, "asset_key": "frame-silver",
     "description": "Аккуратная серебряная окантовка"},
    {"name": "Рамка: Золотая", "category": ItemCategory.frame, "rarity": ItemRarity.epic,
     "price_credits": 150, "asset_key": "frame-gold",
     "description": "Сияющая золотая рамка"},
    {"name": "Рамка: Огненная", "category": ItemCategory.frame, "rarity": ItemRarity.legendary,
     "price_credits": 250, "asset_key": "frame-fire",
     "description": "Анимированное пламя по краям"},
    {"name": "Рамка: Ледяная", "category": ItemCategory.frame, "rarity": ItemRarity.epic,
     "price_credits": 160, "asset_key": "frame-ice",
     "description": "Мерцающий ледяной кристалл"},
    {"name": "Рамка: Радужная", "category": ItemCategory.frame, "rarity": ItemRarity.legendary,
     "price_credits": 275, "asset_key": "frame-rainbow",
     "description": "Переливающаяся всеми цветами"},

    {"name": "🧪 Зелье заморозки", "category": ItemCategory.artifact, "rarity": ItemRarity.rare,
     "price_credits": 75, "asset_key": "artifact-freeze",
     "description": "Пропусти 1 день без потери стрика",
     "effect_type": "freeze_streak", "effect_duration": None, "effect_value": 1},
    {"name": "📜 Свиток двойного опыта", "category": ItemCategory.artifact, "rarity": ItemRarity.epic,
     "price_credits": 150, "asset_key": "artifact-double-xp",
     "description": "x2 XP в течение 1 часа",
     "effect_type": "double_xp", "effect_duration": 60, "effect_value": 2},
    {"name": "📜 Большой свиток опыта", "category": ItemCategory.artifact, "rarity": ItemRarity.legendary,
     "price_credits": 350, "asset_key": "artifact-double-xp-long",
     "description": "x2 XP в течение 3 часов",
     "effect_type": "double_xp", "effect_duration": 180, "effect_value": 2},
]


async def seed_shop(db: AsyncSession):
    from app.models.shop import InventoryItem

    catalog_keys = {it["asset_key"] for it in INITIAL_ITEMS}

    existing_res = await db.execute(select(ShopItem))
    existing_by_key = {item.asset_key: item for item in existing_res.scalars().all()}

    added = updated = hidden = 0

    for item_data in INITIAL_ITEMS:
        key = item_data["asset_key"]
        existing = existing_by_key.get(key)
        if existing:
            existing.name = item_data["name"]
            existing.description = item_data.get("description")
            existing.category = item_data["category"]
            existing.rarity = item_data["rarity"]
            existing.price_credits = item_data["price_credits"]
            existing.effect_type = item_data.get("effect_type")
            existing.effect_duration = item_data.get("effect_duration")
            existing.effect_value = item_data.get("effect_value")
            existing.is_available = item_data.get("is_available", True)
            updated += 1
        else:
            db.add(ShopItem(
                id=uuid.uuid4(),
                name=item_data["name"],
                description=item_data.get("description"),
                category=item_data["category"],
                rarity=item_data["rarity"],
                price_credits=item_data["price_credits"],
                asset_key=key,
                effect_type=item_data.get("effect_type"),
                effect_duration=item_data.get("effect_duration"),
                effect_value=item_data.get("effect_value"),
                is_available=item_data.get("is_available", True),
            ))
            added += 1

    hide_categories = {
        ItemCategory.clothing, ItemCategory.hairstyle,
        ItemCategory.face, ItemCategory.emotion,
    }
    for key, item in existing_by_key.items():
        if key in catalog_keys:
            continue
        item.is_available = False
        hidden += 1
        if item.category in hide_categories:
            inv_res = await db.execute(
                select(InventoryItem).where(
                    InventoryItem.shop_item_id == item.id,
                    InventoryItem.is_equipped == True,
                )
            )
            for inv in inv_res.scalars().all():
                inv.is_equipped = False

    if added or updated or hidden:
        await db.commit()