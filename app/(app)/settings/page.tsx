import { headers } from "next/headers";
import Link from "next/link";
import { addRule, deleteRule, deleteSource, logout } from "@/app/actions";
import SourceForm from "@/components/SourceForm";
import { ALL_CATEGORIES } from "@/lib/categories";
import { query } from "@/lib/db";
import { getAccounts, getLastIngest, getRules, getSources } from "@/lib/queries";
import { gmailQuery } from "@/lib/sources";

export default async function Settings() {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "your-app.vercel.app";
  const proto = h.get("x-forwarded-proto") ?? "https";
  const webhook = `${proto}://${host}/api/ingest`;

  const [rules, sources, accounts, [totals], lastRun] = await Promise.all([
    getRules(),
    getSources(),
    getAccounts(),
    query<{ at: Date | null; n: number }>(
      `select max(created_at) as at, count(*)::int as n from transactions where source = 'email'`,
    ),
    getLastIngest(),
  ]);
  const keywords = accounts.map((a) => a.keyword).filter((k): k is string => !!k);

  return (
    <>
      <header className="page-head">
        <p className="eyebrow">Account</p>
        <h1>Settings</h1>
      </header>

      <section className="card">
        <h2>Email from</h2>
        <p className="small muted" style={{ margin: 0 }}>
          Extra Gmail senders, on top of the keywords on each card in{" "}
          <Link href="/accounts">Accounts</Link>. Add a domain or a full address — <code>gcash.com</code>,{" "}
          <code>maya.ph</code>. Parsing is still best for BPI until we add more bank formats.
        </p>
        <SourceForm />
        {sources.length > 0 && (
          <ul className="rule-list">
            {sources.map((s) => (
              <li key={s.id} className="rule-row">
                <div>
                  <div className="txn-title">{s.sender}</div>
                  <div className="txn-meta"><span className="chip">from:</span></div>
                </div>
                <form action={deleteSource}>
                  <input type="hidden" name="id" value={s.id} />
                  <button className="btn danger" aria-label={`Remove ${s.sender}`}>Remove</button>
                </form>
              </li>
            ))}
          </ul>
        )}
        <p className="small muted" style={{ margin: 0 }}>
          Gmail query: <code>{gmailQuery(sources.map((s) => s.sender), keywords)}</code>
        </p>
      </section>

      <section className="card">
        <h2>Email sync</h2>
        <p className="small muted" style={{ margin: 0 }}>
          {totals.n
            ? `${totals.n} transaction${totals.n === 1 ? "" : "s"} imported from email. Last one received ${totals.at?.toLocaleString("en-PH", { timeZone: "Asia/Manila" })}.`
            : "Nothing imported from email yet."}
        </p>
        {lastRun && (
          <p className="small muted" style={{ margin: 0 }}>
            Last ingest: {lastRun.inserted} new, {lastRun.duplicates} already saved, {lastRun.skipped} skipped
            (of {lastRun.received} emails).
          </p>
        )}
        <ol className="steps">
          <li>Turn on email notifications in BPI, GCash, Maya, or whatever you added above.</li>
          <li>
            Open <a href="https://script.google.com">script.google.com</a>, paste the latest{" "}
            <code>apps-script/Code.gs</code> from this repo (replace the old file).
          </li>
          <li>
            Project Settings → Script properties: <code>WEBHOOK_URL</code> = <code>{webhook}</code> and{" "}
            <code>INGEST_SECRET</code> = the same value as in Vercel / <code>.env.local</code>.
          </li>
          <li>
            In the function dropdown pick <code>backfill</code> and Run. That is what imports
            September. <code>preview</code> only logs. <code>install</code> only watches new mail
            from the last 24 hours. If Gmail finds nothing, the run turns red with the search it used.
          </li>
        </ol>
      </section>

      <section className="card">
        <h2>Category rules</h2>
        <p className="small muted" style={{ margin: 0 }}>
          If a merchant or note contains the keyword, it gets this category. Yours are checked before the built-in
          guesses.
        </p>
        <form action={addRule} className="grid-2">
          <input name="keyword" placeholder="keyword, e.g. grab" required aria-label="Keyword" />
          <select name="category" aria-label="Category" defaultValue="Food & Dining">
            {ALL_CATEGORIES.filter((c) => c !== "Uncategorized").map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
          <button className="btn" style={{ gridColumn: "1 / -1" }}>Add rule</button>
        </form>
        {rules.length > 0 && (
          <ul className="rule-list">
            {rules.map((r) => (
              <li key={r.id} className="rule-row">
                <div>
                  <div className="txn-title">{r.keyword}</div>
                  <div className="txn-meta"><span className="chip">{r.category}</span></div>
                </div>
                <form action={deleteRule}>
                  <input type="hidden" name="id" value={r.id} />
                  <button className="btn danger" aria-label={`Delete rule ${r.keyword}`}>Remove</button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </section>

      <form action={logout}>
        <button className="btn block">Log out</button>
      </form>
    </>
  );
}
