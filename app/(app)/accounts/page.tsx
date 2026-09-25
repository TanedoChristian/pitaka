import { deleteAccount } from "@/app/actions";
import AccountForm from "@/components/AccountForm";
import BankCard from "@/components/BankCard";
import MonthNav from "@/components/MonthNav";
import { accountLabel } from "@/lib/banks";
import { formatPeso, normalizeMonth } from "@/lib/format";
import { ensureWallet, getAccountSpend, getUnmatchedSpend } from "@/lib/queries";

export default async function AccountsPage({ searchParams }: { searchParams: Promise<{ m?: string }> }) {
  const month = normalizeMonth((await searchParams).m);
  await ensureWallet();
  const [rows, unmatched] = await Promise.all([getAccountSpend(month), getUnmatchedSpend(month)]);
  const cards = rows.filter((r) => r.bank !== "cash");
  const cash = rows.find((r) => r.bank === "cash");
  const cardSpend = cards.reduce((a, r) => a + r.spent, 0) + unmatched.spent;
  const cashSpend = cash?.spent ?? 0;
  const total = cashSpend + cardSpend;

  return (
    <div className="accounts">
      <header className="page-head">
        <p className="eyebrow">Wallet</p>
        <MonthNav month={month} basePath="/accounts" />
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
          {cards.map((card) => (
            <div key={card.id} className="wallet-item">
              <BankCard account={card} spent={card.spent} count={card.count} />
              <form action={deleteAccount} className="wallet-actions">
                <input type="hidden" name="id" value={card.id} />
                <button className="btn danger" aria-label={`Remove ${accountLabel(card)}`}>
                  Remove
                </button>
              </form>
            </div>
          ))}
        </div>
        {cards.length === 0 && (
          <p className="muted small" style={{ margin: "12px 0 0" }}>
            Add a bank card below. Its keyword is what Gmail uses to pull that card’s emails into Pitaka.
          </p>
        )}
      </section>

      <section className="card">
        <div className="card-head">
          <h2>Add a card</h2>
          <span className="muted small">BPI, EastWest, Maya, GoTyme, UnionBank</span>
        </div>
        <AccountForm />
      </section>
    </div>
  );
}
