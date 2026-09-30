import Link from "next/link";
import { AgentEmpty, RefreshHint, Updated } from "@/components/GrowStatus";
import { getBank } from "@/lib/banks";
import { formatPeso, formatShortDate, TZ } from "@/lib/format";
import { matchPerks, type PerkMatch } from "@/lib/insights";
import { getAccounts, getCategoriesSince, getLatestReport, getTopMerchantsSince } from "@/lib/queries";

export default async function Perks({ searchParams }: { searchParams: Promise<{ bank?: string }> }) {
  const want = (await searchParams).bank;
  const today = new Date().toLocaleDateString("sv-SE", { timeZone: TZ });
  const [report, accounts, merchants, categories] = await Promise.all([
    getLatestReport("perks"),
    getAccounts(),
    getTopMerchantsSince(90),
    getCategoriesSince(90),
  ]);
  const cards = accounts.filter((a) => a.card_type === "credit");
  const missingProduct = cards.filter((c) => !c.product);

  const productHint = missingProduct.length > 0 && (
    <Link href="/accounts" className="banner">
      <span aria-hidden="true">💳</span>
      <span>
        Add the card product (e.g. “Amore Cashback”, “Rewards Visa”) to{" "}
        {missingProduct.map((c) => getBank(c.bank)?.label ?? c.bank).join(" and ")} in Accounts. Promos differ per card,
        so the agent finds better matches.
      </span>
    </Link>
  );

  if (!report) {
    return (
      <>
        {productHint}
        <AgentEmpty task="perks" what="card perks" />
      </>
    );
  }

  const all = matchPerks(report.data.perks, merchants, categories, today);
  const banks = [...new Set(all.map((p) => p.bank))];
  const bank = want && banks.includes(want) ? want : null;
  const perks = bank ? all.filter((p) => p.bank === bank) : all;
  const matched = perks.filter((p) => p.matched);
  const ending = perks.filter((p) => !p.matched && p.daysLeft !== null && p.daysLeft <= 7);
  const rest = perks.filter((p) => !p.matched && !(p.daysLeft !== null && p.daysLeft <= 7));
  const byCategory = new Map<string, PerkMatch[]>();
  for (const p of rest) byCategory.set(p.category, [...(byCategory.get(p.category) ?? []), p]);
  const groups = [...byCategory].sort((a, b) => b[1].length - a[1].length);

  return (
    <>
      {productHint}

      <section className="card perks-head">
        <div className="spread wrap">
          <div>
            <h2>
              {perks.length} live promo{perks.length === 1 ? "" : "s"} for your cards
            </h2>
            <p className="small muted" style={{ margin: "4px 0 0" }}>
              {matched.length} match where you already spend. Expired promos are hidden automatically.
            </p>
          </div>
          <Updated at={report.generated_at} />
        </div>
        {banks.length > 1 && (
          <nav className="chips" aria-label="Filter by bank">
            <Link href="/grow/perks" className={`chip-x${bank ? " ghost" : ""}`}>
              All
            </Link>
            {banks.map((b) => (
              <Link key={b} href={`/grow/perks?bank=${b}`} className={`chip-x${bank === b ? "" : " ghost"}`}>
                {getBank(b)?.label ?? b.toUpperCase()}
              </Link>
            ))}
          </nav>
        )}
      </section>

      {matched.length > 0 && (
        <section className="perk-section">
          <h2 className="section-title">Matches your spending</h2>
          <div className="perk-grid">
            {matched.map((p, i) => (
              <PerkCard key={i} p={p} highlight />
            ))}
          </div>
        </section>
      )}

      {ending.length > 0 && (
        <section className="perk-section">
          <h2 className="section-title">Ending this week</h2>
          <div className="perk-grid">
            {ending.map((p, i) => (
              <PerkCard key={i} p={p} />
            ))}
          </div>
        </section>
      )}

      {groups.map(([cat, list]) => (
        <section key={cat} className="perk-section">
          <h2 className="section-title">
            {cat} <span className="muted">· {list.length}</span>
          </h2>
          <div className="perk-grid">
            {list.map((p, i) => (
              <PerkCard key={i} p={p} />
            ))}
          </div>
        </section>
      ))}

      {report.data.sources.length > 0 && (
        <section className="card">
          <h2>Where these came from</h2>
          <ul className="source-links">
            {report.data.sources.map((s, n) => (
              <li key={n}>
                <a href={s.url} target="_blank" rel="noopener noreferrer">
                  {s.title || new URL(s.url).hostname}
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}
      <RefreshHint task="perks" />
    </>
  );
}

function PerkCard({ p, highlight = false }: { p: PerkMatch; highlight?: boolean }) {
  return (
    <article className={`perk${highlight ? " match" : ""}`}>
      <div className="perk-top">
        <span className={`bank-pill bank-${p.bank}`}>{getBank(p.bank)?.label ?? p.bank.toUpperCase()}</span>
        {p.daysLeft !== null && (
          <span className={`chip${p.daysLeft <= 7 ? " warn" : ""}`}>
            {p.daysLeft === 0 ? "Ends today" : p.daysLeft <= 30 ? `${p.daysLeft}d left` : `Until ${formatShortDate(p.valid_until!)}`}
          </span>
        )}
      </div>
      <p className="perk-benefit">{p.benefit || p.title}</p>
      <p className="perk-title">{p.benefit ? p.title : p.merchant}</p>
      <dl className="perk-facts">
        {p.merchant && (
          <div>
            <dt>Where</dt>
            <dd>{p.merchant}</dd>
          </div>
        )}
        {p.cards.length > 0 && (
          <div>
            <dt>Cards</dt>
            <dd>{p.cards.join(", ")}</dd>
          </div>
        )}
        {p.min_spend !== null && p.min_spend > 0 && (
          <div>
            <dt>Min. spend</dt>
            <dd>{formatPeso(p.min_spend)}</dd>
          </div>
        )}
      </dl>
      {p.matched && (
        <p className="perk-match small">
          You spent {formatPeso(Math.round(p.spent))} at {p.matched} in the last 90 days.
        </p>
      )}
      {p.how && <p className="small muted perk-how">{p.how}</p>}
      {p.url && (
        <a className="perk-link small" href={p.url} target="_blank" rel="noopener noreferrer">
          Promo details ↗
        </a>
      )}
    </article>
  );
}
