/** Credit-card statement cycles and in-month payment terms (Manila calendar dates). */

export const PLAN_MONTHS = [1, 3, 6, 9, 12, 18, 24] as const;
export type PlanMonths = (typeof PLAN_MONTHS)[number];

export type BillingCycle = {
  /** First day of the cycle (day after the previous statement). */
  start: string;
  /** Statement date (last day of the cycle). */
  statement: string;
  end: string;
  /** Bank due date: statement + dueDays. Pay days after this are overdue. */
  due: string;
};

export type PaymentTerm = {
  term: number;
  due: string;
  amount: number;
};

const YMD = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isPlanMonths(n: number): n is PlanMonths {
  return (PLAN_MONTHS as readonly number[]).includes(n);
}

export function planLabel(months: number) {
  if (months <= 1) return "Pay this cycle";
  return `${months} months`;
}

export function ordinal(n: number) {
  const v = n % 100;
  const suffix = v >= 11 && v <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10] || "th";
  return `${n}${suffix}`;
}

export function parseYmd(ymd: string): { y: number; m: number; d: number } {
  const match = YMD.exec(ymd);
  if (!match) throw new Error(`Invalid date ${ymd}`);
  return { y: Number(match[1]), m: Number(match[2]), d: Number(match[3]) };
}

export function addCalendarDays(ymd: string, days: number) {
  const { y, m, d } = parseYmd(ymd);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`;
}

export function statementDateOn(year: number, month: number, statementDay: number) {
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const day = Math.min(Math.max(1, statementDay), last);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function shiftStatement(statement: string, statementDay: number, delta: number) {
  const { y, m } = parseYmd(statement);
  const dt = new Date(Date.UTC(y, m - 1 + delta, 1));
  return statementDateOn(dt.getUTCFullYear(), dt.getUTCMonth() + 1, statementDay);
}

function previousStatement(statement: string, statementDay: number) {
  return shiftStatement(statement, statementDay, -1);
}

export function parsePayDays(raw: unknown): number[] {
  if (Array.isArray(raw)) return normalizePayDays(raw.map((n) => Number(n)));
  if (typeof raw === "string") {
    return normalizePayDays(
      raw
        .replace(/[{}]/g, "")
        .split(",")
        .map((s) => Number(s.trim())),
    );
  }
  return [];
}

export function normalizePayDays(days: number[]) {
  return [...new Set(days.filter((d) => Number.isInteger(d) && d >= 1 && d <= 31))].sort((a, b) => a - b);
}

export function payDaysLabel(days: number[]) {
  const n = normalizePayDays(days);
  if (!n.length) return "";
  const labels = n.map(ordinal);
  if (labels.length === 1) return `the ${labels[0]}`;
  if (labels.length === 2) return `the ${labels[0]} and ${labels[1]}`;
  return `the ${labels.slice(0, -1).join(", ")}, and ${labels.at(-1)}`;
}

export function effectiveDueDays(dueDays?: number | null) {
  return dueDays && dueDays > 0 ? dueDays : 20;
}

export function bankDueDate(statement: string, dueDays?: number | null) {
  return addCalendarDays(statement, effectiveDueDays(dueDays));
}

/** Infer a single pay day from the old “statement + N days” due date. */
export function payDaysFromDue(statementDay: number, dueDays: number) {
  const due = addCalendarDays(statementDateOn(2026, 1, statementDay), dueDays);
  return normalizePayDays([parseYmd(due).d]);
}

export function effectivePayDays(
  payDays: number[] | null | undefined,
  statementDay?: number | null,
  dueDays?: number | null,
) {
  const n = parsePayDays(payDays);
  if (n.length) return n;
  if (statementDay && dueDays) return payDaysFromDue(statementDay, dueDays);
  return [];
}

/** Upcoming pay dates strictly after `after`, clamping 29–31 to the month’s last day. */
export function nextPayDates(after: string, payDays: number[], count: number) {
  const days = normalizePayDays(payDays);
  if (!days.length || count <= 0) return [];
  const out: string[] = [];
  let { y: year, m: month } = parseYmd(after);
  let guard = 0;
  while (out.length < count && guard < 48) {
    for (const d of days) {
      const ymd = statementDateOn(year, month, d);
      if (ymd <= after || ymd === out.at(-1)) continue;
      out.push(ymd);
      if (out.length >= count) return out;
    }
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
    guard += 1;
  }
  return out;
}

/**
 * Pay days in the statement’s calendar month that are still on or before the bank due date.
 * (e.g. statement Oct 20, due Nov 9, pays 15 & 30 → Oct 15 + Oct 30 halves — including the
 * mid-cycle 15th before the statement closes.)
 * If every pay day that month is already past due, pay in full on the due date.
 */
export function onTimePayDates(statement: string, payDays: number[], dueDays?: number | null): string[] {
  const due = bankDueDate(statement, dueDays);
  const days = normalizePayDays(payDays);
  if (!days.length) return [due];
  const { y, m } = parseYmd(statement);
  const dates = [
    ...new Set(
      days
        .map((d) => statementDateOn(y, m, d))
        .filter((ymd) => ymd <= due),
    ),
  ].sort();
  return dates.length ? dates : [due];
}

export function cycleFromStatement(
  statement: string,
  statementDay: number,
  payDays: number[],
  dueDays?: number | null,
): BillingCycle {
  const start = addCalendarDays(previousStatement(statement, statementDay), 1);
  return { start, statement, end: statement, due: bankDueDate(statement, dueDays) };
}

/** Billing cycle whose statement date includes this calendar day. */
export function cycleForDate(
  ymd: string,
  statementDay: number,
  payDays: number[],
  dueDays?: number | null,
): BillingCycle {
  const { y, m, d } = parseYmd(ymd);
  const thisMonth = statementDateOn(y, m, statementDay);
  const thisDay = Number(thisMonth.slice(8));
  const statement = d <= thisDay ? thisMonth : shiftStatement(thisMonth, statementDay, 1);
  return cycleFromStatement(statement, statementDay, payDays, dueDays);
}

/**
 * Statement to show first: the one still in its pay window (up to the bank due date),
 * otherwise the open (not-yet-billed) cycle.
 */
export function defaultCycle(
  today: string,
  statementDay: number,
  payDays: number[],
  dueDays?: number | null,
): BillingCycle {
  const open = cycleForDate(today, statementDay, payDays, dueDays);
  const prev = cycleFromStatement(previousStatement(open.statement, statementDay), statementDay, payDays, dueDays);
  return today <= prev.due ? prev : open;
}

export function shiftCycle(
  cycle: BillingCycle,
  statementDay: number,
  payDays: number[],
  delta: number,
  dueDays?: number | null,
): BillingCycle {
  return cycleFromStatement(shiftStatement(cycle.statement, statementDay, delta), statementDay, payDays, dueDays);
}

/** Equal peso splits; leftover centavos land on the last term so they sum exactly. */
export function splitAmount(total: number, terms: number): number[] {
  const cents = Math.round(Math.max(0, total) * 100);
  if (terms <= 1) return [cents / 100];
  const base = Math.floor(cents / terms);
  const rem = cents - base * terms;
  return Array.from({ length: terms }, (_, i) => (base + (i === terms - 1 ? rem : 0)) / 100);
}

export function paymentSchedule(opts: {
  total: number;
  planMonths: number;
  statement: string;
  statementDay?: number;
  payDays: number[];
  dueDays?: number | null;
}): PaymentTerm[] {
  const months = Math.max(1, opts.planMonths);
  const statementDay = opts.statementDay ?? parseYmd(opts.statement).d;
  const dates: string[] = [];
  for (let i = 0; i < months; i++) {
    const stmt = shiftStatement(opts.statement, statementDay, i);
    dates.push(...onTimePayDates(stmt, opts.payDays, opts.dueDays));
  }
  return splitAmount(opts.total, dates.length).map((amount, i) => ({
    term: i + 1,
    due: dates[i]!,
    amount,
  }));
}

export type BillCharge = {
  id: number;
  occurredOn: string;
  amount: number;
  direction: "in" | "out";
  planMonths: number | null;
};

export type ChargeSlice = {
  id: number;
  amount: number;
  planMonths: number;
  terms: PaymentTerm[];
};

export type StatementBill = {
  cycle: BillingCycle;
  charges: ChargeSlice[];
  credits: { id: number; amount: number }[];
  chargeTotal: number;
  creditTotal: number;
  payInFull: number;
  planBalance: number;
  schedule: PaymentTerm[];
  dueThisStatement: number;
};

function inCycle(ymd: string, cycle: BillingCycle) {
  return ymd >= cycle.start && ymd <= cycle.end;
}

function scheduleOpts(
  total: number,
  planMonths: number,
  statement: string,
  statementDay: number,
  payDays: number[],
  dueDays?: number | null,
) {
  return { total, planMonths, statement, statementDay, payDays, dueDays };
}

export function statementBill(opts: {
  cycle: BillingCycle;
  statementDay: number;
  payDays: number[];
  dueDays?: number | null;
  planMonths: number;
  txns: BillCharge[];
}): StatementBill {
  const plan = Math.max(1, opts.planMonths);
  const payDays = normalizePayDays(opts.payDays);
  const charges: ChargeSlice[] = [];
  const credits: { id: number; amount: number }[] = [];
  let inherited = 0;
  let dueThisStatement = 0;

  for (const t of opts.txns) {
    if (t.direction === "in") {
      if (inCycle(t.occurredOn, opts.cycle)) credits.push({ id: t.id, amount: t.amount });
      continue;
    }
    const own = t.planMonths != null && t.planMonths > 1 ? t.planMonths : null;
    const months = own ?? plan;
    const txnCycle = cycleForDate(t.occurredOn, opts.statementDay, payDays, opts.dueDays);
    const terms = paymentSchedule(
      scheduleOpts(t.amount, months, txnCycle.statement, opts.statementDay, payDays, opts.dueDays),
    );
    const thisDue = terms.filter((p) => p.due <= opts.cycle.due && p.due >= txnCycle.statement).reduce((a, p) => a + p.amount, 0);
    dueThisStatement += thisDue;

    if (!inCycle(t.occurredOn, opts.cycle)) continue;
    charges.push({ id: t.id, amount: t.amount, planMonths: months, terms });
    if (!own) inherited += t.amount;
  }

  const creditTotal = credits.reduce((a, c) => a + c.amount, 0);
  const chargeTotal = charges.reduce((a, c) => a + c.amount, 0);
  const payInFull = Math.max(0, chargeTotal - creditTotal);
  const inheritedNet = Math.max(0, inherited - creditTotal);
  dueThisStatement = Math.max(0, dueThisStatement - creditTotal);

  const extras = charges.filter((c) => c.planMonths > 1 && c.planMonths !== plan);
  const usedOwn = extras.length > 0;
  const schedule = usedOwn
    ? mergeSchedules([
        ...paymentSchedule(
          scheduleOpts(inheritedNet, plan, opts.cycle.statement, opts.statementDay, payDays, opts.dueDays),
        ),
        ...extras.flatMap((c) => c.terms),
      ])
    : paymentSchedule(
        scheduleOpts(payInFull, plan, opts.cycle.statement, opts.statementDay, payDays, opts.dueDays),
      );

  const firstRound = schedule.filter((t) => t.due <= opts.cycle.due).reduce((a, t) => a + t.amount, 0);

  return {
    cycle: opts.cycle,
    charges,
    credits,
    chargeTotal,
    creditTotal,
    payInFull,
    planBalance: inheritedNet,
    schedule,
    dueThisStatement: usedOwn ? dueThisStatement : firstRound || payInFull,
  };
}

function mergeSchedules(terms: PaymentTerm[]): PaymentTerm[] {
  const byDue = new Map<string, number>();
  for (const t of terms) byDue.set(t.due, (byDue.get(t.due) ?? 0) + t.amount);
  return [...byDue.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([due, amount], i) => ({ term: i + 1, due, amount: Math.round(amount * 100) / 100 }));
}
