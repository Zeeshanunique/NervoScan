"use client";

interface StressLevelProps {
  level: string;
  large?: boolean;
}

const levelConfig: Record<string, { color: string; bg: string; icon: string }> = {
  Low: { color: "text-green-400", bg: "bg-green-500/10 border-green-500/20", icon: "🟢" },
  Moderate: { color: "text-yellow-400", bg: "bg-yellow-500/10 border-yellow-500/20", icon: "🟡" },
  High: { color: "text-orange-400", bg: "bg-orange-500/10 border-orange-500/20", icon: "🟠" },
  Critical: { color: "text-red-400", bg: "bg-red-500/10 border-red-500/20", icon: "🔴" },
  Unknown: { color: "text-slate-400", bg: "bg-slate-500/10 border-slate-500/20", icon: "⚪" },
};

export default function StressLevel({ level, large = false }: StressLevelProps) {
  const config = levelConfig[level] || levelConfig.Unknown;

  return (
    <div
      className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full border ${config.bg} ${
        large ? "text-lg px-5 py-2" : "text-sm"
      }`}
    >
      <span>{config.icon}</span>
      <span className={`font-semibold ${config.color}`}>{level}</span>
    </div>
  );
}
