import { daysUntil, type FuelPrice, type Perk } from "./grow";

// Pure money-coaching math over the user's own transactions. No DB, no fetch,
// so every rule is unit-tested in insights.test.ts.

const TZ = "Asia/Manila";
const monthOf = (d: Date) => d.toLocaleDateString("sv-SE", { timeZone: TZ }).slice(0, 7);

export function median(xs: number[]) {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export function merchantKey(m: string) {
  return m
    .toLowerCase()
    .replace(/\s·\s.*$/, "")
    .replace(/\b(inc|corp|ph|philippines|com|www|online|payment|pmt)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

// ---------- subscriptions / recurring charges ----------

export type Charge = { merchant: string; amount: number; occurred_at: Date; category: string };

export type Recurring = {
  merchant: string;
  category: string;
  /** Utilities you can't cancel vs. subscriptions you choose to keep. */
  kind: "bill" | "subscription";
  monthly: number;
  yearly: number;
  months: number;
  last: Date;
  lastAmount: number;
  priceUp: boolean;
};

const NOT_SUBSCRIPTIONS = new Set(["Transfers", "Cash Withdrawal", "Groceries", "Food & Dining", "Transport"]);
const UTILITY = /meralco|maynilad|manila water|pldt|globe|smart|converge|dito|sky ?cable|veco|davao light|primewater|insurance|sss|pag-?ibig|philhealth|rent|condo|hoa|dues|tuition|amortization|loan/i;

/**
 * Same merchant, about the same amount, in at least `minMonths` different months,
 * at most twice a month → likely a subscription or a fixed bill.
 */
export function detectRecurring(charges: Charge[], minMonths = 2): Recurring[] {
  const groups = new Map<string, Charge[]>();
  for (const c of charges) {
    if (NOT_SUBSCRIPTIONS.has(c.category) || !c.merchant || c.amount <= 0) continue;
    const key = merchantKey(c.merchant);
    if (!key) continue;
    groups.set(key, [...(groups.get(key) ?? []), c]);
  }
  const out: Recurring[] = [];
  for (const list of groups.values()) {
    const byMonth = new Map<string, Charge[]>();
    for (const c of list) byMonth.set(monthOf(c.occurred_at), [...(byMonth.get(monthOf(c.occurred_at)) ?? []), c]);
    if (byMonth.size < minMonths) continue;
    if ([...byMonth.values()].some((m) => m.length > 2)) continue;
    const amounts = list.map((c) => c.amount);
    const mid = median(amounts);
    // Fixed price: every charge within 15% of the typical one.
    if (amounts.some((a) => Math.abs(a - mid) / mid > 0.15)) continue;
    const sorted = [...list].sort((a, b) => a.occurred_at.getTime() - b.occurred_at.getTime());
    const last = sorted[sorted.length - 1];
    const prev = sorted[sorted.length - 2];
    // What it costs now (a price increase shows up right away).
    const perMonth = last.amount * byMonth.get(monthOf(last.occurred_at))!.length;
    out.push({
      merchant: last.merchant,
      category: last.category,
      kind: UTILITY.test(last.merchant) ? "bill" : "subscription",
      monthly: round2(perMonth),
      yearly: round2(perMonth * 12),
      months: byMonth.size,
      last: last.occurred_at,
      lastAmount: last.amount,
      priceUp: !!prev && last.amount > prev.amount * 1.03,
    });
  }
  return out.sort((a, b) => b.yearly - a.yearly);
}

// ---------- budgets & pace ----------

export type BudgetLine = {
  category: string;
  budget: number;
  spent: number;
  pct: number;
  projected: number;
  left: number;
  perDayLeft: number;
  status: "ok" | "watch" | "over";
};

/** Where each budget stands, and where it lands if the month keeps this pace. */
export function budgetLines(
  budgets: { category: string; monthly: number }[],
  spent: Map<string, number>,
  day: number,
  days: number,
): BudgetLine[] {
  return budgets
    .map((b) => {
      const s = spent.get(b.category) ?? 0;
      // Pace from day 5 on; before that one purchase would project nonsense.
      const projected = day >= 5 ? (s / day) * days : s;
      const left = b.monthly - s;
      const daysLeft = Math.max(1, days - day + 1);
      const status: BudgetLine["status"] = s > b.monthly ? "over" : projected > b.monthly * 1.05 ? "watch" : "ok";
      return {
        category: b.category,
        budget: b.monthly,
        spent: s,
        pct: b.monthly ? (s / b.monthly) * 100 : 0,
        projected: round2(projected),
        left: round2(left),
        perDayLeft: round2(Math.max(0, left) / daysLeft),
        status,
      };
    })
    .sort((a, b) => b.pct - a.pct);
}

export type Leak = { category: string; spent: number; projected: number; usual: number; extra: number };

/**
 * Categories on pace to beat their usual (3-month average) by 25%+ and ₱500+.
 * Waits until day 7 so one early purchase doesn't cry wolf.
 */
export function paceLeaks(
  current: Map<string, number>,
  usual: Map<string, number>,
  day: number,
  days: number,
): Leak[] {
  if (day < 7) return [];
  const out: Leak[] = [];
  for (const [category, spent] of current) {
    if (category === "Transfers") continue;
    const avg = usual.get(category) ?? 0;
    const projected = (spent / day) * days;
    if (avg > 0 && projected > avg * 1.25 && projected - avg >= 500) {
      out.push({ category, spent, projected: round2(projected), usual: round2(avg), extra: round2(projected - avg) });
    }
  }
  return out.sort((a, b) => b.extra - a.extra);
}

// ---------- health ----------

export type HealthPart = { label: string; score: number; max: number; detail: string };

export function emergencyMonths(saved: number, avgSpend: number) {
  return avgSpend > 0 ? saved / avgSpend : saved > 0 ? Infinity : 0;
}

export function savingsRate(received: number, spent: number) {
  return received > 0 ? (received - spent) / received : null;
}

/**
 * A 0–100 money health score from four habits that matter most:
 * saving 20%+, 6 months' emergency fund, staying inside budgets, and a
 * light subscription load. Each part says how to earn the missing points.
 */
export function healthScore(input: {
  savingsRate: number | null;
  emergencyMonths: number;
  budgets: BudgetLine[];
  subscriptionsMonthly: number;
  avgSpend: number;
}): { total: number; parts: HealthPart[] } {
  const sr = input.savingsRate;
  const srScore = sr === null ? 0 : clamp((sr / 0.2) * 35, 0, 35);
  const ef = input.emergencyMonths;
  const efScore = clamp((Math.min(ef, 6) / 6) * 35, 0, 35);
  const within = input.budgets.filter((b) => b.status !== "over").length;
  const budgetScore = input.budgets.length ? (within / input.budgets.length) * 15 : 4;
  const subShare = input.avgSpend > 0 ? input.subscriptionsMonthly / input.avgSpend : 0;
  const subScore = subShare <= 0.05 ? 15 : subShare >= 0.2 ? 0 : 15 * (1 - (subShare - 0.05) / 0.15);

  const parts: HealthPart[] = [
    {
      label: "Savings rate",
      score: srScore,
      max: 35,
      detail: sr === null ? "No income recorded this month yet." : `${Math.round(sr * 100)}% of income kept — aim for 20%+.`,
    },
    {
      label: "Emergency fund",
      score: efScore,
      max: 35,
      detail: Number.isFinite(ef)
        ? `${ef.toFixed(1)} months of expenses covered — aim for 6.`
        : "Set your average spend by using Pitaka for a month.",
    },
    {
      label: "Budgets",
      score: budgetScore,
      max: 15,
      detail: input.budgets.length
        ? `${within} of ${input.budgets.length} budgets on track.`
        : "Set at least one budget to earn these points.",
    },
    {
      label: "Subscriptions",
      score: subScore,
      max: 15,
      detail: `${Math.round(subShare * 100)}% of spending goes to subscriptions — keep it under 5%.`,
    },
  ];
  return { total: Math.round(parts.reduce((a, p) => a + p.score, 0)), parts };
}

// ---------- card perks ↔ where you actually spend ----------

export type PerkMatch = Perk & { matched: string | null; spent: number; daysLeft: number | null };

const GENERIC = new Set(["all", "any", "various", "selected", "participating", "merchants", "stores", "online", "partner", "the"]);

function words(s: string) {
  return merchantKey(s)
    .split(" ")
    .filter((w) => w.length >= 3 && !GENERIC.has(w));
}

/** Tag each live perk with the merchant (or category) of yours it applies to. */
export function matchPerks(
  perks: Perk[],
  merchants: { merchant: string; total: number }[],
  categories: { category: string; total: number }[],
  today: string,
): PerkMatch[] {
  const out: PerkMatch[] = [];
  for (const p of perks) {
    const daysLeft = p.valid_until ? daysUntil(p.valid_until, today) : null;
    if (daysLeft !== null && daysLeft < 0) continue;
    const pw = words(p.merchant);
    let matched: string | null = null;
    let spent = 0;
    if (pw.length) {
      for (const m of merchants) {
        const mw = new Set(words(m.merchant));
        if (pw.some((w) => mw.has(w))) {
          matched = m.merchant;
          spent += m.total;
        }
      }
    }
    if (!matched) {
      const cat = categories.find((c) => c.category === p.category);
      if (cat && cat.total > 0 && !pw.length) {
        matched = cat.category;
        spent = cat.total;
      }
    }
    out.push({ ...p, matched, spent: round2(spent), daysLeft });
  }
  return out.sort(
    (a, b) =>
      Number(!!b.matched) - Number(!!a.matched) ||
      b.spent - a.spent ||
      (a.daysLeft ?? 999) - (b.daysLeft ?? 999),
  );
}

// ---------- fuel ----------

export const FUEL_BRANDS: [string, RegExp][] = [
  ["Petron", /petron/i],
  ["Shell", /shell/i],
  ["Caltex", /caltex|chevron/i],
  ["Seaoil", /sea ?oil/i],
  ["Phoenix", /phoenix/i],
  ["Cleanfuel", /clean ?fuel/i],
  ["Unioil", /unioil/i],
  ["Jetti", /jetti/i],
  ["Flying V", /flying ?v/i],
  ["PTT", /\bptt\b/i],
  ["TotalEnergies", /\btotal ?energies\b|\btotal\b/i],
];

export function fuelBrand(text: string) {
  return FUEL_BRANDS.find(([, re]) => re.test(text))?.[0] ?? null;
}

export function midPrice(p: Pick<FuelPrice, "low" | "high">) {
  if (p.low !== null && p.high !== null) return (p.low + p.high) / 2;
  return p.low ?? p.high;
}

export type FuelStats = {
  spent: number;
  months: number;
  monthly: number;
  liters: number | null;
  topBrand: string | null;
  byBrand: { brand: string; spent: number; visits: number }[];
  cheapest: { brand: string; price: number } | null;
  yourPrice: number | null;
  monthlySavings: number | null;
};

/** Your fuel spend by brand and what switching to the cheapest brand would save. */
export function fuelStats(charges: { merchant: string; amount: number }[], prices: FuelPrice[], months: number): FuelStats {
  const map = new Map<string, { spent: number; visits: number }>();
  let spent = 0;
  for (const c of charges) {
    const brand = fuelBrand(c.merchant);
    if (!brand) continue;
    spent += c.amount;
    const cur = map.get(brand) ?? { spent: 0, visits: 0 };
    map.set(brand, { spent: cur.spent + c.amount, visits: cur.visits + 1 });
  }
  const byBrand = [...map].map(([brand, v]) => ({ brand, ...v })).sort((a, b) => b.spent - a.spent);
  const priceOf = (brand: string) => {
    const mids = prices.filter((p) => p.brand.toLowerCase().includes(brand.toLowerCase())).map(midPrice).filter((n): n is number => n !== null);
    return mids.length ? Math.min(...mids) : null;
  };
  let cheapest: FuelStats["cheapest"] = null;
  for (const p of prices) {
    const m = midPrice(p);
    if (m !== null && m > 0 && (!cheapest || m < cheapest.price)) cheapest = { brand: p.brand, price: m };
  }
  const topBrand = byBrand[0]?.brand ?? null;
  const yourPrice = topBrand ? priceOf(topBrand) : null;
  const allMids = prices.map(midPrice).filter((n): n is number => n !== null && n > 0);
  const refPrice = yourPrice ?? (allMids.length ? allMids.reduce((a, b) => a + b, 0) / allMids.length : null);
  const liters = refPrice ? spent / refPrice : null;
  const monthly = months > 0 ? spent / months : spent;
  const monthlySavings =
    liters !== null && cheapest && refPrice && refPrice > cheapest.price && months > 0
      ? ((refPrice - cheapest.price) * liters) / months
      : null;
  return {
    spent: round2(spent),
    months,
    monthly: round2(monthly),
    liters: liters === null ? null : Math.round(liters),
    topBrand,
    byBrand,
    cheapest,
    yourPrice,
    monthlySavings: monthlySavings === null ? null : round2(monthlySavings),
  };
}

// ---------- utils ----------

function clamp(n: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, n));
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}


/** Does a price row's product ("RON 95", "Diesel Max", "Premium") match the chosen fuel type? */
export function fuelMatches(product: string, fuel: string) {
  const p = product.toLowerCase();
  const f = fuel.toLowerCase();
  if (f.includes("diesel")) return /diesel/.test(p);
  if (f.includes("kerosene")) return /kerosene/.test(p);
  if (/diesel|kerosene|lpg|auto ?lpg/.test(p)) return false;
  if (f.includes("97")) return /\b(97|98|100)\b|blaze|racing|platinum/.test(p);
  if (f.includes("95")) return /\b95\b|premium|v-?power|xcs/.test(p) && !/\b(97|100)\b/.test(p);
  return /\b91\b|regular|unleaded|silver|fuelsave/.test(p) && !/\b(95|97|100)\b/.test(p);
}
