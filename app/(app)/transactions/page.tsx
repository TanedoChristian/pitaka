import Link from "next/link";
import MonthNav from "@/components/MonthNav";
import TxnList from "@/components/TxnList";
import { ALL_CATEGORIES } from "@/lib/categories";
import { formatPeso, normalizeMonth } from "@/lib/format";
import { listTransactions } from "@/lib/queries";

type Params = { m?: string; c?: string; q?: string; review?: string };

export default async function Transactions({ searchParams }: { searchParams: Promise<Params> }) {
  const sp = await searchParams;
  const review = sp.review === "1";
  const month = normalizeMonth(sp.m);
  const category = sp.c && ALL_CATEGORIES.includes(sp.c) ? sp.c : undefined;
  const search = sp.q?.trim().slice(0, 80) || undefined;

  const txns = await listTransactions({ month: review ? undefined : month, category, search, review });
  const out = txns.filter((t) => t.direction === "out").reduce((a, t) => a + t.amount, 0);
  const inn = txns.filter((t) => t.direction === "in").reduce((a, t) => a + t.amount, 0);

  const keep = (next: { c?: string; q?: string }) => {
    const p = new URLSearchParams({ m: month });
    if (next.c) p.set("c", next.c);
    if (next.q) p.set("q", next.q);
    return `/transactions?${p}`;
  };

  return (
    <>
      {review ? (
        <header className="page-head">
          <div className="spread">
            <div>
              <p className="eyebrow">Inbox</p>
              <h1>Needs review</h1>
            </div>
            <Link href="/transactions" className="btn">Done</Link>
          </div>
        </header>
      ) : (
        <header className="page-head">
          <p className="eyebrow">Activity</p>
          <MonthNav month={month} basePath="/transactions" extra={{ c: category, q: search }} />
        </header>
      )}

      <section className="activity-stats" aria-label="Totals">
        <div className="activity-stat">
          <div className="k">Transactions</div>
          <div className="v">{txns.length}</div>
        </div>
        <div className="activity-stat">
          <div className="k">Spent</div>
          <div className="v">−{formatPeso(out)}</div>
        </div>
        <div className="activity-stat">
          <div className="k">Received</div>
          <div className="v in">+{formatPeso(inn)}</div>
        </div>
      </section>

      {!review && (
        <form className="activity-tools" action="/transactions">
          <input type="hidden" name="m" value={month} />
          <label className="activity-search">
            <span className="vh">Search</span>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
              <circle cx="11" cy="11" r="7" />
              <path d="M20 20l-3.5-3.5" />
            </svg>
            <input type="search" name="q" placeholder="Search merchant or note" defaultValue={search} />
          </label>
          <div className="activity-tools-row">
            <select name="c" defaultValue={category ?? ""} aria-label="Category">
              <option value="">All categories</option>
              {ALL_CATEGORIES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
            <button className="btn primary">Apply</button>
          </div>
          {(category || search) && (
            <div className="chips">
              {category && (
                <Link className="chip-x" href={keep({ q: search })}>
                  {category} <span aria-hidden="true">×</span>
                </Link>
              )}
              {search && (
                <Link className="chip-x" href={keep({ c: category })}>
                  “{search}” <span aria-hidden="true">×</span>
                </Link>
              )}
              <Link className="chip-x ghost" href={`/transactions?m=${month}`}>
                Clear
              </Link>
            </div>
          )}
        </form>
      )}

      <section className="card ledger">
        <div className="ledger-head">
          <h2>{review ? "Flagged" : "Ledger"}</h2>
          <span className="muted small">{txns.length} this {review ? "list" : "month"}</span>
        </div>
        <div className="ledger-cols" aria-hidden="true">
          <span />
          <span>Merchant</span>
          <span>Category</span>
          <span>Time</span>
          <span>Amount</span>
        </div>
        <TxnList txns={txns} empty={review ? "All caught up." : "No transactions match."} />
      </section>
    </>
  );
}
