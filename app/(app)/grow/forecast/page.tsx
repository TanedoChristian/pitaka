import Link from "next/link";
import { AgentEmpty, RefreshHint, Updated } from "@/components/GrowStatus";
import { ForecastCard, IdeaCard } from "@/components/GrowCards";
import { formatPeso, TZ } from "@/lib/format";
import { getLatestReport, getProfile, listReportDates } from "@/lib/queries";

const GROUP_ORDER = ["Crypto", "Stocks", "Forex", "Commodities", "Fuel", "Rates"];

/** Allocation slices blend from the first series color to the second, so neighbours stay distinct. */
const sliceColor = (i: number, n: number) =>
  `color-mix(in srgb, var(--series-1) ${n > 1 ? Math.round(100 - (i / (n - 1)) * 100) : 100}%, var(--series-2))`;

export default async function Forecast() {
  const [report, profile, market, fuel, news] = await Promise.all([
    getLatestReport("analysis"),
    getProfile(),
    listReportDates("market", 1),
    listReportDates("fuel", 1),
    listReportDates("news", 1),
  ]);

  if (!report) {
    return (
      <>
        <AgentEmpty task="analyze" what="forecast" />
        <p className="small muted" style={{ margin: 0 }}>
          The analysis reads your latest market brief, fuel prices and news, so run those first (or{" "}
          <code>npm run agent -- all</code> to do everything in one go).
        </p>
      </>
    );
  }

  const r = report.data;
  const forecasts = [...r.forecasts].sort(
    (a, b) => rank(GROUP_ORDER, a.group) - rank(GROUP_ORDER, b.group),
  );
  const totalPct = r.allocation.reduce((a, x) => a + x.pct, 0) || 1;
  const based = [
    market[0] && ["market brief", market[0].generated_at],
    fuel[0] && ["fuel prices", fuel[0].generated_at],
    news[0] && ["news", news[0].generated_at],
  ].filter(Boolean) as [string, Date][];

  return (
    <>
      <section className={`market-hero ${r.mood}`}>
        <div className="spread wrap">
          <span className="mood-chip">{r.mood === "risk-on" ? "▲ Risk-on" : r.mood === "risk-off" ? "▼ Risk-off" : "◆ Mixed"}</span>
          <Updated at={report.generated_at} />
        </div>
        <h2 className="market-headline">{r.headline}</h2>
        {r.summary && <p className="market-summary">{r.summary}</p>}
        {based.length > 0 && (
          <p className="small muted">
            Based on your{" "}
            {based.map(([what, at], i) => (
              <span key={what}>
                {i > 0 && (i === based.length - 1 ? " and " : ", ")}
                {what} from{" "}
                {at.toLocaleString("en-PH", { timeZone: TZ, month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
              </span>
            ))}
            .
          </p>
        )}
      </section>

      {r.picks.length > 0 && (
        <section className="ideas">
          <div className="section-head">
            <h2 className="section-title">Best moves right now</h2>
            <p className="small muted">
              Ranked for a {profile.risk} investor using today&apos;s rates and prices. Only invest money you won&apos;t need
              within the time shown.
            </p>
          </div>
          <div className="idea-grid">
            {r.picks.map((p, i) => (
              <IdeaCard key={i} idea={p} rank={i + 1} mine={p.risk === profile.risk} />
            ))}
          </div>
        </section>
      )}

      {r.allocation.length > 0 && (
        <section className="card">
          <div className="card-head">
            <h2>How to split your extra money each month</h2>
            {r.allocation.some((a) => a.amount !== null) && (
              <span className="muted small">
                {formatPeso(Math.round(r.allocation.reduce((a, x) => a + (x.amount ?? 0), 0)))}/month
              </span>
            )}
          </div>
          <div className="alloc-bar" aria-hidden="true">
            {r.allocation.map((a, i) => (
              <span key={i} style={{ width: `${(a.pct / totalPct) * 100}%`, background: sliceColor(i, r.allocation.length) }} />
            ))}
          </div>
          <ul className="rule-list">
            {r.allocation.map((a, i) => (
              <li key={i} className="rule-row">
                <div style={{ minWidth: 0 }}>
                  <div className="txn-title">
                    <span className="alloc-dot" style={{ background: sliceColor(i, r.allocation.length) }} aria-hidden="true" />
                    {a.bucket}
                  </div>
                  {a.why && (
                    <p className="small muted" style={{ margin: 0 }}>
                      {a.why}
                    </p>
                  )}
                </div>
                <div className="num-stack">
                  <strong>{Math.round(a.pct)}%</strong>
                  {a.amount !== null && <span className="small muted">{formatPeso(Math.round(a.amount))}</span>}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {forecasts.length > 0 && (
        <section className="forecasts">
          <div className="section-head">
            <h2 className="section-title">Forecast</h2>
            <p className="small muted">
              Likely ranges, not promises. Each one says whose view it&apos;s based on; markets often move outside them.
            </p>
          </div>
          <div className="forecast-grid">
            {forecasts.map((f, i) => (
              <ForecastCard key={i} f={f} />
            ))}
          </div>
        </section>
      )}

      <div className="dash">
        {r.tips.length > 0 && (
          <section className="card moves">
            <div className="card-head">
              <h2>Tips &amp; tricks</h2>
            </div>
            <ol className="tips">
              {r.tips.map((t, i) => (
                <li key={i}>
                  <strong>{t.title}</strong>
                  <p className="small">{t.body}</p>
                </li>
              ))}
            </ol>
          </section>
        )}

        {r.avoid.length > 0 && (
          <section className="card">
            <div className="card-head">
              <h2>Steer clear of</h2>
            </div>
            <ul className="alerts">
              {r.avoid.map((a, i) => (
                <li key={i} className="alert warn">
                  <strong>{a.title}</strong>
                  {a.why && <> — {a.why}</>}
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>

      {r.sources.length > 0 && (
        <section className="card">
          <div className="card-head">
            <h2>Sources</h2>
          </div>
          <ul className="source-links">
            {r.sources.map((s, i) => (
              <li key={i}>
                <a href={s.url} target="_blank" rel="noopener noreferrer">
                  {s.title || new URL(s.url).hostname}
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="small muted" style={{ margin: 0 }}>
        Want the raw numbers? See <Link href="/grow/markets">Markets</Link> and <Link href="/grow/fuel">Fuel</Link>.
      </p>
      <RefreshHint task="analyze" />
    </>
  );
}

function rank(order: string[], v: string) {
  const i = order.indexOf(v);
  return i < 0 ? order.length : i;
}
