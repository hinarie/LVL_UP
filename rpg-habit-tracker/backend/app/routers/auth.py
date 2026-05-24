from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from datetime import datetime
import uuid

from app.database import get_db
from app.models.user import User, OAuthProvider
from app.models.character import Character, Gender as CharGender, Rank
from app.schemas.auth import (
    RegisterRequest, VerifyOTPRequest, LoginRequest,
    OnboardingRequest, TokenResponse
)
from app.core.security import hash_password, verify_password, create_access_token
from app.core.email import generate_otp, get_otp_expiry, send_otp_email
from app.core.deps import get_current_user
from app.services.username_util import ensure_username

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register", status_code=201)
async def register(data: RegisterRequest, db: AsyncSession = Depends(get_db)):
    # Проверяем нет ли уже такого email
    result = await db.execute(select(User).where(User.email == data.email))
    existing = result.scalar_one_or_none()

    if existing:
        if existing.is_verified:
            raise HTTPException(status_code=400, detail="Email уже зарегистрирован")
        # Если не верифицирован — обновляем OTP и отправляем заново
        otp = generate_otp()
        existing.otp_code = otp
        existing.otp_expires_at = get_otp_expiry()
        existing.hashed_password = hash_password(data.password)
        await db.commit()
        await send_otp_email(data.email, otp)
        return {"message": "OTP отправлен повторно"}

    otp = generate_otp()
    user = User(
        id=uuid.uuid4(),
        email=data.email,
        hashed_password=hash_password(data.password),
        oauth_provider=OAuthProvider.email,
        otp_code=otp,
        otp_expires_at=get_otp_expiry(),
    )
    db.add(user)
    await db.commit()
    await send_otp_email(data.email, otp)
    return {"message": "Код подтверждения отправлен на email"}


@router.post("/verify-otp")
async def verify_otp(data: VerifyOTPRequest, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.email == data.email))
    user = result.scalar_one_or_none()

    if not user:
        raise HTTPException(status_code=404, detail="Пользователь не найден")
    if user.is_verified:
        raise HTTPException(status_code=400, detail="Email уже подтверждён")
    if user.otp_code != data.otp:
        raise HTTPException(status_code=400, detail="Неверный код")
    if user.otp_expires_at < datetime.utcnow():
        raise HTTPException(status_code=400, detail="Код истёк, запросите новый")

    user.is_verified = True
    user.otp_code = None
    user.otp_expires_at = None
    await db.commit()

    token = create_access_token({"sub": str(user.id)})
    return TokenResponse(access_token=token, is_onboarded=False)


@router.post("/login")
async def login(data: LoginRequest, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.email == data.email))
    user = result.scalar_one_or_none()

    if not user or not verify_password(data.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Неверный email или пароль")
    if not user.is_verified:
        raise HTTPException(status_code=403, detail="Сначала подтвердите email")

    token = create_access_token({"sub": str(user.id)})
    return TokenResponse(access_token=token, is_onboarded=user.is_onboarded)


@router.post("/onboarding")
async def onboarding(
    data: OnboardingRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.is_onboarded:
        raise HTTPException(status_code=400, detail="Онбординг уже пройден")

    character = Character(
        id=uuid.uuid4(),
        user_id=current_user.id,
        display_name=data.display_name,
        character_name=data.character_name,
        gender=CharGender(data.gender.value),
        level=1,
        xp_total=0,
        xp_current_level=0,
        credits=0,
        rank=Rank.warrior,
        current_streak=0,
        longest_streak=0,
        age_display=1,
    )
    db.add(character)
    current_user.is_onboarded = True
    await db.commit()

    # Создаём username если ещё нет
    await ensure_username(db, current_user)

    token = create_access_token({"sub": str(current_user.id)})
    return TokenResponse(access_token=token, is_onboarded=True)


@router.get("/me")
async def me(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # Гарантируем username (для всех старых юзеров — генерация при первом запросе)
    username = await ensure_username(db, current_user)
    return {
        "id": str(current_user.id),
        "email": current_user.email,
        "username": username,
        "is_onboarded": current_user.is_onboarded,
    }