"use client";

interface StressGaugeProps {
  score: number;
  size?: number;
  label?: string;
}

export default function StressGauge({ score, size = 200, label = "Stress" }: StressGaugeProps) {
  const radius = (size - 20) / 2;
  const circumference = Math.PI * radius; // Half circle
  const progress = (score / 100) * circumference;

  const getColor = (s: number) => {
    if (s < 25) return "#22c55e";
    if (s < 50) return "#eab308";
    if (s < 75) return "#f97316";
    return "#ef4444";
  };

  const color = getColor(score);

  return (
    <div className="flex flex-col items-center">
      <svg width={size} height={size / 2 + 30} viewBox={`0 0 ${size} ${size / 2 + 30}`}>
        {/* Background arc */}
        <path
          d={`M 10 ${size / 2 + 10} A ${radius} ${radius} 0 0 1 ${size - 10} ${size / 2 + 10}`}
          fill="none"
          stroke="#1e293b"
          strokeWidth="12"
          strokeLinecap="round"
        />
        {/* Progress arc */}
        <path
          d={`M 10 ${size / 2 + 10} A ${radius} ${radius} 0 0 1 ${size - 10} ${size / 2 + 10}`}
          fill="none"
          stroke={color}
          strokeWidth="12"
          strokeLinecap="round"
          strokeDasharray={`${circumference}`}
          strokeDashoffset={`${circumference - progress}`}
          className="transition-all duration-700 ease-out"
          style={{ filter: `drop-shadow(0 0 8px ${color}40)` }}
        />
        {/* Score text */}
        <text
          x={size / 2}
          y={size / 2 - 5}
          textAnchor="middle"
          className="text-4xl font-bold"
          fill={color}
          style={{ fontSize: size / 5 }}
        >
          {Math.round(score)}
        </text>
        <text
          x={size / 2}
          y={size / 2 + 20}
          textAnchor="middle"
          fill="#94a3b8"
          style={{ fontSize: size / 14 }}
        >
          / 100
        </text>
      </svg>
      <span className="text-sm text-slate-400 -mt-1">{label}</span>
    </div>
  );
}
