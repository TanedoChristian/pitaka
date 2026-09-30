import Link from "next/link";
import { deleteBudget, saveBudget, saveGrowProfile } from "@/app/actions";
import PendingSubmit from "@/components/PendingSubmit";
import { EXPENSE_CATEGORIES } from "@/lib/categories";
import { currentMonth, daysInMonth, formatPeso, formatShortDate, TZ } from "@/lib/format";
import {
  budgetLines,
  detectRecurring,
  emergencyMonths,
  fuelStats,
  healthScore,
  matchPerks,
  paceLeaks,
  savingsRate,
} from "@/lib/insights";
import {
  getAccounts,
  getBudgets,
  getCategoriesSince,
  getCategoryAverages,
  getLatestReport,
  getMonthlyAverages,
  getProfile,
  getRecentCharges,
  getSpendingByCategory,
  getSummary,
  getTopMerchantsSince,
} from "@/lib/queries";
import { pickTips } from "@/lib/tips";

export default async function Insights() {
  const month = currentMonth();
  const today = new Date().toLocaleDateString("sv-SE", { timeZone: TZ });
  const day = Number(today.slice(8, 10));
  const days = daysInMonth(month);

  const [summary, averages, byCategory, usualRows, budgets, profile, charges, accounts, perks, market, fuel, merchants, categories] =
    await Promise.all([
      getSummary(month),
      getMonthlyAverages(month, 3),
      getSpendingByCategory(month),
      getCategoryAverages(month, 3),
      getBudgets(),
      getProfile(),
      getRecentCharges(125),
      getAccounts(),
      getLatestReport("perks"),
      getLatestReport("market"),
      getLatestReport("fuel"),
      getTopMerchantsSince(90),
      getCategoriesSince(90),
    ]);

  const spentMap = new Map(byCategory.map((c) => [c.category, c.total]));
  const usualMap = new Map(usualRows.map((r) => [r.category, r.avg]));
  const lines = budgetLines(budgets, spentMap, day, days);
  const leaks = paceLeaks(spentMap, usualMap, day, days);
  const recurring = detectRecurring(charges);
  const recurringMonthly = recurring.reduce((a, r) => a + r.monthly, 0);
  const subscriptionsMonthly = recurring.filter((r) => r.kind === "subscription").reduce((a, r) => a + r.monthly, 0);

  const hasHistory = averages.months > 0;
  const avgSpend = hasHistory ? averages.spend : summary.spent;
  const rate = hasHistory ? savingsRate(averages.income, averages.spend) : savingsRate(summary.received, summary.spent);
  const efMonths = emergencyMonths(profile.emergency_saved, avgSpend);
  const health = healthScore({
    savingsRate: rate,
    emergencyMonths: efMonths,
    budgets: lines,
    subscriptionsMonthly,
    avgSpend,
  });

  const fuelCharges = charges.filter((c) => c.category === "Transport");
  const fuel90 = fuelStats(
    fuelCharges.filter((c) => c.occurred_at.getTime() >= Date.now() - 90 * 86_400_000),
    fuel?.data.prices ?? [],
    3,
  );
  const foodShare = summary.spent > 0 ? (spentMap.get("Food & Dining") ?? 0) / summary.spent : 0;
  const tips = pickTips({
    emergencyMonths: efMonths,
    savingsRate: rate,
    hasCreditCard: accounts.some((a) => a.card_type === "credit"),
    subscriptionsMonthly,
    foodShare,
    fuelMonthly: fuel90.monthly,
    month: Number(month.slice(5, 7)),
  });
  const perkMatches = perks ? matchPerks(perks.data.perks, merchants, categories, today).filter((p) => p.matched).slice(0, 3) : [];
  const unbudgeted = EXPENSE_CATEGORIES.filter((c) => c !== "Uncategorized" && !budgets.some((b) => b.category === c));
  const efTarget = avgSpend * 6;
  const efPct = efTarget > 0 ? Math.min(100, (profile.emergency_saved / efTarget) * 100) : 0;

  const alerts: { tone: "bad" | "warn"; text: string; href?: string }[] = [
    ...lines
      .filter((l) => l.status === "over")
      .map((l) => ({ tone: "bad" as const, text: `${l.category} is over budget by ${formatPeso(l.spent - l.budget)}.`, href: `/transactions?m=${month}&c=${encodeURIComponent(l.category)}` })),
    ...leaks.slice(0, 3).map((l) => ({
      tone: "warn" as const,
      text: `${l.category} is on pace for ${formatPeso(l.projected)} — about ${formatPeso(l.extra)} more than your usual ${formatPeso(l.usual)}.`,
      href: `/transactions?m=${month}&c=${encodeURIComponent(l.category)}`,
    })),
    ...recurring
      .filter((r) => r.priceUp)
      .map((r) => ({ tone: "warn" as const, text: `${r.merchant} charged ${formatPeso(r.lastAmount)} — higher than before. Check if the price went up.` })),
  ];

  return (
    <>
      <section className="health" aria-label="Money health">
        <div className="health-ring">
          <ScoreRing value={health.total} />
          <div className="health-copy">
            <p className="stat-label">Money health</p>
            <p className="health-verdict">{verdict(health.total)}</p>
            <p className="small muted">Four habits that build wealth. Earn the missing points below.</p>
          </div>
        </div>
        <ul className="health-parts">
          {health.parts.map((p) => (
            <li key={p.label}>
              <div className="spread">
                <strong>{p.label}</strong>
                <span className="small muted">
                  {Math.round(p.score)}/{p.max}
                </span>
              </div>
              <div className="bar-track">
                <div className="bar-fill" style={{ width: `${(p.score / p.max) * 100}%` }} />
              </div>
              <p className="small muted">{p.detail}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="kpis" aria-label="Key numbers">
        <div className="kpi">
          <p className="k">Savings rate</p>
          <p className={`v${rate !== null && rate >= 0.2 ? " in" : ""}`}>{rate === null ? "—" : `${Math.round(rate * 100)}%`}</p>
          <p className="s">{hasHistory ? `${averages.months}-month average` : "This month so far"}</p>
        </div>
        <div className="kpi">
          <p className="k">Monthly spend</p>
          <p className="v">{formatPeso(Math.round(avgSpend))}</p>
          <p className="s">{hasHistory ? "Average of full months" : "This month so far"}</p>
        </div>
        <div className="kpi">
          <p className="k">Recurring</p>
          <p className="v">{formatPeso(Math.round(recurringMonthly))}</p>
          <p className="s">{formatPeso(Math.round(recurringMonthly * 12))} a year</p>
        </div>
        <div className="kpi">
          <p className="k">Fuel (90 days)</p>
          <p className="v">{formatPeso(Math.round(fuel90.spent))}</p>
          <p className="s">{fuel90.topBrand ? `Mostly ${fuel90.topBrand}` : "No fuel purchases found"}</p>
        </div>
      </section>

      {alerts.length > 0 && (
        <section className="card" aria-label="Heads up">
          <div className="card-head">
            <h2>Heads up</h2>
            <span className="muted small">
              Day {day} of {days}
            </span>
          </div>
          <ul className="alerts">
            {alerts.map((a, i) => (
              <li key={i} className={`alert ${a.tone}`}>
                {a.href ? <Link href={a.href}>{a.text}</Link> : a.text}
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="dash">
        <section className="card">
          <div className="card-head">
            <h2>Emergency fund</h2>
            <span className="muted small">Goal: 6 months</span>
          </div>
          <div className="ef">
            <p className="ef-value">
              {Number.isFinite(efMonths) ? efMonths.toFixed(1) : "—"}
              <span> months covered</span>
            </p>
            <div className="bar-track tall">
              <div className="bar-fill" style={{ width: `${efPct}%` }} />
            </div>
            <p className="small muted">
              {formatPeso(profile.emergency_saved)} saved of {formatPeso(Math.round(efTarget))}
              {efTarget > profile.emergency_saved
                ? ` — ${formatPeso(Math.round(efTarget - profile.emergency_saved))} to go. Saving ${formatPeso(Math.ceil((efTarget - profile.emergency_saved) / 12 / 100) * 100)} a month gets you there in a year.`
                : ". Fully funded! Extra savings can go to MP2, bonds or index funds."}
            </p>
          </div>
          <form action={saveGrowProfile} className="inline-form">
            <label className="vh" htmlFor="ef-saved">
              Emergency fund balance
            </label>
            <input
              id="ef-saved"
              name="emergency_saved"
              inputMode="decimal"
              placeholder="Amount set aside"
              defaultValue={profile.emergency_saved || ""}
            />
            <PendingSubmit className="btn" pendingLabel="Saving…">
              Update
            </PendingSubmit>
          </form>
        </section>

        <section className="card">
          <div className="card-head">
            <h2>Subscriptions & fixed bills</h2>
            <span className="muted small">Last 4 months</span>
          </div>
          {recurring.length ? (
            <ul className="rule-list">
              {recurring.slice(0, 8).map((r) => (
                <li key={r.merchant} className="rule-row">
                  <div style={{ minWidth: 0 }}>
                    <div className="txn-title">{r.merchant}</div>
                    <div className="grow-meta">
                      <span className="chip">{r.kind === "bill" ? "Bill" : "Subscription"}</span>
                      <span>last {formatShortDate(r.last.toLocaleDateString("sv-SE", { timeZone: TZ }))}</span>
                      {r.priceUp && <span className="chip warn">price up</span>}
                    </div>
                  </div>
                  <div className="num-stack">
                    <strong>{formatPeso(r.monthly)}</strong>
                    <span className="small muted">{formatPeso(Math.round(r.yearly))}/yr</span>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="empty small">No repeating charges found yet. They show up after two months of the same bill.</p>
          )}
        </section>
      </div>

      <section className="card">
        <div className="card-head">
          <h2>Budgets</h2>
          <span className="muted small">
            {days - day + 1} day{days - day === 0 ? "" : "s"} left in the month
          </span>
        </div>
        {lines.length ? (
          <ul className="budgets">
            {lines.map((l) => (
              <li key={l.category} className={`budget ${l.status}`}>
                <div className="spread">
                  <strong>{l.category}</strong>
                  <span className="small">
                    {formatPeso(l.spent)} <span className="muted">/ {formatPeso(l.budget)}</span>
                  </span>
                </div>
                <div className="bar-track">
                  <div className="bar-fill" style={{ width: `${Math.min(100, l.pct)}%` }} />
                  <span className="bar-pace" style={{ left: `${Math.min(100, (day / days) * 100)}%` }} title="Where you should be today" />
                </div>
                <div className="spread small muted">
                  <span>
                    {l.status === "over"
                      ? `Over by ${formatPeso(-l.left)}`
                      : `${formatPeso(l.left)} left · ${formatPeso(l.perDayLeft)}/day`}
                  </span>
                  <span>
                    {day >= 5 && `Pace ${formatPeso(Math.round(l.projected))}`}
                    <form action={deleteBudget} className="inline">
                      <input type="hidden" name="category" value={l.category} />
                      <PendingSubmit className="link-btn" pendingLabel="…" aria-label={`Remove ${l.category} budget`}>
                        ×
                      </PendingSubmit>
                    </form>
                  </span>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="small muted" style={{ margin: 0 }}>
            A budget per category is the simplest way to spend on purpose. Start with your biggest category. Its
            3-month average is shown as a starting point.
          </p>
        )}
        {unbudgeted.length > 0 && (
          <form action={saveBudget} className="budget-form">
            <select name="category" aria-label="Category">
              {unbudgeted.map((c) => (
                <option key={c} value={c}>
                  {c}
                  {usualMap.get(c) ? ` (avg ${formatPeso(Math.round(usualMap.get(c)!))})` : ""}
                </option>
              ))}
            </select>
            <input name="monthly" inputMode="decimal" placeholder="Monthly limit" required aria-label="Monthly limit" />
            <PendingSubmit className="btn primary" pendingLabel="Adding…">
              Add budget
            </PendingSubmit>
          </form>
        )}
      </section>

      <div className="dash">
        <section className="card">
          <div className="card-head">
            <h2>Perks that fit your spending</h2>
            <Link href="/grow/perks" className="small">
              All perks
            </Link>
          </div>
          {perkMatches.length ? (
            <ul className="mini-list">
              {perkMatches.map((p, i) => (
                <li key={i}>
                  <span className={`bank-pill bank-${p.bank}`}>{p.bank.toUpperCase()}</span>
                  <div>
                    <strong>{p.benefit || p.title}</strong>
                    <p className="small muted">
                      {p.merchant || p.category} · you spent {formatPeso(Math.round(p.spent))} here in 90 days
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="small muted" style={{ margin: 0 }}>
              {perks ? "No current promo matches where you usually spend." : "Run the agent's perks task to find promos for your BPI and UnionBank cards."}
            </p>
          )}
        </section>

        <section className="card">
          <div className="card-head">
            <h2>Today&apos;s pulse</h2>
            <Link href="/grow/markets" className="small">
              Markets
            </Link>
          </div>
          <ul className="mini-list">
            <li>
              <span className={`mood-dot ${market?.data.mood ?? "mixed"}`} aria-hidden="true" />
              <div>
                <strong>{market ? market.data.headline : "No market brief yet"}</strong>
                <p className="small muted">{market ? `Market brief · ${moodLabel(market.data.mood)}` : "npm run agent -- markets"}</p>
              </div>
            </li>
            <li>
              <span className="mood-dot fuel" aria-hidden="true" />
              <div>
                <strong>{fuel?.data.advisory.summary || (fuel ? "Fuel prices updated" : "No fuel prices yet")}</strong>
                <p className="small muted">
                  {fuel90.monthlySavings && fuel90.cheapest
                    ? `Switching to ${fuel90.cheapest.brand} could save about ${formatPeso(Math.round(fuel90.monthlySavings))}/month`
                    : fuel
                      ? `${fuel.data.city || "Your area"} · ${fuel.data.fuel}`
                      : "npm run agent -- fuel"}
                </p>
              </div>
            </li>
          </ul>
        </section>
      </div>

      <section className="card">
        <div className="card-head">
          <h2>Your coach says</h2>
          <Link href="/grow/news#tips" className="small">
            All tips
          </Link>
        </div>
        <ol className="tips">
          {tips.map((t) => (
            <li key={t.id}>
              <strong>{t.title}</strong>
              <p className="small muted">{t.body}</p>
            </li>
          ))}
        </ol>
      </section>
    </>
  );
}

function verdict(score: number) {
  if (score >= 85) return "Excellent: you're building wealth";
  if (score >= 65) return "Good: a few habits away from great";
  if (score >= 40) return "Getting there: focus on the weakest part";
  return "Let's build the foundation";
}

function moodLabel(m: string) {
  return m === "risk-on" ? "Risk-on (buyers in control)" : m === "risk-off" ? "Risk-off (cautious markets)" : "Mixed signals";
}

function ScoreRing({ value }: { value: number }) {
  const r = 42;
  const c = 2 * Math.PI * r;
  const tone = value >= 65 ? "good" : value >= 40 ? "mid" : "low";
  return (
    <svg viewBox="0 0 100 100" className={`score-ring ${tone}`} role="img" aria-label={`Money health ${value} out of 100`}>
      <circle cx="50" cy="50" r={r} className="score-track" />
      <circle
        cx="50"
        cy="50"
        r={r}
        className="score-fill"
        strokeDasharray={`${(value / 100) * c} ${c}`}
        transform="rotate(-90 50 50)"
      />
      <text x="50" y="50" className="score-num" textAnchor="middle" dominantBaseline="central">
        {value}
      </text>
    </svg>
  );
}
