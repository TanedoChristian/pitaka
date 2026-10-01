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
