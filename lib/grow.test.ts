import { test } from "node:test";
import assert from "node:assert/strict";
import { ageLabel, daysUntil, formatPct, num, safeUrl, sanitizeFuel, sanitizeGrow, sanitizeMarket, sanitizeNews, sanitizePerks, ymd } from "./grow";

test("safeUrl keeps http(s) and drops script/data links", () => {
  assert.equal(safeUrl("https://www.bpi.com.ph/promos"), "https://www.bpi.com.ph/promos");
  assert.equal(safeUrl("javascript:alert(1)"), "");
  assert.equal(safeUrl("data:text/html,hi"), "");
  assert.equal(safeUrl("not a url"), "");
  assert.equal(safeUrl(42), "");
});

test("num reads numbers and money strings, rejects junk", () => {
  assert.equal(num(58.2), 58.2);
  assert.equal(num("₱1,234.50"), 1234.5);
  assert.equal(num("-0.42%"), -0.42);
  assert.equal(num(""), null);
  assert.equal(num("n/a"), null);
  assert.equal(num(Infinity), null);
});

test("ymd accepts real calendar dates only", () => {
  assert.equal(ymd("2026-10-31"), "2026-10-31");
  assert.equal(ymd("2026-10-31T23:00:00Z"), "2026-10-31");
  assert.equal(ymd("2026-02-30"), null);
  assert.equal(ymd("Oct 31"), null);
});

test("sanitizeMarket requires a headline and cleans every list", () => {
  assert.equal(sanitizeMarket({ summary: "x" }), null);
  const m = sanitizeMarket({
    headline: "  PSEi   slips as peso weakens ",
    mood: "panic",
    stocks: [{ symbol: "PSEi", name: "PSE index", price: "6,412.30", change_pct: -0.8, note: "" }, { foo: 1 }],
    forex: "nope",
    sources: [{ title: "BW", url: "https://bworldonline.com/x" }, { title: "bad", url: "javascript:x" }],
    moves: ["Keep peso-cost averaging", 3, ""],
  })!;
  assert.equal(m.headline, "PSEi slips as peso weakens");
  assert.equal(m.mood, "mixed");
  assert.deepEqual(m.stocks, [{ symbol: "PSEi", name: "PSE index", price: 6412.3, change_pct: -0.8, note: "" }]);
  assert.deepEqual(m.forex, []);
  assert.equal(m.sources.length, 1);
  assert.deepEqual(m.moves, ["Keep peso-cost averaging", "3"]);
});

test("sanitizePerks lowercases bank, drops untitled and bad dates", () => {
  assert.equal(sanitizePerks({ perks: [] }), null);
  const p = sanitizePerks({
    perks: [
      { bank: "BPI", title: "10% off at Shell", merchant: "Shell", category: "Transport", valid_until: "2026-13-01", url: "https://bpi.com.ph/p", min_spend: "1,000" },
      { bank: "unionbank" },
    ],
  })!;
  assert.equal(p.perks.length, 1);
  assert.equal(p.perks[0].bank, "bpi");
  assert.equal(p.perks[0].valid_until, null);
  assert.equal(p.perks[0].min_spend, 1000);
  assert.deepEqual(p.perks[0].cards, []);
});

test("sanitizeFuel keeps priced rows or an advisory", () => {
  assert.equal(sanitizeFuel({ prices: [{ brand: "Petron" }] }), null);
  const f = sanitizeFuel({
    city: "Quezon City",
    advisory: { effective: "2026-10-06", summary: "Gasoline +₱0.90", changes: [{ product: "Gasoline", change: "0.90" }] },
    prices: [{ brand: "Petron", product: "RON 91", low: 58.1, high: "60.40" }, { brand: "Shell" }, { brand: "All brands (avg)", low: 59 }],
  })!;
  assert.equal(f.prices.length, 1);
  assert.equal(f.prices[0].high, 60.4);
  assert.equal(f.advisory.changes[0].change, 0.9);
  assert.equal(f.advisory.effective, "2026-10-06");
});

test("sanitizeNews needs title and a safe link", () => {
  const n = sanitizeNews({
    items: [
      { title: "BSP cuts rates", url: "https://x.ph/a", published: "Thu, 01 Oct 2026 02:55:44 +0800" },
      { title: "no link", url: "ftp://x" },
    ],
  })!;
  assert.equal(n.items.length, 1);
  assert.equal(n.items[0].published, "2026-09-30T18:55:44.000Z");
});

test("sanitizeGrow dispatches by kind", () => {
  assert.equal(sanitizeGrow("market", { headline: "Hi" })?.headline, "Hi");
  assert.equal(sanitizeGrow("news", {}), null);
});

test("display helpers", () => {
  assert.equal(formatPct(1.234), "+1.23%");
  assert.equal(formatPct(-0.5), "−0.50%");
  assert.equal(formatPct(null), "—");
  assert.equal(daysUntil("2026-10-08", "2026-10-01"), 7);
  assert.equal(daysUntil("2026-09-30", "2026-10-01"), -1);
  const now = new Date("2026-10-01T12:00:00Z");
  assert.equal(ageLabel(new Date("2026-10-01T11:30:00Z"), now), "30m ago");
  assert.equal(ageLabel(new Date("2026-09-28T12:00:00Z"), now), "3d ago");
});

test("market forecasts and ideas are coerced, ranges ordered and junk dropped", () => {
  const m = sanitizeGrow("market", {
    headline: "Hi",
    forecasts: [
      { asset: "Bitcoin", group: "Crypto", direction: "UP", low: "120,000", high: 95000, price: 110000, confidence: "sure", drivers: "ETF inflows", url: "javascript:alert(1)" },
      { asset: "No drivers" },
    ],
    ideas: [
      { title: "RTB", why: "6.1% yield", risk: "conservative", min_amount: "₱5,000" },
      { title: "Bad risk", why: "x", risk: "yolo" },
      { title: "No why" },
    ],
  })!;
  assert.equal(m.forecasts!.length, 1);
  const f = m.forecasts![0];
  assert.deepEqual([f.direction, f.low, f.high, f.confidence, f.url], ["up", 95000, 120000, "low", ""]);
  assert.equal(m.ideas!.length, 2);
  assert.equal(m.ideas![0].min_amount, 5000);
  assert.equal(m.ideas![1].risk, "moderate");
  assert.deepEqual(m.commodities, []);
});

test("fuel forecast keeps ranges and is null when empty", () => {
  const base = { advisory: { summary: "Gas up" }, prices: [] };
  assert.equal(sanitizeGrow("fuel", { ...base, forecast: {} })!.forecast, null);
  const fc = sanitizeGrow("fuel", {
    ...base,
    forecast: { direction: "down", effective: "2026-10-13", changes: [{ product: "Diesel", low: -0.2, high: -0.8 }, { product: "X" }], drivers: ["Brent fell"] },
  })!.forecast!;
  assert.equal(fc.direction, "down");
  assert.deepEqual(fc.changes, [{ product: "Diesel", low: -0.8, high: -0.2 }]);
});

test("analysis keeps ranked picks, clamps allocation and drops junk", () => {
  assert.equal(sanitizeGrow("analysis", { picks: [] }), null);
  const a = sanitizeGrow("analysis", {
    headline: "Lock in yields, DCA into dips",
    mood: "risk-off",
    picks: [
      { title: "Emergency fund first", why: "Only 1 month covered", risk: "conservative", expected: "≈4% a year", risks: "None", min_amount: 100 },
      { title: "No why" },
    ],
    allocation: [{ bucket: "MP2", pct: 140, amount: "₱3,000" }, { bucket: "Zero", pct: 0 }],
    tips: [{ title: "Buy RTB in-app", body: "Most banks sell them." }, { title: "Empty" }],
    avoid: [{ title: "Leverage", why: "Losses compound" }],
    forecasts: [{ asset: "Pump prices", group: "Fuel", direction: "down", low: -0.8, high: -0.3, unit: "₱/L", drivers: "Brent fell" }],
  })!;
  assert.equal(a.mood, "risk-off");
  assert.equal(a.picks.length, 1);
  assert.equal(a.picks[0].expected, "≈4% a year");
  assert.deepEqual(a.allocation, [{ bucket: "MP2", pct: 100, amount: 3000, why: "" }]);
  assert.equal(a.tips.length, 1);
  assert.equal(a.forecasts[0].group, "Fuel");
});
