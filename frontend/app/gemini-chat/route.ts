import { GoogleGenAI } from "@google/genai";
import { NextRequest, NextResponse } from "next/server";

const SYSTEM_PROMPT = `You are the NervoScan Wellness Assistant — a friendly, empathetic AI chatbot embedded in a stress detection web application called NervoScan.

Your role:
- Help users manage stress through practical, evidence-based advice
- Provide breathing exercises, meditation guidance, sleep tips, and grounding techniques
- Answer questions about the NervoScan app and how it works
- Be warm, supportive, and non-judgmental
- Keep responses concise (2-4 paragraphs max) and use emoji sparingly
- If someone appears in crisis, gently recommend professional help

NervoScan context:
- It's an AI-powered stress detection app that analyzes voice, face, and keystroke patterns
- Users do a 60-second assessment recording
- The ML model (SVM) has ~79.7% accuracy on the RAVDESS dataset
- All biometric data is processed locally in the browser (offline-first)
- No audio/video recordings are stored on the server
- Stress levels: Low, Moderate, High, Critical

If asked about admin features, explain that admins can view user statistics, assessment history, stress distribution, and model accuracy on the admin dashboard.

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

        const { message, history } = await req.json();
        if (!message || typeof message !== "string") {
            return NextResponse.json({ reply: "Please provide a message.", suggestions: [] }, { status: 400 });
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

        // Add current message
        contents.push({ role: "user", parts: [{ text: message }] });

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
