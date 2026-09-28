import { paymentChoices } from "@/lib/banks";
import type { Account, Txn } from "@/lib/db";
import { ALL_CATEGORIES } from "@/lib/categories";
import { toLocalInput } from "@/lib/format";
import PendingSubmit from "@/components/PendingSubmit";
import TxnAccountFields from "@/components/TxnAccountFields";

/** Shared add/edit form. Rendered on the server; posts to a server action. */
export default function TxnForm({
  action,
  txn,
  submitLabel,
  back,
  accounts = [],
  defaultAccountId,
}: {
  action: (form: FormData) => Promise<void>;
  txn?: Txn;
  submitLabel: string;
  back?: string;
  accounts?: Account[];
  defaultAccountId?: number;
}) {
  const dir = txn?.direction ?? "out";
  const { cash, pending } = paymentChoices(accounts);
  const defaultAccount = txn?.account_id
    ? String(txn.account_id)
    : defaultAccountId
      ? String(defaultAccountId)
      : cash
        ? String(cash.id)
        : pending[0]
          ? `bank:${pending[0].id}`
          : "";
  return (
    <form action={action} className="form">
      {txn && <input type="hidden" name="id" value={txn.id} />}
      {back && <input type="hidden" name="back" value={back} />}

      <div className="segmented" role="radiogroup" aria-label="Type">
        <input type="radio" id="dir-out" name="direction" value="out" defaultChecked={dir === "out"} />
        <label htmlFor="dir-out">Expense</label>
        <input type="radio" id="dir-in" name="direction" value="in" defaultChecked={dir === "in"} />
        <label htmlFor="dir-in">Income</label>
      </div>

      <label>
        Amount (₱)
        <input
          className="amount-input"
          name="amount"
          inputMode="decimal"
          pattern="[0-9,]*\.?[0-9]{0,2}"
          placeholder="0.00"
          defaultValue={txn ? txn.amount.toFixed(2) : ""}
          required
          autoFocus={!txn}
        />
      </label>

      <label>
        What / where
        <input name="merchant" placeholder="e.g. Jollibee, Meralco" defaultValue={txn?.merchant ?? ""} />
      </label>

      <label>
        Note
        <input name="description" placeholder="optional" defaultValue={txn?.description ?? ""} />
      </label>

      <div className="grid-2">
        <label>
          Category
          <select name="category" defaultValue={txn?.category ?? "Uncategorized"}>
            {ALL_CATEGORIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
        <label>
          When
          <input type="datetime-local" name="occurred_at" defaultValue={toLocalInput(txn?.occurred_at ?? new Date())} required />
        </label>
      </div>

      <TxnAccountFields accounts={accounts} defaultAccount={defaultAccount} defaultPlan={txn?.plan_months} />

      {txn && (
        <label className="check">
          <input type="checkbox" name="remember" defaultChecked={txn.category === "Uncategorized"} />
          Always use this category for this merchant
        </label>
      )}

      <PendingSubmit className="btn primary block" pendingLabel={submitLabel === "Save" ? "Saving…" : "Adding…"}>
        {submitLabel}
      </PendingSubmit>
    </form>
  );
}
