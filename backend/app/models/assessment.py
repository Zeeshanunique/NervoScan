import uuid
from datetime import datetime
from sqlalchemy import Column, String, Float, Boolean, DateTime, Integer, JSON, Text, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from app.database import Base


class User(Base):
    __tablename__ = "users"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    anonymous_id = Column(String(64), unique=True, nullable=False, index=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    locale = Column(String(10), default="en")

    assessments = relationship("Assessment", back_populates="user", cascade="all, delete-orphan")


class Assessment(Base):
    __tablename__ = "assessments"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True)
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

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    assessment_id = Column(UUID(as_uuid=True), ForeignKey("assessments.id"), nullable=False, index=True)
    timestamp_sec = Column(Integer, nullable=False)  # 5, 10, 15...60

    stress_score = Column(Float, nullable=True)
    confidence = Column(Float, nullable=True)
    voice_pitch = Column(Float, nullable=True)
    voice_energy = Column(Float, nullable=True)
    face_tension = Column(Float, nullable=True)
    keystroke_speed = Column(Float, nullable=True)

    raw_features = Column(JSON, nullable=True)

    assessment = relationship("Assessment", back_populates="snapshots")
