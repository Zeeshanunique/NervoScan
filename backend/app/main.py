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
    yield
    # Shutdown


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
