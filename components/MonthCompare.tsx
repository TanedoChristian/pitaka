"use client";

import { useState } from "react";
import { niceMax } from "@/lib/chart";
import { formatPeso, formatPesoShort, monthShort } from "@/lib/format";

const W = 720;
const H = 248;
const H_COMPACT = 148;
const L = 48;
const R = 12;
const T = 16;
const T_COMPACT = 8;
const B = 32;
const B_COMPACT = 24;

/** Spent vs received across recent months. */
export default function MonthCompare({
  rows,
  compact = false,
}: {
  rows: { month: string; spent: number; received: number }[];
  compact?: boolean;
}) {
  const [active, setActive] = useState<number | null>(null);
  const height = compact ? H_COMPACT : H;
  const topPad = compact ? T_COMPACT : T;
  const botPad = compact ? B_COMPACT : B;
  const top = niceMax(Math.max(1, ...rows.flatMap((r) => [r.spent, r.received])));
  const innerW = W - L - R;
  const innerH = height - topPad - botPad;
  const slot = innerW / rows.length;
  const barW = Math.min(22, slot * 0.28);
  const gap = 5;
  const y = (v: number) => topPad + innerH - (v / top) * innerH;
  const ticks = [0, 0.5, 1].map((p) => p * top);
  const hit = active !== null ? rows[active] : null;

  return (
    <div className={`chart${compact ? " compact" : ""}`}>
      <div className="chart-legend">
        <span><i className="swatch swatch-1" /> Spent</span>
        <span><i className="swatch swatch-2" /> Received</span>
      </div>
      <div className="chart-frame">
        {hit && (
          <div
            className="chart-tip"
            style={{ left: `${Math.min(88, Math.max(12, ((L + (active! + 0.5) * slot) / W) * 100))}%` }}
            role="status"
          >
            {monthShort(hit.month)}: −{formatPeso(hit.spent)} / +{formatPeso(hit.received)}
          </div>
        )}
        <svg viewBox={`0 0 ${W} ${height}`} role="img" aria-label="Monthly spent versus received">
          {ticks.map((v) => (
            <g key={v}>
              <line x1={L} x2={W - R} y1={y(v)} y2={y(v)} stroke="var(--grid)" strokeWidth="1" />
              <text x={L - 8} y={y(v) + 4} textAnchor="end" className="chart-tick">
                {formatPesoShort(v)}
              </text>
            </g>
          ))}
          {rows.map((r, i) => {
            const cx = L + (i + 0.5) * slot;
            const spentH = r.spent ? Math.max(3, (r.spent / top) * innerH) : 0;
            const recvH = r.received ? Math.max(3, (r.received / top) * innerH) : 0;
            const dim = active !== null && active !== i;
            return (
              <g key={r.month}>
                {spentH > 0 && (
                  <rect
                    x={cx - barW - gap / 2}
                    y={y(r.spent)}
                    width={barW}
                    height={spentH}
                    rx="3"
                    fill="var(--series-1)"
                    opacity={dim ? 0.35 : 1}
                  />
                )}
                {recvH > 0 && (
                  <rect
                    x={cx + gap / 2}
                    y={y(r.received)}
                    width={barW}
                    height={recvH}
                    rx="3"
                    fill="var(--series-2)"
                    opacity={dim ? 0.35 : 1}
                  />
                )}
                <text x={cx} y={height - 8} textAnchor="middle" className="chart-tick">
                  {monthShort(r.month)}
                </text>
                <rect
                  x={L + i * slot}
                  y={topPad}
                  width={slot}
                  height={innerH}
                  fill="transparent"
                  onMouseEnter={() => setActive(i)}
                  onClick={() => setActive(active === i ? null : i)}
                />
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}
