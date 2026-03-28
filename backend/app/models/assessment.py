import uuid
from datetime import datetime
from sqlalchemy import Column, String, Float, Boolean, DateTime, Integer, JSON, Text, ForeignKey, TypeDecorator
from sqlalchemy.orm import relationship
from app.database import Base


class GUID(TypeDecorator):
    """Portable UUID type for SQLite and PostgreSQL."""
    impl = String(36)
    cache_ok = True

    def process_bind_param(self, value, dialect):
        if value is None:
            return None
        return str(value) if isinstance(value, uuid.UUID) else value

    def process_result_value(self, value, dialect):
        if value is None:
            return None
        return uuid.UUID(value) if isinstance(value, str) else value


class User(Base):
    __tablename__ = "users"

    id = Column(GUID, primary_key=True, default=uuid.uuid4)
    anonymous_id = Column(String(128), unique=True, nullable=False, index=True)
    google_id = Column(String(128), unique=True, nullable=True, index=True)
    email = Column(String(255), nullable=True, index=True)
    name = Column(String(255), nullable=True)
    avatar_url = Column(String(512), nullable=True)
    password_hash = Column(String(255), nullable=True)
    is_admin = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    locale = Column(String(10), default="en")

    assessments = relationship("Assessment", back_populates="user", cascade="all, delete-orphan")


class Assessment(Base):
    __tablename__ = "assessments"

    id = Column(GUID, primary_key=True, default=uuid.uuid4)
    user_id = Column(GUID, ForeignKey("users.id"), nullable=False, index=True)
    started_at = Column(DateTime, default=datetime.utcnow)
    completed_at = Column(DateTime, nullable=True)
    duration_sec = Column(Integer, default=60)

    # Final scores
    stress_level = Column(String(20), nullable=True)  # Low / Moderate / High / Critical
    stress_score = Column(Float, nullable=True)  # 0-100
    confidence = Column(Float, nullable=True)  # 0-100
    spoof_detected = Column(Boolean, default=False)

    # Raw feature data
    voice_features = Column(JSON, nullable=True)
    face_features = Column(JSON, nullable=True)
    keystroke_features = Column(JSON, nullable=True)

    # Recommendations
    recommendations = Column(JSON, nullable=True)

    # Metadata
    status = Column(String(20), default="recording")  # recording / processing / completed / failed

    user = relationship("User", back_populates="assessments")
    snapshots = relationship("AssessmentSnapshot", back_populates="assessment", cascade="all, delete-orphan")


class AssessmentSnapshot(Base):
    """5-second interval snapshots during recording."""
    __tablename__ = "assessment_snapshots"

    id = Column(GUID, primary_key=True, default=uuid.uuid4)
    assessment_id = Column(GUID, ForeignKey("assessments.id"), nullable=False, index=True)
    timestamp_sec = Column(Integer, nullable=False)  # 5, 10, 15...60

    stress_score = Column(Float, nullable=True)
    confidence = Column(Float, nullable=True)
    voice_pitch = Column(Float, nullable=True)
    voice_energy = Column(Float, nullable=True)
    face_tension = Column(Float, nullable=True)
    keystroke_speed = Column(Float, nullable=True)

    raw_features = Column(JSON, nullable=True)

    assessment = relationship("Assessment", back_populates="snapshots")
