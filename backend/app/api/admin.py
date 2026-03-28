"""
Admin API endpoints.
GET /admin/stats   — Dashboard summary statistics
GET /admin/users   — List all users with assessment counts
GET /admin/assessments — Paginated list of all assessments
"""
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, Query, HTTPException, status
from sqlalchemy import select, func, desc
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.assessment import User, Assessment

router = APIRouter(prefix="/admin", tags=["Admin"])


async def require_admin(db: AsyncSession = Depends(get_db)) -> User:
    from app.api.auth import get_current_user
    user = await get_current_user(db=db)
    if not user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required"
        )
    return user


@router.get("/stats")
async def admin_stats(
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin),
):
    """Dashboard summary: total users, assessments, avg stress, level distribution."""

    # Total users
    total_users = (await db.execute(select(func.count(User.id)))).scalar() or 0

    # Total assessments
    total_assessments = (
        await db.execute(
            select(func.count(Assessment.id)).where(Assessment.status == "completed")
        )
    ).scalar() or 0

    # Average stress score
    avg_stress = (
        await db.execute(
            select(func.avg(Assessment.stress_score)).where(
                Assessment.status == "completed"
            )
        )
    ).scalar()
    avg_stress = round(avg_stress, 1) if avg_stress else 0

    # Stress level distribution
    level_rows = (
        await db.execute(
            select(Assessment.stress_level, func.count(Assessment.id))
            .where(Assessment.status == "completed")
            .group_by(Assessment.stress_level)
        )
    ).all()
    level_distribution = {row[0] or "Unknown": row[1] for row in level_rows}

    # Recent assessments (last 20)
    recent_rows = (
        await db.execute(
            select(
                Assessment.id,
                Assessment.stress_score,
                Assessment.stress_level,
                Assessment.confidence,
                Assessment.spoof_detected,
                Assessment.completed_at,
                Assessment.user_id,
                User.email,
                User.name,
            )
            .join(User, Assessment.user_id == User.id)
            .where(Assessment.status == "completed")
            .order_by(desc(Assessment.completed_at))
            .limit(20)
        )
    ).all()

    recent = [
        {
            "id": str(row[0]),
            "stress_score": row[1],
            "stress_level": row[2],
            "confidence": row[3],
            "spoof_detected": row[4],
            "completed_at": row[5].isoformat() if row[5] else None,
            "user_id": str(row[6]),
            "email": row[7],
            "name": row[8],
        }
        for row in recent_rows
    ]

    # Model info
    from app.ml.voice_stress import voice_analyzer

    model_info = {
        "loaded": voice_analyzer._model_loaded,
        "type": voice_analyzer._meta.get("model_name", "Unknown")
        if voice_analyzer._meta
        else "Heuristic",
        "accuracy": None,
    }
    if voice_analyzer._meta:
        cv = voice_analyzer._meta.get("cross_validation", {})
        selected = cv.get(voice_analyzer._meta.get("model_name", ""), {})
        if selected:
            model_info["accuracy"] = round(
                selected.get("mean_accuracy", 0) * 100, 1
            )

    return {
        "total_users": total_users,
        "total_assessments": total_assessments,
        "avg_stress_score": avg_stress,
        "level_distribution": level_distribution,
        "recent_assessments": recent,
        "model_info": model_info,
    }


@router.get("/users")
async def admin_users(
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin),
):
    """List all users with their assessment count."""
    rows = (
        await db.execute(
            select(
                User.id,
                User.anonymous_id,
                User.email,
                User.name,
                User.avatar_url,
                User.created_at,
                func.count(Assessment.id).label("assessment_count"),
            )
            .outerjoin(Assessment, User.id == Assessment.user_id)
            .group_by(User.id)
            .order_by(desc(User.created_at))
            .limit(limit)
            .offset(offset)
        )
    ).all()

    return [
        {
            "id": str(row[0]),
            "anonymous_id": row[1],
            "email": row[2],
            "name": row[3],
            "avatar_url": row[4],
            "created_at": row[5].isoformat() if row[5] else None,
            "assessment_count": row[6],
        }
        for row in rows
    ]


@router.get("/assessments")
async def admin_assessments(
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin),
):
    """Paginated list of all assessments."""
    rows = (
        await db.execute(
            select(
                Assessment.id,
                Assessment.stress_score,
                Assessment.stress_level,
                Assessment.confidence,
                Assessment.spoof_detected,
                Assessment.status,
                Assessment.started_at,
                Assessment.completed_at,
                Assessment.user_id,
                User.email,
                User.name,
            )
            .join(User, Assessment.user_id == User.id)
            .order_by(desc(Assessment.started_at))
            .limit(limit)
            .offset(offset)
        )
    ).all()

    return [
        {
            "id": str(row[0]),
            "stress_score": row[1],
            "stress_level": row[2],
            "confidence": row[3],
            "spoof_detected": row[4],
            "status": row[5],
            "started_at": row[6].isoformat() if row[6] else None,
            "completed_at": row[7].isoformat() if row[7] else None,
            "user_id": str(row[8]),
            "email": row[9],
            "name": row[10],
        }
        for row in rows
    ]
