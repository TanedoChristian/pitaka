"use client";

import { useActionState } from "react";
import { addSource } from "@/app/actions";

export default function SourceForm() {
  const [error, action, pending] = useActionState(addSource, null);
  return (
    <form action={action} className="source-form">
      <input
        name="sender"
        placeholder="gcash.com or alerts@maya.ph"
        autoComplete="off"
        required
        aria-label="Email from"
      />
      <button className="btn primary" disabled={pending}>
        {pending ? "Adding…" : "Add"}
      </button>
      {error && <p className="error" role="alert">{error}</p>}
    </form>
  );
}
