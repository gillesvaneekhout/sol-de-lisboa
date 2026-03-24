"use client";

interface TimeSliderProps {
  value: number;
  onChange: (minutes: number) => void;
  sunnyCount: number;
  onNow: () => void;
  date?: Date;
  onDateChange?: (date: Date) => void;
}

function minutesToTime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;
}

function formatDateShort(date: Date): string {
  return date.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function isToday(date: Date): boolean {
  const today = new Date();
  return (
    date.getDate() === today.getDate() &&
    date.getMonth() === today.getMonth() &&
    date.getFullYear() === today.getFullYear()
  );
}

export default function TimeSlider({
  value,
  onChange,
  sunnyCount,
  onNow,
  date,
  onDateChange,
}: TimeSliderProps) {
  const minMinutes = 8 * 60;
  const maxMinutes = 22 * 60;

  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (onDateChange && e.target.value) {
      onDateChange(new Date(e.target.value + "T12:00:00"));
    }
  };

  const handleToday = () => {
    if (onDateChange) {
      onDateChange(new Date());
    }
  };

  return (
    <div className="w-full space-y-3">
      {/* Time display and slider */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <span className="text-lg">☀️</span>
          <div className="flex items-center gap-2">
            <span className="text-xs text-neutral-400">{sunnyCount} sunny at</span>
            <span className="text-xl font-bold text-amber-400 tabular-nums tracking-tight">
              {minutesToTime(value)}
            </span>
            <button
              onClick={onNow}
              className="rounded-full bg-amber-500/15 px-4 py-2 text-xs font-semibold text-amber-400 hover:bg-amber-500/25 active:scale-95 transition-all min-h-[44px] min-w-[44px]"
            >
              Now
            </button>
          </div>
          <span className="text-lg">🌙</span>
        </div>
        <input
          type="range"
          min={minMinutes}
          max={maxMinutes}
          step={15}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="w-full h-2 bg-neutral-700 rounded-lg appearance-none cursor-pointer accent-amber-500"
          aria-label="Time of day"
          data-testid="time-slider"
        />
        {/* Hour markers */}
        <div className="flex justify-between text-[10px] text-neutral-500 mt-1 px-1">
          <span>8:00</span>
          <span>12:00</span>
          <span>16:00</span>
          <span>20:00</span>
        </div>
      </div>

      {/* Date picker (optional) */}
      {date && onDateChange && (
        <div className="flex items-center justify-center gap-2 pt-1 border-t border-neutral-800">
          <span className="text-sm">📅</span>
          <input
            type="date"
            value={date.toISOString().split("T")[0]}
            onChange={handleDateChange}
            className="bg-neutral-800 text-white text-sm px-2 py-1 rounded border border-neutral-700 focus:border-amber-500 focus:outline-none"
          />
          {!isToday(date) && (
            <button
              onClick={handleToday}
              className="rounded bg-neutral-700 px-2 py-1 text-xs text-neutral-300 hover:bg-neutral-600 transition-colors"
            >
              Today
            </button>
          )}
          <span className="text-xs text-neutral-500">{formatDateShort(date)}</span>
        </div>
      )}
    </div>
  );
}
