"""
Assessment API endpoints.
POST /assessment/start
WS   /assessment/live
POST /assessment/final
"""
import json
import uuid
import asyncio
import numpy as np
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Depends, HTTPException, Header
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel

from app.database import get_db
from app.models.assessment import User, Assessment, AssessmentSnapshot
from app.ml.voice_stress import voice_analyzer
from app.ml.face_emotion import face_analyzer
from app.ml.keystroke import keystroke_analyzer
from app.ml.spoof_detection import spoof_detector
from app.ml.ensemble import ensemble

router = APIRouter(prefix="/assessment", tags=["Assessment"])


# --- Schemas ---

class StartRequest(BaseModel):
    anonymous_id: str
    locale: str = "en"


class StartResponse(BaseModel):
    assessment_id: str
    user_id: str
    status: str
    duration_sec: int


class FinalRequest(BaseModel):
    assessment_id: str
    voice_features: Optional[dict] = None
    face_features: Optional[dict] = None
    keystroke_events: Optional[list[dict]] = None
    snapshots: Optional[list[dict]] = None


class FinalResponse(BaseModel):
    stress_level: str
    stress_score: float
    confidence: float
    spoof_detected: bool
    recommendations: list[str]
    breakdown: dict


# --- Endpoints ---

@router.post("/start", response_model=StartResponse)
async def start_assessment(
    req: StartRequest, 
    db: AsyncSession = Depends(get_db),
    authorization: str | None = Header(None)
):
    """Start a new 60-second assessment session. Requires authentication."""
    from app.api.auth import decode_token
    
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Authentication required to start assessment")
    
    token = authorization.replace("Bearer ", "")
    payload = decode_token(token)
    if not payload:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    
    user_id = payload.get("sub")
    result = await db.execute(select(User).where(User.id == uuid.UUID(user_id)))
    user = result.scalar_one_or_none()
    
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    assessment = Assessment(
        user_id=user.id,
        status="recording",
        duration_sec=60,
    )
    db.add(assessment)
    await db.flush()

    return StartResponse(
        assessment_id=str(assessment.id),
        user_id=str(user.id),
        status="recording",
        duration_sec=60,
    )


@router.post("/final", response_model=FinalResponse)
async def final_analysis(req: FinalRequest, db: AsyncSession = Depends(get_db)):
    """Run final high-accuracy analysis after 60s recording."""

    # Get assessment
    result = await db.execute(
        select(Assessment).where(Assessment.id == uuid.UUID(req.assessment_id))
    )
    assessment = result.scalar_one_or_none()
    if not assessment:
        raise HTTPException(status_code=404, detail="Assessment not found")

    # Process voice features
    voice_result = {"stress_score": 50, "confidence": 50}
    if req.voice_features:
        if "audio_samples" in req.voice_features and len(req.voice_features["audio_samples"]) > 0:
            samples = np.array(req.voice_features["audio_samples"], dtype=np.float32)
            sr = req.voice_features.get("sample_rate", 16000)
            print(f"[ML] Received {len(samples)} audio samples at {sr}Hz ({len(samples)/sr:.1f}s)")
            features = voice_analyzer.extract_features(samples, sr)
            voice_result = voice_analyzer.predict_stress(features)
            print(f"[ML] Voice stress result: score={voice_result.get('stress_score')}, "
                  f"level={voice_result.get('stress_level')}, model={voice_result.get('model', 'unknown')}")
        elif "mfcc_mean" in req.voice_features:
            voice_result = voice_analyzer.predict_stress(req.voice_features)
        else:
            print(f"[ML] No audio_samples or mfcc_mean in voice_features, using default. Keys: {list(req.voice_features.keys())}")

    # Process face features
    face_result = {"tension_score": 50}
    if req.face_features:
        if "landmarks" in req.face_features:
            face_result = face_analyzer.analyze_landmarks(req.face_features["landmarks"])
        elif "tension_score" in req.face_features:
            face_result = req.face_features

    # Process keystroke
    ks_result = None
    if req.keystroke_events:
        ks_result = keystroke_analyzer.analyze(req.keystroke_events)

    # Spoof detection (using snapshots history)
    spoof_result = None
    if req.snapshots and len(req.snapshots) >= 4:
        voice_history = [s.get("voice", {}) for s in req.snapshots]
        face_history = [s.get("face", {}) for s in req.snapshots]
        spoof_result = spoof_detector.detect(voice_history, face_history, ks_result)

    # Ensemble fusion
    final = ensemble.fuse(voice_result, face_result, ks_result, spoof_result)

    # Save to DB
    assessment.stress_score = final["stress_score"]
    assessment.stress_level = final["stress_level"]
    assessment.confidence = final["confidence"]
    assessment.spoof_detected = final["spoof_detected"]
    assessment.recommendations = final["recommendations"]
    assessment.voice_features = voice_result
    assessment.face_features = face_result
    assessment.keystroke_features = ks_result
    assessment.status = "completed"
    assessment.completed_at = datetime.utcnow()

    # Save snapshots
    if req.snapshots:
        for snap in req.snapshots:
            db_snap = AssessmentSnapshot(
                assessment_id=assessment.id,
                timestamp_sec=snap.get("timestamp_sec", 0),
                stress_score=snap.get("stress_score", 0),
                confidence=snap.get("confidence", 0),
                voice_pitch=snap.get("voice", {}).get("pitch_mean", 0),
                voice_energy=snap.get("voice", {}).get("energy_mean", 0),
                face_tension=snap.get("face", {}).get("tension_score", 0),
                raw_features=snap,
            )
            db.add(db_snap)

    return FinalResponse(
        stress_level=final["stress_level"],
        stress_score=final["stress_score"],
        confidence=final["confidence"],
        spoof_detected=final["spoof_detected"],
        recommendations=final["recommendations"],
        breakdown=final["breakdown"],
    )


@router.websocket("/live")
async def live_assessment(websocket: WebSocket):
    """
    WebSocket for real-time 5-second updates during assessment.
    Client sends: {type: "snapshot", voice: {...}, face: {...}, timestamp_sec: N}
    Server responds: {stress_score, stress_level, confidence}
    """
    await websocket.accept()

    try:
        while True:
            data = await websocket.receive_text()
            payload = json.loads(data)

            msg_type = payload.get("type", "snapshot")

            if msg_type == "snapshot":
                # Quick inference
                voice_data = payload.get("voice", {})
                face_data = payload.get("face", {})

                voice_stress = voice_data.get("stress_score", 50)
                face_tension = face_data.get("tension_score", 50)

                result = ensemble.quick_fuse(voice_stress, face_tension)

                await websocket.send_json({
                    "type": "update",
                    "timestamp_sec": payload.get("timestamp_sec", 0),
                    "stress_score": result["stress_score"],
                    "stress_level": result["stress_level"],
                    "confidence": result["confidence"],
                })

            elif msg_type == "ping":
                await websocket.send_json({"type": "pong"})

    except WebSocketDisconnect:
        pass
    except Exception as e:
        try:
            await websocket.send_json({"type": "error", "message": str(e)})
        except Exception:
            pass
