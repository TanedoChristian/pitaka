import { headers } from "next/headers";
import { addRule, deleteRule, logout } from "@/app/actions";
import { ALL_CATEGORIES } from "@/lib/categories";
import { query } from "@/lib/db";
import { getRules } from "@/lib/queries";

export default async function Settings() {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "your-app.vercel.app";
  const proto = h.get("x-forwarded-proto") ?? "https";
  const webhook = `${proto}://${host}/api/ingest`;

  const [rules, [last]] = await Promise.all([
    getRules(),
    query<{ at: Date | null; n: number }>(
      `select max(created_at) as at, count(*)::int as n from transactions where source = 'email'`,
    ),
  ]);

  return (
    <>
      <h1>Settings</h1>

      <section className="card">
        <h2>BPI email sync</h2>
        <p className="small muted" style={{ margin: 0 }}>
          {last.n
            ? `${last.n} transactions imported from email. Last one received ${last.at?.toLocaleString("en-PH", { timeZone: "Asia/Manila" })}.`
            : "Nothing imported from email yet."}
        </p>
        <ol className="steps">
          <li>In the BPI app, turn on email notifications for transactions.</li>
          <li>
            Open <a href="https://script.google.com" style={{ color: "var(--accent)" }}>script.google.com</a>, create a
            project, paste <code>apps-script/Code.gs</code> from this repo.
          </li>
          <li>
            Project Settings → Script properties: <code>WEBHOOK_URL</code> = <code>{webhook}</code> and{" "}
            <code>INGEST_SECRET</code> = the same value as in Vercel.
          </li>
          <li>
            Run <code>install</code> once (checks Gmail every minute), then <code>backfill</code> to import past emails.
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
          <ul className="txns">
            {rules.map((r) => (
              <li key={r.id} className="txn">
                <div className="txn-main">
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
