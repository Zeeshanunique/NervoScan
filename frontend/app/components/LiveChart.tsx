"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Area,
  AreaChart,
} from "recharts";

interface LiveChartProps {
  data: Array<{
    time: number;
    stress: number;
    voice: number;
    face: number;
  }>;
  title?: string;
}

export default function LiveChart({ data, title = "Stress Over Time" }: LiveChartProps) {
  return (
    <div className="bg-slate-800/50 backdrop-blur rounded-xl border border-slate-700/50 p-4">
      <h3 className="text-sm font-medium text-slate-300 mb-3">{title}</h3>
      <ResponsiveContainer width="100%" height={200}>
        <AreaChart data={data}>
          <defs>
            <linearGradient id="stressGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
              <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="voiceGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#22c55e" stopOpacity={0.2} />
              <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="faceGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.2} />
              <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
          <XAxis
            dataKey="time"
            stroke="#64748b"
            fontSize={12}
            tickFormatter={(v) => `${v}s`}
          />
          <YAxis stroke="#64748b" fontSize={12} domain={[0, 100]} />
          <Tooltip
            contentStyle={{
              backgroundColor: "#1e293b",
              border: "1px solid #334155",
              borderRadius: "8px",
              fontSize: "12px",
            }}
            labelFormatter={(v) => `${v}s`}
          />
          <Area
            type="monotone"
            dataKey="stress"
            stroke="#6366f1"
            fill="url(#stressGradient)"
            strokeWidth={2}
            name="Stress"
          />
          <Area
            type="monotone"
            dataKey="voice"
            stroke="#22c55e"
            fill="url(#voiceGradient)"
            strokeWidth={1.5}
            name="Voice"
            strokeDasharray="4 4"
          />
          <Area
            type="monotone"
            dataKey="face"
            stroke="#f59e0b"
            fill="url(#faceGradient)"
            strokeWidth={1.5}
            name="Face"
            strokeDasharray="4 4"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
