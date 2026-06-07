from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import RedirectResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
import httpx
import uuid

from app.database import get_db
from app.models.user import User, OAuthProvider
from app.models.character import Character
from app.core.security import create_access_token
from app.core.config import settings

router = APIRouter(prefix="/auth", tags=["oauth"])

GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
GOOGLE_INFO_URL = "https://www.googleapis.com/oauth2/v2/userinfo"

def get_redirect_uri(request: Request) -> str:
    if settings.APP_URL:
        base = settings.APP_URL.rstrip("/")
    else:
        scheme = request.headers.get("x-forwarded-proto", request.url.scheme)
        host = request.headers.get("x-forwarded-host", request.url.netloc)
        base = f"{scheme}://{host}"
    return f"{base}/auth/google/callback"

@router.get("/google/login")
async def google_login(request: Request):
    if not settings.GOOGLE_CLIENT_ID:
        raise HTTPException(400, "Google OAuth не настроен: добавь GOOGLE_CLIENT_ID в .env")

    redirect_uri = get_redirect_uri(request)
    params = {
        "client_id": settings.GOOGLE_CLIENT_ID,
        "redirect_uri": redirect_uri,
        "response_type": "code",
        "scope": "openid email profile",
        "access_type": "offline",
        "prompt": "select_account",
    }
    query = "&".join(f"{k}={v}" for k, v in params.items())
    return RedirectResponse(f"{GOOGLE_AUTH_URL}?{query}")

@router.get("/google/callback")
async def google_callback(
    request: Request,
    code:  str = None,
    error: str = None,
    db: AsyncSession = Depends(get_db),
):
    if error or not code:
        return RedirectResponse("/?error=google_auth_failed")

    redirect_uri = get_redirect_uri(request)

    async with httpx.AsyncClient() as client:
        token_resp = await client.post(
            GOOGLE_TOKEN_URL,
            data={
                "client_id": settings.GOOGLE_CLIENT_ID,
                "client_secret": settings.GOOGLE_CLIENT_SECRET,
                "code": code,
                "redirect_uri": redirect_uri,
                "grant_type": "authorization_code",
            },
        )
        if token_resp.status_code != 200:
            return RedirectResponse("/?error=token_exchange_failed")

        google_access_token = token_resp.json().get("access_token")

        info_resp = await client.get(
            GOOGLE_INFO_URL,
            headers={"Authorization": f"Bearer {google_access_token}"},
        )
        if info_resp.status_code != 200:
            return RedirectResponse("/?error=userinfo_failed")

        userinfo = info_resp.json()

    google_id = userinfo.get("id")
    email = userinfo.get("email")

    if not email or not google_id:
        return RedirectResponse("/?error=invalid_userinfo")

    result = await db.execute(
        select(User).where(
            (User.oauth_provider_id == google_id) | (User.email == email)
        )
    )
    user = result.scalar_one_or_none()

    if not user:
        user = User(
            id=uuid.uuid4(),
            email=email,
            hashed_password=None,
            oauth_provider=OAuthProvider.google,
            oauth_provider_id=google_id,
            is_verified=True,
            is_active=True,
            is_onboarded=False,
        )
        db.add(user)
        await db.commit()
        await db.refresh(user)
    else:
        if not user.oauth_provider_id:
            user.oauth_provider_id = google_id
        if not user.is_verified:
            user.is_verified = True
        await db.commit()

    jwt_token = create_access_token({"sub": str(user.id)})

    char_result = await db.execute(
        select(Character).where(Character.user_id == user.id)
    )
    char = char_result.scalar_one_or_none()
    is_onboarded = char is not None and user.is_onboarded

    return RedirectResponse(
        f"/?oauth_token={jwt_token}&is_onboarded={str(is_onboarded).lower()}"
    )

@router.get("/google/status")
async def google_status():
    return {"enabled": bool(settings.GOOGLE_CLIENT_ID and settings.GOOGLE_CLIENT_SECRET)}