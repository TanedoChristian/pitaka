import Link from "next/link";
import { deleteAccount } from "@/app/actions";
import AccountForm from "@/components/AccountForm";
import BankCard from "@/components/BankCard";
import MonthNav from "@/components/MonthNav";
import { accountLabel } from "@/lib/banks";
import { effectivePayDays, ordinal, payDaysLabel } from "@/lib/billing";
import { formatPeso, normalizeMonth } from "@/lib/format";
import { getAccount, getAccountSpend, getUnmatchedSpend } from "@/lib/queries";

export default async function AccountsPage({
  searchParams,
}: {
  searchParams: Promise<{ m?: string; edit?: string }>;
}) {
  const sp = await searchParams;
  const month = normalizeMonth(sp.m);
  const editId = Number(sp.edit);
  const [rows, unmatched, editing] = await Promise.all([
    getAccountSpend(month),
    getUnmatchedSpend(month),
    Number.isInteger(editId) && editId > 0 ? getAccount(editId) : Promise.resolve(null),
  ]);
  const cards = rows.filter((r) => r.bank !== "cash");
  const cash = rows.find((r) => r.bank === "cash");
  const cardSpend = cards.reduce((a, r) => a + r.spent, 0) + unmatched.spent;
  const cashSpend = cash?.spent ?? 0;
  const total = cashSpend + cardSpend;
  const listHref = `/accounts?m=${month}`;

  return (
    <div className="accounts">
      <header className="page-head">
        <p className="eyebrow">Wallet</p>
        <MonthNav month={month} basePath="/accounts" extra={editing ? { edit: String(editing.id) } : {}} />
      </header>

      <section className="activity-stats" aria-label="Wallet totals">
        <div className="activity-stat">
          <div className="k">Spent</div>
          <div className="v">{formatPeso(total)}</div>
        </div>
        <div className="activity-stat">
          <div className="k">Cards</div>
          <div className="v">{formatPeso(cardSpend)}</div>
        </div>
        <div className="activity-stat">
          <div className="k">Cash</div>
          <div className="v">{formatPeso(cashSpend)}</div>
        </div>
      </section>

      <section>
        <div className="card-head" style={{ marginBottom: 12 }}>
          <h2>Your cards</h2>
          <span className="muted small">
            {cards.length} card{cards.length === 1 ? "" : "s"}
          </span>
        </div>
        <div className="wallet-grid">
          {cards.map((card) => {
            const days = effectivePayDays(card.pay_days, card.statement_day, card.due_days);
            return (
            <div key={card.id} className={`wallet-item${editing?.id === card.id ? " is-editing" : ""}`}>
              <Link href={`/accounts/${card.id}`} className="wallet-card-link">
                <BankCard account={card} spent={card.spent} count={card.count} />
              </Link>
              {card.card_type === "credit" && card.statement_day && days.length > 0 && (
                <p className="muted small wallet-bill">
                  Statement {ordinal(card.statement_day)} · pays {payDaysLabel(days)}
                  {card.plan_months && card.plan_months > 1 ? ` · ${card.plan_months}-month plan` : ""}
                </p>
              )}
              <div className="wallet-actions">
                <Link href={`/accounts/${card.id}`} className="btn">
                  Statement
                </Link>
                <Link href={`/accounts?m=${month}&edit=${card.id}`} className="btn">
                  Edit
                </Link>
                <form action={deleteAccount}>
                  <input type="hidden" name="id" value={card.id} />
                  <button className="btn danger" aria-label={`Remove ${accountLabel(card)}`}>
                    Remove
                  </button>
                </form>
              </div>
            </div>
            );
          })}
        </div>
        {cards.length === 0 && (
          <p className="muted small" style={{ margin: "12px 0 0" }}>
            Add a bank card below. For a credit card, set the statement day and the days you pay (15th and 30th, for example).
          </p>
        )}
      </section>

      <section className="card">
        <div className="card-head">
          <h2>{editing ? "Edit card" : "Add a card"}</h2>
          {editing ? (
            <Link href={listHref} className="small">
              Cancel
            </Link>
          ) : (
            <span className="muted small">BPI, EastWest, Maya, GoTyme, UnionBank</span>
          )}
        </div>
        <AccountForm key={editing?.id ?? "new"} account={editing ?? undefined} />
      </section>
    </div>
  );
}
