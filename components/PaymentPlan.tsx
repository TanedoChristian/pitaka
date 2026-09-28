"use client";

import { useMemo, useState } from "react";
import { updateAccountPlan } from "@/app/actions";
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
}: {
  accountId: number;
  statement: string;
  statementDay: number;
  savedPlan: number;
  savedPayDays: number[];
  savedDueDays: number;
  payInFull: number;
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
  const first = terms[0];
  const last = terms.at(-1);
  const even = terms.length > 1 && first && last && terms.every((t) => t.amount === first.amount);
  const lastThisCycle = terms.filter((t) => t.due <= due).at(-1);
  const onTime = onTimePayDates(statement, payDays, dueDays);
  const skipped = payDays.filter((d) => !onTime.some((ymd) => parseYmd(ymd).d === d));
  const usedDays = [...new Set(terms.map((t) => parseYmd(t.due).d))];

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

        <PendingSubmit className="btn primary block" pendingLabel="Saving…">
          Save this plan
        </PendingSubmit>
      </form>
    </section>
  );
}
