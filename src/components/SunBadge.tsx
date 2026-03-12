"use client";

import type { SunStatus } from "@/types";

interface SunBadgeProps {
  status: SunStatus;
  size?: "sm" | "md";
}

const config: Record<SunStatus, { bg: string; text: string; label: string; emoji: string }> = {
  sunny: { bg: "bg-amber-500/15", text: "text-amber-400", label: "Sunny", emoji: "☀️" },
  partial: { bg: "bg-orange-500/15", text: "text-orange-400", label: "Partial", emoji: "⛅" },
  shaded: { bg: "bg-neutral-500/15", text: "text-neutral-400", label: "Shaded", emoji: "☁️" },
};

export default function SunBadge({ status, size = "sm" }: SunBadgeProps) {
  const c = config[status];
  const sizeClasses = size === "sm" ? "px-2 py-0.5 text-[11px]" : "px-3 py-1 text-xs";

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full font-semibold ${c.bg} ${c.text} ${sizeClasses}`}
    >
      {c.emoji} {c.label}
    </span>
  );
}
