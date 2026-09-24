import Link from "next/link";
import type { Txn } from "@/lib/db";
import { dayKey, formatDay, formatPeso, formatTime } from "@/lib/format";

export default function TxnList({ txns, empty = "No transactions yet." }: { txns: Txn[]; empty?: string }) {
  if (!txns.length) return <p className="empty">{empty}</p>;

  const items: React.ReactNode[] = [];
  let lastDay = "";
  for (const t of txns) {
    const key = dayKey(t.occurred_at);
    if (key !== lastDay) {
      items.push(<li key={`d-${key}`} className="day-head">{formatDay(t.occurred_at)}</li>);
      lastDay = key;
    }
    const review = t.needs_review || t.category === "Uncategorized";
    items.push(
      <li key={t.id} className="txn">
        <Link href={`/transactions/${t.id}`} className="txn-main">
          <div className="txn-title">{t.merchant || t.description || "(no description)"}</div>
          <div className="txn-meta">
            <span className={review ? "chip warn" : "chip"}>{review && t.needs_review ? "Check this" : t.category}</span>
            <span>{formatTime(t.occurred_at)}</span>
            {t.account && <span>··{t.account}</span>}
            {t.source === "manual" && <span>manual</span>}
          </div>
        </Link>
        <span className={t.direction === "in" ? "txn-amt in" : "txn-amt"}>
          {t.direction === "in" ? "+" : "−"}
          {formatPeso(t.amount)}
        </span>
      </li>,
    );
  }
  return <ul className="txns">{items}</ul>;
}
