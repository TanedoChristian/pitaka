"use client";

import { useActionState, useId, useMemo, useState } from "react";
import { addAccount, updateAccount } from "@/app/actions";
import BankCard from "@/components/BankCard";
import PayDaysField from "@/components/PayDaysField";
import { BANKS, isBankId } from "@/lib/banks";
import { effectivePayDays, ordinal } from "@/lib/billing";
import type { Account } from "@/lib/db";

export default function AccountForm({ account }: { account?: Account }) {
  const uid = useId();
  const [error, action, pending] = useActionState(account ? updateAccount : addAccount, null);
  const initialBank = account && isBankId(account.bank) ? account.bank : BANKS[0].id;
  const [bank, setBank] = useState(initialBank);
  const [cardType, setCardType] = useState<"debit" | "credit">(account?.card_type === "credit" ? "credit" : "debit");
  const [last4, setLast4] = useState(account?.last4 ?? "");
  const [nickname, setNickname] = useState(account?.nickname ?? "");
  const [keyword, setKeyword] = useState(account?.keyword ?? BANKS[0].defaultKeyword);

  const info = useMemo(() => BANKS.find((b) => b.id === bank) ?? BANKS[0], [bank]);
  const debitId = `${uid}-debit`;
  const creditId = `${uid}-credit`;
  const hintId = `${uid}-hint`;

  return (
    <form action={action} className="account-form">
      {account && <input type="hidden" name="id" value={account.id} />}
      <BankCard
        account={{
          bank,
          card_type: cardType,
          nickname: nickname || null,
          last4: last4.replace(/\D/g, "").slice(-4) || null,
          keyword,
        }}
      />

      <div className="form">
        <label>
          Bank
          <select
            name="bank"
            value={bank}
            onChange={(e) => {
              const next = e.target.value;
              if (!isBankId(next)) return;
              const prevDefault = BANKS.find((b) => b.id === bank)?.defaultKeyword;
              setBank(next);
              const nextDefault = BANKS.find((b) => b.id === next)?.defaultKeyword ?? "";
              if (!keyword || keyword === prevDefault) setKeyword(nextDefault);
            }}
          >
            {BANKS.map((b) => (
              <option key={b.id} value={b.id}>
                {b.label}
              </option>
            ))}
          </select>
        </label>

        <div className="segmented" role="radiogroup" aria-label="Card type">
          <input
            type="radio"
            id={debitId}
            name="card_type"
            value="debit"
            checked={cardType === "debit"}
            onChange={() => setCardType("debit")}
          />
          <label htmlFor={debitId}>Debit</label>
          <input
            type="radio"
            id={creditId}
            name="card_type"
            value="credit"
            checked={cardType === "credit"}
            onChange={() => setCardType("credit")}
          />
          <label htmlFor={creditId}>Credit</label>
        </div>

        <div className="grid-2">
          <label>
            Last 4 digits
            <input
              name="last4"
              inputMode="numeric"
              maxLength={4}
              placeholder="8821"
              value={last4}
              onChange={(e) => setLast4(e.target.value.replace(/\D/g, "").slice(0, 4))}
              autoComplete="off"
            />
          </label>
          <label>
            Nickname
            <input
              name="nickname"
              placeholder="Everyday, Payroll…"
              maxLength={40}
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              autoComplete="off"
            />
          </label>
        </div>

        <label>
          Email keyword
          <input
            name="keyword"
            required
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder={info.defaultKeyword}
            autoComplete="off"
            aria-describedby={hintId}
          />
        </label>
        <p id={hintId} className="small muted" style={{ margin: 0 }}>
          Gmail uses this to pull alerts for this card — a sender like{" "}
          <code>{info.defaultKeyword}</code>, or a phrase from the subject. {info.hint}. Same bank as
          another card is fine; last 4 digits tell them apart.
        </p>

        {cardType === "credit" && (
          <>
            <label>
              Statement date
              <select name="statement_day" defaultValue={account?.statement_day ? String(account.statement_day) : ""} required>
                <option value="" disabled>
                  Day of month
                </option>
                {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => (
                  <option key={d} value={d}>
                    {ordinal(d)} of every month
                  </option>
                ))}
              </select>
            </label>
            <PayDaysField initial={effectivePayDays(account?.pay_days, account?.statement_day, account?.due_days)} />
            <label>
              Payment plan
              <select name="plan_months" defaultValue={String(account?.plan_months && account.plan_months > 1 ? account.plan_months : 1)}>
                <option value="1">Pay this cycle (split across pay days)</option>
                <option value="3">3 months</option>
                <option value="6">6 months</option>
                <option value="9">9 months</option>
                <option value="12">12 months</option>
                <option value="18">18 months</option>
                <option value="24">24 months</option>
              </select>
            </label>
            <p className="small muted" style={{ margin: 0 }}>
              A 2nd-of-month statement with pay days on the 15th and 30th splits what you owe across those dates. A 3-month plan is six payments.
            </p>
          </>
        )}

        <button className="btn primary block" disabled={pending}>
          {pending ? (account ? "Saving…" : "Adding…") : account ? "Save card" : "Add card"}
        </button>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
      </div>
    </form>
  );
}
