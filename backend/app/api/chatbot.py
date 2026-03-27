"""
Chatbot API — rule-based stress management chatbot.
POST /chatbot/message — Send a message and get a response.
"""
from fastapi import APIRouter
from pydantic import BaseModel

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


@router.post("/message", response_model=ChatResponse)
async def chat_message(msg: ChatMessage):
    """Process a chat message and return a rule-based response."""
    result = find_response(msg.message, msg.context)
    return ChatResponse(**result)
