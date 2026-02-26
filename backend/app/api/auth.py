"""Google OAuth login and JWT session handling."""
import secrets
import uuid
from datetime import datetime, timedelta
from urllib.parse import urlencode
import httpx
from fastapi import APIRouter, Depends, HTTPException, status, Query
from fastapi.responses import RedirectResponse
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import jwt
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.database import get_db
from app.models.assessment import User

router = APIRouter(prefix="/auth", tags=["Auth"])
security = HTTPBearer(auto_error=False)
settings = get_settings()

GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v2/userinfo"


def build_google_auth_url(state: str) -> str:
    params = {
        "client_id": settings.google_client_id,
        "redirect_uri": f"{settings.backend_url}/auth/google/callback",
        "response_type": "code",
        "scope": "openid email profile",
        "state": state,
        "access_type": "offline",
        "prompt": "consent",
    }
    return f"{GOOGLE_AUTH_URL}?{urlencode(params)}"


def create_token(user_id: str, email: str | None = None) -> str:
    payload = {
        "sub": user_id,
        "email": email or "",
        "exp": datetime.utcnow() + timedelta(minutes=settings.jwt_expire_minutes),
        "iat": datetime.utcnow(),
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def decode_token(token: str) -> dict | None:
    try:
        return jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
    except Exception:
        return None


@router.get("/google")
async def auth_google_redirect():
    if not settings.google_client_id or not settings.google_client_secret:
        return RedirectResponse(
            url=f"{settings.frontend_url}/login?error=config",
            status_code=status.HTTP_302_FOUND,
        )
    state = secrets.token_urlsafe(32)
    url = build_google_auth_url(state)
    return RedirectResponse(url=url, status_code=status.HTTP_302_FOUND)


@router.get("/google/callback")
async def auth_google_callback(
    code: str | None = Query(None),
    state: str | None = Query(None),
    error: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
):
    if error:
        return RedirectResponse(
            url=f"{settings.frontend_url}/login?error={error}",
            status_code=status.HTTP_302_FOUND,
        )
    if not code:
        return RedirectResponse(
            url=f"{settings.frontend_url}/login?error=no_code",
            status_code=status.HTTP_302_FOUND,
        )

    redirect_uri = f"{settings.backend_url}/auth/google/callback"

    async with httpx.AsyncClient() as client:
        token_res = await client.post(
            GOOGLE_TOKEN_URL,
            data={
                "code": code,
                "client_id": settings.google_client_id,
                "client_secret": settings.google_client_secret,
                "redirect_uri": redirect_uri,
                "grant_type": "authorization_code",
            },
            headers={"Content-Type": "application/x-www-form-urlencoded"},
        )
        if token_res.status_code != 200:
            return RedirectResponse(
                url=f"{settings.frontend_url}/login?error=token_exchange",
                status_code=status.HTTP_302_FOUND,
            )
        tokens = token_res.json()
        access_token = tokens.get("access_token")
        if not access_token:
            return RedirectResponse(
                url=f"{settings.frontend_url}/login?error=no_token",
                status_code=status.HTTP_302_FOUND,
            )

        userinfo_res = await client.get(
            GOOGLE_USERINFO_URL,
            headers={"Authorization": f"Bearer {access_token}"},
        )
        if userinfo_res.status_code != 200:
            return RedirectResponse(
                url=f"{settings.frontend_url}/login?error=userinfo",
                status_code=status.HTTP_302_FOUND,
            )
        info = userinfo_res.json()

    google_id = info.get("id")
    email = info.get("email")
    name = info.get("name")
    picture = info.get("picture")
    if not google_id:
        return RedirectResponse(
            url=f"{settings.frontend_url}/login?error=invalid_profile",
            status_code=status.HTTP_302_FOUND,
        )

    result = await db.execute(
        select(User).where(User.google_id == google_id)
    )
    user = result.scalar_one_or_none()
    if not user:
        anonymous_id = f"google-{google_id}"
        result = await db.execute(select(User).where(User.anonymous_id == anonymous_id))
        existing = result.scalar_one_or_none()
        if existing:
            existing.google_id = google_id
            existing.email = email
            existing.name = name
            existing.avatar_url = picture
            user = existing
        else:
            user = User(
                anonymous_id=anonymous_id,
                google_id=google_id,
                email=email,
                name=name,
                avatar_url=picture,
            )
            db.add(user)
            await db.flush()
    else:
        user.email = email
        user.name = name
        user.avatar_url = picture

    await db.commit()
    token = create_token(str(user.id), user.email)
    return RedirectResponse(
        url=f"{settings.frontend_url}/login?token={token}&success=1",
        status_code=status.HTTP_302_FOUND,
    )


def get_token_from_request(
    creds: HTTPAuthorizationCredentials | None = Depends(security),
    token_query: str | None = Query(None, alias="token"),
) -> str:
    if token_query:
        return token_query
    if creds and creds.credentials:
        return creds.credentials
    raise HTTPException(status_code=401, detail="Missing token")


@router.get("/me")
async def auth_me(
    token: str = Depends(get_token_from_request),
    db: AsyncSession = Depends(get_db),
):
    payload = decode_token(token)
    if not payload:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    user_id = payload.get("sub")
    try:
        uid = uuid.UUID(user_id)
    except (ValueError, TypeError):
        raise HTTPException(status_code=400, detail="Invalid user id")
    result = await db.execute(select(User).where(User.id == uid))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return {
        "user_id": str(user.id),
        "email": user.email,
        "name": user.name,
        "avatar_url": user.avatar_url,
    }
