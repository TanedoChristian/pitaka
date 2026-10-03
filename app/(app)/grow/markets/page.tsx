import Link from "next/link";
import { saveGrowProfile } from "@/app/actions";
import { AgentEmpty, RefreshHint, Updated } from "@/components/GrowStatus";
import PendingSubmit from "@/components/PendingSubmit";
import { ForecastCard, IdeaCard, riskDistance } from "@/components/GrowCards";
import { TZ } from "@/lib/format";
import { formatPct, formatPrice, RISK_LEVELS, type Quote } from "@/lib/grow";
import { getLatestReport, getProfile, getReport, listReportDates } from "@/lib/queries";

export default async function Markets({ searchParams }: { searchParams: Promise<{ id?: string }> }) {
  const id = Number((await searchParams).id);
  const [picked, latest, history, profile] = await Promise.all([
    Number.isInteger(id) && id > 0 ? getReport("market", id) : null,
    getLatestReport("market"),
    listReportDates("market", 10),
    getProfile(),
  ]);
  const report = picked ?? latest;

  const settings = (
    <details className="card settings-fold">
      <summary>
        <span>
          <strong>What the agent tracks</strong>
          <span className="small muted"> · {profile.risk} investor</span>
        </span>
        <span className="small muted">Edit</span>
      </summary>
      <form action={saveGrowProfile} className="form">
        <label>
          Watchlist
          <textarea name="watchlist" rows={2} defaultValue={profile.watchlist} />
        </label>
        <p className="small muted" style={{ margin: 0 }}>
          Comma-separated: PSE tickers (BDO, JFC), US indices or stocks (S&amp;P 500, NVDA), currency pairs (USD/PHP), coins (BTC).
        </p>
        <label>
          Risk comfort
          <select name="risk" defaultValue={profile.risk}>
            {RISK_LEVELS.map((r) => (
              <option key={r} value={r}>
                {r[0].toUpperCase() + r.slice(1)}
              </option>
            ))}
          </select>
        </label>
        <PendingSubmit className="btn primary" pendingLabel="Saving…">
          Save
        </PendingSubmit>
      </form>
    </details>
  );

  if (!report) {
    return (
      <>
        <AgentEmpty task="markets" what="market brief" />
        {settings}
      </>
    );
  }

  const r = report.data;
  const isLatest = report.id === latest?.id;
  const commodities = r.commodities ?? [];
  const forecasts = r.forecasts ?? [];
  // Ideas for the person's own risk level first, then the neighbouring levels.
  const ideas = [...(r.ideas ?? [])].sort(
    (a, b) => riskDistance(a.risk, profile.risk) - riskDistance(b.risk, profile.risk),
  );

  return (
    <>
      <section className={`market-hero ${r.mood}`}>
        <div className="spread wrap">
          <span className="mood-chip">{r.mood === "risk-on" ? "▲ Risk-on" : r.mood === "risk-off" ? "▼ Risk-off" : "◆ Mixed"}</span>
          <Updated at={report.generated_at} />
        </div>
        <h2 className="market-headline">{r.headline}</h2>
        {r.summary && <p className="market-summary">{r.summary}</p>}
        {!isLatest && (
          <p className="small">
            Viewing an older brief. <Link href="/grow/markets">Back to latest</Link>
          </p>
        )}
      </section>

      <div className={`quote-grid${commodities.length ? " four" : ""}`}>
        <QuoteCard title="Stocks" rows={r.stocks} />
        <QuoteCard title="Forex" rows={r.forex} />
        <QuoteCard title="Crypto" rows={r.crypto} />
        {commodities.length > 0 && <QuoteCard title="Oil, gold & commodities" rows={commodities} />}
      </div>

      {forecasts.length > 0 && (
        <section className="forecasts">
          <div className="section-head">
            <div className="spread">
              <h2 className="section-title">Outlook</h2>
              <Link href="/grow/forecast" className="small">
                Full forecast &amp; best moves →
              </Link>
            </div>
            <p className="small muted">
              Likely ranges from analysts, futures and recent trading. These are estimates, not promises. Markets often
              move outside them.
            </p>
          </div>
          <div className="forecast-grid">
            {forecasts.map((f, n) => (
              <ForecastCard key={n} f={f} />
            ))}
          </div>
        </section>
      )}

      {ideas.length > 0 && (
        <section className="ideas">
          <div className="section-head">
            <h2 className="section-title">Where to put money now</h2>
            <p className="small muted">
              Ideas that fit today&apos;s rates and prices, starting with ones for a {profile.risk} investor. Only invest money
              you won&apos;t need within the horizon shown.
            </p>
          </div>
          <div className="idea-grid">
            {ideas.map((i, n) => (
              <IdeaCard key={n} idea={i} mine={i.risk === profile.risk} />
            ))}
          </div>
        </section>
      )}

      {r.insights.length > 0 && (
        <section className="card">
          <div className="card-head">
            <h2>What it means for you</h2>
          </div>
          <ul className="insight-list">
            {r.insights.map((i, n) => (
              <li key={n}>
                <strong>{i.title}</strong>
                <p>{i.body}</p>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="dash">
        {r.movers.length > 0 && (
          <section className="card">
            <div className="card-head">
              <h2>Big movers</h2>
            </div>
            <ul className="rule-list">
              {r.movers.map((m, n) => (
                <li key={n} className="rule-row">
                  <div style={{ minWidth: 0 }}>
                    <div className="txn-title">
                      {m.symbol} <span className="muted">{m.name}</span>
                    </div>
                    <p className="small muted" style={{ margin: 0 }}>
                      {m.reason}
                    </p>
                  </div>
                  <Change v={m.change_pct} />
                </li>
              ))}
            </ul>
          </section>
        )}

        {r.watch.length > 0 && (
          <section className="card">
            <div className="card-head">
              <h2>On the radar</h2>
            </div>
            <ul className="rule-list">
              {r.watch.map((w, n) => (
                <li key={n} className="rule-row watch-row">
                  <div style={{ minWidth: 0 }}>
                    <div className="txn-title">{w.event}</div>
                    <p className="small muted" style={{ margin: 0 }}>
                      {w.why}
                    </p>
                  </div>
                  {w.when && <span className="chip">{w.when}</span>}
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>

      {r.moves.length > 0 && (
        <section className="card moves">
          <div className="card-head">
            <h2>Smart moves to consider</h2>
            <span className="muted small">For a {profile.risk} investor</span>
          </div>
          <ol className="tips">
            {r.moves.map((m, n) => (
              <li key={n}>
                <p>{m}</p>
              </li>
            ))}
          </ol>
        </section>
      )}

      {r.sources.length > 0 && (
        <section className="card">
          <div className="card-head">
            <h2>Sources</h2>
            <span className="muted small">
              As of {new Date(r.as_of).toLocaleString("en-PH", { timeZone: TZ, dateStyle: "medium", timeStyle: "short" })}
            </span>
          </div>
          <ul className="source-links">
            {r.sources.map((s, n) => (
              <li key={n}>
                <a href={s.url} target="_blank" rel="noopener noreferrer">
                  {s.title || new URL(s.url).hostname}
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}

      {history.length > 1 && (
        <section className="card">
          <div className="card-head">
            <h2>Past briefs</h2>
          </div>
          <ul className="history">
            {history.map((h) => (
              <li key={h.id}>
                <Link href={`/grow/markets?id=${h.id}`} aria-current={h.id === report.id ? "page" : undefined}>
                  <span className={`mood-dot ${h.mood ?? "mixed"}`} aria-hidden="true" />
                  <span className="history-title">{h.headline}</span>
                  <span className="small muted">
                    {h.generated_at.toLocaleString("en-PH", { timeZone: TZ, month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {settings}
      <RefreshHint task="markets" />
    </>
  );
}

function Change({ v }: { v: number | null }) {
  const tone = v === null ? "" : v > 0 ? " up" : v < 0 ? " down" : "";
  return <span className={`change${tone}`}>{formatPct(v)}</span>;
}


function QuoteCard({ title, rows }: { title: string; rows: Quote[] }) {
  return (
    <section className="card quote-card">
      <div className="card-head">
        <h2>{title}</h2>
        <span className="muted small">{rows.length ? "Price · day change" : ""}</span>
      </div>
      {rows.length ? (
        <ul className="quotes">
          {rows.map((q, n) => (
            <li key={n}>
              <div className="quote-main">
                <div className="quote-id">
                  <strong>{q.symbol || q.name}</strong>
                  {q.symbol && q.name && <span className="small muted">{q.name}</span>}
                </div>
                <div className="quote-num">
                  <span>{formatPrice(q.price)}</span>
                  <Change v={q.change_pct} />
                </div>
              </div>
              {q.note && <p className="small muted quote-note">{q.note}</p>}
            </li>
          ))}
        </ul>
      ) : (
        <p className="empty small">Nothing in this brief.</p>
      )}
    </section>
  );
}
