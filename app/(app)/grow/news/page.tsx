import Link from "next/link";
import { refreshNews } from "@/app/actions";
import { Updated } from "@/components/GrowStatus";
import PendingSubmit from "@/components/PendingSubmit";
import { TZ } from "@/lib/format";
import { ageLabel } from "@/lib/grow";
import { getLatestReport } from "@/lib/queries";
import { TIP_GROUPS, TIPS } from "@/lib/tips";

const REGIONS = [
  { id: "ph", label: "Philippines" },
  { id: "global", label: "Global" },
] as const;

export default async function News({ searchParams }: { searchParams: Promise<{ tag?: string; region?: string }> }) {
  const params = await searchParams;
  const report = await getLatestReport("news");
  const items = (report?.data.items ?? []).map((i) => ({ ...i, region: i.region ?? "ph" }));
  const region = REGIONS.find((r) => r.id === params.region)?.id ?? null;
  const inRegion = region ? items.filter((i) => i.region === region) : items;
  const tags = [...new Set(inRegion.map((i) => i.tag).filter(Boolean))];
  const tag = params.tag && tags.includes(params.tag) ? params.tag : null;
  const shown = tag ? inRegion.filter((i) => i.tag === tag) : inRegion;
  const [lead, ...others] = shown;
  const hasGlobal = items.some((i) => i.region === "global");
  const href = (r: string | null, t: string | null) => {
    const q = new URLSearchParams();
    if (r) q.set("region", r);
    if (t) q.set("tag", t);
    return q.size ? `/grow/news?${q}` : "/grow/news";
  };

  return (
    <>
      <section className="card news-head">
        <div className="spread wrap">
          <div>
            <h2>Money news that affects your wallet</h2>
            <p className="small muted" style={{ margin: "4px 0 0" }}>
              Philippine business news plus the global markets, oil and crypto stories that move the peso and your
              prices, ranked by what matters for saving and investing.
            </p>
          </div>
          <form action={refreshNews}>
            <PendingSubmit className="btn" pendingLabel="Fetching…">
              Refresh headlines
            </PendingSubmit>
          </form>
        </div>
        {report && (
          <div className="spread wrap">
            <Updated at={report.generated_at} source={report.source} />
            {report.source === "rss" && (
              <span className="small muted">
                Run <code>npm run agent -- news</code> for “why it matters” notes.
              </span>
            )}
          </div>
        )}
        {hasGlobal && (
          <nav className="chips" aria-label="Filter by region">
            <Link href={href(null, tag)} className={`chip-x${region ? " ghost" : ""}`}>
              Everywhere
            </Link>
            {REGIONS.map((r) => (
              <Link key={r.id} href={href(r.id, tag)} className={`chip-x${region === r.id ? "" : " ghost"}`}>
                {r.label}
              </Link>
            ))}
          </nav>
        )}
        {tags.length > 1 && (
          <nav className="chips" aria-label="Filter by topic">
            <Link href={href(region, null)} className={`chip-x${tag ? " ghost" : ""}`}>
              All topics
            </Link>
            {tags.map((t) => (
              <Link key={t} href={href(region, t)} className={`chip-x${tag === t ? "" : " ghost"}`}>
                {t}
              </Link>
            ))}
          </nav>
        )}
      </section>

      {!lead ? (
        <p className="empty card">
          {items.length ? "No headlines match this filter." : "No headlines yet. Tap “Refresh headlines” to pull the latest."}
        </p>
      ) : (
        <section className="news">
          <a className="news-lead" href={lead.url} target="_blank" rel="noopener noreferrer">
            <span className="news-meta small">
              <span className="chip">{lead.tag}</span>
              {lead.region === "global" && <span className="chip">Global</span>}
              {lead.source}
              {lead.published && ` · ${ageLabel(lead.published)}`}
            </span>
            <h2>{lead.title}</h2>
            {lead.why && <p className="news-why">{lead.why}</p>}
            {lead.summary && <p className="small muted">{lead.summary}</p>}
          </a>
          <ul className={`news-list${others.length > 5 ? " cols" : ""}`}>
            {others.map((n, i) => (
              <li key={i}>
                <a href={n.url} target="_blank" rel="noopener noreferrer">
                  <span className="news-meta small">
                    <span className="chip">{n.tag}</span>
                    {n.region === "global" && <span className="chip">Global</span>}
                    {n.source}
                    {n.published && (
                      <time dateTime={n.published} title={new Date(n.published).toLocaleString("en-PH", { timeZone: TZ })}>
                        {` · ${ageLabel(n.published)}`}
                      </time>
                    )}
                  </span>
                  <strong>{n.title}</strong>
                  {n.why ? <p className="news-why small">{n.why}</p> : n.summary && <p className="small muted">{n.summary}</p>}
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section id="tips" className="tips-library">
        <h2 className="section-title">Money habits worth keeping</h2>
        <div className="tip-groups">
          {TIP_GROUPS.map((g) => (
            <section key={g} className="card">
              <h3>{g}</h3>
              <ul className="tip-cards">
                {TIPS.filter((t) => t.group === g).map((t) => (
                  <li key={t.id}>
                    <details>
                      <summary>{t.title}</summary>
                      <p className="small muted">{t.body}</p>
                      {t.link && (
                        <a className="small" href={t.link.url} target="_blank" rel="noopener noreferrer">
                          {t.link.label} ↗
                        </a>
                      )}
                    </details>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </section>
    </>
  );
}
