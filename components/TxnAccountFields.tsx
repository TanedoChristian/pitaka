"use client";

import { useState } from "react";
import { accountLabel, paymentChoices } from "@/lib/banks";
import { PLAN_MONTHS, planLabel } from "@/lib/billing";
import type { Account } from "@/lib/db";

export default function TxnAccountFields({
  accounts,
  defaultAccount,
  defaultPlan,
}: {
  accounts: Account[];
  defaultAccount: string;
  defaultPlan?: number | null;
}) {
  const { cash, cards, pending } = paymentChoices(accounts);
  const [accountKey, setAccountKey] = useState(defaultAccount);
  const selected = accounts.find((a) => String(a.id) === accountKey);
  const isCredit = selected?.card_type === "credit";
  const inherited = selected?.plan_months && selected.plan_months > 1 ? selected.plan_months : 1;
  const planValue = defaultPlan && PLAN_MONTHS.includes(defaultPlan as (typeof PLAN_MONTHS)[number]) ? defaultPlan : inherited;

  return (
    <>
      <label>
        Account
        <select name="account_id" value={accountKey} onChange={(e) => setAccountKey(e.target.value)}>
          {cash && <option value={String(cash.id)}>Cash</option>}
          {cards.map((a) => (
            <option key={a.id} value={String(a.id)}>
              {accountLabel(a)}
            </option>
          ))}
          {pending.map((b) => (
            <option key={b.id} value={`bank:${b.id}`}>
              {b.label}
            </option>
          ))}
        </select>
      </label>

      {isCredit && (
        <label>
          Payment plan
          <select name="plan_months" key={`${accountKey}-${planValue}`} defaultValue={String(planValue)}>
            {PLAN_MONTHS.map((n) => (
              <option key={n} value={n}>
                {n === 1 ? "Pay in full this statement" : `${planLabel(n)} · equal payments`}
              </option>
            ))}
          </select>
        </label>
      )}
    </>
  );
}
