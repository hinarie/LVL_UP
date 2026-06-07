from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, or_, and_
from datetime import datetime
import uuid

from app.database import get_db
from app.models.user import User
from app.models.social import Post, PostReaction, PostComment, Friendship, FriendshipStatus, MotivationalPing
from app.models.challenges import ChallengePost
from app.models.character import Character
from app.schemas.social import PostCreate, FriendRequestCreate
from app.core.deps import get_current_user
from app.services import notification_service as notif_svc

router = APIRouter(prefix="/social", tags=["social"])

def char_to_dict(char: Character, user: User = None) -> dict:
    if not char:
        return {}
    return {
        "character_name": char.character_name,
        "display_name": char.display_name,
        "username": user.username if user else None,
        "level": char.level,
        "rank": char.rank.value,
        "avatar_url": char.avatar_url,
        "active_frame": char.active_frame,
        "current_streak": char.current_streak,
    }

async def _actor_name(db: AsyncSession, user: User) -> str:
    ch_res = await db.execute(select(Character).where(Character.user_id == user.id))
    ch = ch_res.scalar_one_or_none()
    if ch and ch.display_name:
        return ch.display_name
    return user.username or "Герой"

def post_to_dict(post: Post, author_char: Character, my_reaction=None,
                 likes: int = 0, dislikes: int = 0, comments_count: int = 0,
                 author_user: User = None) -> dict:
    return {
        "id": str(post.id),
        "content": post.content,
        "image_url": post.image_url,
        "visibility": post.visibility.value,
        "is_auto_generated": post.is_auto_generated,
        "auto_event_type": post.auto_event_type,
        "auto_event_data": post.auto_event_data,
        "created_at": post.created_at,
        "author_id": str(post.user_id),
        "author": char_to_dict(author_char, author_user),
        "my_reaction": my_reaction,
        "liked": my_reaction == "like",
        "likes": likes,
        "dislikes": dislikes,
        "comments_count": comments_count,
    }

@router.get("/feed")
async def get_feed(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
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

    post_ids = [p.id for p in posts]

    my_react_result = await db.execute(
        select(PostReaction).where(
            PostReaction.user_id == current_user.id,
            PostReaction.post_id.in_(post_ids),
        )
    )
    my_reaction_by_post = {str(r.post_id): r.reaction_type for r in my_react_result.scalars().all()}

    all_react_result = await db.execute(
        select(PostReaction).where(PostReaction.post_id.in_(post_ids))
    )
    likes_by_post, dislikes_by_post = {}, {}
    for r in all_react_result.scalars().all():
        if r.reaction_type == "dislike":
            dislikes_by_post[str(r.post_id)] = dislikes_by_post.get(str(r.post_id), 0) + 1
        else:
            likes_by_post[str(r.post_id)] = likes_by_post.get(str(r.post_id), 0) + 1

    comments_result = await db.execute(
        select(PostComment).where(PostComment.post_id.in_(post_ids))
    )
    comments_by_post = {}
    for c in comments_result.scalars().all():
        comments_by_post[str(c.post_id)] = comments_by_post.get(str(c.post_id), 0) + 1

    author_user_ids = list({p.user_id for p in posts})
    chars_result = await db.execute(
        select(Character).where(Character.user_id.in_(author_user_ids))
    )
    char_by_uid = {str(c.user_id): c for c in chars_result.scalars().all()}

    users_result = await db.execute(
        select(User).where(User.id.in_(author_user_ids))
    )
    user_by_uid = {str(u.id): u for u in users_result.scalars().all()}

    response = []
    for post in posts:
        uid = str(post.user_id)
        author_char = char_by_uid.get(uid)
        author_user = user_by_uid.get(uid)
        pid = str(post.id)
        response.append(post_to_dict(
            post, author_char,
            my_reaction=my_reaction_by_post.get(pid),
            likes=likes_by_post.get(pid, 0),
            dislikes=dislikes_by_post.get(pid, 0),
            comments_count=comments_by_post.get(pid, 0),
            author_user=author_user,
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
    return post_to_dict(post, char, my_reaction=None, likes=0, dislikes=0, comments_count=0,
                        author_user=current_user)

async def _apply_reaction(db, post_id, user_id, rtype: str) -> dict:
    if rtype not in ("like", "dislike"):
        raise HTTPException(400, "Неверный тип реакции")

    existing = await db.execute(
        select(PostReaction).where(
            PostReaction.post_id == post_id,
            PostReaction.user_id == user_id,
        )
    )
    reaction = existing.scalar_one_or_none()

    my_reaction = None
    became_like = False
    if reaction is None:
        db.add(PostReaction(
            id=uuid.uuid4(), post_id=post_id, user_id=user_id, reaction_type=rtype,
        ))
        my_reaction = rtype
        became_like = (rtype == "like")
    elif reaction.reaction_type == rtype:
        await db.delete(reaction)
        my_reaction = None
    else:
        reaction.reaction_type = rtype
        my_reaction = rtype
        became_like = (rtype == "like")

    if became_like:
        post_res = await db.execute(select(Post).where(Post.id == post_id))
        post = post_res.scalar_one_or_none()
        if post and str(post.user_id) != str(user_id):
            liker_res = await db.execute(select(User).where(User.id == user_id))
            liker = liker_res.scalar_one_or_none()
            if liker:
                liker_name = await _actor_name(db, liker)
                await notif_svc.notify_post_liked(
                    db,
                    post_owner_id=post.user_id,
                    liker_id=user_id,
                    liker_username=liker.username,
                    liker_name=liker_name,
                    post_id=post_id,
                    post_preview=(post.content or "")[:80],
                )

    await db.commit()

    all_r = await db.execute(select(PostReaction).where(PostReaction.post_id == post_id))
    likes = dislikes = 0
    for r in all_r.scalars().all():
        if r.reaction_type == "dislike":
            dislikes += 1
        else:
            likes += 1
    return {"my_reaction": my_reaction, "liked": my_reaction == "like",
            "likes": likes, "dislikes": dislikes}

@router.post("/posts/{post_id}/react")
async def react_post(
    post_id: str,
    data: dict,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    rtype = (data or {}).get("type", "like")
    return await _apply_reaction(db, post_id, current_user.id, rtype)

@router.post("/posts/{post_id}/like")
async def toggle_like(
    post_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return await _apply_reaction(db, post_id, current_user.id, "like")

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

@router.get("/posts/{post_id}/comments")
async def list_comments(
    post_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    res = await db.execute(
        select(PostComment).where(PostComment.post_id == post_id)
        .order_by(PostComment.created_at)
    )
    comments = res.scalars().all()

    author_ids = list({c.user_id for c in comments})
    info = {}
    if author_ids:
        chars_res = await db.execute(
            select(Character).where(Character.user_id.in_(author_ids))
        )
        for ch in chars_res.scalars().all():
            info[str(ch.user_id)] = {
                "name": ch.character_name,
                "display_name": ch.display_name,
                "level": ch.level,
                "avatar_url": ch.avatar_url,
            }
        users_res = await db.execute(
            select(User).where(User.id.in_(author_ids))
        )
        for u in users_res.scalars().all():
            entry = info.setdefault(str(u.id), {})
            entry["username"] = u.username

    return [{
        "id": str(c.id),
        "content": c.content,
        "user_id": str(c.user_id),
        "author_name": info.get(str(c.user_id), {}).get("name", "Герой"),
        "author_display_name": info.get(str(c.user_id), {}).get("display_name", "Герой"),
        "author_username": info.get(str(c.user_id), {}).get("username"),
        "author_level": info.get(str(c.user_id), {}).get("level", 1),
        "author_avatar_url": info.get(str(c.user_id), {}).get("avatar_url"),
        "created_at": c.created_at,
    } for c in comments]

@router.post("/posts/{post_id}/comments", status_code=201)
async def add_comment(
    post_id: str,
    data: dict,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    content = (data.get("content") or "").strip()
    if not content or len(content) > 300:
        raise HTTPException(400, "Комментарий от 1 до 300 символов")

    post_res = await db.execute(select(Post).where(Post.id == post_id))
    post = post_res.scalar_one_or_none()
    if not post:
        raise HTTPException(404, "Пост не найден")

    comment = PostComment(
        id=uuid.uuid4(),
        post_id=post_id,
        user_id=current_user.id,
        content=content,
    )
    db.add(comment)

    if str(post.user_id) != str(current_user.id):
        commenter_name = await _actor_name(db, current_user)
        await notif_svc.notify_post_commented(
            db,
            post_owner_id=post.user_id,
            commenter_id=current_user.id,
            commenter_username=current_user.username,
            commenter_name=commenter_name,
            post_id=post_id,
            comment_preview=content,
        )

    await db.commit()
    await db.refresh(comment)

    ch = await db.execute(select(Character).where(Character.user_id == current_user.id))
    char = ch.scalar_one_or_none()
    return {
        "id": str(comment.id),
        "content": comment.content,
        "user_id": str(comment.user_id),
        "author_name": char.character_name if char else "Герой",
        "author_display_name": char.display_name if char else "Герой",
        "author_username": current_user.username,
        "author_level": char.level if char else 1,
        "author_avatar_url": char.avatar_url if char else None,
        "created_at": comment.created_at,
    }

@router.delete("/posts/{post_id}/comments/{comment_id}")
async def delete_comment(
    post_id: str,
    comment_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    res = await db.execute(select(PostComment).where(PostComment.id == comment_id))
    comment = res.scalar_one_or_none()
    if not comment or str(comment.post_id) != str(post_id):
        raise HTTPException(404, "Комментарий не найден")
    if str(comment.user_id) != str(current_user.id):
        raise HTTPException(403, "Можно удалять только свои комментарии")
    await db.delete(comment)
    await db.commit()
    return {"deleted": True, "id": str(comment_id)}

@router.post("/friends/request")
async def send_friend_request(
    data: dict,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    target = None

    email = (data.get("addressee_email") or "").strip().lower()
    username = (data.get("username") or "").strip().lower()

    if username:
        r = await db.execute(select(User).where(User.username == username))
        target = r.scalar_one_or_none()
    elif email:
        r = await db.execute(select(User).where(User.email == email))
        target = r.scalar_one_or_none()
    else:
        raise HTTPException(400, "Укажите email или username")

    if not target:
        raise HTTPException(404, "Пользователь не найден")
    if str(target.id) == str(current_user.id):
        raise HTTPException(400, "Нельзя добавить себя")

    existing = await db.execute(
        select(Friendship).where(
            or_(
                and_(Friendship.requester_id == current_user.id, Friendship.addressee_id == target.id),
                and_(Friendship.requester_id == target.id, Friendship.addressee_id == current_user.id),
            )
        )
    )
    fr = existing.scalar_one_or_none()
    if fr:
        if fr.status == FriendshipStatus.accepted:
            raise HTTPException(400, "Вы уже друзья")
        if fr.status == FriendshipStatus.pending:
            raise HTTPException(400, "Запрос уже отправлен")
        await db.delete(fr)
        await db.flush()

    friendship = Friendship(
        id=uuid.uuid4(),
        requester_id=current_user.id,
        addressee_id=target.id,
        status=FriendshipStatus.pending,
    )
    db.add(friendship)

    sender_name = await _actor_name(db, current_user)
    await notif_svc.notify_friend_request(
        db,
        receiver_id=target.id,
        sender_id=current_user.id,
        sender_username=current_user.username,
        sender_name=sender_name,
    )

    await db.commit()
    label = username or email
    return {"message": f"Запрос отправлен пользователю {label}"}

@router.post("/friends/cancel")
async def cancel_friend_request(
    data: dict,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    username = (data.get("username") or "").strip().lower()
    user_id = data.get("user_id")
    target = None
    if username:
        r = await db.execute(select(User).where(User.username == username))
        target = r.scalar_one_or_none()
    elif user_id:
        r = await db.execute(select(User).where(User.id == user_id))
        target = r.scalar_one_or_none()
    if not target:
        raise HTTPException(404, "Пользователь не найден")

    fr_res = await db.execute(
        select(Friendship).where(
            Friendship.requester_id == current_user.id,
            Friendship.addressee_id == target.id,
            Friendship.status == FriendshipStatus.pending,
        )
    )
    fr = fr_res.scalar_one_or_none()
    if not fr:
        raise HTTPException(404, "Активный запрос не найден")
    await db.delete(fr)
    await db.commit()
    return {"message": "Запрос отменён"}

@router.post("/friends/remove")
async def remove_friend(
    data: dict,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    username = (data.get("username") or "").strip().lower()
    user_id = data.get("user_id")
    target = None
    if username:
        r = await db.execute(select(User).where(User.username == username))
        target = r.scalar_one_or_none()
    elif user_id:
        r = await db.execute(select(User).where(User.id == user_id))
        target = r.scalar_one_or_none()
    if not target:
        raise HTTPException(404, "Пользователь не найден")

    fr_res = await db.execute(
        select(Friendship).where(
            or_(
                and_(Friendship.requester_id == current_user.id, Friendship.addressee_id == target.id),
                and_(Friendship.requester_id == target.id, Friendship.addressee_id == current_user.id),
            ),
            Friendship.status == FriendshipStatus.accepted,
        )
    )
    fr = fr_res.scalar_one_or_none()
    if not fr:
        raise HTTPException(404, "Вы не друзья")
    await db.delete(fr)
    await db.commit()
    return {"message": "Удалён из друзей"}

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
            "requester": char_to_dict(char, user),
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

    accepter_name = await _actor_name(db, current_user)
    await notif_svc.notify_friend_accepted(
        db,
        receiver_id=friendship.requester_id,
        accepter_id=current_user.id,
        accepter_username=current_user.username,
        accepter_name=accepter_name,
    )

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
            "username": user.username if user else None,
            "character": char_to_dict(char, user),
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

    sender_name = await _actor_name(db, current_user)
    await notif_svc.notify_ping(
        db,
        receiver_id=user_id,
        sender_id=current_user.id,
        sender_username=current_user.username,
        sender_name=sender_name,
        message="Ты справишься! 💪",
    )

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
        all_r = await db.execute(select(PostReaction).where(PostReaction.post_id == post.id))
        likes = dislikes = 0
        my_reaction = None
        for r in all_r.scalars().all():
            if r.reaction_type == "dislike":
                dislikes += 1
            else:
                likes += 1
            if str(r.user_id) == str(current_user.id):
                my_reaction = r.reaction_type
        cc_res = await db.execute(select(PostComment).where(PostComment.post_id == post.id))
        comments_count = len(cc_res.scalars().all())
        post_list.append(post_to_dict(
            post, char, my_reaction=my_reaction,
            likes=likes, dislikes=dislikes, comments_count=comments_count,
            author_user=current_user,
        ))

    ch_posts_result = await db.execute(
        select(ChallengePost).where(
            ChallengePost.user_id == current_user.id,
            ChallengePost.cross_posted == True,
            ChallengePost.is_auto_generated == False,
        ).order_by(ChallengePost.created_at.desc()).limit(20)
    )
    for cp in ch_posts_result.scalars().all():
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
            "auto_event_data": None,
            "created_at": cp.created_at,
            "author_id": str(cp.user_id),
            "author": char_to_dict(char, current_user),
            "my_reaction": None,
            "liked": False,
            "likes": 0,
            "dislikes": 0,
            "comments_count": 0,
            "from_challenge": True,
        })

    post_list.sort(key=lambda p: str(p["created_at"]), reverse=True)

    return {
        "user": {
            "id": str(current_user.id),
            "email": current_user.email,
            "username": current_user.username,
        },
        "character": char_to_dict(char, current_user),
        "friends_count": friends_count,
        "posts": post_list,
    }