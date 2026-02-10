"use client";

import { useState, useEffect } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  AreaChart,
  Area,
} from "recharts";
import { getLocale, t, type Locale } from "@/app/lib/i18n";
import { getReports, getExportPdfUrl, getExportCsvUrl } from "@/app/lib/api";
import StressLevel from "@/app/components/StressLevel";

interface Assessment {
  id: string;
  stress_score: number | null;
  stress_level: string | null;
  confidence: number | null;
  spoof_detected: boolean;
  status: string;
  started_at: string;
  completed_at: string | null;
}

interface TrendData {
  dates: string[];
  stress_scores: number[];
  confidence_scores: number[];
}

type TimeRange = "daily" | "weekly" | "monthly";

export default function ReportsPage() {
  const [locale, setLoc] = useState<Locale>("en");
  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [trend, setTrend] = useState<TrendData | null>(null);
  const [timeRange, setTimeRange] = useState<TimeRange>("daily");
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string>("");

  useEffect(() => {
    setLoc(getLocale());
    loadReports();
  }, []);

  const loadReports = async () => {
    setLoading(true);
    const storedUserId = localStorage.getItem("nervoscan-user-id");

    if (storedUserId) {
      setUserId(storedUserId);
      try {
        const days = timeRange === "daily" ? 7 : timeRange === "weekly" ? 30 : 90;
        const data = await getReports(storedUserId, days);
        setAssessments(data.assessments || []);
        setTrend(data.trend || null);
      } catch {
        setAssessments([]);
        setTrend(null);
      }
    }

    setLoading(false);
  };

  const trendChartData = trend
    ? trend.dates.map((date, i) => ({
        date: date.substring(5), // MM-DD
        stress: trend.stress_scores[i],
        confidence: trend.confidence_scores[i],
      }))
    : [];

  const avgStress =
    assessments.length > 0
      ? Math.round(assessments.reduce((s, a) => s + (a.stress_score || 0), 0) / assessments.length)
      : 0;

  const avgConfidence =
    assessments.length > 0
      ? Math.round(assessments.reduce((s, a) => s + (a.confidence || 0), 0) / assessments.length)
      : 0;

  const highStressDays = assessments.filter(
    (a) => a.stress_level === "High" || a.stress_level === "Critical"
  ).length;

  return (
    <div className="min-h-[calc(100vh-4rem)] px-4 py-8 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-slate-100">{t("report.title", locale)}</h1>

        <div className="flex gap-2">
          {(["daily", "weekly", "monthly"] as TimeRange[]).map((range) => (
            <button
              key={range}
              onClick={() => setTimeRange(range)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                timeRange === range
                  ? "bg-indigo-500/20 text-indigo-400 border border-indigo-500/30"
                  : "text-slate-400 hover:text-slate-300 bg-slate-800/50 border border-slate-700/50"
              }`}
            >
              {t(`report.${range}`, locale)}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-3 border-indigo-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : assessments.length === 0 ? (
        <div className="glass-card p-12 text-center">
          <div className="w-16 h-16 bg-slate-800 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <p className="text-slate-400">{t("report.noData", locale)}</p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Stats summary */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard label="Total Assessments" value={assessments.length.toString()} />
            <StatCard label="Avg Stress" value={`${avgStress}`} suffix="/100" color={avgStress > 60 ? "text-red-400" : avgStress > 40 ? "text-yellow-400" : "text-green-400"} />
            <StatCard label="Avg Confidence" value={`${avgConfidence}%`} color="text-indigo-400" />
            <StatCard label="High Stress Days" value={highStressDays.toString()} color={highStressDays > 5 ? "text-red-400" : "text-slate-300"} />
          </div>

          {/* Trend chart */}
          <div className="glass-card p-6">
            <h3 className="text-lg font-semibold text-slate-200 mb-4">{t("report.trend", locale)}</h3>
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={trendChartData}>
                <defs>
                  <linearGradient id="trendGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="confGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#22c55e" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis dataKey="date" stroke="#64748b" fontSize={12} />
                <YAxis stroke="#64748b" fontSize={12} domain={[0, 100]} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#1e293b",
                    border: "1px solid #334155",
                    borderRadius: "8px",
                    fontSize: "12px",
                  }}
                />
                <Area type="monotone" dataKey="stress" stroke="#6366f1" fill="url(#trendGrad)" strokeWidth={2} name="Stress" />
                <Area type="monotone" dataKey="confidence" stroke="#22c55e" fill="url(#confGrad)" strokeWidth={1.5} name="Confidence" strokeDasharray="4 4" />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* Assessment history */}
          <div className="glass-card p-6">
            <h3 className="text-lg font-semibold text-slate-200 mb-4">Recent Assessments</h3>
            <div className="space-y-3">
              {assessments.slice(0, 10).map((a) => (
                <div
                  key={a.id}
                  className="flex items-center justify-between p-3 bg-slate-800/30 rounded-lg hover:bg-slate-800/50 transition-colors"
                >
                  <div className="flex items-center gap-4">
                    <StressLevel level={a.stress_level || "Unknown"} />
                    <div>
                      <p className="text-sm font-medium text-slate-200">
                        Score: {a.stress_score ?? "—"}
                      </p>
                      <p className="text-xs text-slate-500">
                        {new Date(a.started_at).toLocaleDateString()} at{" "}
                        {new Date(a.started_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-slate-400">Confidence: {a.confidence ?? "—"}%</p>
                    {a.spoof_detected && (
                      <span className="text-xs text-amber-400">Inconsistency flagged</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Export buttons */}
          <div className="flex gap-4 justify-center">
            <button
              onClick={() => {
                if (assessments.length > 0) {
                  window.open(getExportPdfUrl(assessments[0].id), "_blank");
                }
              }}
              className="px-6 py-3 bg-slate-800 text-slate-200 font-medium rounded-xl hover:bg-slate-700 transition-colors border border-slate-700 flex items-center gap-2"
              disabled={assessments.length === 0}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              {t("report.exportPdf", locale)}
            </button>
            <button
              onClick={() => {
                if (userId) {
                  window.open(getExportCsvUrl(userId), "_blank");
                }
              }}
              className="px-6 py-3 bg-slate-800 text-slate-200 font-medium rounded-xl hover:bg-slate-700 transition-colors border border-slate-700 flex items-center gap-2"
              disabled={!userId}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              {t("report.exportCsv", locale)}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  suffix,
  color = "text-slate-200",
}: {
  label: string;
  value: string;
  suffix?: string;
  color?: string;
}) {
  return (
    <div className="glass-card p-4">
      <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">{label}</p>
      <p className={`text-2xl font-bold ${color}`}>
        {value}
        {suffix && <span className="text-sm text-slate-500 font-normal">{suffix}</span>}
      </p>
    </div>
  );
}
