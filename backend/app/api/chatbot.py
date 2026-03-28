"""
Chatbot API — data-aware stress management chatbot.
POST /chatbot/message — Send a message and get a response with access to user data.
"""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from app.database import get_db
from app.models.assessment import User, Assessment
from app.api.auth import get_current_user
import uuid

router = APIRouter(prefix="/chatbot", tags=["Chatbot"])


class ChatMessage(BaseModel):
    message: str
    context: str = "user"  # "user" or "admin"
    locale: str = "en"


class ChatResponse(BaseModel):
    reply: str
    category: str
    suggestions: list[str]


# Rule-based response patterns
RESPONSES = {
    "breathing": {
        "keywords": ["breath", "breathing", "inhale", "exhale", "4-7-8", "calm down"],
        "reply": "Here's a breathing exercise to help you relax:\n\n"
        "**4-7-8 Breathing Technique:**\n"
        "1. Inhale quietly through your nose for **4 seconds**\n"
        "2. Hold your breath for **7 seconds**\n"
        "3. Exhale completely through your mouth for **8 seconds**\n"
        "4. Repeat 3-4 times\n\n"
        "This activates your parasympathetic nervous system and reduces stress hormones.",
        "suggestions": [
            "Tell me about box breathing",
            "How does deep breathing reduce stress?",
            "Other relaxation techniques",
        ],
    },
    "sleep": {
        "keywords": ["sleep", "insomnia", "can't sleep", "tired", "fatigue", "rest"],
        "reply": "Good sleep is crucial for stress management. Here are some tips:\n\n"
        "🌙 **Sleep Hygiene Tips:**\n"
        "- Keep a consistent sleep schedule (even on weekends)\n"
        "- Avoid screens 1 hour before bed\n"
        "- Keep your room cool (18-20°C / 65-68°F)\n"
        "- Try the 4-7-8 breathing before bed\n"
        "- Limit caffeine after 2 PM\n"
        "- Consider a warm bath or shower before bed",
        "suggestions": [
            "Breathing exercises for sleep",
            "How much sleep do I need?",
            "What about power naps?",
        ],
    },
    "anxiety": {
        "keywords": ["anxious", "anxiety", "worried", "worry", "nervous", "panic", "fear", "scared"],
        "reply": "I understand you're feeling anxious. Here are some grounding techniques:\n\n"
        "**5-4-3-2-1 Grounding:**\n"
        "- **5** things you can see\n"
        "- **4** things you can touch\n"
        "- **3** things you can hear\n"
        "- **2** things you can smell\n"
        "- **1** thing you can taste\n\n"
        "This brings your focus to the present moment and away from anxious thoughts.",
        "suggestions": [
            "More anxiety management tips",
            "When should I seek help?",
            "Meditation for anxiety",
        ],
    },
    "exercise": {
        "keywords": ["exercise", "workout", "physical", "walk", "running", "yoga", "stretch"],
        "reply": "Physical activity is one of the best stress relievers!\n\n"
        "💪 **Quick Stress-Busting Exercises:**\n"
        "- **5-min desk stretches** — neck rolls, shoulder shrugs, wrist circles\n"
        "- **10-min brisk walk** — even around the office helps!\n"
        "- **Progressive muscle relaxation** — tense and release each muscle group\n"
        "- **Yoga poses** — child's pose, cat-cow, standing forward fold\n\n"
        "Even 10 minutes of movement can reduce cortisol and boost endorphins.",
        "suggestions": [
            "Desk stretches guide",
            "Quick yoga routine",
            "How exercise reduces stress",
        ],
    },
    "meditation": {
        "keywords": ["meditat", "mindful", "focus", "concentration", "zen"],
        "reply": "Meditation can significantly reduce stress levels.\n\n"
        "🧘 **Quick Meditation Guide (5 minutes):**\n"
        "1. Find a quiet, comfortable spot\n"
        "2. Close your eyes and focus on your breath\n"
        "3. When thoughts arise, acknowledge them and let them pass\n"
        "4. Return focus to your breath\n"
        "5. Start with just 5 minutes and increase gradually\n\n"
        "Regular practice rewires your brain's stress response over time.",
        "suggestions": [
            "Guided meditation resources",
            "Body scan meditation",
            "Breathing techniques",
        ],
    },
    "stress": {
        "keywords": ["stress", "stressed", "overwhelm", "burnout", "pressure", "tense", "tension"],
        "reply": "I hear you — stress can feel overwhelming. Here are some immediate strategies:\n\n"
        "🎯 **Quick Stress Relief:**\n"
        "- Take 3 deep breaths right now\n"
        "- Step away from your screen for 5 minutes\n"
        "- Splash cold water on your face\n"
        "- Listen to calming music\n"
        "- Write down what's stressing you\n\n"
        "Remember: stress is temporary, and you have tools to manage it.",
        "suggestions": [
            "Breathing exercises",
            "Long-term stress management",
            "When to seek professional help",
        ],
    },
    "help": {
        "keywords": ["help", "what can you", "options", "menu", "commands"],
        "reply": "I'm your NervoScan wellness assistant! I can help with:\n\n"
        "🔹 **Stress management** — immediate relief techniques\n"
        "🔹 **Breathing exercises** — guided breathing patterns\n"
        "🔹 **Sleep tips** — improve your sleep quality\n"
        "🔹 **Anxiety relief** — grounding and calming techniques\n"
        "🔹 **Exercise suggestions** — quick physical activities\n"
        "🔹 **Meditation guidance** — mindfulness practices\n\n"
        "Just tell me what you need, or ask about any topic above!",
        "suggestions": [
            "I feel stressed",
            "Help me relax",
            "Sleep tips",
        ],
    },
    "greeting": {
        "keywords": ["hello", "hi", "hey", "good morning", "good evening", "good afternoon"],
        "reply": "Hello! 👋 I'm the NervoScan wellness assistant. "
        "I'm here to help you manage stress and improve your wellbeing. "
        "How are you feeling today?",
        "suggestions": [
            "I'm feeling stressed",
            "Tell me about breathing exercises",
            "What can you help with?",
        ],
    },
    # Admin-specific responses
    "admin_stats": {
        "keywords": ["statistics", "stats", "dashboard", "overview", "metrics"],
        "reply": "You can view comprehensive statistics on the Admin Dashboard:\n\n"
        "📊 **Available Metrics:**\n"
        "- Total users and assessments\n"
        "- Average stress scores across all users\n"
        "- Stress level distribution (Low/Moderate/High/Critical)\n"
        "- Recent assessment activity\n"
        "- ML model accuracy and status\n\n"
        "Navigate to the Admin page to see real-time data.",
        "suggestions": [
            "How to export data?",
            "User management",
            "Model accuracy info",
        ],
    },
    "admin_users": {
        "keywords": ["users", "user management", "accounts", "people"],
        "reply": "User information is available in the Admin Dashboard:\n\n"
        "👥 **User Management:**\n"
        "- View all registered users\n"
        "- See assessment count per user\n"
        "- Check user activity timestamps\n"
        "- Monitor authentication status\n\n"
        "All user data is anonymized by default for privacy.",
        "suggestions": [
            "View dashboard stats",
            "Export reports",
            "Privacy policy",
        ],
    },
}

DEFAULT_RESPONSE = {
    "reply": "I'm not sure I understand that, but I'm here to help with stress management! "
    "Try asking about:\n\n"
    "• Breathing exercises\n"
    "• Sleep tips\n"
    "• Anxiety relief\n"
    "• Stress management\n"
    "• Exercise suggestions\n"
    "• Meditation guidance",
    "category": "unknown",
    "suggestions": [
        "Help me relax",
        "Breathing exercises",
        "What can you do?",
    ],
}


def find_response(message: str, context: str = "user") -> dict:
    """Match user message to the best response category."""
    msg_lower = message.lower().strip()

    # Check each category for keyword matches
    best_match = None
    best_score = 0

    for category, data in RESPONSES.items():
        # Skip admin-specific responses for user context
        if category.startswith("admin_") and context != "admin":
            continue

        for keyword in data["keywords"]:
            if keyword in msg_lower:
                score = len(keyword)  # Longer keyword = better match
                if score > best_score:
                    best_score = score
                    best_match = category

    if best_match:
        data = RESPONSES[best_match]
        return {
            "reply": data["reply"],
            "category": best_match,
            "suggestions": data["suggestions"],
        }

    return DEFAULT_RESPONSE


@router.get("/user-context")
async def get_user_context(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Get user's assessment context for AI chatbot."""
    user_data = await get_user_data(db, current_user.id)
    return user_data


@router.post("/message", response_model=ChatResponse)
async def chat_message(
    msg: ChatMessage,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Process a chat message and return a data-aware response."""
    # Get user's assessment data
    user_data = await get_user_data(db, current_user.id)
    
    # Find response based on message and user data
    result = await find_data_aware_response(msg.message, msg.context, user_data, db)
    return ChatResponse(**result)


async def get_user_data(db: AsyncSession, user_id: uuid.UUID) -> dict:
    """Fetch comprehensive user assessment data and patterns for chatbot context."""
    from datetime import datetime, timedelta
    
    # Get user info
    user_result = await db.execute(select(User).where(User.id == user_id))
    user = user_result.scalar_one_or_none()
    
    # Count total assessments
    total_result = await db.execute(
        select(func.count(Assessment.id))
        .where(Assessment.user_id == user_id)
    )
    total_assessments = total_result.scalar() or 0
    
    # Count completed assessments
    completed_result = await db.execute(
        select(func.count(Assessment.id))
        .where(Assessment.user_id == user_id, Assessment.status == "complete")
    )
    completed_assessments = completed_result.scalar() or 0
    
    # Get average stress score
    avg_result = await db.execute(
        select(func.avg(Assessment.stress_score))
        .where(Assessment.user_id == user_id, Assessment.stress_score.isnot(None))
    )
    avg_stress = avg_result.scalar()
    
    # Get stress level distribution
    level_dist_result = await db.execute(
        select(Assessment.stress_level, func.count(Assessment.id))
        .where(Assessment.user_id == user_id, Assessment.stress_level.isnot(None))
        .group_by(Assessment.stress_level)
    )
    level_distribution = {level: count for level, count in level_dist_result.all()}
    
    # Get latest 5 assessments for trend analysis
    recent_result = await db.execute(
        select(Assessment)
        .where(Assessment.user_id == user_id, Assessment.stress_score.isnot(None))
        .order_by(Assessment.started_at.desc())
        .limit(5)
    )
    recent_assessments = recent_result.scalars().all()
    
    # Calculate trend
    trend = None
    if len(recent_assessments) >= 2:
        scores = [a.stress_score for a in reversed(recent_assessments)]
        if scores[-1] < scores[0] - 5:
            trend = "improving"
        elif scores[-1] > scores[0] + 5:
            trend = "worsening"
        else:
            trend = "stable"
    
    # Get spoof detection count
    spoof_result = await db.execute(
        select(func.count(Assessment.id))
        .where(Assessment.user_id == user_id, Assessment.spoof_detected == True)
    )
    spoof_count = spoof_result.scalar() or 0
    
    # Get recommendations from latest assessment
    latest = recent_assessments[0] if recent_assessments else None
    latest_recommendations = []
    if latest and latest.recommendations:
        import json
        try:
            latest_recommendations = json.loads(latest.recommendations) if isinstance(latest.recommendations, str) else latest.recommendations
        except:
            pass
    
    # Calculate assessment frequency (assessments per week)
    if total_assessments > 0 and user:
        days_since_signup = (datetime.utcnow() - user.created_at).days
        weeks_active = max(days_since_signup / 7, 1)
        frequency = round(total_assessments / weeks_active, 1)
    else:
        frequency = 0
    
    # Get time-based patterns (assessments in last 7 days vs last 30 days)
    week_ago = datetime.utcnow() - timedelta(days=7)
    month_ago = datetime.utcnow() - timedelta(days=30)
    
    week_result = await db.execute(
        select(func.count(Assessment.id))
        .where(Assessment.user_id == user_id, Assessment.started_at >= week_ago)
    )
    assessments_last_week = week_result.scalar() or 0
    
    month_result = await db.execute(
        select(func.count(Assessment.id))
        .where(Assessment.user_id == user_id, Assessment.started_at >= month_ago)
    )
    assessments_last_month = month_result.scalar() or 0
    
    # Calculate consistency score (how regularly they assess)
    if total_assessments >= 3:
        if assessments_last_week >= 2:
            consistency = "excellent"
        elif assessments_last_week >= 1:
            consistency = "good"
        elif assessments_last_month >= 2:
            consistency = "moderate"
        else:
            consistency = "low"
    else:
        consistency = "new_user"
    
    # Get confidence trends
    if recent_assessments:
        avg_confidence = sum(a.confidence for a in recent_assessments if a.confidence) / len([a for a in recent_assessments if a.confidence])
        avg_confidence = round(avg_confidence, 1) if avg_confidence else None
    else:
        avg_confidence = None
    
    return {
        # Basic stats
        "total_assessments": total_assessments,
        "completed_assessments": completed_assessments,
        "avg_stress": round(avg_stress, 1) if avg_stress else None,
        
        # Latest assessment
        "latest_assessment": {
            "stress_score": latest.stress_score if latest else None,
            "stress_level": latest.stress_level if latest else None,
            "confidence": latest.confidence if latest else None,
            "completed_at": latest.completed_at.isoformat() if latest and latest.completed_at else None,
            "recommendations": latest_recommendations[:3] if latest_recommendations else [],
        } if latest else None,
        
        # Stress patterns
        "level_distribution": level_distribution,
        "trend": trend,
        "high_stress_count": level_distribution.get("High", 0) + level_distribution.get("Critical", 0),
        
        # Usage patterns
        "assessments_last_week": assessments_last_week,
        "assessments_last_month": assessments_last_month,
        "frequency_per_week": frequency,
        "consistency": consistency,
        
        # Quality indicators
        "spoof_detections": spoof_count,
        "avg_confidence": avg_confidence,
        
        # User info
        "user_name": user.name if user else None,
        "member_since": user.created_at.strftime("%B %Y") if user else None,
        "days_active": (datetime.utcnow() - user.created_at).days if user else 0,
    }


async def find_data_aware_response(message: str, context: str, user_data: dict, db: AsyncSession) -> dict:
    """Match user message to the best response category, incorporating user data."""
    msg_lower = message.lower().strip()
    
    # Data-specific queries
    if any(word in msg_lower for word in ["how many", "count", "number of", "assessments", "completed"]):
        total = user_data["total_assessments"]
        completed = user_data["completed_assessments"]
        
        encouragement = "Great work on staying consistent! 🎯" if completed > 5 else "Keep going! Regular assessments help track your stress patterns. 📊"
        
        return {
            "reply": f"You've completed **{completed} assessment{'s' if completed != 1 else ''}** out of {total} total started.\n\n{encouragement}",
            "category": "user_data",
            "suggestions": [
                "What's my average stress?",
                "Show my stress trends",
                "Take a new assessment",
            ],
        }
    
    if any(word in msg_lower for word in ["average", "avg", "typical", "usual", "normal"]) and any(word in msg_lower for word in ["stress", "score"]):
        avg = user_data["avg_stress"]
        if avg is None:
            return {
                "reply": "You haven't completed any assessments yet with stress scores.\n\nTake your first assessment to start tracking your stress levels!",
                "category": "user_data",
                "suggestions": [
                    "Start an assessment",
                    "How do assessments work?",
                    "Stress management tips",
                ],
            }
        
        level = "Low" if avg < 30 else "Moderate" if avg < 50 else "High" if avg < 70 else "Critical"
        
        return {
            "reply": f"Your average stress score is **{avg}/100** ({level} level).\n\n" +
                    (f"That's excellent! You're managing stress well. 😊" if avg < 30 else
                     f"You're in the moderate range. Consider regular relaxation techniques. 🧘" if avg < 50 else
                     f"Your stress levels are elevated. Let's work on some coping strategies. 💪" if avg < 70 else
                     f"Your stress is quite high. Please consider speaking with a healthcare professional. ⚠️"),
            "category": "user_data",
            "suggestions": [
                "Breathing exercises",
                "Stress management tips",
                "View my reports",
            ],
        }
    
    if any(word in msg_lower for word in ["latest", "last", "recent", "most recent"]) and any(word in msg_lower for word in ["assessment", "test", "result"]):
        latest = user_data["latest_assessment"]
        if not latest or latest["stress_score"] is None:
            return {
                "reply": "You haven't completed any assessments yet.\n\nTake your first assessment to get personalized insights!",
                "category": "user_data",
                "suggestions": [
                    "Start an assessment",
                    "How long does it take?",
                    "What does it measure?",
                ],
            }
        
        score = latest["stress_score"]
        level = latest["stress_level"] or "Unknown"
        
        feedback = "Great job! Keep maintaining your wellness routine. ✨" if score < 30 else "Consider some relaxation techniques to manage stress better. 🌿"
        
        return {
            "reply": f"Your most recent assessment:\n\n"
                    f"**Stress Score:** {score}/100\n"
                    f"**Level:** {level}\n\n"
                    f"{feedback}",
            "category": "user_data",
            "suggestions": [
                "View full report",
                "Take another assessment",
                "Stress relief tips",
            ],
        }
    
    if any(word in msg_lower for word in ["trend", "progress", "improvement", "history", "over time"]):
        total = user_data["completed_assessments"]
        avg = user_data["avg_stress"]
        high_count = user_data["high_stress_count"]
        
        if total == 0:
            return {
                "reply": "You don't have enough data yet to show trends.\n\nComplete a few more assessments to track your progress!",
                "category": "user_data",
                "suggestions": [
                    "Start an assessment",
                    "How often should I assess?",
                    "What can I learn?",
                ],
            }
        
        high_percent = (high_count / total * 100) if total > 0 else 0
        
        if high_percent < 20:
            insight = "You're doing great at managing stress! 🌟"
        else:
            insight = "Consider adding more stress management practices to your routine. 💡"
        
        return {
            "reply": f"Your stress trends:\n\n"
                    f"📊 **Total Completed:** {total}\n"
                    f"📈 **Average Score:** {avg if avg else 'N/A'}\n"
                    f"⚠️ **High Stress Events:** {high_count} ({high_percent:.0f}%)\n\n"
                    f"{insight}",
            "category": "user_data",
            "suggestions": [
                "Breathing exercises",
                "Sleep tips",
                "View detailed reports",
            ],
        }
    
    # Fall back to rule-based responses for general wellness questions
    result = find_response(message, context)
    return result
