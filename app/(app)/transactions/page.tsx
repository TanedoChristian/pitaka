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

  return (
    <>
      {review ? (
        <div className="spread">
          <h1>Needs review</h1>
          <Link href="/transactions" className="btn">Done</Link>
        </div>
      ) : (
        <MonthNav month={month} basePath="/transactions" extra={{ c: category, q: search }} />
      )}

      {!review && (
        <form className="filters" action="/transactions">
          <input type="hidden" name="m" value={month} />
          <select name="c" defaultValue={category ?? ""} aria-label="Category">
            <option value="">All categories</option>
            {ALL_CATEGORIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
          <input type="search" name="q" placeholder="Search merchant or note" defaultValue={search} />
          <button className="btn">Filter</button>
        </form>
      )}

      <section className="card">
        <div className="card-head">
          <h2>{txns.length} transaction{txns.length === 1 ? "" : "s"}</h2>
          <span className="small muted">
            −{formatPeso(out)} · <span className="in">+{formatPeso(inn)}</span>
          </span>
        </div>
        <TxnList txns={txns} empty={review ? "All caught up." : "No transactions match."} />
      </section>
    </>
  );
}
