"use client";

interface TimeSliderProps {
  value: number;
  onChange: (minutes: number) => void;
  sunnyCount: number;
  onNow: () => void;
}

function minutesToTime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;
}

export default function TimeSlider({ value, onChange, sunnyCount, onNow }: TimeSliderProps) {
  const minMinutes = 8 * 60;
  const maxMinutes = 22 * 60;

  return (
    <div className="w-full">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[11px] text-neutral-500 font-medium">08:00</span>
        <div className="flex items-center gap-2">
          <span className="text-xs text-neutral-400">
            {sunnyCount} sunny at
          </span>
          <span className="text-sm font-bold text-amber-400 tabular-nums tracking-tight">
            {minutesToTime(value)}
          </span>
          <button
            onClick={onNow}
            className="rounded-full bg-amber-500/15 px-2.5 py-0.5 text-[11px] font-semibold text-amber-400 hover:bg-amber-500/25 transition-colors"
          >
            Now
          </button>
        </div>
        <span className="text-[11px] text-neutral-500 font-medium">22:00</span>
      </div>
      <input
        type="range"
        min={minMinutes}
        max={maxMinutes}
        step={15}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full"
        aria-label="Time of day"
        data-testid="time-slider"
      />
    </div>
  );
}
