"use client";

import { useFormStatus } from "react-dom";

/** Submit button that disables itself and shows progress while the server action runs. */
export default function SubmitButton({ children, pendingLabel, className }: {
  children: React.ReactNode;
  pendingLabel: string;
  className?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button className={className} disabled={pending} aria-busy={pending}>
      {pending ? pendingLabel : children}
    </button>
  );
}
