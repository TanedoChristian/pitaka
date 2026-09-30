import { test } from "node:test";
import assert from "node:assert/strict";
import type { Perk } from "./grow";
import {
  budgetLines,
  detectRecurring,
  emergencyMonths,
  fuelBrand,
  fuelMatches,
  fuelStats,
  healthScore,
  matchPerks,
  merchantKey,
  paceLeaks,
  savingsRate,
} from "./insights";

const d = (s: string) => new Date(`${s}T12:00:00+08:00`);

test("merchantKey normalizes noise", () => {
  assert.equal(merchantKey("NETFLIX.COM"), "netflix");
  assert.equal(merchantKey("Spotify Philippines Inc."), "spotify");
});

test("detectRecurring finds fixed monthly charges", () => {
  const rows = [
    { merchant: "NETFLIX.COM", amount: 549, occurred_at: d("2026-07-05"), category: "Bills & Utilities" },
    { merchant: "Netflix.com", amount: 549, occurred_at: d("2026-08-05"), category: "Bills & Utilities" },
    { merchant: "NETFLIX.COM", amount: 549, occurred_at: d("2026-09-05"), category: "Bills & Utilities" },
    // varies too much → not a subscription
    { merchant: "Lazada", amount: 300, occurred_at: d("2026-08-01"), category: "Shopping" },
    { merchant: "Lazada", amount: 2400, occurred_at: d("2026-09-01"), category: "Shopping" },
    // food is never a subscription even if steady
    { merchant: "Jollibee", amount: 200, occurred_at: d("2026-08-01"), category: "Food & Dining" },
    { merchant: "Jollibee", amount: 200, occurred_at: d("2026-09-01"), category: "Food & Dining" },
    // single month
    { merchant: "Steam", amount: 999, occurred_at: d("2026-09-10"), category: "Entertainment" },
  ];
  const r = detectRecurring(rows);
  assert.equal(r.length, 1);
  assert.equal(r[0].merchant, "NETFLIX.COM");
  assert.equal(r[0].monthly, 549);
  assert.equal(r[0].yearly, 6588);
  assert.equal(r[0].months, 3);
  assert.equal(r[0].priceUp, false);
  assert.equal(r[0].kind, "subscription");
});

test("detectRecurring prices at the latest charge and tells bills apart", () => {
  const r = detectRecurring([
    { merchant: "MERALCO", amount: 4000, occurred_at: d("2026-08-12"), category: "Bills & Utilities" },
    { merchant: "MERALCO", amount: 4300, occurred_at: d("2026-09-12"), category: "Bills & Utilities" },
  ]);
  assert.equal(r[0].kind, "bill");
  assert.equal(r[0].monthly, 4300);
});

test("detectRecurring flags a price increase", () => {
  const r = detectRecurring([
    { merchant: "Spotify", amount: 149, occurred_at: d("2026-08-02"), category: "Entertainment" },
    { merchant: "Spotify", amount: 169, occurred_at: d("2026-09-02"), category: "Entertainment" },
  ]);
  assert.equal(r[0].priceUp, true);
});

test("budgetLines projects pace and status", () => {
  const lines = budgetLines(
    [
      { category: "Food & Dining", monthly: 6000 },
      { category: "Shopping", monthly: 2000 },
      { category: "Transport", monthly: 3000 },
    ],
    new Map([
      ["Food & Dining", 4000],
      ["Shopping", 2500],
      ["Transport", 500],
    ]),
    10,
    30,
  );
  const by = Object.fromEntries(lines.map((l) => [l.category, l]));
  assert.equal(by["Shopping"].status, "over");
  assert.equal(by["Food & Dining"].status, "watch"); // 4000 in 10 days → 12000 pace
  assert.equal(by["Food & Dining"].projected, 12000);
  assert.equal(by["Transport"].status, "ok");
  assert.equal(by["Transport"].left, 2500);
  assert.equal(by["Transport"].perDayLeft, 119.05); // 2500 / 21 days
  assert.equal(lines[0].category, "Shopping"); // most used first
});

test("paceLeaks waits a week, then flags big overshoots only", () => {
  const cur = new Map([
    ["Food & Dining", 5000],
    ["Groceries", 3100],
    ["Transfers", 90000],
  ]);
  const usual = new Map([
    ["Food & Dining", 8000],
    ["Groceries", 9000],
    ["Transfers", 1000],
  ]);
  assert.deepEqual(paceLeaks(cur, usual, 5, 30), []);
  const leaks = paceLeaks(cur, usual, 10, 30);
  assert.equal(leaks.length, 1);
  assert.equal(leaks[0].category, "Food & Dining");
  assert.equal(leaks[0].projected, 15000);
});

test("health score rewards the four habits", () => {
  const great = healthScore({ savingsRate: 0.3, emergencyMonths: 8, budgets: [], subscriptionsMonthly: 0, avgSpend: 30000 });
  assert.equal(great.total, 89); // 35 + 35 + 4 (no budgets) + 15
  const weak = healthScore({ savingsRate: -0.1, emergencyMonths: 0, budgets: [], subscriptionsMonthly: 9000, avgSpend: 30000 });
  assert.equal(weak.total, 4);
  assert.equal(savingsRate(50000, 40000), 0.2);
  assert.equal(savingsRate(0, 100), null);
  assert.equal(emergencyMonths(60000, 20000), 3);
});

const perk = (p: Partial<Perk>): Perk => ({
  bank: "bpi",
  cards: [],
  title: "Promo",
  merchant: "",
  category: "Other",
  benefit: "",
  min_spend: null,
  valid_until: null,
  url: "",
  how: "",
  ...p,
});

test("matchPerks ranks perks at your merchants first and hides expired", () => {
  const out = matchPerks(
    [
      perk({ title: "Lazada sale", merchant: "Lazada", category: "Shopping", valid_until: "2026-10-20" }),
      perk({ title: "Shell rebate", merchant: "Shell", category: "Transport", valid_until: "2026-10-31" }),
      perk({ title: "Old", merchant: "Shell", valid_until: "2026-09-01" }),
      perk({ title: "Any grocery", category: "Groceries" }),
    ],
    [
      { merchant: "SHELL SLEX NB", total: 6000 },
      { merchant: "Puregold", total: 3000 },
    ],
    [{ category: "Groceries", total: 3000 }],
    "2026-10-01",
  );
  assert.deepEqual(
    out.map((p) => [p.title, p.matched]),
    [
      ["Shell rebate", "SHELL SLEX NB"],
      ["Any grocery", "Groceries"],
      ["Lazada sale", null],
    ],
  );
  assert.equal(out[0].daysLeft, 30);
});

test("fuel brand detection and product matching", () => {
  assert.equal(fuelBrand("PETRON C5 EXT"), "Petron");
  assert.equal(fuelBrand("SHELL SLEX NB"), "Shell");
  assert.equal(fuelBrand("SEAOIL Katipunan"), "Seaoil");
  assert.equal(fuelBrand("Jollibee"), null);
  assert.ok(fuelMatches("RON 91", "Gasoline (RON 91)"));
  assert.ok(fuelMatches("Unleaded", "Gasoline (RON 91)"));
  assert.ok(!fuelMatches("RON 95", "Gasoline (RON 91)"));
  assert.ok(fuelMatches("Premium RON 95", "Gasoline (RON 95)"));
  assert.ok(fuelMatches("Diesel Max", "Diesel"));
  assert.ok(!fuelMatches("Diesel", "Gasoline (RON 95)"));
});

test("fuelStats estimates liters and switch savings", () => {
  const s = fuelStats(
    [
      { merchant: "SHELL SLEX", amount: 3000 },
      { merchant: "SHELL EDSA", amount: 3000 },
      { merchant: "PETRON C5", amount: 1000 },
      { merchant: "Jollibee", amount: 500 },
    ],
    [
      { brand: "Shell", product: "RON 91", low: 60, high: 62, area: "" },
      { brand: "Seaoil", product: "RON 91", low: 56, high: 58, area: "" },
      { brand: "Petron", product: "RON 91", low: 59, high: 61, area: "" },
    ],
    1,
  );
  assert.equal(s.spent, 7000);
  assert.equal(s.topBrand, "Shell");
  assert.equal(s.yourPrice, 61);
  assert.deepEqual(s.cheapest, { brand: "Seaoil", price: 57 });
  assert.equal(s.liters, 115); // 7000 / 61
  assert.equal(s.monthlySavings, 459.02); // (61 - 57) * 114.75
});
