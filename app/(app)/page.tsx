import Link from "next/link";
import CategoryPie from "@/components/CategoryPie";
import DailyChart from "@/components/DailyChart";
import MonthCompare from "@/components/MonthCompare";
import MonthNav from "@/components/MonthNav";
import TopCounterparties from "@/components/TopCounterparties";
import TxnList from "@/components/TxnList";
import { daysInMonth, formatPeso, lastMonths, monthLabel, normalizeMonth, shiftMonth } from "@/lib/format";
import {
  countNeedsReview,
  ensureWallet,
  getAccountSpend,
  getDailySpending,
  getLargestTransactions,
  getMonthlyTrend,
  getSpendingByCategory,
  getSummary,
  getTopCounterparties,
  getUnmatchedSpend,
  listTransactions,
} from "@/lib/queries";

export default async function Overview({ searchParams }: { searchParams: Promise<{ m?: string }> }) {
  const month = normalizeMonth((await searchParams).m);
  const prevMonth = shiftMonth(month, -1);
  const months = lastMonths(month, 6);
  await ensureWallet();

  const [
    summary,
    prev,
    categories,
    daily,
    dailyPrev,
    trendRows,
    transfers,
    merchants,
    recent,
    review,
    accountSpend,
    unmatched,
    biggest,
  ] = await Promise.all([
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
    getAccountSpend(month),
    getUnmatchedSpend(month),
    getLargestTransactions(month, 5),
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
  const cashSpend = accountSpend.find((a) => a.bank === "cash")?.spent ?? 0;
  const linkedCardSpend = accountSpend.filter((a) => a.bank !== "cash").reduce((a, r) => a + r.spent, 0);
  const otherSpend = unmatched.spent;
  const cardSpend = linkedCardSpend + otherSpend;
  const knownSpend = cashSpend + cardSpend;
  const cashPct = knownSpend ? (cashSpend / knownSpend) * 100 : 0;
  const cardPct = knownSpend ? (cardSpend / knownSpend) * 100 : 0;
  const bigCut = biggest[0]?.amount ?? 0;

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
          <div>
            <dt>Cash</dt>
            <dd>{formatPeso(cashSpend)}</dd>
          </div>
          <div>
            <dt>Cards</dt>
            <dd>{formatPeso(cardSpend)}</dd>
          </div>
        </dl>
        {knownSpend > 0 && (
          <div className="spend-split" aria-label="Cash versus cards">
            {cashSpend > 0 && (
              <span className="spend-split-cash" style={{ width: `${cashPct}%` }} title={`Cash ${formatPeso(cashSpend)}`} />
            )}
            {cardSpend > 0 && (
              <span className="spend-split-cards" style={{ width: `${cardPct}%` }} title={`Cards ${formatPeso(cardSpend)}`} />
            )}
          </div>
        )}
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
          <h2>Biggest transactions</h2>
          <span className="muted small">
            {bigCut ? `Top hit ${formatPeso(bigCut)}` : "This month"}
          </span>
        </div>
        <TxnList txns={biggest} compact empty="No expenses this month yet." />
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
          <CategoryPie rows={categories} month={month} />
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
