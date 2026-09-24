import Link from "next/link";
import { formatPeso } from "@/lib/format";

/** Ranked horizontal bars: one series, so one color; every bar is labeled. */
export default function CategoryBars({
  rows,
  month,
}: {
  rows: { category: string; total: number; count: number }[];
  month: string;
}) {
  if (!rows.length) return <p className="empty">No spending this month.</p>;
  const max = rows[0].total;
  const sum = rows.reduce((a, r) => a + r.total, 0);
  return (
    <ul className="bars">
      {rows.map((r) => {
        const share = sum ? Math.round((r.total / sum) * 100) : 0;
        return (
          <li key={r.category}>
            <Link
              href={`/transactions?m=${month}&c=${encodeURIComponent(r.category)}`}
              className="bar-row"
              title={`${r.category}: ${formatPeso(r.total)} · ${r.count} transaction${r.count === 1 ? "" : "s"} · ${share}%`}
            >
              <div className="bar-top">
                <span>
                  {r.category} <span className="muted small">{share}%</span>
                </span>
                <span className="val">{formatPeso(r.total)}</span>
              </div>
              <div className="bar-track">
                <div className="bar-fill" style={{ width: `${(r.total / max) * 100}%` }} />
              </div>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
