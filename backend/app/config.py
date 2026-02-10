from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    app_name: str = "NervoScan"
    app_version: str = "1.0.0"
    debug: bool = False

    database_url: str = "postgresql+asyncpg://postgres:postgres@localhost:5432/nervoscan"
    database_url_sync: str = "postgresql://postgres:postgres@localhost:5432/nervoscan"

    cors_origins: list[str] = ["http://localhost:3000", "http://localhost:3001"]

    # ML
    voice_model_path: str = "models/voice_stress_model.joblib"
    face_model_path: str = "models/face_emotion.pkl"
    spoof_threshold: float = 0.35

    # Assessment
    assessment_duration_sec: int = 60
    update_interval_sec: int = 5

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


@lru_cache()
def get_settings() -> Settings:
    return Settings()
