import { saveGrowProfile } from "@/app/actions";
import { AgentEmpty, RefreshHint, Updated } from "@/components/GrowStatus";
import PendingSubmit from "@/components/PendingSubmit";
import { formatLongDate, formatPeso, TZ } from "@/lib/format";
import { daysUntil, FUEL_TYPES } from "@/lib/grow";
import { FUEL_BRANDS, fuelBrand, fuelMatches, fuelStats, midPrice } from "@/lib/insights";
import { getLatestReport, getProfile, getRecentCharges } from "@/lib/queries";

const maps = (q: string) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;

export default async function Fuel() {
  const today = new Date().toLocaleDateString("sv-SE", { timeZone: TZ });
  const [report, profile, charges, perks] = await Promise.all([
    getLatestReport("fuel"),
    getProfile(),
    getRecentCharges(95),
    getLatestReport("perks"),
  ]);

  const fuelCharges = charges.filter(
    (c) => c.category === "Transport" && c.occurred_at.getTime() >= Date.now() - 90 * 86_400_000,
  );
  const allPrices = report?.data.prices ?? [];
  const mine = allPrices.filter((p) => fuelMatches(p.product, profile.fuel));
  const prices = (mine.length ? mine : allPrices)
    .map((p) => ({ ...p, mid: midPrice(p) }))
    .filter((p): p is typeof p & { mid: number } => p.mid !== null)
    .sort((a, b) => a.mid - b.mid);
  const stats = fuelStats(fuelCharges, mine.length ? mine : allPrices, 3);
  const lo = prices[0]?.mid ?? 0;
  const hi = prices[prices.length - 1]?.mid ?? 0;

  const fuelPerks = (perks?.data.perks ?? []).filter(
    (p) =>
      (!p.valid_until || daysUntil(p.valid_until, today) >= 0) &&
      (fuelBrand(`${p.merchant} ${p.title}`) !== null || /fuel|gas station|petrol/i.test(`${p.title} ${p.merchant} ${p.category}`)),
  );

  const adv = report?.data.advisory;
  const upcoming = adv?.effective ? daysUntil(adv.effective, today) : null;
  // Advisories usually say just "Gasoline" / "Diesel", so fall back to the family name.
  const family = profile.fuel.split(" ")[0].toLowerCase();
  const netChange =
    (adv?.changes.find((c) => fuelMatches(c.product, profile.fuel)) ??
      adv?.changes.find((c) => c.product.toLowerCase().includes(family)))?.change ?? null;
  const advice =
    upcoming !== null && upcoming >= 0 && netChange !== null && netChange !== 0
      ? netChange > 0
        ? `Prices go up ${formatPeso(netChange)}/L ${upcoming === 0 ? "today" : upcoming === 1 ? "tomorrow" : `on ${formatLongDate(adv!.effective!)}`}. Fill up before then.`
        : `A rollback of ${formatPeso(-netChange)}/L takes effect ${upcoming === 0 ? "today" : upcoming === 1 ? "tomorrow" : `on ${formatLongDate(adv!.effective!)}`}. Wait for it if your tank can.`
      : null;

  return (
    <>
      <details className="card settings-fold" open={!profile.city}>
        <summary>
          <span>
            <strong>{profile.city || "Set your city"}</strong>
            <span className="small muted"> · {profile.fuel}</span>
          </span>
          <span className="small muted">Edit</span>
        </summary>
        <form action={saveGrowProfile} className="grid-2">
          <label>
            City / area
            <input name="city" defaultValue={profile.city ?? ""} placeholder="e.g. Quezon City, Cebu City" />
          </label>
          <label>
            Fuel
            <select name="fuel" defaultValue={profile.fuel}>
              {FUEL_TYPES.map((f) => (
                <option key={f}>{f}</option>
              ))}
            </select>
          </label>
          <PendingSubmit className="btn primary" style={{ gridColumn: "1 / -1" }} pendingLabel="Saving…">
            Save — the agent uses this next run
          </PendingSubmit>
        </form>
      </details>

      <a className="near-me" href={maps("gas station near me")} target="_blank" rel="noopener noreferrer">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z" />
          <circle cx="12" cy="9.5" r="2.5" />
        </svg>
        <span>
          <strong>Stations near me</strong>
          <span className="small">Opens Google Maps with your location</span>
        </span>
        <span aria-hidden="true">↗</span>
      </a>

      {!report ? (
        <AgentEmpty task="fuel" what="fuel prices" />
      ) : (
        <>
          {adv && (adv.summary || adv.changes.length > 0) && (
            <section className={`advisory${netChange !== null && netChange > 0 ? " up" : netChange !== null && netChange < 0 ? " down" : ""}`}>
              <div className="spread wrap">
                <p className="stat-label">This week&apos;s price change</p>
                {adv.effective && <span className="small">Effective {formatLongDate(adv.effective)}</span>}
              </div>
              {advice && <p className="advisory-advice">{advice}</p>}
              {adv.summary && <p className="small">{adv.summary}</p>}
              {adv.changes.length > 0 && (
                <div className="chips">
                  {adv.changes.map((c, i) => (
                    <span key={i} className={`change-chip${c.change !== null && c.change > 0 ? " up" : c.change !== null && c.change < 0 ? " down" : ""}`}>
                      {c.product} {c.change === null ? "—" : `${c.change > 0 ? "+" : "−"}₱${Math.abs(c.change).toFixed(2)}/L`}
                    </span>
                  ))}
                </div>
              )}
            </section>
          )}

          <section className="card">
            <div className="card-head">
              <h2>Cheapest {mine.length ? profile.fuel : "fuel"} in {report.data.city || profile.city || "your area"}</h2>
              <Updated at={report.generated_at} />
            </div>
            {prices.length ? (
              <ul className="fuel-list">
                {prices.map((p, i) => (
                  <li key={i} className={i === 0 ? "best" : undefined}>
                    <div className="fuel-row">
                      <div className="fuel-brand">
                        <strong>{p.brand}</strong>
                        <span className="small muted">
                          {p.product}
                          {p.area ? ` · ${p.area}` : ""}
                        </span>
                      </div>
                      <div className="fuel-price">
                        <strong>₱{p.mid.toFixed(2)}</strong>
                        {p.low !== null && p.high !== null && p.low !== p.high && (
                          <span className="small muted">
                            ₱{p.low.toFixed(2)}–{p.high.toFixed(2)}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="fuel-bar">
                      <span style={{ width: `${hi > lo ? 18 + ((p.mid - lo) / (hi - lo)) * 82 : 100}%` }} />
                    </div>
                    <div className="spread small">
                      <span className="muted">{i === 0 ? "Cheapest" : `+₱${(p.mid - lo).toFixed(2)}/L vs cheapest`}</span>
                      <a href={maps(`${p.brand} gas station near me`)} target="_blank" rel="noopener noreferrer">
                        Nearest {p.brand} ↗
                      </a>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="empty small">No per-brand prices in the last report.</p>
            )}
          </section>
        </>
      )}

      <div className="dash">
        <section className="card">
          <div className="card-head">
            <h2>Your fuel, last 90 days</h2>
          </div>
          {stats.spent > 0 ? (
            <>
              <div className="kpis two">
                <div className="kpi">
                  <p className="k">Per month</p>
                  <p className="v">{formatPeso(Math.round(stats.monthly))}</p>
                </div>
                <div className="kpi">
                  <p className="k">About</p>
                  <p className="v">{stats.liters ? `${Math.round(stats.liters / 3)} L` : "—"}</p>
                  <p className="s">per month</p>
                </div>
              </div>
              <ul className="rule-list">
                {stats.byBrand.map((b) => (
                  <li key={b.brand} className="rule-row">
                    <span>
                      {b.brand} <span className="small muted">· {b.visits} fill-up{b.visits === 1 ? "" : "s"}</span>
                    </span>
                    <strong>{formatPeso(b.spent)}</strong>
                  </li>
                ))}
              </ul>
              {stats.monthlySavings !== null && stats.cheapest && stats.monthlySavings >= 20 && (
                <p className="saving-callout">
                  Filling up at <strong>{stats.cheapest.brand}</strong> instead of {stats.topBrand} could save about{" "}
                  <strong>{formatPeso(Math.round(stats.monthlySavings))}/month</strong> ({formatPeso(Math.round(stats.monthlySavings * 12))} a year).
                </p>
              )}
            </>
          ) : (
            <p className="small muted" style={{ margin: 0 }}>
              No fill-ups found. Pitaka spots {FUEL_BRANDS.slice(0, 5).map(([b]) => b).join(", ")} and more in your
              Transport transactions.
            </p>
          )}
        </section>

        <section className="card">
          <div className="card-head">
            <h2>Fuel promos on your cards</h2>
          </div>
          {fuelPerks.length ? (
            <ul className="mini-list">
              {fuelPerks.slice(0, 5).map((p, i) => (
                <li key={i}>
                  <span className={`bank-pill bank-${p.bank}`}>{p.bank.toUpperCase()}</span>
                  <div>
                    <strong>{p.benefit || p.title}</strong>
                    <p className="small muted">
                      {p.merchant}
                      {p.valid_until ? ` · until ${formatLongDate(p.valid_until)}` : ""}
                      {p.url && (
                        <>
                          {" · "}
                          <a href={p.url} target="_blank" rel="noopener noreferrer">
                            details
                          </a>
                        </>
                      )}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="small muted" style={{ margin: 0 }}>
              No live fuel promos found for your cards. Station loyalty cards like Petron Value Card or Shell GO+ still earn
              points on every fill-up.
            </p>
          )}
        </section>
      </div>

      {report && report.data.tips.length > 0 && (
        <section className="card">
          <h2>Save at the pump</h2>
          <ol className="tips">
            {report.data.tips.map((t, i) => (
              <li key={i}>
                <p>{t}</p>
              </li>
            ))}
          </ol>
        </section>
      )}

      {report && report.data.sources.length > 0 && (
        <section className="card">
          <h2>Sources</h2>
          <ul className="source-links">
            {report.data.sources.map((s, n) => (
              <li key={n}>
                <a href={s.url} target="_blank" rel="noopener noreferrer">
                  {s.title || new URL(s.url).hostname}
                </a>
              </li>
            ))}
          </ul>
          <p className="small muted" style={{ margin: 0 }}>
            The DOE publishes price ranges per city and brand, not live per-station prices. Pump prices at a specific
            station can differ.
          </p>
        </section>
      )}
      {report && <RefreshHint task="fuel" />}
    </>
  );
}
