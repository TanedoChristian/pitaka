"use client";

import { useState } from "react";
import { formatPeso, formatPesoShort } from "@/lib/format";

const H = 140;
const TOP = 22; // room for the tooltip

/** Spending per day of the month, with a hover/tap tooltip per column. */
export default function DailyChart({
  data,
  days,
  monthLabel,
}: {
  data: { day: number; total: number }[];
  days: number;
  monthLabel: string;
}) {
  const [active, setActive] = useState<number | null>(null);
  const byDay = new Map(data.map((d) => [d.day, d.total]));
  const max = Math.max(1, ...data.map((d) => d.total));
  const w = 100 / days;
  const gap = Math.min(0.6, w * 0.25); // ≥ 2px-ish spacer between columns at phone width
  const activeTotal = active ? byDay.get(active) ?? 0 : 0;

  return (
    <div className="daily" onMouseLeave={() => setActive(null)}>
      {active !== null && (
        <div className="tip" style={{ left: `${(active - 0.5) * w}%` }} role="status">
          {monthLabel.split(" ")[0].slice(0, 3)} {active}: {formatPeso(activeTotal)}
        </div>
      )}
      <svg viewBox={`0 0 100 ${H}`} preserveAspectRatio="none" role="img" aria-label={`Daily spending, peak ${formatPeso(max)}`}>
        <line x1="0" x2="100" y1={H} y2={H} stroke="var(--grid)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
        <line x1="0" x2="100" y1={TOP} y2={TOP} stroke="var(--grid)" strokeWidth="1" strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />
        {Array.from({ length: days }, (_, i) => {
          const day = i + 1;
          const total = byDay.get(day) ?? 0;
          const h = total ? Math.max(2, (total / max) * (H - TOP)) : 0;
          const x = i * w;
          return (
            <g key={day}>
              {h > 0 && (
                <rect
                  x={x + gap / 2}
                  width={w - gap}
                  y={H - h}
                  height={h}
                  rx="0.6"
                  fill="var(--series-1)"
                  opacity={active === null || active === day ? 1 : 0.45}
                />
              )}
              {/* full-height hit target, larger than the mark */}
              <rect
                x={x}
                width={w}
                y="0"
                height={H}
                fill="transparent"
                onMouseEnter={() => setActive(day)}
                onClick={() => setActive(active === day ? null : day)}
              />
            </g>
          );
        })}
      </svg>
      <div className="daily-axis">
        <span>1</span>
        <span>peak {formatPesoShort(max)}</span>
        <span>{days}</span>
      </div>
    </div>
  );
}
