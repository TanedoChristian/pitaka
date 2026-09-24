import Link from "next/link";
import { notFound } from "next/navigation";
import { deleteTransaction, updateTransaction } from "@/app/actions";
import TxnForm from "@/components/TxnForm";
import { getTransaction } from "@/lib/queries";

export default async function EditTransaction({ params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();
  const txn = await getTransaction(id);
  if (!txn) notFound();

  return (
    <>
      <div className="spread">
        <h1>Edit</h1>
        <Link href="/transactions" className="btn">Cancel</Link>
      </div>

      {txn.needs_review && (
        <div className="banner">
          <span aria-hidden="true">⚠</span>
          <span>Couldn’t tell if this was money in or out. Check the type, then save.</span>
        </div>
      )}

      <section className="card">
        <TxnForm action={updateTransaction} txn={txn} submitLabel="Save" />
      </section>

      {txn.raw && (
        <details className="card">
          <summary className="small">Original email</summary>
          <pre className="raw">{txn.raw}</pre>
        </details>
      )}

      <form action={deleteTransaction}>
        <input type="hidden" name="id" value={txn.id} />
        <button className="btn danger block">Delete transaction</button>
      </form>
    </>
  );
}
