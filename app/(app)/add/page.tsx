import { addTransaction } from "@/app/actions";
import TxnForm from "@/components/TxnForm";

export default function AddTransaction() {
  return (
    <>
      <header className="page-head">
        <p className="eyebrow">Manual entry</p>
        <h1>Add transaction</h1>
        <p className="muted small" style={{ margin: 0 }}>
          For cash or anything the BPI alerts don’t cover.
        </p>
      </header>
      <section className="card">
        <TxnForm action={addTransaction} submitLabel="Add" />
      </section>
    </>
  );
}
