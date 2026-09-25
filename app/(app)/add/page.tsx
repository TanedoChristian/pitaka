import { addTransaction } from "@/app/actions";
import TxnForm from "@/components/TxnForm";
import { getAccounts } from "@/lib/queries";

export default async function AddTransaction() {
  const accounts = await getAccounts();
  return (
    <>
      <header className="page-head">
        <p className="eyebrow">Manual entry</p>
        <h1>Add transaction</h1>
        <p className="muted small" style={{ margin: 0 }}>
          Cash, or a bank card. Pick where the money came from.
        </p>
      </header>
      <section className="card">
        <TxnForm action={addTransaction} submitLabel="Add" accounts={accounts} />
      </section>
    </>
  );
}
