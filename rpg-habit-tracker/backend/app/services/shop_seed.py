import uuid
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.models.shop import ShopItem, ItemCategory, ItemRarity

INITIAL_ITEMS = [
    # Темы сайта
    {"name": "Тема Cyber Pink", "category": ItemCategory.theme, "rarity": ItemRarity.rare,
     "price_credits": 200, "asset_key": "theme-cyber-pink", "description": "Розово-неоновая тема"},
    {"name": "Тема Ocean Dark", "category": ItemCategory.theme, "rarity": ItemRarity.rare,
     "price_credits": 200, "asset_key": "theme-ocean-dark", "description": "Тёмно-синяя тема"},
    {"name": "Тема Emerald", "category": ItemCategory.theme, "rarity": ItemRarity.epic,
     "price_credits": 350, "asset_key": "theme-emerald", "description": "Изумрудная тема"},

    # Фоны профиля
    {"name": "Фон: Звёздное небо", "category": ItemCategory.background, "rarity": ItemRarity.common,
     "price_credits": 100, "asset_key": "bg-stars", "description": "Анимированные звёзды"},
    {"name": "Фон: Матрица", "category": ItemCategory.background, "rarity": ItemRarity.rare,
     "price_credits": 180, "asset_key": "bg-matrix", "description": "Падающие символы"},

    # Рамки аватара
    {"name": "Рамка: Золотая", "category": ItemCategory.frame, "rarity": ItemRarity.epic,
     "price_credits": 300, "asset_key": "frame-gold", "description": "Золотая рамка аватара"},
    {"name": "Рамка: Огненная", "category": ItemCategory.frame, "rarity": ItemRarity.legendary,
     "price_credits": 500, "asset_key": "frame-fire", "description": "Анимированная огненная рамка"},

    # Одежда персонажа
    {"name": "Доспехи рыцаря", "category": ItemCategory.clothing, "rarity": ItemRarity.rare,
     "price_credits": 250, "asset_key": "cloth-knight", "description": "Тяжёлые рыцарские доспехи"},
    {"name": "Мантия мага", "category": ItemCategory.clothing, "rarity": ItemRarity.epic,
     "price_credits": 400, "asset_key": "cloth-mage", "description": "Таинственная мантия"},
    {"name": "Костюм ниндзя", "category": ItemCategory.clothing, "rarity": ItemRarity.rare,
     "price_credits": 280, "asset_key": "cloth-ninja", "description": "Тёмный костюм"},

    # Причёски
    {"name": "Причёска: Самурай", "category": ItemCategory.hairstyle, "rarity": ItemRarity.common,
     "price_credits": 80, "asset_key": "hair-samurai", "description": "Хвост самурая"},
    {"name": "Причёска: Неон", "category": ItemCategory.hairstyle, "rarity": ItemRarity.rare,
     "price_credits": 150, "asset_key": "hair-neon", "description": "Светящиеся волосы"},

    # Артефакты (функциональные)
    {"name": "🧪 Зелье заморозки", "category": ItemCategory.artifact, "rarity": ItemRarity.rare,
     "price_credits": 150, "asset_key": "artifact-freeze",
     "description": "Пропусти 1 день без потери стрика",
     "effect_type": "freeze_streak", "effect_duration": None, "effect_value": 1},
    {"name": "📜 Свиток двойного опыта", "category": ItemCategory.artifact, "rarity": ItemRarity.epic,
     "price_credits": 300, "asset_key": "artifact-double-xp",
     "description": "x2 XP в течение 1 часа",
     "effect_type": "double_xp", "effect_duration": 60, "effect_value": 2},
]


async def seed_shop(db: AsyncSession):
    """Заполняет магазин начальными товарами если он пустой."""
    result = await db.execute(select(ShopItem).limit(1))
    if result.scalar_one_or_none():
        return  # уже заполнен

    for item_data in INITIAL_ITEMS:
        item = ShopItem(
            id=uuid.uuid4(),
            name=item_data["name"],
            description=item_data.get("description"),
            category=item_data["category"],
            rarity=item_data["rarity"],
            price_credits=item_data["price_credits"],
            asset_key=item_data["asset_key"],
            effect_type=item_data.get("effect_type"),
            effect_duration=item_data.get("effect_duration"),
            effect_value=item_data.get("effect_value"),
            is_available=True,
        )
        db.add(item)
    await db.commit()