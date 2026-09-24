export const TZ = "Asia/Manila";

const peso = new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" });

export const formatPeso = (n: number) => peso.format(n);

/** Compact peso for chart axes — not Intl, so Node and the browser stay in sync. */
export function formatPesoShort(n: number) {
  const sign = n < 0 ? "−" : "";
  const abs = Math.abs(n);
  const [value, suffix] =
    abs >= 1_000_000 ? [abs / 1_000_000, "M"] : abs >= 1_000 ? [abs / 1_000, "K"] : [abs, ""];
  const rounded = Math.round(value * 10) / 10;
  const body = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
  return `${sign}₱${body}${suffix}`;
}

export function formatDay(d: Date) {
  return d.toLocaleDateString("en-PH", { timeZone: TZ, weekday: "short", month: "short", day: "numeric" });
}

export function formatTime(d: Date) {
  return d.toLocaleTimeString("en-PH", { timeZone: TZ, hour: "numeric", minute: "2-digit" });
}

/** YYYY-MM-DD of a date in Manila time (used to group rows by day). */
export function dayKey(d: Date) {
  return d.toLocaleDateString("sv-SE", { timeZone: TZ });
}

/** Value for <input type="datetime-local"> in Manila time. */
export function toLocalInput(d: Date) {
  return d.toLocaleString("sv-SE", { timeZone: TZ }).replace(" ", "T").slice(0, 16);
}

// ---- months ("YYYY-MM") ----

export function currentMonth() {
  return new Date().toLocaleDateString("sv-SE", { timeZone: TZ }).slice(0, 7);
}

export function normalizeMonth(m: string | undefined) {
  return m && /^\d{4}-(0[1-9]|1[0-2])$/.test(m) ? m : currentMonth();
}

export function shiftMonth(m: string, delta: number) {
  const [y, mo] = m.split("-").map(Number);
  const d = new Date(Date.UTC(y, mo - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function monthLabel(m: string) {
  const [y, mo] = m.split("-").map(Number);
  return new Date(Date.UTC(y, mo - 1, 1)).toLocaleDateString("en-PH", {
    timeZone: "UTC",
    month: "long",
    year: "numeric",
  });
}

export function daysInMonth(m: string) {
  const [y, mo] = m.split("-").map(Number);
  return new Date(Date.UTC(y, mo, 0)).getUTCDate();
}
