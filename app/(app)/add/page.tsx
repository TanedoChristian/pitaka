import { addTransaction } from "@/app/actions";
import TxnForm from "@/components/TxnForm";

export default function AddTransaction() {
  return (
    <>
      <h1>Add transaction</h1>
      <p className="muted small" style={{ margin: 0 }}>
        For cash or anything the BPI alerts don’t cover.
      </p>
      <section className="card">
        <TxnForm action={addTransaction} submitLabel="Add" />
      </section>
    </>
  );
}
