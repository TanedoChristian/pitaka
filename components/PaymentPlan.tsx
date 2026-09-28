"use client";

import { useMemo, useState } from "react";
import { updateAccountPlan } from "@/app/actions";
import PayDaysField from "@/components/PayDaysField";
import { PLAN_MONTHS, payDaysLabel, paymentSchedule, planLabel } from "@/lib/billing";
import { formatLongDate, formatPeso } from "@/lib/format";

export default function PaymentPlan({
  accountId,
  statement,
  savedPlan,
  savedPayDays,
  payInFull,
}: {
  accountId: number;
  statement: string;
  savedPlan: number;
  savedPayDays: number[];
  payInFull: number;
}) {
  const initial = PLAN_MONTHS.includes(savedPlan as (typeof PLAN_MONTHS)[number]) ? savedPlan : 1;
  const [plan, setPlan] = useState(initial);
  const [payDays, setPayDays] = useState(() => (savedPayDays.length ? savedPayDays : [15, 30]));
  const terms = useMemo(
    () =>
      paymentSchedule({
        total: payInFull,
        planMonths: plan,
        statement,
        payDays,
      }),
    [payInFull, plan, statement, payDays],
  );
  const first = terms[0];
  const last = terms.at(-1);
  const even = terms.length > 1 && first && last && terms.every((t) => t.amount === first.amount);
  const lastThisCycle = terms[Math.max(0, payDays.length - 1)];

  return (
    <section className="card bill-plan">
      <div className="card-head">
        <h2>What to pay</h2>
        <span className="muted small">{planLabel(plan)}</span>
      </div>

      <div className="bill-full">
        <p className="stat-label">
          {payInFull > 0 && lastThisCycle
            ? `Statement total · last of this round ${formatLongDate(lastThisCycle.due)}`
            : "Statement total"}
        </p>
        <p className="hero-value bill-full-amt">{formatPeso(payInFull)}</p>
      </div>

      <form action={updateAccountPlan} className="form">
        <input type="hidden" name="id" value={accountId} />
        <PayDaysField initial={savedPayDays} onChange={setPayDays} />
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

        {first && (
          <p className="bill-each">
            {even ? (
              <>
                <strong>{formatPeso(first.amount)}</strong> on {payDaysLabel(payDays)}
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

        <ol className="bill-terms">
          {terms.map((t) => (
            <li key={`${t.term}-${t.due}`}>
              <span>
                <span className="bill-term-n">Term {t.term}</span>
                <span className="muted small">{formatLongDate(t.due)}</span>
              </span>
              <strong>{formatPeso(t.amount)}</strong>
            </li>
          ))}
        </ol>

        <button className="btn primary block">Save this plan</button>
      </form>
    </section>
  );
}
