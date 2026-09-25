import Link from "next/link";
import { formatPeso } from "@/lib/format";

const COLORS = [
  "var(--series-1)",
  "var(--series-2)",
  "#3d6b8c",
  "#8b5e3c",
  "#6b4c7a",
  "#4a7c59",
  "#a35b4a",
  "#2f6f6a",
];

function slicePath(cx: number, cy: number, r: number, start: number, end: number) {
  const rad = (d: number) => ((d - 90) * Math.PI) / 180;
  const x1 = cx + r * Math.cos(rad(start));
  const y1 = cy + r * Math.sin(rad(start));
  const x2 = cx + r * Math.cos(rad(end));
  const y2 = cy + r * Math.sin(rad(end));
  const large = end - start > 180 ? 1 : 0;
  return `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} Z`;
}

export default function CategoryPie({
  rows,
  month,
}: {
  rows: { category: string; total: number; count: number }[];
  month: string;
}) {
  if (!rows.length) return <p className="empty">No spending this month.</p>;

  const sum = rows.reduce((a, r) => a + r.total, 0);
  const top = rows[0];
  const topShare = sum ? Math.round((top.total / sum) * 100) : 0;
  let angle = 0;
  const slices = rows.map((r, i) => {
    const sweep = sum ? (r.total / sum) * 360 : 0;
    const start = angle;
    angle += sweep;
    return { ...r, start, end: angle, color: COLORS[i % COLORS.length] };
  });

  return (
    <div className="pie">
      <div className="pie-visual">
        <svg viewBox="0 0 200 200" className="pie-svg" role="img" aria-label={`${top.category} ${formatPeso(top.total)}`}>
          {slices.map((s) =>
            s.end - s.start < 0.3 ? null : (
              <path key={s.category} d={slicePath(100, 100, 92, s.start, s.end)} fill={s.color} />
            ),
          )}
          <circle cx="100" cy="100" r="58" className="pie-hole" />
        </svg>
        <div className="pie-center">
          <p className="stat-label">Biggest</p>
          <p className="pie-cat">{top.category}</p>
          <p className="pie-amt">{formatPeso(top.total)}</p>
          <p className="muted small">{topShare}% of spend</p>
        </div>
      </div>
      <ul className="pie-legend">
        {slices.map((s) => {
          const share = sum ? Math.round((s.total / sum) * 100) : 0;
          return (
            <li key={s.category}>
              <Link href={`/transactions?m=${month}&c=${encodeURIComponent(s.category)}`} className="pie-leg">
                <span className="pie-swatch" style={{ background: s.color }} aria-hidden="true" />
                <span className="txn-title">{s.category}</span>
                <span className="muted small">{share}%</span>
                <span className="val">{formatPeso(s.total)}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
