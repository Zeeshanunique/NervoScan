"""
Reports & Export API endpoints.
GET /reports/{user_id}
GET /export/pdf
GET /export/csv
"""
import uuid
from datetime import datetime, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Header
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc
from pydantic import BaseModel
import io

from app.database import get_db
from app.models.assessment import User, Assessment, AssessmentSnapshot
from app.services.report_service import report_service

router = APIRouter(tags=["Reports"])


# --- Schemas ---

class AssessmentSummary(BaseModel):
    id: str
    stress_score: Optional[float]
    stress_level: Optional[str]
    confidence: Optional[float]
    spoof_detected: bool
    status: str
    started_at: str
    completed_at: Optional[str]


class ReportsResponse(BaseModel):
    user_id: str
    assessments: list[AssessmentSummary]
    total: int
    trend: Optional[dict] = None


class TrendData(BaseModel):
    dates: list[str]
    stress_scores: list[float]
    confidence_scores: list[float]


# --- Endpoints ---

@router.get("/reports/{user_id}", response_model=ReportsResponse)
async def get_reports(
    user_id: str,
    days: int = Query(30, ge=1, le=365),
    limit: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    authorization: str | None = Header(None)
):
    """Get assessment history and trends for a user. Requires authentication."""
    from app.api.auth import decode_token
    
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Authentication required to view reports")
    
    token = authorization.replace("Bearer ", "")
    payload = decode_token(token)
    if not payload:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    
    authenticated_user_id = payload.get("sub")
    if authenticated_user_id != user_id:
        raise HTTPException(status_code=403, detail="Cannot view other users' reports")

    result = await db.execute(
        select(User).where(User.id == uuid.UUID(user_id))
    )
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    since = datetime.utcnow() - timedelta(days=days)
    result = await db.execute(
        select(Assessment)
        .where(Assessment.user_id == user.id)
        .where(Assessment.started_at >= since)
        .where(Assessment.status == "completed")
        .order_by(desc(Assessment.started_at))
        .limit(limit)
    )
    assessments = result.scalars().all()

    summaries = [
        AssessmentSummary(
            id=str(a.id),
            stress_score=a.stress_score,
            stress_level=a.stress_level,
            confidence=a.confidence,
            spoof_detected=a.spoof_detected or False,
            status=a.status,
            started_at=a.started_at.isoformat() if a.started_at else "",
            completed_at=a.completed_at.isoformat() if a.completed_at else None,
        )
        for a in assessments
    ]

    trend = None
    if assessments:
        trend = {
            "dates": [a.started_at.strftime("%Y-%m-%d") for a in reversed(assessments)],
            "stress_scores": [a.stress_score or 0 for a in reversed(assessments)],
            "confidence_scores": [a.confidence or 0 for a in reversed(assessments)],
        }

    return ReportsResponse(
        user_id=user_id,
        assessments=summaries,
        total=len(summaries),
        trend=trend,
    )


@router.get("/export/pdf")
async def export_pdf(
    assessment_id: str = Query(...),
    token: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
    authorization: str | None = Header(None)
):
    """Export a single assessment as PDF. Requires authentication."""
    from app.api.auth import decode_token
    
    auth_token = token or (authorization.replace("Bearer ", "") if authorization and authorization.startswith("Bearer ") else None)
    
    if not auth_token:
        raise HTTPException(status_code=401, detail="Authentication required")
    
    payload = decode_token(auth_token)
    if not payload:
        raise HTTPException(status_code=401, detail="Invalid or expired token")

    result = await db.execute(
        select(Assessment).where(Assessment.id == uuid.UUID(assessment_id))
    )
    assessment = result.scalar_one_or_none()
    if not assessment:
        raise HTTPException(status_code=404, detail="Assessment not found")
    
    authenticated_user_id = payload.get("sub")
    if str(assessment.user_id) != authenticated_user_id:
        raise HTTPException(status_code=403, detail="Cannot export other users' assessments")

    assessment_dict = {
        "stress_score": assessment.stress_score,
        "stress_level": assessment.stress_level,
        "confidence": assessment.confidence,
        "spoof_detected": assessment.spoof_detected,
        "recommendations": assessment.recommendations or [],
        "breakdown": {
            "voice_stress": (assessment.voice_features or {}).get("stress_score", 0),
            "face_tension": (assessment.face_features or {}).get("tension_score", 0),
            "keystroke_modifier": (assessment.keystroke_features or {}).get("confidence_modifier", 0),
            "voice_weight": 0.50,
            "face_weight": 0.35,
        },
        "completed_at": assessment.completed_at.isoformat() if assessment.completed_at else "",
        "duration_sec": assessment.duration_sec,
    }

    pdf_bytes = report_service.generate_pdf(assessment_dict)

    return StreamingResponse(
        io.BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename=nervoscan-report-{assessment_id[:8]}.pdf"},
    )


@router.get("/export/csv")
async def export_csv(
    user_id: str = Query(...),
    days: int = Query(30, ge=1, le=365),
    token: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
    authorization: str | None = Header(None)
):
    """Export assessment history as CSV. Requires authentication."""
    from app.api.auth import decode_token
    
    auth_token = token or (authorization.replace("Bearer ", "") if authorization and authorization.startswith("Bearer ") else None)
    
    if not auth_token:
        raise HTTPException(status_code=401, detail="Authentication required")
    
    payload = decode_token(auth_token)
    if not payload:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    
    authenticated_user_id = payload.get("sub")
    if authenticated_user_id != user_id:
        raise HTTPException(status_code=403, detail="Cannot export other users' data")

    since = datetime.utcnow() - timedelta(days=days)
    result = await db.execute(
        select(Assessment)
        .where(Assessment.user_id == uuid.UUID(user_id))
        .where(Assessment.started_at >= since)
        .where(Assessment.status == "completed")
        .order_by(desc(Assessment.started_at))
    )
    assessments = result.scalars().all()

    if not assessments:
        raise HTTPException(status_code=404, detail="No assessments found")

    assessment_dicts = []
    for a in assessments:
        breakdown = {}
        if a.voice_features:
            breakdown["voice_stress"] = a.voice_features.get("stress_score", 0)
        if a.face_features:
            breakdown["face_tension"] = a.face_features.get("tension_score", 0)
        if a.keystroke_features:
            breakdown["keystroke_modifier"] = a.keystroke_features.get("confidence_modifier", 0)

        assessment_dicts.append({
            "stress_score": a.stress_score,
            "stress_level": a.stress_level,
            "confidence": a.confidence,
            "spoof_detected": a.spoof_detected,
            "breakdown": breakdown,
            "completed_at": a.completed_at.isoformat() if a.completed_at else "",
            "duration_sec": a.duration_sec,
        })

    csv_content = report_service.generate_csv(assessment_dicts)

    return StreamingResponse(
        io.StringIO(csv_content),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename=nervoscan-history-{user_id[:8]}.csv"},
    )
