from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_
from datetime import datetime, date, timedelta
import uuid
import secrets
import json

from app.database import get_db
from app.models.user import User
from app.models.challenges import (
    Challenge, ChallengeTask, ChallengeTaskCompletion,
    ChallengeParticipant, ChallengePost, ChallengePostReaction,
    ChallengeStatus, ChallengeType, RANK_ORDER,
)
from app.models.character import Character
from app.models.transactions import CreditTransaction, CreditSource, XPTransaction, XPSource
from app.models.social import Post, PostVisibility
from app.schemas.challenges import (
    ChallengeCreate, ChallengePostCreate, ReactionCreate,
)
from app.core.deps import get_current_user
from app.services.xp_service import award_xp

router = APIRouter(prefix="/challenges", tags=["challenges"])

ARCHIVE_DELETE_DAYS = 30

def _challenge_dict(ch: Challenge, participants: list, user_id=None) -> dict:
    participant = next((p for p in participants if str(p.user_id) == str(user_id)), None)
    return {
        "id": str(ch.id),
        "title": ch.title,
        "description": ch.description,
        "banner_emoji": ch.banner_emoji,
        "challenge_type": ch.challenge_type.value,
        "status": ch.status.value,
        "required_rank": ch.required_rank,
        "initial_stake_credits": ch.initial_stake_credits,
        "entry_fee_credits": ch.entry_fee_credits,
        "prize_pool_credits": ch.prize_pool_credits,
        "prize_split": {
            "1st": ch.prize_split_1st,
            "2nd": ch.prize_split_2nd,
            "3rd": ch.prize_split_3rd,
        },
        "starts_at": ch.starts_at.isoformat(),
        "ends_at": ch.ends_at.isoformat(),
        "creator_id": str(ch.creator_id),
        "invite_code": ch.invite_code if str(ch.creator_id) == str(user_id) else None,
        "participants_count": len(participants),
        "joined": participant is not None,
        "my_score": participant.score if participant else 0,
        "created_at": ch.created_at.isoformat(),
    }

def _task_dict(task: ChallengeTask, today_completion=None) -> dict:
    now_hour = datetime.utcnow().hour
    in_window = True
    if task.available_from_hour is not None and task.available_until_hour is not None:
        in_window = task.available_from_hour <= now_hour < task.available_until_hour

    return {
        "id": str(task.id),
        "title": task.title,
        "description": task.description,
        "xp_reward": task.xp_reward,
        "duration_minutes": task.duration_minutes,
        "available_from_hour": task.available_from_hour,
        "available_until_hour": task.available_until_hour,
        "in_window": in_window,
        "repeat_type": task.repeat_type.value,
        "score_value": task.score_value,
        "order_index": task.order_index,
        "completion": {
            "id": str(today_completion.id) if today_completion else None,
            "timer_started_at": today_completion.timer_started_at.isoformat()
                                if today_completion and today_completion.timer_started_at else None,
            "completed_at": today_completion.completed_at.isoformat()
                            if today_completion and today_completion.completed_at else None,
            "xp_granted": today_completion.xp_granted if today_completion else False,
        } if True else None,
    }

def _participant_dict(p: ChallengeParticipant, char: Character, position: int,
                      is_me: bool) -> dict:
    now = datetime.utcnow()
    cooldown_sec = max(0, int((p.cooldown_until - now).total_seconds())) if p.cooldown_until and p.cooldown_until > now else 0
    return {
        "user_id": str(p.user_id),
        "position": position,
        "is_me": is_me,
        "score": p.score,
        "final_rank": p.final_rank,
        "prize_earned": p.prize_earned,
        "joined_at": p.joined_at.isoformat(),
        "cooldown_sec": cooldown_sec,
        "character": {
            "name": char.character_name if char else "Герой",
            "level": char.level if char else 1,
            "rank": char.rank.value if char else "Warrior",
            "avatar_url": char.avatar_url if char else None,
        },
    }

def _post_dict(post: ChallengePost, char: Character, my_reactions: set,
               all_reactions: list = None) -> dict:
    reaction_counts = {}
    for r in (all_reactions or []):
        reaction_counts[r.emoji.value] = reaction_counts.get(r.emoji.value, 0) + 1
    return {
        "id": str(post.id),
        "content": post.content,
        "image_url": post.image_url,
        "cross_posted": post.cross_posted,
        "is_auto_generated": post.is_auto_generated,
        "auto_event_type": post.auto_event_type,
        "created_at": post.created_at.isoformat(),
        "author": {
            "user_id": str(post.user_id),
            "name": char.character_name if char else "Герой",
            "level": char.level if char else 1,
            "rank": char.rank.value if char else "Warrior",
            "avatar_url": char.avatar_url if char else None,
        },
        "reactions": reaction_counts,
        "my_reactions": list(my_reactions),
        "comments": [],
    }

async def _get_participant(db, challenge_id, user_id):
    res = await db.execute(
        select(ChallengeParticipant).where(
            ChallengeParticipant.challenge_id == challenge_id,
            ChallengeParticipant.user_id == user_id,
        )
    )
    return res.scalar_one_or_none()

async def _get_character(db, user_id):
    res = await db.execute(select(Character).where(Character.user_id == user_id))
    return res.scalar_one_or_none()

async def _get_challenge(db, challenge_id):
    res = await db.execute(select(Challenge).where(Challenge.id == challenge_id))
    return res.scalar_one_or_none()

@router.get("/")
async def get_challenges(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Challenge).order_by(Challenge.created_at.desc())
    )
    challenges = result.scalars().all()

    ch_ids = [ch.id for ch in challenges]
    if ch_ids:
        all_parts_result = await db.execute(
            select(ChallengeParticipant).where(ChallengeParticipant.challenge_id.in_(ch_ids))
        )
        all_participants = all_parts_result.scalars().all()
    else:
        all_participants = []

    parts_by_challenge = {}
    for p in all_participants:
        parts_by_challenge.setdefault(str(p.challenge_id), []).append(p)

    from app.models.social import Friendship, FriendshipStatus
    from sqlalchemy import or_

    friends_q = await db.execute(
        select(Friendship).where(
            Friendship.status == FriendshipStatus.accepted,
            or_(
                Friendship.requester_id == current_user.id,
                Friendship.addressee_id == current_user.id,
            )
        )
    )
    friend_ids = set()
    for f in friends_q.scalars().all():
        other = f.addressee_id if str(f.requester_id) == str(current_user.id) else f.requester_id
        friend_ids.add(str(other))

    response = []
    for ch in challenges:
        participants = parts_by_challenge.get(str(ch.id), [])
        is_creator = str(ch.creator_id) == str(current_user.id)
        is_public = ch.challenge_type == ChallengeType.public
        is_joined = any(str(p.user_id) == str(current_user.id) for p in participants)
        is_for_friends = ch.challenge_type.value == "friends"
        creator_is_friend = str(ch.creator_id) in friend_ids

        if is_public or is_creator or is_joined or (is_for_friends and creator_is_friend):
            response.append(_challenge_dict(ch, participants, current_user.id))

    return response

@router.get("/{challenge_id}")
async def get_challenge_detail(
    challenge_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    ch = await _get_challenge(db, challenge_id)
    if not ch:
        raise HTTPException(404, "Ивент не найден")

    parts_result = await db.execute(
        select(ChallengeParticipant).where(ChallengeParticipant.challenge_id == challenge_id)
    )
    participants = parts_result.scalars().all()

    is_joined = any(str(p.user_id) == str(current_user.id) for p in participants)
    is_creator = str(ch.creator_id) == str(current_user.id)

    my_participant = await _get_participant(db, challenge_id, current_user.id)
    today_start = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)

    tasks_result = await db.execute(
        select(ChallengeTask).where(ChallengeTask.challenge_id == challenge_id)
        .order_by(ChallengeTask.order_index)
    )
    tasks = tasks_result.scalars().all()

    tasks_out = []
    for task in tasks:
        today_comp = None
        if my_participant:
            comp_result = await db.execute(
                select(ChallengeTaskCompletion).where(
                    ChallengeTaskCompletion.challenge_task_id == task.id,
                    ChallengeTaskCompletion.participant_id == my_participant.id,
                    ChallengeTaskCompletion.completed_date >= today_start,
                )
            )
            today_comp = comp_result.scalar_one_or_none()
        tasks_out.append(_task_dict(task, today_comp))

    sorted_parts = sorted(participants, key=lambda p: p.score, reverse=True)
    leaderboard = []
    for i, p in enumerate(sorted_parts):
        char = await _get_character(db, p.user_id)
        leaderboard.append(_participant_dict(
            p, char, i + 1, str(p.user_id) == str(current_user.id)
        ))

    pool = ch.prize_pool_credits
    prize_preview = {
        "1st": int(pool * ch.prize_split_1st / 100),
        "2nd": int(pool * ch.prize_split_2nd / 100),
        "3rd": int(pool * ch.prize_split_3rd / 100),
    }

    posts_result = await db.execute(
        select(ChallengePost)
        .where(ChallengePost.challenge_id == challenge_id)
        .order_by(ChallengePost.created_at.desc())
        .limit(30)
    )
    posts = posts_result.scalars().all()

    post_ids = [p.id for p in posts]

    all_reactions_result = await db.execute(
        select(ChallengePostReaction).where(
            ChallengePostReaction.post_id.in_(post_ids)
        )
    )
    all_reactions = all_reactions_result.scalars().all()

    reactions_by_post = {}
    for r in all_reactions:
        reactions_by_post.setdefault(str(r.post_id), []).append(r)

    my_reactions_map = {}
    for r in all_reactions:
        if str(r.user_id) == str(current_user.id):
            my_reactions_map.setdefault(str(r.post_id), set()).add(r.emoji.value)

    from app.models.challenges import ChallengePostComment
    comments_result = await db.execute(
        select(ChallengePostComment).where(
            ChallengePostComment.post_id.in_(post_ids)
        ).order_by(ChallengePostComment.created_at)
    )
    all_comments = comments_result.scalars().all()

    comment_user_ids = list({str(c.user_id) for c in all_comments})
    comments_chars = {}
    for uid in comment_user_ids:
        from sqlalchemy import text as sql_text
        import uuid as _uuid
        char = await _get_character(db, _uuid.UUID(uid))
        if char:
            comments_chars[uid] = char.character_name

    comments_by_post = {}
    for c in all_comments:
        comments_by_post.setdefault(str(c.post_id), []).append({
            "id": str(c.id),
            "content": c.content,
            "user_id": str(c.user_id),
            "author_name": comments_chars.get(str(c.user_id), "Герой"),
            "created_at": c.created_at.isoformat(),
        })

    posts_out = []
    for post in posts:
        char = await _get_character(db, post.user_id)
        d = _post_dict(
            post, char,
            my_reactions=my_reactions_map.get(str(post.id), set()),
            all_reactions=reactions_by_post.get(str(post.id), []),
        )
        d["comments"] = comments_by_post.get(str(post.id), [])
        posts_out.append(d)

    return {
        "challenge": _challenge_dict(ch, participants, current_user.id),
        "is_joined": is_joined,
        "is_creator": is_creator,
        "tasks": tasks_out,
        "leaderboard": leaderboard,
        "prize_preview": prize_preview,
        "posts": posts_out,
    }

@router.post("/", status_code=201)
async def create_challenge(
    data: ChallengeCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    char = await _get_character(db, current_user.id)
    if not char:
        raise HTTPException(404, "Персонаж не найден")
    if char.credits < data.initial_stake_credits:
        raise HTTPException(400, f"Недостаточно кредитов. Нужно: {data.initial_stake_credits} ₡")

    entry_fee = data.initial_stake_credits // 2
    invite_code = secrets.token_urlsafe(8) if data.challenge_type.value == "private" else None

    starts_at = data.starts_at.replace(tzinfo=None)
    ends_at = data.ends_at.replace(tzinfo=None)

    from datetime import timedelta
    now = datetime.utcnow()
    initial_status = (
        ChallengeStatus.active
        if starts_at <= now + timedelta(minutes=2)
        else ChallengeStatus.upcoming
    )

    challenge = Challenge(
        id=uuid.uuid4(),
        creator_id=current_user.id,
        title=data.title,
        description=data.description,
        banner_emoji=data.banner_emoji,
        challenge_type=data.challenge_type,
        status=initial_status,
        required_rank=data.required_rank,
        initial_stake_credits=data.initial_stake_credits,
        entry_fee_credits=entry_fee,
        prize_pool_credits=data.initial_stake_credits,
        prize_split_1st=data.prize_split_1st,
        prize_split_2nd=data.prize_split_2nd,
        prize_split_3rd=data.prize_split_3rd,
        starts_at=starts_at,
        ends_at=ends_at,
        invite_code=invite_code,
    )
    db.add(challenge)

    for idx, task_data in enumerate(data.tasks):
        task = ChallengeTask(
            id=uuid.uuid4(),
            challenge_id=challenge.id,
            title=task_data.title,
            description=task_data.description,
            xp_reward=task_data.xp_reward,
            duration_minutes=task_data.duration_minutes,
            available_from_hour=task_data.available_from_hour,
            available_until_hour=task_data.available_until_hour,
            repeat_type=task_data.repeat_type,
            custom_days=getattr(task_data, 'custom_days', None),
            score_value=task_data.score_value,
            order_index=idx,
        )
        db.add(task)

    char.credits -= data.initial_stake_credits
    db.add(CreditTransaction(
        id=uuid.uuid4(),
        user_id=current_user.id,
        amount=-data.initial_stake_credits,
        source=CreditSource.challenge_entry,
        source_id=challenge.id,
        description=f"Ставка организатора: {data.title}",
        balance_after=char.credits,
    ))

    participant = ChallengeParticipant(
        id=uuid.uuid4(),
        challenge_id=challenge.id,
        user_id=current_user.id,
        score=0,
        fee_paid=True,
    )
    db.add(participant)

    await db.commit()
    await db.refresh(challenge)
    return _challenge_dict(challenge, [participant], current_user.id)

@router.post("/{challenge_id}/join")
async def join_challenge(
    challenge_id: str,
    invite_code: str | None = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    ch = await _get_challenge(db, challenge_id)
    if not ch:
        raise HTTPException(404, "Ивент не найден")
    if ch.status == ChallengeStatus.finished:
        raise HTTPException(400, "Ивент уже завершён")

    if ch.challenge_type == ChallengeType.private:
        if invite_code != ch.invite_code:
            raise HTTPException(403, "Неверный инвайт-код")

    char = await _get_character(db, current_user.id)
    if not char:
        raise HTTPException(404, "Персонаж не найден")

    if ch.required_rank:
        user_rank_order = RANK_ORDER.get(char.rank.value, 0)
        req_rank_order = RANK_ORDER.get(ch.required_rank, 0)
        if user_rank_order < req_rank_order:
            raise HTTPException(403, f"Требуется ранг {ch.required_rank} или выше")

    if await _get_participant(db, challenge_id, current_user.id):
        raise HTTPException(400, "Вы уже участвуете в этом ивенте")

    if char.credits < ch.entry_fee_credits:
        raise HTTPException(400, f"Недостаточно кредитов. Взнос: {ch.entry_fee_credits} ₡")

    char.credits -= ch.entry_fee_credits
    ch.prize_pool_credits += ch.entry_fee_credits

    db.add(CreditTransaction(
        id=uuid.uuid4(),
        user_id=current_user.id,
        amount=-ch.entry_fee_credits,
        source=CreditSource.challenge_entry,
        source_id=ch.id,
        description=f"Взнос: {ch.title}",
        balance_after=char.credits,
    ))

    participant = ChallengeParticipant(
        id=uuid.uuid4(),
        challenge_id=ch.id,
        user_id=current_user.id,
        score=0,
        fee_paid=True,
    )
    db.add(participant)
    await db.commit()

    return {
        "message": f"Вы вступили в ивент! Взнос: {ch.entry_fee_credits} ₡",
        "credits_left": char.credits,
        "prize_pool": ch.prize_pool_credits,
    }

@router.post("/{challenge_id}/tasks/{task_id}/start")
async def start_task_timer(
    challenge_id: str,
    task_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    ch = await _get_challenge(db, challenge_id)
    if not ch or ch.status != ChallengeStatus.active:
        raise HTTPException(400, "Ивент не активен")

    participant = await _get_participant(db, challenge_id, current_user.id)
    if not participant:
        raise HTTPException(403, "Вы не участвуете в этом ивенте")

    now = datetime.utcnow()
    if participant.cooldown_until and participant.cooldown_until > now:
        remaining = int((participant.cooldown_until - now).total_seconds())
        raise HTTPException(400, f"Cooldown: ещё {remaining} сек")

    task_result = await db.execute(
        select(ChallengeTask).where(
            ChallengeTask.id == task_id,
            ChallengeTask.challenge_id == challenge_id,
        )
    )
    task = task_result.scalar_one_or_none()
    if not task:
        raise HTTPException(404, "Задача не найдена")

    if task.available_from_hour is not None and task.available_until_hour is not None:
        hour = now.hour
        if not (task.available_from_hour <= hour < task.available_until_hour):
            raise HTTPException(400,
                f"Задача доступна с {task.available_from_hour}:00 до {task.available_until_hour}:00 UTC")

    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    if task.repeat_type.value == "daily":
        existing = await db.execute(
            select(ChallengeTaskCompletion).where(
                ChallengeTaskCompletion.challenge_task_id == task.id,
                ChallengeTaskCompletion.participant_id == participant.id,
                ChallengeTaskCompletion.completed_date >= today_start,
            )
        )
        if existing.scalar_one_or_none():
            raise HTTPException(400, "Задача уже выполнена сегодня")

    active_comp = await db.execute(
        select(ChallengeTaskCompletion).where(
            ChallengeTaskCompletion.challenge_task_id == task.id,
            ChallengeTaskCompletion.participant_id == participant.id,
            ChallengeTaskCompletion.completed_at == None,
        )
    )
    if active_comp.scalar_one_or_none():
        raise HTTPException(400, "Таймер уже запущен для этой задачи")

    completion = ChallengeTaskCompletion(
        id=uuid.uuid4(),
        challenge_task_id=task.id,
        participant_id=participant.id,
        user_id=current_user.id,
        completed_date=today_start,
        timer_started_at=now,
    )
    db.add(completion)
    await db.commit()
    await db.refresh(completion)

    return {
        "completion_id": str(completion.id),
        "timer_started_at": completion.timer_started_at.isoformat(),
        "duration_minutes": task.duration_minutes,
        "message": f"Таймер запущен! У вас {task.duration_minutes} мин",
    }

COOLDOWN_AFTER_TASK = 300

@router.post("/{challenge_id}/tasks/{task_id}/complete")
async def complete_task(
    challenge_id: str,
    task_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    ch = await _get_challenge(db, challenge_id)
    if not ch or ch.status != ChallengeStatus.active:
        raise HTTPException(400, "Ивент не активен")

    participant = await _get_participant(db, challenge_id, current_user.id)
    if not participant:
        raise HTTPException(403, "Вы не участвуете")

    comp_result = await db.execute(
        select(ChallengeTaskCompletion).where(
            ChallengeTaskCompletion.challenge_task_id == task_id,
            ChallengeTaskCompletion.participant_id == participant.id,
            ChallengeTaskCompletion.completed_at == None,
        )
    )
    completion = comp_result.scalar_one_or_none()
    if not completion:
        raise HTTPException(400, "Сначала запустите таймер")

    now = datetime.utcnow()
    if completion.timer_started_at:
        from datetime import timedelta
        task_result = await db.execute(
            select(ChallengeTask).where(ChallengeTask.id == task_id)
        )
        task = task_result.scalar_one_or_none()
        required = timedelta(minutes=task.duration_minutes)
        elapsed = now - completion.timer_started_at
        if elapsed < required:
            rem = int((required - elapsed).total_seconds())
            raise HTTPException(400, f"Рано! Осталось {rem // 60}:{rem % 60:02d}")

    completion.completed_at = now
    completion.xp_granted = True

    char = await _get_character(db, current_user.id)
    task_result = await db.execute(select(ChallengeTask).where(ChallengeTask.id == task_id))
    task = task_result.scalar_one_or_none()

    xp_result = await award_xp(
        db=db,
        character=char,
        amount=task.xp_reward,
        source=XPSource.challenge,
        source_id=task.id,
        description=f"Задача ивента: {task.title}",
    )

    participant.score += task.score_value

    from datetime import timedelta
    participant.cooldown_until = now + timedelta(seconds=COOLDOWN_AFTER_TASK)

    auto_post = ChallengePost(
        id=uuid.uuid4(),
        challenge_id=challenge_id,
        user_id=current_user.id,
        content=f"✅ Выполнил задачу «{task.title}»! +{task.xp_reward} XP",
        is_auto_generated=True,
        auto_event_type="task_done",
    )
    db.add(auto_post)

    await db.commit()

    return {
        "message": f"Задача выполнена! +{task.xp_reward} XP, +{task.score_value} очков",
        "xp_result": xp_result,
        "score": participant.score,
        "cooldown_sec": COOLDOWN_AFTER_TASK,
    }

@router.post("/{challenge_id}/posts", status_code=201)
async def create_post(
    challenge_id: str,
    data: ChallengePostCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    participant = await _get_participant(db, challenge_id, current_user.id)
    if not participant:
        raise HTTPException(403, "Только участники могут писать в ленту ивента")

    ch = await _get_challenge(db, challenge_id)
    if not ch:
        raise HTTPException(404, "Ивент не найден")
    if ch.status == ChallengeStatus.finished:
        raise HTTPException(403, "Ивент завершён — ленту можно только просматривать")

    post = ChallengePost(
        id=uuid.uuid4(),
        challenge_id=challenge_id,
        user_id=current_user.id,
        content=data.content,
        image_url=data.image_url,
        is_auto_generated=False,
    )
    db.add(post)

    if data.cross_post:
        global_post = Post(
            id=uuid.uuid4(),
            user_id=current_user.id,
            content=data.content,
            visibility=PostVisibility.public,
            is_auto_generated=False,
            auto_event_data=json.dumps({"challenge_title": ch.title}),
        )
        db.add(global_post)
        post.cross_posted = True
        post.cross_post_id = global_post.id

    await db.commit()
    await db.refresh(post)

    char = await _get_character(db, current_user.id)
    return _post_dict(post, char, my_reactions=set(), all_reactions=[])

@router.post("/{challenge_id}/posts/{post_id}/react")
async def toggle_reaction(
    challenge_id: str,
    post_id: str,
    data: ReactionCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    ch = await _get_challenge(db, challenge_id)
    if not ch:
        raise HTTPException(404, "Ивент не найден")
    if ch.status == ChallengeStatus.finished:
        raise HTTPException(403, "Ивент завершён — реакции недоступны")

    existing = await db.execute(
        select(ChallengePostReaction).where(
            ChallengePostReaction.post_id == post_id,
            ChallengePostReaction.user_id == current_user.id,
            ChallengePostReaction.emoji == data.emoji,
        )
    )
    reaction = existing.scalar_one_or_none()

    if reaction:
        await db.delete(reaction)
        added = False
    else:
        reaction = ChallengePostReaction(
            id=uuid.uuid4(),
            post_id=post_id,
            user_id=current_user.id,
            emoji=data.emoji,
        )
        db.add(reaction)
        added = True

    await db.commit()
    return {"added": added, "emoji": data.emoji.value}

@router.post("/{challenge_id}/posts/{post_id}/comments", status_code=201)
async def add_comment(
    challenge_id: str,
    post_id: str,
    data: dict,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    from app.models.challenges import ChallengePostComment
    content = (data.get("content") or "").strip()
    if not content or len(content) > 200:
        raise HTTPException(400, "Комментарий от 1 до 200 символов")

    participant = await _get_participant(db, challenge_id, current_user.id)
    if not participant:
        raise HTTPException(403, "Только участники могут комментировать")

    ch = await _get_challenge(db, challenge_id)
    if not ch:
        raise HTTPException(404, "Ивент не найден")
    if ch.status == ChallengeStatus.finished:
        raise HTTPException(403, "Ивент завершён — комментарии можно только просматривать")

    char = await _get_character(db, current_user.id)
    comment = ChallengePostComment(
        id=uuid.uuid4(),
        post_id=post_id,
        user_id=current_user.id,
        content=content,
    )
    db.add(comment)
    await db.commit()
    await db.refresh(comment)
    return {
        "id": str(comment.id),
        "content": comment.content,
        "user_id": str(comment.user_id),
        "author_name": char.character_name if char else "Герой",
        "created_at": comment.created_at.isoformat(),
    }

@router.delete("/{challenge_id}/posts/{post_id}")
async def delete_post(
    challenge_id: str,
    post_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    from app.models.challenges import ChallengePostComment

    res = await db.execute(select(ChallengePost).where(ChallengePost.id == post_id))
    post = res.scalar_one_or_none()
    if not post or str(post.challenge_id) != str(challenge_id):
        raise HTTPException(404, "Пост не найден")
    if str(post.user_id) != str(current_user.id):
        raise HTTPException(403, "Можно удалять только свои посты")

    if post.cross_post_id:
        gp_res = await db.execute(select(Post).where(Post.id == post.cross_post_id))
        gp = gp_res.scalar_one_or_none()
        if gp:
            await db.delete(gp)

    await db.execute(
        ChallengePostComment.__table__.delete().where(
            ChallengePostComment.post_id == post_id
        )
    )

    await db.delete(post)
    await db.commit()
    return {"deleted": True, "id": str(post_id)}

@router.delete("/{challenge_id}/posts/{post_id}/comments/{comment_id}")
async def delete_comment(
    challenge_id: str,
    post_id: str,
    comment_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    from app.models.challenges import ChallengePostComment

    res = await db.execute(
        select(ChallengePostComment).where(ChallengePostComment.id == comment_id)
    )
    comment = res.scalar_one_or_none()
    if not comment or str(comment.post_id) != str(post_id):
        raise HTTPException(404, "Комментарий не найден")
    if str(comment.user_id) != str(current_user.id):
        raise HTTPException(403, "Можно удалять только свои комментарии")

    await db.delete(comment)
    await db.commit()
    return {"deleted": True, "id": str(comment_id)}

@router.post("/{challenge_id}/finish")
async def finish_challenge(
    challenge_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    ch = await _get_challenge(db, challenge_id)
    if not ch or str(ch.creator_id) != str(current_user.id):
        raise HTTPException(404, "Ивент не найден или нет прав")
    if ch.status == ChallengeStatus.finished:
        raise HTTPException(400, "Уже завершён")

    parts_result = await db.execute(
        select(ChallengeParticipant)
        .where(ChallengeParticipant.challenge_id == challenge_id)
        .order_by(ChallengeParticipant.score.desc())
    )
    participants = parts_result.scalars().all()

    pool = ch.prize_pool_credits
    splits = [ch.prize_split_1st, ch.prize_split_2nd, ch.prize_split_3rd]

    results = []
    for i, p in enumerate(participants[:3]):
        prize = int(pool * splits[i] / 100) if i < len(splits) else 0
        p.final_rank = i + 1
        p.prize_earned = prize

        if prize > 0:
            char = await _get_character(db, p.user_id)
            if char:
                char.credits += prize
                db.add(CreditTransaction(
                    id=uuid.uuid4(),
                    user_id=p.user_id,
                    amount=prize,
                    source=CreditSource.challenge_prize,
                    source_id=ch.id,
                    description=f"Приз #{i+1}: {ch.title}",
                    balance_after=char.credits,
                ))

        results.append({"rank": i + 1, "prize": prize, "user_id": str(p.user_id)})

    ch.status = ChallengeStatus.finished

    if participants:
        winner_char = await _get_character(db, participants[0].user_id)
        winner_name = winner_char.character_name if winner_char else "Победитель"
        win_content = f"🏆 {winner_name} победил в ивенте «{ch.title}»!"

        global_win = Post(
            id=uuid.uuid4(),
            user_id=participants[0].user_id,
            content=win_content,
            visibility=PostVisibility.public,
            is_auto_generated=True,
            auto_event_type="challenge_win",
            auto_event_data=json.dumps({"challenge_title": ch.title}),
        )
        db.add(global_win)

        auto = ChallengePost(
            id=uuid.uuid4(),
            challenge_id=challenge_id,
            user_id=participants[0].user_id,
            content=win_content,
            is_auto_generated=True,
            auto_event_type="winner",
            cross_posted=True,
            cross_post_id=global_win.id,
        )
        db.add(auto)

    await db.commit()
    return {"message": "Ивент завершён! Призы выданы.", "results": results}

@router.post("/admin/tick")
async def tick_challenge_statuses(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    now = datetime.utcnow()
    result = await db.execute(select(Challenge))
    challenges = result.scalars().all()
    updated = []

    for ch in challenges:
        if ch.status == ChallengeStatus.upcoming and ch.starts_at <= now:
            ch.status = ChallengeStatus.active
            updated.append(str(ch.id))
        elif ch.status == ChallengeStatus.active and ch.ends_at <= now:
            ch.status = ChallengeStatus.finished
            updated.append(str(ch.id))

    deleted = []
    cutoff = now - timedelta(days=ARCHIVE_DELETE_DAYS)
    old_result = await db.execute(
        select(Challenge).where(
            Challenge.status == ChallengeStatus.finished,
            Challenge.ends_at <= cutoff,
        )
    )
    old_challenges = old_result.scalars().all()
    for ch in old_challenges:
        await _purge_challenge(db, ch)
        deleted.append(str(ch.id))

    await db.commit()
    return {"updated": updated, "deleted": deleted}

async def _purge_challenge(db, ch: Challenge):
    from app.models.challenges import ChallengePostComment

    posts_res = await db.execute(
        select(ChallengePost.id).where(ChallengePost.challenge_id == ch.id)
    )
    post_ids = [row[0] for row in posts_res.all()]

    if post_ids:
        await db.execute(
            ChallengePostComment.__table__.delete().where(
                ChallengePostComment.post_id.in_(post_ids)
            )
        )

    await db.delete(ch)