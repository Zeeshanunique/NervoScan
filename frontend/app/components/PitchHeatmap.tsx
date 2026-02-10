"use client";

interface PitchHeatmapProps {
  pitchValues: number[];
  maxPitch?: number;
}

export default function PitchHeatmap({ pitchValues, maxPitch = 400 }: PitchHeatmapProps) {
  const getColor = (pitch: number) => {
    const normalized = Math.min(pitch / maxPitch, 1);
    if (normalized < 0.25) return "bg-blue-900";
    if (normalized < 0.5) return "bg-green-700";
    if (normalized < 0.75) return "bg-yellow-600";
    return "bg-red-600";
  };

  const getGlow = (pitch: number) => {
    const normalized = Math.min(pitch / maxPitch, 1);
    if (normalized < 0.25) return "";
    if (normalized < 0.5) return "shadow-green-500/20";
    if (normalized < 0.75) return "shadow-yellow-500/30";
    return "shadow-red-500/40 shadow-lg";
  };

  return (
    <div className="bg-slate-800/50 backdrop-blur rounded-xl border border-slate-700/50 p-4">
      <h3 className="text-sm font-medium text-slate-300 mb-3">Voice Pitch Heatmap</h3>
      <div className="flex gap-1 items-end h-16">
        {pitchValues.map((pitch, i) => (
          <div
            key={i}
            className={`flex-1 rounded-sm transition-all duration-300 ${getColor(pitch)} ${getGlow(pitch)}`}
            style={{
              height: `${Math.max(4, (pitch / maxPitch) * 100)}%`,
              minHeight: "4px",
            }}
            title={`${Math.round(pitch)} Hz`}
          />
        ))}
        {pitchValues.length === 0 && (
          <div className="flex-1 flex items-center justify-center text-slate-600 text-xs">
            Awaiting data...
          </div>
        )}
      </div>
      <div className="flex justify-between mt-2 text-[10px] text-slate-500">
        <span>Low</span>
        <span>Medium</span>
        <span>High</span>
      </div>
    </div>
  );
}
