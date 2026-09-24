import Link from "next/link";
import { formatPeso, shortMerchant } from "@/lib/format";

export default function TopCounterparties({
  rows,
  month,
  category,
}: {
  rows: { merchant: string; total: number; count: number }[];
  month: string;
  category?: string;
}) {
  if (!rows.length) return <p className="empty">No transfers this month.</p>;
  const max = rows[0].total;
  const sum = rows.reduce((a, r) => a + r.total, 0);

  return (
    <ol className="bars rank">
      {rows.map((r, i) => {
        const share = sum ? Math.round((r.total / sum) * 100) : 0;
        const q = new URLSearchParams({ m: month, q: shortMerchant(r.merchant) });
        if (category) q.set("c", category);
        return (
          <li key={r.merchant}>
            <Link
              href={`/transactions?${q}`}
              className="bar-row"
              title={`${r.merchant}: ${formatPeso(r.total)} · ${r.count} · ${share}%`}
            >
              <div className="bar-top">
                <span>
                  <span className="rank-n">{i + 1}</span>
                  {shortMerchant(r.merchant)}{" "}
                  <span className="muted small">{share}%</span>
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
    </ol>
  );
}
