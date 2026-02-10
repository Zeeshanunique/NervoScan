"use client";

interface CountdownTimerProps {
  seconds: number;
  total: number;
}

export default function CountdownTimer({ seconds, total }: CountdownTimerProps) {
  const progress = ((total - seconds) / total) * 100;
  const radius = 54;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (progress / 100) * circumference;

  const getColor = () => {
    if (seconds > 40) return "#6366f1";
    if (seconds > 20) return "#eab308";
    if (seconds > 10) return "#f97316";
    return "#ef4444";
  };

  return (
    <div className="relative inline-flex items-center justify-center">
      <svg width="130" height="130" className="-rotate-90">
        <circle
          cx="65"
          cy="65"
          r={radius}
          stroke="#1e293b"
          strokeWidth="8"
          fill="none"
        />
        <circle
          cx="65"
          cy="65"
          r={radius}
          stroke={getColor()}
          strokeWidth="8"
          fill="none"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className="transition-all duration-1000 ease-linear"
          style={{ filter: `drop-shadow(0 0 6px ${getColor()}50)` }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span
          className="text-3xl font-bold tabular-nums"
          style={{ color: getColor() }}
        >
          {seconds}
        </span>
        <span className="text-[10px] text-slate-500 uppercase tracking-wider">
          seconds
        </span>
      </div>
    </div>
  );
}
