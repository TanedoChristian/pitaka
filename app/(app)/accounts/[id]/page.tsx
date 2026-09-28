import Link from "next/link";
import { notFound } from "next/navigation";
import { addTransaction } from "@/app/actions";
import BankCard from "@/components/BankCard";
import PaymentPlan from "@/components/PaymentPlan";
import TxnForm from "@/components/TxnForm";
import TxnList from "@/components/TxnList";
import { accountLabel } from "@/lib/banks";
import {
  cycleFromStatement,
  defaultCycle,
  effectiveDueDays,
  effectivePayDays,
  payDaysLabel,
  shiftCycle,
  statementBill,
} from "@/lib/billing";
import { dayKey, formatShortDate } from "@/lib/format";
import { getAccount, getAccounts, getPaymentCompletions, listAccountTransactions } from "@/lib/queries";

export default async function AccountPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ s?: string; add?: string }>;
}) {
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) notFound();
  const sp = await searchParams;
  const [account, txns, accounts] = await Promise.all([getAccount(id), listAccountTransactions(id), getAccounts()]);
  if (!account) notFound();

  const credit = account.card_type === "credit";
  const payDays = effectivePayDays(account.pay_days, account.statement_day, account.due_days);
  const dueDays = effectiveDueDays(account.due_days);
  const billing =
    credit && account.statement_day && payDays.length
      ? {
          day: account.statement_day,
          payDays,
          dueDays,
          plan: account.plan_months && account.plan_months > 0 ? account.plan_months : 1,
        }
      : null;

  const today = dayKey(new Date());
  const cycle = billing
    ? sp.s && /^\d{4}-\d{2}-\d{2}$/.test(sp.s)
      ? cycleFromStatement(sp.s, billing.day, billing.payDays, billing.dueDays)
      : defaultCycle(today, billing.day, billing.payDays, billing.dueDays)
    : null;
  const prev = cycle && billing ? shiftCycle(cycle, billing.day, billing.payDays, -1, billing.dueDays) : null;
  const next = cycle && billing ? shiftCycle(cycle, billing.day, billing.payDays, 1, billing.dueDays) : null;

  const bill =
    cycle && billing
      ? statementBill({
          cycle,
          statementDay: billing.day,
          payDays: billing.payDays,
          dueDays: billing.dueDays,
          planMonths: billing.plan,
          txns: txns.map((t) => ({
            id: t.id,
            occurredOn: dayKey(t.occurred_at),
            amount: t.amount,
            direction: t.direction,
            planMonths: t.plan_months,
          })),
        })
      : null;

  const completions = cycle ? await getPaymentCompletions(account.id, cycle.statement) : [];
  const completedDues = completions.map((c) => c.due_date);

  const cycleTxns = cycle ? txns.filter((t) => {
    const d = dayKey(t.occurred_at);
    return d >= cycle.start && d <= cycle.end;
  }) : txns.slice(0, 20);

  const showAdd = sp.add === "1";
  const href = (statement: string, extra?: Record<string, string>) => {
    const p = new URLSearchParams({ s: statement, ...extra });
    return `/accounts/${account.id}?${p}`;
  };

  return (
    <div className="accounts">
      <header className="page-head">
        <div className="spread">
          <div>
            <p className="eyebrow">
              <Link href="/accounts">Wallet</Link>
            </p>
            <h1>{accountLabel(account)}</h1>
          </div>
          <Link href={`/accounts?edit=${account.id}`} className="btn">
            Edit
          </Link>
        </div>
      </header>

      <BankCard account={account} />

      {credit && !billing && (
        <p className="banner">
          <span aria-hidden="true">⚠</span>
          <span>
            Set a statement date, due days, and pay days (like the 15th and 30th) on{" "}
            <Link href={`/accounts?edit=${account.id}`}>Edit</Link> to calculate what to pay.
          </span>
        </p>
      )}

      {cycle && billing && bill && (
        <>
          <nav className="month-nav cycle-nav" aria-label="Statement cycle">
            <Link href={href(prev!.statement)} aria-label="Previous statement">
              ‹
            </Link>
            <div className="cycle-nav-label">
              <p className="eyebrow">Statement cycle</p>
              <h1>
                {formatShortDate(cycle.start)} – {formatShortDate(cycle.statement)}
              </h1>
            </div>
            <Link href={href(next!.statement)} aria-label="Next statement">
              ›
            </Link>
          </nav>

          <section className="activity-stats" aria-label="Statement dates">
            <div className="activity-stat">
              <div className="k">Statement</div>
              <div className="v wrap">{formatShortDate(cycle.statement)}</div>
            </div>
            <div className="activity-stat">
              <div className="k">Due</div>
              <div className="v wrap">{formatShortDate(cycle.due)}</div>
            </div>
            <div className="activity-stat">
              <div className="k">Pays</div>
              <div className="v wrap">{payDaysLabel(billing.payDays)}</div>
            </div>
          </section>

          <PaymentPlan
            accountId={account.id}
            statement={cycle.statement}
            statementDay={billing.day}
            savedPlan={billing.plan}
            savedPayDays={billing.payDays}
            savedDueDays={billing.dueDays}
            payInFull={bill.planBalance}
            completedDues={completedDues}
          />
        </>
      )}

      <section className="card ledger">
        <div className="card-head">
          <h2>{cycle ? "On this statement" : "Transactions"}</h2>
          {cycle ? (
            <Link href={href(cycle.statement, { add: "1" })} className="small">
              Add
            </Link>
          ) : (
            <Link href={`/accounts/${account.id}?add=1`} className="small">
              Add
            </Link>
          )}
        </div>
        <div className="ledger-cols" aria-hidden="true">
          <span />
          <span>Merchant</span>
          <span>Category</span>
          <span>Time</span>
          <span>Amount</span>
        </div>
        <TxnList
          txns={cycleTxns}
          empty={cycle ? "No charges in this cycle yet." : "No transactions on this card yet."}
        />
      </section>

      {showAdd && (
        <section className="card">
          <div className="card-head">
            <h2>Add a charge</h2>
            {cycle && (
              <Link href={href(cycle.statement)} className="small">
                Close
              </Link>
            )}
          </div>
          <TxnForm
            action={addTransaction}
            submitLabel="Add"
            accounts={accounts}
            defaultAccountId={account.id}
            back={`/accounts/${account.id}${cycle ? `?s=${cycle.statement}` : ""}`}
          />
        </section>
      )}
    </div>
  );
}
