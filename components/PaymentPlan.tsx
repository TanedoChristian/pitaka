"use client";

import { useMemo, useState } from "react";
import { markPaymentComplete, unmarkPaymentComplete, updateAccountPlan } from "@/app/actions";
import PayDaysField from "@/components/PayDaysField";
import PendingSubmit from "@/components/PendingSubmit";
import {
  PLAN_MONTHS,
  bankDueDate,
  effectiveDueDays,
  onTimePayDates,
  ordinal,
  parseYmd,
  payDaysLabel,
  paymentSchedule,
  planLabel,
} from "@/lib/billing";
import { formatLongDate, formatPeso } from "@/lib/format";

export default function PaymentPlan({
  accountId,
  statement,
  statementDay,
  savedPlan,
  savedPayDays,
  savedDueDays,
  payInFull,
  completedDues = [],
}: {
  accountId: number;
  statement: string;
  statementDay: number;
  savedPlan: number;
  savedPayDays: number[];
  savedDueDays: number;
  payInFull: number;
  completedDues?: string[];
}) {
  const initial = PLAN_MONTHS.includes(savedPlan as (typeof PLAN_MONTHS)[number]) ? savedPlan : 1;
  const [plan, setPlan] = useState(initial);
  const [payDays, setPayDays] = useState(() => (savedPayDays.length ? savedPayDays : [15, 30]));
  const [dueDays, setDueDays] = useState(() => effectiveDueDays(savedDueDays));
  const due = bankDueDate(statement, dueDays);
  const terms = useMemo(
    () =>
      paymentSchedule({
        total: payInFull,
        planMonths: plan,
        statement,
        statementDay,
        payDays,
        dueDays,
      }),
    [payInFull, plan, statement, statementDay, payDays, dueDays],
  );
  const done = useMemo(() => new Set(completedDues), [completedDues]);
  const first = terms[0];
  const last = terms.at(-1);
  const even = terms.length > 1 && first && last && terms.every((t) => t.amount === first.amount);
  const lastThisCycle = terms.filter((t) => t.due <= due).at(-1);
  const onTime = onTimePayDates(statement, payDays, dueDays);
  const skipped = payDays.filter((d) => !onTime.some((ymd) => parseYmd(ymd).d === d));
  const usedDays = [...new Set(terms.map((t) => parseYmd(t.due).d))];
  const paidTotal = terms.filter((t) => done.has(t.due)).reduce((a, t) => a + t.amount, 0);
  const leftTotal = Math.max(0, payInFull - paidTotal);

  return (
    <section className="card bill-plan">
      <div className="card-head">
        <h2>What to pay</h2>
        <span className="muted small">{planLabel(plan)}</span>
      </div>

      <div className="bill-full">
        <p className="stat-label">
          {payInFull > 0 && lastThisCycle
            ? `Statement total · last on-time pay ${formatLongDate(lastThisCycle.due)}`
            : "Statement total"}
        </p>
        <p className="hero-value bill-full-amt">{formatPeso(payInFull)}</p>
        {payInFull > 0 && (
          <p className="hero-delta">
            {paidTotal > 0
              ? `${formatPeso(paidTotal)} marked paid · ${formatPeso(leftTotal)} left`
              : "Nothing marked paid yet"}
          </p>
        )}
      </div>

      <form action={updateAccountPlan} className="form">
        <input type="hidden" name="id" value={accountId} />
        <PayDaysField initial={savedPayDays} onChange={setPayDays} />
        <label>
          Days until due
          <input
            name="due_days"
            type="number"
            min={1}
            max={45}
            value={dueDays}
            onChange={(e) => setDueDays(Math.min(45, Math.max(1, Number(e.target.value) || 20)))}
          />
        </label>
        <label>
          Spread over
          <select name="plan_months" value={plan} onChange={(e) => setPlan(Number(e.target.value))}>
            {PLAN_MONTHS.map((n) => (
              <option key={n} value={n}>
                {n === 1 ? "This cycle only" : `${n} months`}
              </option>
            ))}
          </select>
        </label>

        {skipped.length > 0 && (
          <p className="small muted" style={{ margin: 0 }}>
            {skipped.map(ordinal).join(" and ")} {skipped.length === 1 ? "is" : "are"} after the due date (
            {formatLongDate(due)}), so this statement is paid in full on {formatLongDate(onTime[0] ?? due)}.
          </p>
        )}

        {first && (
          <p className="bill-each">
            {terms.length === 1 ? (
              <>
                Pay in full <strong>{formatPeso(first.amount)}</strong> on {formatLongDate(first.due)}
              </>
            ) : even ? (
              <>
                <strong>{formatPeso(first.amount)}</strong> on {payDaysLabel(usedDays.length ? usedDays : payDays)}
                {plan > 1 ? ` · ${terms.length} payments` : null}
              </>
            ) : (
              <>
                <strong>{formatPeso(first.amount)}</strong> for most terms, then{" "}
                <strong>{formatPeso(last?.amount ?? 0)}</strong> on the last
              </>
            )}
          </p>
        )}

        <PendingSubmit className="btn primary block" pendingLabel="Saving…">
          Save this plan
        </PendingSubmit>
      </form>

      {terms.length > 0 && (
        <ol className="bill-terms">
          {terms.map((t) => {
            const complete = done.has(t.due);
            return (
              <li key={`${t.term}-${t.due}`} className={complete ? "done" : undefined}>
                <span>
                  <span className="bill-term-n">
                    Term {t.term}
                    {complete ? " · paid" : ""}
                  </span>
                  <span className="muted small">{formatLongDate(t.due)}</span>
                </span>
                <span className="bill-term-actions">
                  <strong>{formatPeso(t.amount)}</strong>
                  <form action={complete ? unmarkPaymentComplete : markPaymentComplete}>
                    <input type="hidden" name="account_id" value={accountId} />
                    <input type="hidden" name="statement" value={statement} />
                    <input type="hidden" name="due_date" value={t.due} />
                    <input type="hidden" name="amount" value={t.amount.toFixed(2)} />
                    <PendingSubmit
                      className={complete ? "btn ghost small" : "btn primary small"}
                      pendingLabel={complete ? "…" : "…"}
                      aria-label={complete ? `Undo paid for term ${t.term}` : `Mark term ${t.term} paid`}
                    >
                      {complete ? "Undo" : "Done"}
                    </PendingSubmit>
                  </form>
                </span>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
