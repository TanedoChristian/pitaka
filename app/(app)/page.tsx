import Link from "next/link";
import CategoryBars from "@/components/CategoryBars";
import DailyChart from "@/components/DailyChart";
import MonthNav from "@/components/MonthNav";
import TxnList from "@/components/TxnList";
import { daysInMonth, formatPeso, monthLabel, normalizeMonth, shiftMonth } from "@/lib/format";
import {
  countNeedsReview,
  getDailySpending,
  getSpendingByCategory,
  getSummary,
  listTransactions,
} from "@/lib/queries";

export default async function Overview({ searchParams }: { searchParams: Promise<{ m?: string }> }) {
  const month = normalizeMonth((await searchParams).m);
  const [summary, prev, categories, daily, recent, review] = await Promise.all([
    getSummary(month),
    getSummary(shiftMonth(month, -1)),
    getSpendingByCategory(month),
    getDailySpending(month),
    listTransactions({ month, limit: 6 }),
    countNeedsReview(),
  ]);

  const net = summary.received - summary.spent;
  const diff = summary.spent - prev.spent;
  const vsLast =
    prev.spent > 0
      ? `${diff >= 0 ? "▲" : "▼"} ${formatPeso(Math.abs(diff))} vs last month`
      : "No data for last month";

  return (
    <>
      <MonthNav month={month} basePath="/" />

      {review > 0 && (
        <Link href="/transactions?review=1" className="banner">
          <span aria-hidden="true">⚠</span>
          <span>
            {review} transaction{review === 1 ? "" : "s"} need a category or a check. Tap to review.
          </span>
        </Link>
      )}

      <section className="stats" aria-label="Month totals">
        <div className="stat hero">
          <div className="stat-label">Spent</div>
          <div className="stat-value">{formatPeso(summary.spent)}</div>
          <div className="stat-sub">{vsLast}</div>
        </div>
        <div className="stat">
          <div className="stat-label">Received</div>
          <div className="stat-value in">+{formatPeso(summary.received)}</div>
        </div>
        <div className="stat">
          <div className="stat-label">Net</div>
          <div className={net >= 0 ? "stat-value in" : "stat-value"}>
            {net >= 0 ? "+" : "−"}
            {formatPeso(Math.abs(net))}
          </div>
        </div>
      </section>

      <section className="card">
        <div className="card-head">
          <h2>Where it went</h2>
          <span className="muted small">{categories.reduce((a, c) => a + c.count, 0)} expenses</span>
        </div>
        <CategoryBars rows={categories} month={month} />
      </section>

      <section className="card">
        <div className="card-head">
          <h2>Spending per day</h2>
          <span className="muted small">tap a day</span>
        </div>
        <DailyChart data={daily} days={daysInMonth(month)} monthLabel={monthLabel(month)} />
      </section>

      <section className="card">
        <div className="card-head">
          <h2>Recent</h2>
          <Link href={`/transactions?m=${month}`} className="small" style={{ color: "var(--accent)" }}>
            See all
          </Link>
        </div>
        <TxnList txns={recent} empty="Nothing recorded this month yet." />
      </section>
    </>
  );
}
