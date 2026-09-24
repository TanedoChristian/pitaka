import Link from "next/link";
import { currentMonth, monthLabel, shiftMonth } from "@/lib/format";

/** Prev / next month links. `extra` keeps other query params (e.g. filters). */
export default function MonthNav({
  month,
  basePath,
  extra = {},
}: {
  month: string;
  basePath: string;
  extra?: Record<string, string | undefined>;
}) {
  const href = (m: string) => {
    const p = new URLSearchParams({ m });
    for (const [k, v] of Object.entries(extra)) if (v) p.set(k, v);
    return `${basePath}?${p}`;
  };
  const next = shiftMonth(month, 1);
  const atCurrent = month >= currentMonth();
  return (
    <div className="month-nav">
      <Link href={href(shiftMonth(month, -1))} aria-label="Previous month">‹</Link>
      <h1>{monthLabel(month)}</h1>
      <Link href={href(next)} aria-label="Next month" aria-disabled={atCurrent}>›</Link>
    </div>
  );
}
