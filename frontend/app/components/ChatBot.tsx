"use client";

import { useState, useEffect, useRef } from "react";
import { getLocale, t, type Locale } from "@/app/lib/i18n";


interface Message {
    id: number;
    role: "user" | "bot";
    text: string;
    suggestions?: string[];
}

export default function ChatBot() {
    const [locale, setLoc] = useState<Locale>("en");
    const [isOpen, setIsOpen] = useState(false);
    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState("");
    const [loading, setLoading] = useState(false);
    const scrollRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const msgIdRef = useRef(0);

    useEffect(() => {
        setLoc(getLocale());
        const handler = () => setLoc(getLocale());
        window.addEventListener("nervoscan-locale-change", handler);
        return () => window.removeEventListener("nervoscan-locale-change", handler);
    }, []);

    useEffect(() => {
        if (isOpen && messages.length === 0) {
            // Welcome message
            setMessages([
                {
                    id: ++msgIdRef.current,
                    role: "bot",
                    text: t("chatbot.welcome", locale),
                    suggestions: [
                        t("chatbot.suggestStress", locale),
                        t("chatbot.suggestBreathing", locale),
                        t("chatbot.suggestHelp", locale),
                    ],
                },
            ]);
        }
    }, [isOpen]);

    useEffect(() => {
        scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
    }, [messages]);

    useEffect(() => {
        if (isOpen) inputRef.current?.focus();
    }, [isOpen]);

    const sendMessage = async (text: string) => {
        if (!text.trim() || loading) return;

        const userMsg: Message = { id: ++msgIdRef.current, role: "user", text: text.trim() };
        setMessages((prev) => [...prev, userMsg]);
        setInput("");
        setLoading(true);

        try {
            // Build history from previous messages (excluding suggestions)
            const history = messages
                .filter((m) => m.role === "user" || m.role === "bot")
                .map((m) => ({ role: m.role === "user" ? "user" : "model", text: m.text }));

            const res = await fetch("/gemini-chat", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ message: text.trim(), history }),
            });

            if (!res.ok) throw new Error("Failed");
            const data = await res.json();

            setMessages((prev) => [
                ...prev,
                {
                    id: ++msgIdRef.current,
                    role: "bot",
                    text: data.reply,
                    suggestions: data.suggestions,
                },
            ]);
        } catch {
            setMessages((prev) => [
                ...prev,
                {
                    id: ++msgIdRef.current,
                    role: "bot",
                    text: "Sorry, I'm having trouble connecting. Please try again.",
                    suggestions: ["Try again", "Help"],
                },
            ]);
        } finally {
            setLoading(false);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            sendMessage(input);
        }
    };

    return (
        <>
            {/* Floating Chat Button */}
            <button
                id="chatbot-toggle"
                onClick={() => setIsOpen(!isOpen)}
                className={`fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full shadow-2xl flex items-center justify-center transition-all duration-300 ${isOpen
                    ? "bg-slate-700 hover:bg-slate-600 rotate-0"
                    : "bg-gradient-to-br from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 shadow-indigo-500/25"
                    }`}
            >
                {isOpen ? (
                    <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                ) : (
                    <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                    </svg>
                )}
            </button>

            {/* Chat Window */}
            {isOpen && (
                <div className="fixed bottom-24 right-6 z-50 w-[380px] max-w-[calc(100vw-2rem)] bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl shadow-black/40 flex flex-col overflow-hidden"
                    style={{ height: "500px" }}
                >
                    {/* Header */}
                    <div className="px-4 py-3 bg-gradient-to-r from-indigo-600/20 to-purple-600/20 border-b border-slate-700 flex items-center gap-3">
                        <div className="w-8 h-8 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-lg flex items-center justify-center">
                            <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                            </svg>
                        </div>
                        <div>
                            <p className="text-sm font-semibold text-slate-200">{t("chatbot.title", locale)}</p>
                            <p className="text-[10px] text-slate-400">{t("chatbot.subtitle", locale)}</p>
                        </div>
                    </div>

                    {/* Messages */}
                    <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
                        {messages.map((msg) => (
                            <div key={msg.id} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                                <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm ${msg.role === "user"
                                    ? "bg-indigo-600 text-white rounded-br-md"
                                    : "bg-slate-800 text-slate-300 rounded-bl-md"
                                    }`}>
                                    <div className="whitespace-pre-wrap" dangerouslySetInnerHTML={{
                                        __html: msg.text
                                            .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
                                            .replace(/\n/g, "<br>")
                                    }} />
                                    {msg.suggestions && msg.suggestions.length > 0 && (
                                        <div className="mt-2 flex flex-wrap gap-1.5">
                                            {msg.suggestions.map((s, i) => (
                                                <button
                                                    key={i}
                                                    onClick={() => sendMessage(s)}
                                                    className="px-2.5 py-1 text-[11px] bg-slate-700/50 hover:bg-slate-600/50 text-slate-300 rounded-full transition-colors border border-slate-600/30"
                                                >
                                                    {s}
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>
                        ))}
                        {loading && (
                            <div className="flex justify-start">
                                <div className="bg-slate-800 rounded-2xl rounded-bl-md px-4 py-3">
                                    <div className="flex gap-1">
                                        <div className="w-2 h-2 bg-slate-500 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                                        <div className="w-2 h-2 bg-slate-500 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                                        <div className="w-2 h-2 bg-slate-500 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Input */}
                    <div className="px-3 py-3 border-t border-slate-700 bg-slate-900/80">
                        <div className="flex gap-2">
                            <input
                                ref={inputRef}
                                type="text"
                                value={input}
                                onChange={(e) => setInput(e.target.value)}
                                onKeyDown={handleKeyDown}
                                placeholder={t("chatbot.placeholder", locale)}
                                className="flex-1 bg-slate-800 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500/50 transition-colors"
                            />
                            <button
                                onClick={() => sendMessage(input)}
                                disabled={!input.trim() || loading}
                                className="w-10 h-10 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-700 disabled:text-slate-500 text-white rounded-xl flex items-center justify-center transition-colors"
                            >
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                                </svg>
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
