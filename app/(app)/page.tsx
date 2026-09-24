import Link from "next/link";
import CategoryBars from "@/components/CategoryBars";
import DailyChart from "@/components/DailyChart";
import MonthCompare from "@/components/MonthCompare";
import MonthNav from "@/components/MonthNav";
import TopCounterparties from "@/components/TopCounterparties";
import TxnList from "@/components/TxnList";
import { daysInMonth, formatPeso, lastMonths, monthLabel, normalizeMonth, shiftMonth } from "@/lib/format";
import {
  countNeedsReview,
  getDailySpending,
  getMonthlyTrend,
  getSpendingByCategory,
  getSummary,
  getTopCounterparties,
  listTransactions,
} from "@/lib/queries";

export default async function Overview({ searchParams }: { searchParams: Promise<{ m?: string }> }) {
  const month = normalizeMonth((await searchParams).m);
  const prevMonth = shiftMonth(month, -1);
  const months = lastMonths(month, 6);

  const [summary, prev, categories, daily, dailyPrev, trendRows, transfers, merchants, recent, review] =
    await Promise.all([
      getSummary(month),
      getSummary(prevMonth),
      getSpendingByCategory(month),
      getDailySpending(month),
      getDailySpending(prevMonth),
      getMonthlyTrend(months[0], months[months.length - 1]),
      getTopCounterparties(month, { category: "Transfers", limit: 6 }),
      getTopCounterparties(month, { limit: 6 }),
      listTransactions({ month, limit: 6 }),
      countNeedsReview(),
    ]);

  const trend = months.map((m) => {
    const row = trendRows.find((r) => r.month === m);
    return { month: m, spent: row?.spent ?? 0, received: row?.received ?? 0 };
  });
  const counterparties = transfers.length ? transfers : merchants;
  const counterpartyCat = transfers.length ? "Transfers" : undefined;

  const net = summary.received - summary.spent;
  const diff = summary.spent - prev.spent;
  const vsLast =
    prev.spent <= 0
      ? "No last-month comparison"
      : diff === 0
        ? "Same as last month"
        : `${formatPeso(Math.abs(diff))} ${diff > 0 ? "more" : "less"} than last month`;
  const expenseCount = categories.reduce((a, c) => a + c.count, 0);

  return (
    <div className="overview">
      <header className="page-head">
        <p className="eyebrow">Overview</p>
        <MonthNav month={month} basePath="/" />
      </header>

      {review > 0 && (
        <Link href="/transactions?review=1" className="banner">
          <span aria-hidden="true">⚠</span>
          <span>
            {review} transaction{review === 1 ? "" : "s"} need a category or a check.
          </span>
        </Link>
      )}

      <section className="hero-panel" aria-label="Month totals">
        <div className="hero-spend">
          <p className="stat-label">Spent</p>
          <p className="hero-value">{formatPeso(summary.spent)}</p>
          <p className={`hero-delta${diff < 0 ? " down" : ""}`}>
            {summary.count} transaction{summary.count === 1 ? "" : "s"} · {vsLast}
          </p>
        </div>
        <dl className="hero-metrics">
          <div>
            <dt>Received</dt>
            <dd className="in">+{formatPeso(summary.received)}</dd>
          </div>
          <div>
            <dt>Net</dt>
            <dd className={net >= 0 ? "in" : ""}>
              {net >= 0 ? "+" : "−"}
              {formatPeso(Math.abs(net))}
            </dd>
          </div>
        </dl>
        <div className="hero-trend">
          <div className="card-head">
            <h2>Last 6 months</h2>
            <span className="muted small">Spent vs received</span>
          </div>
          <MonthCompare rows={trend} compact />
        </div>
      </section>

      <section className="card">
        <div className="card-head">
          <h2>Spending per day</h2>
          <span className="muted small">vs {monthLabel(prevMonth).split(" ")[0]}</span>
        </div>
        <DailyChart
          data={daily}
          prev={dailyPrev}
          days={daysInMonth(month)}
          monthLabel={monthLabel(month)}
          prevLabel={monthLabel(prevMonth)}
        />
      </section>

      <div className="dash">
        <section className="card">
          <div className="card-head">
            <h2>Where it went</h2>
            <span className="muted small">
              {expenseCount} expense{expenseCount === 1 ? "" : "s"}
            </span>
          </div>
          <CategoryBars rows={categories} month={month} />
        </section>

        <section className="card">
          <div className="card-head">
            <h2>{transfers.length ? "Biggest transfers" : "Biggest merchants"}</h2>
            <span className="muted small">This month</span>
          </div>
          <TopCounterparties rows={counterparties} month={month} category={counterpartyCat} />
        </section>
      </div>

      <section className="card">
        <div className="card-head">
          <h2>Recent</h2>
          <Link href={`/transactions?m=${month}`} className="small">
            See all
          </Link>
        </div>
        <TxnList txns={recent} compact empty="Nothing recorded this month yet." />
      </section>
    </div>
  );
}
