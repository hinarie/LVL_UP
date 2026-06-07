import asyncio
import uuid
import json
import random
from datetime import datetime, timedelta, date

from sqlalchemy import select, delete

from app.database import AsyncSessionLocal
from app.core.security import hash_password

from app.models.user import User, OAuthProvider
from app.models.character import Character, Gender, Rank
from app.models.tasks import DailyTask, TaskDifficulty, TaskStatus
from app.models.goals import Goal, SubTask, GoalStatus, GoalRarity
from app.models.habits import Habit, HabitCompletion
from app.models.shop import ShopItem, InventoryItem, CharacterEquipment, ItemCategory
from app.models.social import (
    Friendship, FriendshipStatus, Post, PostVisibility,
    PostReaction, PostComment, MotivationalPing,
)
from app.models.transactions import (
    XPTransaction, CreditTransaction, XPSource, CreditSource,
)
from app.models.challenges import (
    Challenge, ChallengeTask, ChallengeParticipant,
    ChallengePost, ChallengePostReaction, ChallengePostComment,
    ChallengeType, ChallengeStatus, TaskRepeatType, PostReactionEmoji,
)
from app.models.notification import Notification, NotificationType

try:
    from app.models.username_change import UsernameChange
except Exception:
    UsernameChange = None

DEMO_EMAIL = "demo@lvlup.app"
DEMO_PASSWORD = "demo1234"
DEMO_USERNAME = "hero_demo"

FRIENDS = [
    {
        "email": "alex@lvlup.app", "password": "demo1234", "username": "alex_storm",
        "display_name": "Алекс", "character_name": "Громовержец",
        "gender": Gender.male, "level": 24, "rank": Rank.master,
    },
    {
        "email": "mira@lvlup.app", "password": "demo1234", "username": "mira_lumen",
        "display_name": "Мира", "character_name": "Светоносная",
        "gender": Gender.female, "level": 31, "rank": Rank.epic,
    },
]

ALL_DEMO_EMAILS = [DEMO_EMAIL] + [f["email"] for f in FRIENDS]

now = datetime.utcnow

async def wipe_previous(db):
    res = await db.execute(select(User).where(User.email.in_(ALL_DEMO_EMAILS)))
    users = res.scalars().all()
    if not users:
        return
    ids = [u.id for u in users]

    post_res = await db.execute(select(Post.id).where(Post.user_id.in_(ids)))
    post_ids = [r[0] for r in post_res.all()]
    if post_ids:
        await db.execute(delete(PostComment).where(PostComment.post_id.in_(post_ids)))
        await db.execute(delete(PostReaction).where(PostReaction.post_id.in_(post_ids)))
    await db.execute(delete(PostComment).where(PostComment.user_id.in_(ids)))
    await db.execute(delete(PostReaction).where(PostReaction.user_id.in_(ids)))
    await db.execute(delete(Post).where(Post.user_id.in_(ids)))

    ch_res = await db.execute(select(Challenge.id).where(Challenge.creator_id.in_(ids)))
    ch_ids = [r[0] for r in ch_res.all()]
    if ch_ids:
        cp_res = await db.execute(
            select(ChallengePost.id).where(ChallengePost.challenge_id.in_(ch_ids))
        )
        cp_ids = [r[0] for r in cp_res.all()]
        if cp_ids:
            await db.execute(delete(ChallengePostComment).where(ChallengePostComment.post_id.in_(cp_ids)))
            await db.execute(delete(ChallengePostReaction).where(ChallengePostReaction.post_id.in_(cp_ids)))
        await db.execute(delete(ChallengePost).where(ChallengePost.challenge_id.in_(ch_ids)))
        await db.execute(delete(ChallengeTask).where(ChallengeTask.challenge_id.in_(ch_ids)))
        await db.execute(delete(ChallengeParticipant).where(ChallengeParticipant.challenge_id.in_(ch_ids)))
        await db.execute(delete(Challenge).where(Challenge.id.in_(ch_ids)))
    await db.execute(delete(ChallengePostComment).where(ChallengePostComment.user_id.in_(ids)))
    await db.execute(delete(ChallengePostReaction).where(ChallengePostReaction.user_id.in_(ids)))
    await db.execute(delete(ChallengePost).where(ChallengePost.user_id.in_(ids)))
    await db.execute(delete(ChallengeParticipant).where(ChallengeParticipant.user_id.in_(ids)))

    char_res = await db.execute(select(Character.id).where(Character.user_id.in_(ids)))
    char_ids = [r[0] for r in char_res.all()]
    if char_ids:
        await db.execute(delete(CharacterEquipment).where(CharacterEquipment.character_id.in_(char_ids)))
    await db.execute(delete(InventoryItem).where(InventoryItem.user_id.in_(ids)))

    await db.execute(delete(HabitCompletion).where(HabitCompletion.user_id.in_(ids)))
    await db.execute(delete(Habit).where(Habit.user_id.in_(ids)))
    goal_res = await db.execute(select(Goal.id).where(Goal.user_id.in_(ids)))
    goal_ids = [r[0] for r in goal_res.all()]
    if goal_ids:
        await db.execute(delete(SubTask).where(SubTask.goal_id.in_(goal_ids)))
    await db.execute(delete(Goal).where(Goal.user_id.in_(ids)))
    await db.execute(delete(DailyTask).where(DailyTask.user_id.in_(ids)))
    await db.execute(delete(XPTransaction).where(XPTransaction.user_id.in_(ids)))
    await db.execute(delete(CreditTransaction).where(CreditTransaction.user_id.in_(ids)))
    await db.execute(delete(MotivationalPing).where(
        (MotivationalPing.sender_id.in_(ids)) | (MotivationalPing.receiver_id.in_(ids))
    ))
    await db.execute(delete(Friendship).where(
        (Friendship.requester_id.in_(ids)) | (Friendship.addressee_id.in_(ids))
    ))
    await db.execute(delete(Notification).where(
        (Notification.user_id.in_(ids)) | (Notification.actor_user_id.in_(ids))
    ))
    if UsernameChange is not None:
        await db.execute(delete(UsernameChange).where(UsernameChange.user_id.in_(ids)))
    await db.execute(delete(Character).where(Character.user_id.in_(ids)))
    await db.execute(delete(User).where(User.id.in_(ids)))
    await db.commit()
    print(f"🧹 Удалены прежние демо-аккаунты: {len(users)}")


def make_user(email, password, username) -> User:
    return User(
        id=uuid.uuid4(),
        email=email,
        hashed_password=hash_password(password),
        oauth_provider=OAuthProvider.email,
        username=username,
        is_verified=True,
        is_active=True,
        is_onboarded=True,
        created_at=now() - timedelta(days=40),
    )


def make_character(user, display_name, character_name, gender,
                   level, rank, credits, xp_total,
                   streak, longest, avatar_url=None) -> Character:
    return Character(
        id=uuid.uuid4(),
        user_id=user.id,
        display_name=display_name,
        character_name=character_name,
        age_display=level,
        gender=gender,
        level=level,
        xp_total=xp_total,
        xp_current_level=xp_total % 1000,
        credits=credits,
        rank=rank,
        current_streak=streak,
        longest_streak=longest,
        last_streak_date=now(),
        xp_earned_today=120,
        xp_cap_reset_date=now(),
        active_theme="default",
        avatar_url=avatar_url,
        created_at=now() - timedelta(days=40),
    )


async def seed():
    async with AsyncSessionLocal() as db:
        await wipe_previous(db)

        main_user = make_user(DEMO_EMAIL, DEMO_PASSWORD, DEMO_USERNAME)
        db.add(main_user)
        main_char = make_character(
            main_user, "Демо Герой", "Аркан", Gender.male,
            level=42, rank=Rank.legend, credits=1850, xp_total=42000,
            streak=17, longest=29,
        )
        db.add(main_char)

        friend_users = []
        friend_chars = []
        for f in FRIENDS:
            u = make_user(f["email"], f["password"], f["username"])
            db.add(u)
            c = make_character(
                u, f["display_name"], f["character_name"], f["gender"],
                level=f["level"], rank=f["rank"],
                credits=random.randint(300, 900),
                xp_total=f["level"] * 1000 + random.randint(0, 800),
                streak=random.randint(3, 12), longest=random.randint(12, 25),
            )
            db.add(c)
            friend_users.append(u)
            friend_chars.append(c)

        await db.flush()

        for fu in friend_users:
            db.add(Friendship(
                id=uuid.uuid4(),
                requester_id=fu.id,
                addressee_id=main_user.id,
                status=FriendshipStatus.accepted,
                created_at=now() - timedelta(days=20),
            ))

        tasks_spec = [
            ("Утренняя зарядка 💪", TaskDifficulty.easy, 10, 5, TaskStatus.done),
            ("Прочитать 20 страниц 📖", TaskDifficulty.medium, 25, 15, TaskStatus.done),
            ("Глубокая работа 90 мин 🧠", TaskDifficulty.hard, 50, 60, TaskStatus.active),
            ("Выпить 2л воды 💧", TaskDifficulty.easy, 10, 5, TaskStatus.active),
            ("Английский — урок 🇬🇧", TaskDifficulty.medium, 25, 15, TaskStatus.done),
        ]
        for title, diff, xp, mins, st in tasks_spec:
            db.add(DailyTask(
                id=uuid.uuid4(),
                user_id=main_user.id,
                title=title,
                difficulty=diff,
                xp_reward=xp,
                duration_minutes=mins,
                status=st,
                completed_at=now() if st == TaskStatus.done else None,
                xp_granted=(st == TaskStatus.done),
                created_at=now() - timedelta(hours=6),
            ))

        goals_spec = [
            ("Запустить проект LVL UP 🚀", GoalRarity.legendary, GoalStatus.active, 60,
             ["Дизайн UI", "Бэкенд API", "Система XP", "Соцлента", "Деплой"]),
            ("Пробежать полумарафон 🏃", GoalRarity.epic, GoalStatus.active, 40,
             ["План тренировок", "10 км без остановки", "15 км", "Регистрация"]),
            ("Выучить 500 слов 🇬🇧", GoalRarity.rare, GoalStatus.completed, 100,
             ["100 слов", "250 слов", "500 слов"]),
        ]
        for title, rarity, status, progress, subs in goals_spec:
            g = Goal(
                id=uuid.uuid4(),
                user_id=main_user.id,
                title=title,
                rarity=rarity,
                status=status,
                progress_percent=progress,
                is_main_quest=(rarity == GoalRarity.legendary),
                deadline=now() + timedelta(days=21),
                completion_xp_bonus=300 if rarity == GoalRarity.legendary else 100,
                completion_xp_granted=(status == GoalStatus.completed),
                completed_at=now() if status == GoalStatus.completed else None,
                created_at=now() - timedelta(days=15),
            )
            db.add(g)
            done_count = int(len(subs) * progress / 100)
            for i, sub in enumerate(subs):
                db.add(SubTask(
                    id=uuid.uuid4(),
                    goal_id=g.id,
                    title=sub,
                    xp_reward=10,
                    is_completed=(i < done_count),
                    completed_at=now() if i < done_count else None,
                    order_index=i,
                ))

        habits_spec = [
            ("Медитация 🧘", "health", 5, "#9d5ff3"),
            ("Без сахара 🍎", "health", 5, "#4ade80"),
            ("Учёба 1 час 📚", "study", 8, "#60a5fa"),
            ("Спорт 🏋️", "fitness", 8, "#f59e0b"),
        ]
        for title, cat, xp, color in habits_spec:
            h = Habit(
                id=uuid.uuid4(),
                user_id=main_user.id,
                title=title,
                category=cat,
                xp_reward=xp,
                color=color,
                is_active=True,
                created_at=now() - timedelta(days=30),
            )
            db.add(h)
            for d in range(14):
                if random.random() < 0.75:
                    day = date.today() - timedelta(days=d)
                    db.add(HabitCompletion(
                        id=uuid.uuid4(),
                        habit_id=h.id,
                        user_id=main_user.id,
                        completed_date=day,
                        completed_at=datetime.combine(day, datetime.min.time()),
                    ))

        for i in range(8):
            db.add(XPTransaction(
                id=uuid.uuid4(),
                user_id=main_user.id,
                amount=random.choice([10, 25, 50]),
                source=random.choice([XPSource.daily_task, XPSource.habit, XPSource.subtask]),
                description="Демо начисление",
                created_at=now() - timedelta(days=i),
            ))
        bal = 1850
        for i in range(5):
            db.add(CreditTransaction(
                id=uuid.uuid4(),
                user_id=main_user.id,
                amount=random.choice([5, 12, 20]),
                source=CreditSource.xp_conversion,
                description="Конвертация XP",
                balance_after=bal,
                created_at=now() - timedelta(days=i),
            ))

        shop_res = await db.execute(select(ShopItem).limit(40))
        shop_items = shop_res.scalars().all()
        equipped_categories = set()
        for item in shop_items[:8]:
            equip = False
            cat = item.category.value if hasattr(item.category, "value") else item.category
            if cat in ("theme", "background", "frame", "clothing", "hairstyle", "face") \
               and cat not in equipped_categories:
                equip = True
                equipped_categories.add(cat)
            db.add(InventoryItem(
                id=uuid.uuid4(),
                user_id=main_user.id,
                shop_item_id=item.id,
                quantity=1,
                is_equipped=equip,
                purchased_at=now() - timedelta(days=random.randint(1, 20)),
            ))

        posts_spec = [
            "Только что закрыл легендарную цель — проект почти готов! 🚀🔥",
            "17 дней стрика подряд. Дисциплина решает 💪",
            "Сегодня выбил новый ранг — Legend. Кто со мной в ивент? 🏆",
        ]
        feed_posts = []
        for i, content in enumerate(posts_spec):
            p = Post(
                id=uuid.uuid4(),
                user_id=main_user.id,
                content=content,
                visibility=PostVisibility.public,
                created_at=now() - timedelta(hours=i * 5 + 1),
            )
            db.add(p)
            feed_posts.append(p)
        await db.flush()

        comments_pool = [
            "Огонь! 🔥", "Так держать 💪", "Вдохновляешь!",
            "Я в деле 🙌", "Красавчик", "Это мощно 👏",
        ]
        for p in feed_posts:
            for fu in friend_users:
                db.add(PostReaction(
                    id=uuid.uuid4(),
                    post_id=p.id,
                    user_id=fu.id,
                    reaction_type="like",
                    created_at=now(),
                ))
            db.add(PostComment(
                id=uuid.uuid4(),
                post_id=p.id,
                user_id=random.choice(friend_users).id,
                content=random.choice(comments_pool),
                created_at=now(),
            ))

        friend_post = Post(
            id=uuid.uuid4(),
            user_id=friend_users[0].id,
            content="Утренняя пробежка 8 км. Доброе утро, чемпионы! 🏃‍♂️",
            visibility=PostVisibility.public,
            created_at=now() - timedelta(hours=3),
        )
        db.add(friend_post)
        await db.flush()
        db.add(PostComment(
            id=uuid.uuid4(),
            post_id=friend_post.id,
            user_id=main_user.id,
            content="Респект! Завтра присоединюсь 💪",
            created_at=now(),
        ))
        db.add(PostReaction(
            id=uuid.uuid4(),
            post_id=friend_post.id,
            user_id=main_user.id,
            reaction_type="like",
            created_at=now(),
        ))

        challenge = Challenge(
            id=uuid.uuid4(),
            creator_id=main_user.id,
            title="30 дней дисциплины 🔥",
            description="Ежедневные задачи на силу воли. Лучшие забирают банк.",
            banner_emoji="🔥",
            challenge_type=ChallengeType.public,
            status=ChallengeStatus.active,
            initial_stake_credits=100,
            entry_fee_credits=50,
            prize_pool_credits=250,
            starts_at=now() - timedelta(days=3),
            ends_at=now() + timedelta(days=27),
            created_at=now() - timedelta(days=3),
        )
        db.add(challenge)
        await db.flush()

        ch_tasks = [
            ("Зарядка с утра", 25, 10),
            ("Чтение 30 мин", 25, 10),
            ("Без соцсетей до обеда", 50, 20),
        ]
        for idx, (t, xp, score) in enumerate(ch_tasks):
            db.add(ChallengeTask(
                id=uuid.uuid4(),
                challenge_id=challenge.id,
                title=t,
                xp_reward=xp,
                duration_minutes=15,
                repeat_type=TaskRepeatType.daily,
                score_value=score,
                order_index=idx,
            ))

        participants_data = [
            (main_user, 180, True),
            (friend_users[0], 150, True),
            (friend_users[1], 210, True),
        ]
        for u, score, paid in participants_data:
            db.add(ChallengeParticipant(
                id=uuid.uuid4(),
                challenge_id=challenge.id,
                user_id=u.id,
                score=score,
                fee_paid=paid,
                joined_at=now() - timedelta(days=3),
            ))

        ch_post = ChallengePost(
            id=uuid.uuid4(),
            challenge_id=challenge.id,
            user_id=main_user.id,
            content="День 3 закрыт полностью! Кто отстаёт — подтягивайтесь 😏",
            created_at=now() - timedelta(hours=2),
        )
        db.add(ch_post)
        await db.flush()
        db.add(ChallengePostReaction(
            id=uuid.uuid4(),
            post_id=ch_post.id,
            user_id=friend_users[0].id,
            emoji=PostReactionEmoji.fire,
            created_at=now(),
        ))
        db.add(ChallengePostComment(
            id=uuid.uuid4(),
            post_id=ch_post.id,
            user_id=friend_users[1].id,
            content="Догоняю! 🔥",
            created_at=now(),
        ))

        notif_specs = [
            (NotificationType.POST_LIKED, friend_users[0].id, "Алекс оценил ваш пост"),
            (NotificationType.POST_COMMENTED, friend_users[1].id, "Мира прокомментировала ваш пост"),
            (NotificationType.PING_RECEIVED, friend_users[0].id, "Алекс отправил вам пинг 💪"),
            (NotificationType.RANK_UP, None, "Новый ранг: Legend!"),
        ]
        for i, (ntype, actor, text) in enumerate(notif_specs):
            db.add(Notification(
                id=uuid.uuid4(),
                user_id=main_user.id,
                type=ntype,
                actor_user_id=actor,
                payload=json.dumps({"text": text}, ensure_ascii=False),
                is_read=(i >= 2),
                created_at=now() - timedelta(hours=i),
            ))

        db.add(MotivationalPing(
            id=uuid.uuid4(),
            sender_id=friend_users[0].id,
            receiver_id=main_user.id,
            message="Не сбавляй темп! 💪",
            is_read=False,
            created_at=now() - timedelta(hours=1),
        ))

        await db.commit()

        print("\n" + "=" * 50)
        print("✅ ДЕМО-ДАННЫЕ СОЗДАНЫ")
        print("=" * 50)
        print(f"  Вход:    {DEMO_EMAIL}")
        print(f"  Пароль:  {DEMO_PASSWORD}")
        print(f"  Друзья:  {', '.join(f['email'] for f in FRIENDS)} (пароль у всех demo1234)")
        print("=" * 50 + "\n")


if __name__ == "__main__":
    asyncio.run(seed())