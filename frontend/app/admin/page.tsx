"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { getLocale, t, type Locale } from "@/app/lib/i18n";
import { getStoredToken } from "@/app/lib/auth";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

interface AdminStats {
    total_users: number;
    total_assessments: number;
    avg_stress_score: number;
    level_distribution: Record<string, number>;
    recent_assessments: Array<{
        id: string;
        stress_score: number | null;
        stress_level: string | null;
        confidence: number | null;
        spoof_detected: boolean;
        completed_at: string | null;
        user_id: string;
        email: string | null;
        name: string | null;
    }>;
    model_info: {
        loaded: boolean;
        type: string;
        accuracy: number | null;
    };
}

const LEVEL_COLORS: Record<string, string> = {
    Low: "text-green-400 bg-green-400/10",
    Moderate: "text-amber-400 bg-amber-400/10",
    High: "text-orange-400 bg-orange-400/10",
    Critical: "text-red-400 bg-red-400/10",
    Unknown: "text-slate-400 bg-slate-400/10",
};

export default function AdminPage() {
    const router = useRouter();
    const [locale, setLoc] = useState<Locale>("en");
    const [stats, setStats] = useState<AdminStats | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    useEffect(() => {
        setLoc(getLocale());
        const handler = () => setLoc(getLocale());
        window.addEventListener("nervoscan-locale-change", handler);
        return () => window.removeEventListener("nervoscan-locale-change", handler);
    }, []);

    useEffect(() => {
        const token = getStoredToken();
        if (!token) {
            router.replace("/login?redirect=/admin");
            return;
        }
        
        fetchStats();
    }, [router]);

    const fetchStats = async () => {
        try {
            setLoading(true);
            const token = getStoredToken();
            if (!token) {
                router.replace("/login?redirect=/admin");
                return;
            }

            const res = await fetch(`${API_URL}/admin/stats`, {
                headers: {
                    Authorization: `Bearer ${token}`,
                },
            });

            if (res.status === 401) {
                router.replace("/login?redirect=/admin");
                return;
            }
            if (res.status === 403) {
                router.replace("/?error=unauthorized");
                return;
            }
            if (!res.ok) throw new Error("Failed to fetch admin stats");

            const data = await res.json();
            setStats(data);
        } catch (err: any) {
            setError(err.message || "Failed to load admin dashboard");
        } finally {
            setLoading(false);
        }
    };

    if (loading) {
        return (
            <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center">
                <div className="glass-card p-10 text-center">
                    <div className="w-12 h-12 border-4 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin mx-auto mb-4" />
                    <p className="text-slate-400">{t("admin.loading", locale)}</p>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center">
                <div className="glass-card p-10 text-center max-w-md">
                    <div className="w-16 h-16 bg-red-500/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
                        <svg className="w-8 h-8 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                        </svg>
                    </div>
                    <p className="text-red-400 mb-4">{error}</p>
                    <button onClick={fetchStats} className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-500 transition-colors">
                        Retry
                    </button>
                </div>
            </div>
        );
    }

    if (!stats) return null;

    const totalLevels = Object.values(stats.level_distribution).reduce((a, b) => a + b, 0);

    return (
        <div className="min-h-[calc(100vh-4rem)] px-4 py-8 max-w-6xl mx-auto">
            <div className="flex items-center justify-between mb-8">
                <div>
                    <h1 className="text-2xl font-bold text-slate-100">{t("admin.title", locale)}</h1>
                    <p className="text-sm text-slate-400 mt-1">{t("admin.subtitle", locale)}</p>
                </div>
                <div className="flex items-center gap-3">
                    <button
                        onClick={fetchStats}
                        className="px-4 py-2 bg-slate-800 text-slate-300 rounded-lg hover:bg-slate-700 transition-colors border border-slate-700 flex items-center gap-2 text-sm"
                    >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                        </svg>
                        Refresh
                    </button>
                    <button
                        onClick={() => router.push("/")}
                        className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-500 transition-colors flex items-center gap-2 text-sm"
                    >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                        </svg>
                        Back to App
                    </button>
                </div>
            </div>

            {/* Stats Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
                <StatCard
                    icon="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"
                    label={t("admin.totalUsers", locale)}
                    value={stats.total_users}
                    color="indigo"
                />
                <StatCard
                    icon="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                    label={t("admin.totalAssessments", locale)}
                    value={stats.total_assessments}
                    color="purple"
                />
                <StatCard
                    icon="M13 10V3L4 14h7v7l9-11h-7z"
                    label={t("admin.avgStress", locale)}
                    value={stats.avg_stress_score}
                    suffix="/100"
                    color="amber"
                />
                <StatCard
                    icon="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
                    label={t("admin.modelAccuracy", locale)}
                    value={stats.model_info.accuracy ?? "N/A"}
                    suffix={stats.model_info.accuracy ? "%" : ""}
                    color="green"
                />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
                {/* Stress Distribution */}
                <div className="glass-card p-6">
                    <h2 className="text-lg font-semibold text-slate-200 mb-4">{t("admin.stressDistribution", locale)}</h2>
                    <div className="space-y-3">
                        {["Low", "Moderate", "High", "Critical"].map((level) => {
                            const count = stats.level_distribution[level] || 0;
                            const pct = totalLevels > 0 ? (count / totalLevels) * 100 : 0;
                            return (
                                <div key={level}>
                                    <div className="flex justify-between text-sm mb-1">
                                        <span className={LEVEL_COLORS[level]?.split(" ")[0] || "text-slate-400"}>{level}</span>
                                        <span className="text-slate-400">{count} ({pct.toFixed(0)}%)</span>
                                    </div>
                                    <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
                                        <div
                                            className={`h-full rounded-full transition-all duration-500 ${level === "Low" ? "bg-green-500" :
                                                    level === "Moderate" ? "bg-amber-500" :
                                                        level === "High" ? "bg-orange-500" : "bg-red-500"
                                                }`}
                                            style={{ width: `${pct}%` }}
                                        />
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* Model Info */}
                <div className="glass-card p-6">
                    <h2 className="text-lg font-semibold text-slate-200 mb-4">{t("admin.modelInfo", locale)}</h2>
                    <div className="space-y-3">
                        <InfoRow label="Status" value={stats.model_info.loaded ? "✅ Active" : "⚠️ Fallback"} />
                        <InfoRow label="Type" value={stats.model_info.type} />
                        <InfoRow label="Accuracy" value={stats.model_info.accuracy ? `${stats.model_info.accuracy}%` : "N/A"} />
                        <InfoRow label="Total Users" value={String(stats.total_users)} />
                        <InfoRow label="Assessments" value={String(stats.total_assessments)} />
                    </div>
                </div>

                {/* Quick Actions */}
                <div className="glass-card p-6">
                    <h2 className="text-lg font-semibold text-slate-200 mb-4">{t("admin.quickActions", locale)}</h2>
                    <div className="space-y-2">
                        <a
                            href={`${API_URL}/docs`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="w-full flex items-center gap-3 px-4 py-3 bg-slate-800/50 hover:bg-slate-800 rounded-xl transition-colors text-sm text-slate-300"
                        >
                            <svg className="w-5 h-5 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                            </svg>
                            API Documentation (Swagger)
                        </a>
                        <a
                            href={`${API_URL}/health`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="w-full flex items-center gap-3 px-4 py-3 bg-slate-800/50 hover:bg-slate-800 rounded-xl transition-colors text-sm text-slate-300"
                        >
                            <svg className="w-5 h-5 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                            </svg>
                            Health Check
                        </a>
                        <button
                            onClick={fetchStats}
                            className="w-full flex items-center gap-3 px-4 py-3 bg-slate-800/50 hover:bg-slate-800 rounded-xl transition-colors text-sm text-slate-300"
                        >
                            <svg className="w-5 h-5 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                            </svg>
                            Refresh Statistics
                        </button>
                    </div>
                </div>
            </div>

            {/* Recent Assessments Table */}
            <div className="glass-card p-6">
                <h2 className="text-lg font-semibold text-slate-200 mb-4">{t("admin.recentAssessments", locale)}</h2>
                {stats.recent_assessments.length === 0 ? (
                    <p className="text-slate-500 text-sm py-8 text-center">No completed assessments yet.</p>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="text-slate-500 text-xs uppercase tracking-wider border-b border-slate-800">
                                    <th className="text-left pb-3 pr-4">User</th>
                                    <th className="text-left pb-3 pr-4">Score</th>
                                    <th className="text-left pb-3 pr-4">Level</th>
                                    <th className="text-left pb-3 pr-4">Confidence</th>
                                    <th className="text-left pb-3 pr-4">Spoof</th>
                                    <th className="text-left pb-3">Date</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-800/50">
                                {stats.recent_assessments.map((a) => (
                                    <tr key={a.id} className="hover:bg-slate-800/30 transition-colors">
                                        <td className="py-3 pr-4">
                                            <span className="text-slate-300">{a.name || a.email || a.user_id.slice(0, 8)}</span>
                                        </td>
                                        <td className="py-3 pr-4">
                                            <span className="text-slate-200 font-medium">{a.stress_score ?? "—"}</span>
                                        </td>
                                        <td className="py-3 pr-4">
                                            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${LEVEL_COLORS[a.stress_level || "Unknown"] || LEVEL_COLORS.Unknown}`}>
                                                {a.stress_level || "—"}
                                            </span>
                                        </td>
                                        <td className="py-3 pr-4 text-slate-400">{a.confidence ? `${a.confidence}%` : "—"}</td>
                                        <td className="py-3 pr-4">
                                            {a.spoof_detected ? (
                                                <span className="text-red-400 text-xs">⚠️ Flagged</span>
                                            ) : (
                                                <span className="text-green-400 text-xs">✓ OK</span>
                                            )}
                                        </td>
                                        <td className="py-3 text-slate-500 text-xs">
                                            {a.completed_at ? new Date(a.completed_at).toLocaleDateString() : "—"}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
}

function StatCard({
    icon,
    label,
    value,
    suffix = "",
    color,
}: {
    icon: string;
    label: string;
    value: number | string;
    suffix?: string;
    color: string;
}) {
    const colorMap: Record<string, string> = {
        indigo: "bg-indigo-500/10 text-indigo-400",
        purple: "bg-purple-500/10 text-purple-400",
        amber: "bg-amber-500/10 text-amber-400",
        green: "bg-green-500/10 text-green-400",
    };

    return (
        <div className="glass-card p-5">
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center mb-3 ${colorMap[color] || colorMap.indigo}`}>
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d={icon} />
                </svg>
            </div>
            <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">{label}</p>
            <p className="text-2xl font-bold text-slate-200">
                {value}<span className="text-sm text-slate-500 font-normal">{suffix}</span>
            </p>
        </div>
    );
}

function InfoRow({ label, value }: { label: string; value: string }) {
    return (
        <div className="flex justify-between items-center py-2 border-b border-slate-800/50 last:border-0">
            <span className="text-sm text-slate-500">{label}</span>
            <span className="text-sm text-slate-300 font-medium">{value}</span>
        </div>
    );
}
