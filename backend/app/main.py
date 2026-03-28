"""
NervoScan Backend — FastAPI Application.
Privacy-aware stress detection API with real-time WebSocket support.
"""
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.database import init_db
from app.api.assessment import router as assessment_router
from app.api.reports import router as reports_router
from app.api.auth import router as auth_router
from app.api.admin import router as admin_router
from app.api.chatbot import router as chatbot_router

settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    await init_db()
    await ensure_default_admin()
    yield
    # Shutdown


async def ensure_default_admin():
    """Create a default admin user if no admins exist (development only)."""
    from sqlalchemy import select, func
    from app.database import async_session
    from app.models.assessment import User
    from passlib.context import CryptContext
    import uuid
    import os
    
    # Only create default admin in development
    if os.getenv("ENVIRONMENT") == "production":
        return
    
    pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
    
    async with async_session() as session:
        # Check if any admin users exist
        result = await session.execute(
            select(func.count(User.id)).where(User.is_admin == True)
        )
        admin_count = result.scalar()
        
        if admin_count == 0:
            # Create default admin
            default_email = "admin@nervoscan.com"
            default_password = "admin123"
            
            password_bytes = default_password.encode('utf-8')[:72]
            hashed = pwd_context.hash(password_bytes.decode('utf-8'))
            
            admin_user = User(
                id=uuid.uuid4(),
                anonymous_id=f"admin-{uuid.uuid4()}",
                email=default_email,
                name="System Administrator",
                password_hash=hashed,
                is_admin=True,
            )
            session.add(admin_user)
            await session.commit()
            print(f"\n🔐 Default admin created: {default_email} / {default_password}")
            print("⚠️  Change this password in production!\n")


app = FastAPI(
    title=settings.app_name,
    version=settings.app_version,
    description="Privacy-aware, offline-first stress detection API. "
    "Analyzes voice, face, and keystroke patterns to compute real-time stress scores.",
    lifespan=lifespan,
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Routers
app.include_router(assessment_router)
app.include_router(reports_router)
app.include_router(auth_router)
app.include_router(admin_router)
app.include_router(chatbot_router)


@app.get("/", tags=["Health"])
async def root():
    return {
        "app": settings.app_name,
        "version": settings.app_version,
        "status": "running",
        "docs": "/docs",
    }


@app.get("/health", tags=["Health"])
async def health():
    return {"status": "healthy"}
