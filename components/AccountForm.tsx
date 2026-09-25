"use client";

import { useActionState, useMemo, useState } from "react";
import { addAccount } from "@/app/actions";
import BankCard from "@/components/BankCard";
import { BANKS, isBankId } from "@/lib/banks";

export default function AccountForm() {
  const [error, action, pending] = useActionState(addAccount, null);
  const [bank, setBank] = useState(BANKS[0].id);
  const [cardType, setCardType] = useState<"debit" | "credit">("debit");
  const [last4, setLast4] = useState("");
  const [nickname, setNickname] = useState("");
  const [keyword, setKeyword] = useState(BANKS[0].defaultKeyword);

  const info = useMemo(() => BANKS.find((b) => b.id === bank) ?? BANKS[0], [bank]);

  return (
    <form action={action} className="account-form">
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
            id="type-debit"
            name="card_type"
            value="debit"
            checked={cardType === "debit"}
            onChange={() => setCardType("debit")}
          />
          <label htmlFor="type-debit">Debit</label>
          <input
            type="radio"
            id="type-credit"
            name="card_type"
            value="credit"
            checked={cardType === "credit"}
            onChange={() => setCardType("credit")}
          />
          <label htmlFor="type-credit">Credit</label>
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
            aria-describedby="keyword-hint"
          />
        </label>
        <p id="keyword-hint" className="small muted" style={{ margin: 0 }}>
          Gmail uses this to pull alerts for this card — a sender like{" "}
          <code>{info.defaultKeyword}</code>, or a phrase from the subject. {info.hint}.
        </p>

        <button className="btn primary block" disabled={pending}>
          {pending ? "Adding…" : "Add card"}
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
