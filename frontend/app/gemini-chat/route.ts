import { GoogleGenAI } from "@google/genai";
import { NextRequest, NextResponse } from "next/server";

const SYSTEM_PROMPT = `You are the NervoScan Wellness Assistant — a friendly, empathetic AI chatbot embedded in a stress detection web application called NervoScan.

Your role:
- Help users manage stress through practical, evidence-based advice
- Provide breathing exercises, meditation guidance, sleep tips, and grounding techniques
- Answer questions about the NervoScan app and how it works
- Provide HIGHLY PERSONALIZED insights based on the user's assessment history, patterns, and trends
- Celebrate improvements and acknowledge challenges with empathy
- Be warm, supportive, and non-judgmental
- Keep responses concise (2-4 paragraphs max) and use emoji sparingly
- If someone appears in crisis, gently recommend professional help

NervoScan context:
- It's an AI-powered stress detection app that analyzes voice, face, and keystroke patterns
- Users do a 60-second assessment recording
- The ML model (SVM) has ~79.7% accuracy on the RAVDESS dataset
- All biometric data is processed locally in the browser (offline-first)
- No audio/video recordings are stored on the server
- Stress levels: Low (0-30), Moderate (30-50), High (50-70), Critical (70-100)

CONTEXT-AWARE BEHAVIOR:
- **USER Context**: When assisting regular users, focus on their personal stress data, trends, and personalized wellness recommendations.
- **ADMIN Context**: When assisting an administrator (indicated by ADMIN DASHBOARD context), provide insights about:
  - Platform-wide statistics and system health
  - User engagement patterns and trends
  - Data quality across all assessments
  - Operational insights and recommendations
  - Answer questions about total users, system stress averages, distribution patterns
  - Suggest improvements for the platform based on data

When provided with user data:
- Reference specific numbers and patterns naturally in conversation
- Acknowledge trends (improving/stable/worsening) and provide relevant guidance
- Celebrate consistency and progress
- Gently encourage better habits if usage is low
- Connect stress patterns to actionable wellness advice
- If recommendations were given before, ask about their effectiveness
- Be specific: "Your stress has improved from 65 to 45 over the last 3 assessments" instead of generic advice

When in ADMIN context:
- Speak as an administrative assistant
- Provide system-wide insights and operational recommendations
- Answer questions about user counts, platform trends, and data quality
- Suggest improvements for user engagement or system features
- Compare system metrics to best practices or benchmarks

Always respond in the same language the user writes in.`;

export async function POST(req: NextRequest) {
    try {
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) {
            return NextResponse.json(
                { reply: "Gemini API key not configured. Please set GEMINI_API_KEY in your environment.", suggestions: [] },
                { status: 200 }
            );
        }

        const { message, history, token, context } = await req.json();
        if (!message || typeof message !== "string") {
            return NextResponse.json({ reply: "Please provide a message.", suggestions: [] }, { status: 400 });
        }

        const isAdminContext = context === "admin";

        // Fetch user data if token is provided
        let userContext = "";
        if (token) {
            try {
                const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
                
                // Fetch personal user data
                const userDataRes = await fetch(`${API_URL}/chatbot/user-context`, {
                    headers: { Authorization: `Bearer ${token}` },
                });
                
                if (userDataRes.ok) {
                    const userData = await userDataRes.json();
                    
                    // Build comprehensive context
                    const contextParts = ["\n\n=== USER'S PERSONALIZED DATA ==="];
                    
                    // User info
                    if (userData.user_name) {
                        contextParts.push(`User Name: ${userData.user_name}`);
                    }
                    if (userData.member_since) {
                        contextParts.push(`Member Since: ${userData.member_since} (${userData.days_active} days)`);
                    }
                    
                    // Assessment statistics
                    contextParts.push(`\n📊 Assessment History:`);
                    contextParts.push(`- Total assessments: ${userData.total_assessments}`);
                    contextParts.push(`- Completed: ${userData.completed_assessments}`);
                    contextParts.push(`- Average stress score: ${userData.avg_stress || 'N/A'}/100`);
                    
                    // Usage patterns
                    contextParts.push(`\n📅 Usage Patterns:`);
                    contextParts.push(`- Last 7 days: ${userData.assessments_last_week} assessments`);
                    contextParts.push(`- Last 30 days: ${userData.assessments_last_month} assessments`);
                    contextParts.push(`- Frequency: ${userData.frequency_per_week} assessments/week`);
                    contextParts.push(`- Consistency: ${userData.consistency}`);
                    
                    // Stress patterns
                    if (userData.level_distribution && Object.keys(userData.level_distribution).length > 0) {
                        contextParts.push(`\n🎯 Stress Level Distribution:`);
                        for (const [level, count] of Object.entries(userData.level_distribution)) {
                            contextParts.push(`- ${level}: ${count} times`);
                        }
                    }
                    
                    // Trend analysis
                    if (userData.trend) {
                        const trendEmoji = userData.trend === "improving" ? "📈" : userData.trend === "worsening" ? "📉" : "➡️";
                        contextParts.push(`\n${trendEmoji} Stress Trend: ${userData.trend}`);
                    }
                    
                    // Latest assessment
                    if (userData.latest_assessment && userData.latest_assessment.stress_score) {
                        contextParts.push(`\n🔍 Latest Assessment:`);
                        contextParts.push(`- Score: ${userData.latest_assessment.stress_score}/100`);
                        contextParts.push(`- Level: ${userData.latest_assessment.stress_level}`);
                        contextParts.push(`- Confidence: ${userData.latest_assessment.confidence}%`);
                        
                        if (userData.latest_assessment.recommendations && userData.latest_assessment.recommendations.length > 0) {
                            contextParts.push(`- Previous recommendations: ${userData.latest_assessment.recommendations.join(", ")}`);
                        }
                    }
                    
                    // Quality indicators
                    contextParts.push(`\n✅ Data Quality:`);
                    contextParts.push(`- Average confidence: ${userData.avg_confidence || 'N/A'}%`);
                    if (userData.spoof_detections > 0) {
                        contextParts.push(`- ⚠️ Spoof detections: ${userData.spoof_detections}`);
                    }
                    
                    contextParts.push(`\n=== END USER DATA ===`);
                    
                    userContext = contextParts.join("\n");
                }
                
                // If admin context, fetch system-wide statistics
                if (isAdminContext) {
                    const adminStatsRes = await fetch(`${API_URL}/admin/stats`, {
                        headers: { Authorization: `Bearer ${token}` },
                    });
                    
                    if (adminStatsRes.ok) {
                        const adminData = await adminStatsRes.json();
                        
                        const adminContextParts = ["\n\n=== ADMIN SYSTEM-WIDE DATA ==="];
                        adminContextParts.push(`🔐 Current Context: ADMIN DASHBOARD`);
                        adminContextParts.push(`\n📊 System Statistics:`);
                        adminContextParts.push(`- Total Users: ${adminData.total_users}`);
                        adminContextParts.push(`- Total Assessments: ${adminData.total_assessments}`);
                        adminContextParts.push(`- System Average Stress: ${adminData.avg_stress_score}/100`);
                        
                        if (adminData.level_distribution) {
                            adminContextParts.push(`\n🎯 System-Wide Stress Distribution:`);
                            for (const [level, count] of Object.entries(adminData.level_distribution)) {
                                const percent = ((count as number) / adminData.total_assessments * 100).toFixed(1);
                                adminContextParts.push(`- ${level}: ${count} (${percent}%)`);
                            }
                        }
                        
                        if (adminData.recent_assessments && adminData.recent_assessments.length > 0) {
                            adminContextParts.push(`\n📋 Recent Activity:`);
                            adminContextParts.push(`- Last ${adminData.recent_assessments.length} assessments from ${new Set(adminData.recent_assessments.map((a: any) => a.email || 'anonymous')).size} users`);
                        }
                        
                        if (adminData.model_info) {
                            adminContextParts.push(`\n🤖 ML Model Status:`);
                            adminContextParts.push(`- Type: ${adminData.model_info.type}`);
                            adminContextParts.push(`- Loaded: ${adminData.model_info.loaded ? 'Yes' : 'No'}`);
                            if (adminData.model_info.accuracy) {
                                adminContextParts.push(`- Accuracy: ${adminData.model_info.accuracy}%`);
                            }
                        }
                        
                        adminContextParts.push(`\n=== END ADMIN DATA ===`);
                        adminContextParts.push(`\nYou are assisting an ADMIN user. Provide insights about system-wide patterns, user engagement, data quality, and administrative recommendations. You can answer questions about overall platform health, user trends, and operational insights.`);
                        
                        userContext += "\n" + adminContextParts.join("\n");
                    }
                }
            } catch (error) {
                // Continue without user data if fetch fails
                console.error("Failed to fetch user context:", error);
            }
        }

        const ai = new GoogleGenAI({ apiKey });

        // Build conversation history for context
        const contents: Array<{ role: string; parts: Array<{ text: string }> }> = [];

        // Add system instruction as first user/model exchange
        contents.push({ role: "user", parts: [{ text: "You are the NervoScan wellness assistant. Please follow your system instructions." }] });
        contents.push({ role: "model", parts: [{ text: "I understand! I'm the NervoScan Wellness Assistant, ready to help with stress management, breathing exercises, and app questions. How can I help you today?" }] });

        // Add conversation history if provided
        if (Array.isArray(history)) {
            for (const msg of history.slice(-10)) { // Last 10 messages for context
                contents.push({
                    role: msg.role === "user" ? "user" : "model",
                    parts: [{ text: msg.text }],
                });
            }
        }

        // Add current message with user context
        const messageWithContext = userContext ? `${message}${userContext}` : message;
        contents.push({ role: "user", parts: [{ text: messageWithContext }] });

        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents,
            config: {
                systemInstruction: SYSTEM_PROMPT,
                maxOutputTokens: 500,
                temperature: 0.7,
            },
        });

        const reply = response.text || "I'm sorry, I couldn't generate a response. Please try again.";

        return NextResponse.json({ reply, suggestions: [] });
    } catch (error: any) {
        console.error("[Gemini Chat Error]", error?.message || error);
        return NextResponse.json(
            { reply: "Sorry, I'm having trouble connecting right now. Please try again in a moment.", suggestions: [] },
            { status: 200 }
        );
    }
}
