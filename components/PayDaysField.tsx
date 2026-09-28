"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import { normalizePayDays, ordinal } from "@/lib/billing";

const MAX_DAYS = 6;

export default function PayDaysField({
  name = "pay_days",
  initial,
  onChange,
}: {
  name?: string;
  initial?: number[] | null;
  onChange?: (days: number[]) => void;
}) {
  const { pending } = useFormStatus();
  const [days, setDays] = useState(() => {
    const n = normalizePayDays(initial ?? []);
    return n.length ? n : [15, 30];
  });

  function commit(next: number[]) {
    setDays(next);
    onChange?.(next);
  }

  function setAt(i: number, value: number) {
    const next = days.slice();
    next[i] = value;
    const unique = normalizePayDays(next);
    commit(unique.length ? unique : [value]);
  }

  function addDay() {
    if (days.length >= MAX_DAYS) return;
    const pick = [15, 30, 7, 22, 1, 10].find((d) => !days.includes(d));
    if (!pick) return;
    commit(normalizePayDays([...days, pick]));
  }

  function removeAt(i: number) {
    if (days.length <= 1) return;
    commit(days.filter((_, j) => j !== i));
  }

  return (
    <fieldset className="pay-days">
      <div className="spread">
        <legend>Pay days each month</legend>
        <button type="button" className="btn" onClick={addDay} disabled={pending || days.length >= MAX_DAYS}>
          Add day
        </button>
      </div>
      <div className="pay-days-list">
        {days.map((d, i) => (
          <label key={`${d}-${i}`}>
            <span className="vh">Pay day {i + 1}</span>
            <select name={name} value={d} onChange={(e) => setAt(i, Number(e.target.value))} disabled={pending}>
              {Array.from({ length: 31 }, (_, n) => n + 1).map((day) => (
                <option key={day} value={day}>
                  {ordinal(day)}
                </option>
              ))}
            </select>
            {days.length > 1 && (
              <button type="button" className="btn" onClick={() => removeAt(i)} disabled={pending} aria-label={`Remove ${ordinal(d)}`}>
                Remove
              </button>
            )}
          </label>
        ))}
      </div>
      <p className="small muted" style={{ margin: 0 }}>
        Split the statement across these days that fall on or before the due date — e.g. the 15th and 30th. Short months clamp the 29th–31st to the last day.
      </p>
    </fieldset>
  );
}
