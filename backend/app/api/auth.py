"""Google OAuth and username/password login with JWT session handling."""
import logging
import secrets
import uuid
from datetime import datetime, timedelta

logger = logging.getLogger(__name__)
from urllib.parse import urlencode, quote
import httpx
from fastapi import APIRouter, Depends, HTTPException, status, Query
from fastapi.responses import RedirectResponse
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import jwt
from passlib.context import CryptContext
from pydantic import BaseModel, EmailStr
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.database import get_db
from app.models.assessment import User

router = APIRouter(prefix="/auth", tags=["Auth"])
security = HTTPBearer(auto_error=False)
settings = get_settings()
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v2/userinfo"


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str
    name: str | None = None


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)


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
            err_body = token_res.text
            logger.warning(
                "Google token exchange failed: status=%s body=%s redirect_uri=%s",
                token_res.status_code, err_body, redirect_uri,
            )
            try:
                err_json = token_res.json()
                err_msg = err_json.get("error_description", err_json.get("error", "unknown"))
            except Exception:
                err_msg = "token_exchange"
            return RedirectResponse(
                url=f"{settings.frontend_url}/login?error=token_exchange&detail={quote(str(err_msg))}",
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


@router.post("/register")
async def auth_register(
    data: RegisterRequest,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(User).where(User.email == data.email))
    existing_user = result.scalar_one_or_none()
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered"
        )
    
    user = User(
        anonymous_id=f"local-{uuid.uuid4()}",
        email=data.email,
        name=data.name or data.email.split("@")[0],
        password_hash=hash_password(data.password),
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    
    token = create_token(str(user.id), user.email)
    return {
        "token": token,
        "user": {
            "user_id": str(user.id),
            "email": user.email,
            "name": user.name,
        }
    }


@router.post("/login")
async def auth_login(
    data: LoginRequest,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(User).where(User.email == data.email))
    user = result.scalar_one_or_none()
    
    if not user or not user.password_hash:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password"
        )
    
    if not verify_password(data.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password"
        )
    
    token = create_token(str(user.id), user.email)
    return {
        "token": token,
        "user": {
            "user_id": str(user.id),
            "email": user.email,
            "name": user.name,
            "avatar_url": user.avatar_url,
        }
    }
