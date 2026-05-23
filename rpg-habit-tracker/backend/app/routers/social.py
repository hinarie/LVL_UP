from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, or_, and_
from datetime import datetime
import uuid

from app.database import get_db
from app.models.user import User
from app.models.social import Post, PostReaction, Friendship, FriendshipStatus, MotivationalPing
from app.models.challenges import ChallengePost
from app.models.character import Character
from app.schemas.social import PostCreate, FriendRequestCreate
from app.core.deps import get_current_user

router = APIRouter(prefix="/social", tags=["social"])


def char_to_dict(char: Character) -> dict:
    if not char:
        return {}
    return {
        "character_name": char.character_name,
        "display_name": char.display_name,
        "level": char.level,
        "rank": char.rank.value,
        "avatar_url": char.avatar_url,
        "active_frame": char.active_frame,
        "current_streak": char.current_streak,
    }


def post_to_dict(post: Post, author_char: Character, liked: bool, likes: int) -> dict:
    return {
        "id": str(post.id),
        "content": post.content,
        "image_url": post.image_url,
        "visibility": post.visibility.value,
        "is_auto_generated": post.is_auto_generated,
        "auto_event_type": post.auto_event_type,
        "created_at": post.created_at,
        "author_id": str(post.user_id),
        "author": char_to_dict(author_char),
        "liked": liked,
        "likes": likes,
    }


@router.get("/feed")
async def get_feed(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Лента — публичные посты + посты друзей."""
    # ID друзей
    friends_result = await db.execute(
        select(Friendship).where(
            Friendship.status == FriendshipStatus.accepted,
            or_(
                Friendship.requester_id == current_user.id,
                Friendship.addressee_id == current_user.id,
            )
        )
    )
    friendships = friends_result.scalars().all()
    friend_ids = set()
    for f in friendships:
        if str(f.requester_id) == str(current_user.id):
            friend_ids.add(f.addressee_id)
        else:
            friend_ids.add(f.requester_id)

    # Посты: публичные + свои + от друзей
    posts_result = await db.execute(
        select(Post)
        .where(
            or_(
                Post.visibility == "public",
                Post.user_id == current_user.id,
                and_(
                    Post.user_id.in_(friend_ids),
                    Post.visibility.in_(["public", "friends"])
                )
            )
        )
        .order_by(Post.created_at.desc())
        .limit(50)
    )
    posts = posts_result.scalars().all()

    # Реакции текущего пользователя
    reactions_result = await db.execute(
        select(PostReaction).where(PostReaction.user_id == current_user.id)
    )
    liked_post_ids = {str(r.post_id) for r in reactions_result.scalars().all()}

    response = []
    seen_ids = set()
    for post in posts:
        char_result = await db.execute(
            select(Character).where(Character.user_id == post.user_id)
        )
        author_char = char_result.scalar_one_or_none()

        likes_result = await db.execute(
            select(PostReaction).where(PostReaction.post_id == post.id)
        )
        likes_count = len(likes_result.scalars().all())

        seen_ids.add(str(post.id))
        response.append(post_to_dict(
            post, author_char,
            liked=str(post.id) in liked_post_ids,
            likes=likes_count,
        ))

    return sorted(response, key=lambda p: str(p["created_at"]), reverse=True)


@router.post("/posts", status_code=201)
async def create_post(
    data: PostCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    post = Post(
        id=uuid.uuid4(),
        user_id=current_user.id,
        content=data.content,
        visibility=data.visibility,
        is_auto_generated=False,
    )
    db.add(post)
    await db.commit()
    await db.refresh(post)

    char_result = await db.execute(
        select(Character).where(Character.user_id == current_user.id)
    )
    char = char_result.scalar_one_or_none()
    return post_to_dict(post, char, liked=False, likes=0)


@router.post("/posts/{post_id}/like")
async def toggle_like(
    post_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    existing = await db.execute(
        select(PostReaction).where(
            PostReaction.post_id == post_id,
            PostReaction.user_id == current_user.id,
        )
    )
    reaction = existing.scalar_one_or_none()

    if reaction:
        await db.delete(reaction)
        liked = False
    else:
        reaction = PostReaction(
            id=uuid.uuid4(),
            post_id=post_id,
            user_id=current_user.id,
            reaction_type="like",
        )
        db.add(reaction)
        liked = True

    await db.commit()
    return {"liked": liked}


@router.delete("/posts/{post_id}")
async def delete_post(
    post_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Post).where(Post.id == post_id, Post.user_id == current_user.id)
    )
    post = result.scalar_one_or_none()
    if not post:
        raise HTTPException(status_code=404, detail="Пост не найден")
    await db.delete(post)
    await db.commit()
    return {"message": "Пост удалён"}


@router.post("/friends/request")
async def send_friend_request(
    data: FriendRequestCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    target_result = await db.execute(
        select(User).where(User.email == data.addressee_email)
    )
    target = target_result.scalar_one_or_none()
    if not target:
        raise HTTPException(status_code=404, detail="Пользователь не найден")
    if str(target.id) == str(current_user.id):
        raise HTTPException(status_code=400, detail="Нельзя добавить себя")

    existing = await db.execute(
        select(Friendship).where(
            or_(
                and_(Friendship.requester_id == current_user.id, Friendship.addressee_id == target.id),
                and_(Friendship.requester_id == target.id, Friendship.addressee_id == current_user.id),
            )
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Запрос уже отправлен или вы уже друзья")

    friendship = Friendship(
        id=uuid.uuid4(),
        requester_id=current_user.id,
        addressee_id=target.id,
        status=FriendshipStatus.pending,
    )
    db.add(friendship)
    await db.commit()
    return {"message": f"Запрос отправлен пользователю {data.addressee_email}"}


@router.get("/friends/requests")
async def get_friend_requests(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Friendship).where(
            Friendship.addressee_id == current_user.id,
            Friendship.status == FriendshipStatus.pending,
        )
    )
    requests = result.scalars().all()
    response = []
    for req in requests:
        char_result = await db.execute(
            select(Character).where(Character.user_id == req.requester_id)
        )
        char = char_result.scalar_one_or_none()
        user_result = await db.execute(select(User).where(User.id == req.requester_id))
        user = user_result.scalar_one_or_none()
        response.append({
            "id": str(req.id),
            "requester_email": user.email if user else "",
            "requester": char_to_dict(char),
            "created_at": req.created_at,
        })
    return response


@router.post("/friends/{friendship_id}/accept")
async def accept_friend(
    friendship_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Friendship).where(
            Friendship.id == friendship_id,
            Friendship.addressee_id == current_user.id,
        )
    )
    friendship = result.scalar_one_or_none()
    if not friendship:
        raise HTTPException(status_code=404, detail="Запрос не найден")
    friendship.status = FriendshipStatus.accepted
    await db.commit()
    return {"message": "Запрос принят! Теперь вы друзья 🎉"}


@router.post("/friends/{friendship_id}/decline")
async def decline_friend(
    friendship_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Friendship).where(
            Friendship.id == friendship_id,
            Friendship.addressee_id == current_user.id,
        )
    )
    friendship = result.scalar_one_or_none()
    if not friendship:
        raise HTTPException(status_code=404, detail="Запрос не найден")
    friendship.status = FriendshipStatus.declined
    await db.commit()
    return {"message": "Запрос отклонён"}


@router.get("/friends")
async def get_friends(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Friendship).where(
            Friendship.status == FriendshipStatus.accepted,
            or_(
                Friendship.requester_id == current_user.id,
                Friendship.addressee_id == current_user.id,
            )
        )
    )
    friendships = result.scalars().all()
    response = []
    for f in friendships:
        friend_id = f.addressee_id if str(f.requester_id) == str(current_user.id) else f.requester_id
        char_result = await db.execute(select(Character).where(Character.user_id == friend_id))
        char = char_result.scalar_one_or_none()
        user_result = await db.execute(select(User).where(User.id == friend_id))
        user = user_result.scalar_one_or_none()
        response.append({
            "friendship_id": str(f.id),
            "user_id": str(friend_id),
            "email": user.email if user else "",
            "character": char_to_dict(char),
        })
    return response


@router.post("/ping/{user_id}")
async def send_ping(
    user_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    ping = MotivationalPing(
        id=uuid.uuid4(),
        sender_id=current_user.id,
        receiver_id=user_id,
        message="Ты справишься! 💪",
    )
    db.add(ping)
    await db.commit()
    return {"message": "Мотивационный пинг отправлен! 💪"}


@router.get("/profile")
async def get_my_profile(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    char_result = await db.execute(
        select(Character).where(Character.user_id == current_user.id)
    )
    char = char_result.scalar_one_or_none()

    posts_result = await db.execute(
        select(Post)
        .where(Post.user_id == current_user.id)
        .order_by(Post.created_at.desc())
        .limit(20)
    )
    posts = posts_result.scalars().all()

    friends_result = await db.execute(
        select(Friendship).where(
            Friendship.status == FriendshipStatus.accepted,
            or_(
                Friendship.requester_id == current_user.id,
                Friendship.addressee_id == current_user.id,
            )
        )
    )
    friends_count = len(friends_result.scalars().all())

    post_list = []
    for post in posts:
        likes_result = await db.execute(
            select(PostReaction).where(PostReaction.post_id == post.id)
        )
        likes = len(likes_result.scalars().all())
        post_list.append(post_to_dict(post, char, liked=False, likes=likes))

    # Добавляем посты из ивентов (cross_posted=True — пользователь сам выбрал)
    ch_posts_result = await db.execute(
        select(ChallengePost).where(
            ChallengePost.user_id == current_user.id,
            ChallengePost.cross_posted == True,  # noqa
            ChallengePost.is_auto_generated == False,  # noqa
        ).order_by(ChallengePost.created_at.desc()).limit(20)
    )
    for cp in ch_posts_result.scalars().all():
        # Проверяем что такого поста нет уже (через cross_post_id)
        already = any(str(p.get("id")) == str(cp.cross_post_id) for p in post_list)
        if already:
            continue
        post_list.append({
            "id": str(cp.id),
            "content": cp.content,
            "image_url": cp.image_url,
            "visibility": "public",
            "is_auto_generated": False,
            "auto_event_type": None,
            "created_at": cp.created_at,
            "author_id": str(cp.user_id),
            "author": char_to_dict(char),
            "liked": False,
            "likes": 0,
            "from_challenge": True,
        })

    post_list.sort(key=lambda p: str(p["created_at"]), reverse=True)

    return {
        "user": {"id": str(current_user.id), "email": current_user.email},
        "character": char_to_dict(char),
        "friends_count": friends_count,
        "posts": post_list,
    }