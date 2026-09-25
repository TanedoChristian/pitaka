import Link from "next/link";
import { bankLabel } from "@/lib/banks";
import type { Txn } from "@/lib/db";
import { dayKey, formatDay, formatPeso, formatTime, shortMerchant } from "@/lib/format";

function label(t: Txn) {
  return t.merchant || t.description || "(no description)";
}

export default function TxnList({
  txns,
  compact = false,
  empty = "No transactions yet.",
}: {
  txns: Txn[];
  compact?: boolean;
  empty?: string;
}) {
  if (!txns.length) return <p className="empty">{empty}</p>;

  if (compact) {
    return (
      <ul className="recent">
        {txns.map((t) => {
          const review = t.needs_review || t.category === "Uncategorized";
          const name = label(t);
          return (
            <li key={t.id}>
              <Link href={`/transactions/${t.id}`} className="recent-row" title={name}>
                <span className="txn-body">
                  <span className="txn-title">{shortMerchant(name)}</span>
                  <span className="recent-meta">
                    <span className={review ? "chip warn" : undefined}>
                      {review && t.needs_review ? "Check this" : t.category}
                    </span>
                    <span>{formatDay(t.occurred_at)}</span>
                  </span>
                </span>
                <span className={t.direction === "in" ? "txn-amt in" : "txn-amt"}>
                  {t.direction === "in" ? "+" : "−"}
                  {formatPeso(t.amount)}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    );
  }

  const groups: { key: string; title: string; out: number; inn: number; items: Txn[] }[] = [];
  for (const t of txns) {
    const key = dayKey(t.occurred_at);
    const last = groups.at(-1);
    if (!last || last.key !== key) {
      groups.push({ key, title: formatDay(t.occurred_at), out: 0, inn: 0, items: [] });
    }
    const g = groups.at(-1)!;
    g.items.push(t);
    if (t.direction === "in") g.inn += t.amount;
    else g.out += t.amount;
  }

  return (
    <ul className="txns">
      {groups.map((g) => (
        <li key={g.key} className="txn-group">
          <div className="day-head">
            <span>{g.title}</span>
            <span className="day-sum">
              {g.out > 0 && <span>−{formatPeso(g.out)}</span>}
              {g.inn > 0 && <span className="in">+{formatPeso(g.inn)}</span>}
            </span>
          </div>
          <ul className="txn-day">
            {g.items.map((t) => {
              const review = t.needs_review || t.category === "Uncategorized";
              const name = label(t);
              const mark = shortMerchant(name).replace(/[^A-Za-z0-9]/g, "").slice(0, 1).toUpperCase() || "?";
              return (
                <li key={t.id}>
                  <Link href={`/transactions/${t.id}`} className="txn-row" title={name}>
                    <span className={`txn-mark ${t.direction === "in" ? "in" : ""}`} aria-hidden="true">
                      {mark}
                    </span>
                    <span className="txn-body">
                      <span className="txn-title">{shortMerchant(name)}</span>
                      <span className="txn-meta">
                        <span className={review ? "chip warn" : "chip"}>
                          {review && t.needs_review ? "Check this" : t.category}
                        </span>
                        <span>{formatTime(t.occurred_at)}</span>
                        {t.account_bank && <span>{bankLabel(t.account_bank)}</span>}
                        {!t.account_bank && t.account && <span>··{t.account}</span>}
                        {t.source === "manual" && <span>manual</span>}
                      </span>
                    </span>
                    <span className="txn-cat">{t.category}</span>
                    <span className="txn-when">{formatTime(t.occurred_at)}</span>
                    <span className={t.direction === "in" ? "txn-amt in" : "txn-amt"}>
                      {t.direction === "in" ? "+" : "−"}
                      {formatPeso(t.amount)}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </li>
      ))}
    </ul>
  );
}
