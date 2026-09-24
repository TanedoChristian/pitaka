"use client";

import { useState } from "react";
import { niceMax } from "@/lib/chart";
import { formatPeso, formatPesoShort } from "@/lib/format";

const W = 720;
const H = 196;
const L = 48;
const R = 12;
const T = 16;
const B = 28;

/** Daily spend this month, with last month drawn as a line for comparison. */
export default function DailyChart({
  data,
  prev,
  days,
  monthLabel,
  prevLabel,
}: {
  data: { day: number; total: number }[];
  prev: { day: number; total: number }[];
  days: number;
  monthLabel: string;
  prevLabel: string;
}) {
  const [active, setActive] = useState<number | null>(null);
  const byDay = new Map(data.map((d) => [d.day, d.total]));
  const prevBy = new Map(prev.map((d) => [d.day, d.total]));
  const peak = Math.max(0, ...data.map((d) => d.total), ...prev.map((d) => d.total));
  const top = niceMax(peak);
  const innerW = W - L - R;
  const innerH = H - T - B;
  const slot = innerW / days;
  const barW = Math.max(4, slot * 0.62);

  const y = (v: number) => T + innerH - (v / top) * innerH;
  const x = (day: number) => L + (day - 0.5) * slot;

  const line = Array.from({ length: days }, (_, i) => {
    const day = i + 1;
    return `${i === 0 ? "M" : "L"} ${x(day).toFixed(2)} ${y(prevBy.get(day) ?? 0).toFixed(2)}`;
  }).join(" ");

  const ticks = [0, 0.5, 1].map((p) => p * top);
  const xLabels = [1, 8, 15, 22, days].filter((d, i, a) => a.indexOf(d) === i && d <= days);
  const month = monthLabel.split(" ")[0].slice(0, 3);
  const prevMonth = prevLabel.split(" ")[0].slice(0, 3);
  const now = active ? byDay.get(active) ?? 0 : 0;
  const then = active ? prevBy.get(active) ?? 0 : 0;

  return (
    <div className="chart">
      <div className="chart-legend">
        <span><i className="swatch swatch-1" /> {month}</span>
        <span><i className="swatch swatch-line" /> {prevMonth}</span>
      </div>
      <div className="chart-frame">
        {active !== null && (
          <div
            className="chart-tip"
            style={{ left: `${Math.min(88, Math.max(12, (x(active) / W) * 100)).toFixed(1)}%` }}
            role="status"
          >
            {month} {active}: {formatPeso(now)}
            <span className="muted"> · {prevMonth} {formatPeso(then)}</span>
          </div>
        )}
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Daily spending, peak ${formatPeso(top)}`}>
          {ticks.map((v) => (
            <g key={v}>
              <line x1={L} x2={W - R} y1={y(v)} y2={y(v)} stroke="var(--grid)" strokeWidth="1" />
              <text x={L - 8} y={y(v) + 4} textAnchor="end" className="chart-tick">
                {formatPesoShort(v)}
              </text>
            </g>
          ))}
          {Array.from({ length: days }, (_, i) => {
            const day = i + 1;
            const total = byDay.get(day) ?? 0;
            const h = total ? Math.max(3, (total / top) * innerH) : 0;
            const bx = x(day) - barW / 2;
            return (
              <g key={day}>
                {h > 0 && (
                  <rect
                    x={bx}
                    y={y(total)}
                    width={barW}
                    height={h}
                    rx="3"
                    fill="var(--series-1)"
                    opacity={active === null || active === day ? 1 : 0.35}
                  />
                )}
                <rect
                  x={L + i * slot}
                  y={T}
                  width={slot}
                  height={innerH}
                  fill="transparent"
                  onMouseEnter={() => setActive(day)}
                  onClick={() => setActive(active === day ? null : day)}
                />
              </g>
            );
          })}
          <path d={line} fill="none" stroke="var(--series-2)" strokeWidth="2" strokeLinejoin="round" />
          {xLabels.map((d) => (
            <text key={d} x={x(d)} y={H - 8} textAnchor="middle" className="chart-tick">
              {d}
            </text>
          ))}
        </svg>
      </div>
    </div>
  );
}
