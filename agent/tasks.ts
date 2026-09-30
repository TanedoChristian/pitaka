// Prompts + JSON schemas for each research task. Claude Code (claude -p) fills
// the schema using WebSearch/WebFetch; the Pitaka server re-validates everything
// in lib/grow.ts, so these schemas guide the model rather than guard the app.

import { EXPENSE_CATEGORIES } from "../lib/categories";

export type Context = {
  profile: { city: string | null; fuel: string; watchlist: string; risk: string; emergency_saved: number };
  cards: { bank: string; type: string; product: string | null; nickname: string | null }[];
  spending: {
    avg_monthly_spend: number;
    avg_monthly_income: number;
    months_of_data: number;
    top_categories_90d: { category: string; total: number }[];
    top_merchants_90d: { merchant: string; total: number }[];
  };
};

const nullable = (type: string) => ({ type: [type, "null"] });
const source = {
  type: "object",
  properties: { title: { type: "string" }, url: { type: "string" } },
  required: ["title", "url"],
};
const quote = {
  type: "object",
  properties: {
    symbol: { type: "string" },
    name: { type: "string" },
    price: nullable("number"),
    change_pct: nullable("number"),
    note: { type: "string", description: "One short line: why it moved or what to know" },
  },
  required: ["symbol", "name", "price", "change_pct", "note"],
};

export const MARKET_SCHEMA = {
  type: "object",
  properties: {
    as_of: { type: "string", description: "ISO timestamp the prices are from" },
    headline: { type: "string", description: "One-line takeaway of today's markets, max ~90 chars" },
    mood: { type: "string", enum: ["risk-on", "risk-off", "mixed"] },
    summary: { type: "string", description: "3-5 plain-English sentences on what happened and why" },
    stocks: { type: "array", items: quote },
    forex: { type: "array", items: quote },
    crypto: { type: "array", items: quote },
    movers: {
      type: "array",
      items: {
        type: "object",
        properties: { symbol: { type: "string" }, name: { type: "string" }, change_pct: nullable("number"), reason: { type: "string" } },
        required: ["symbol", "name", "change_pct", "reason"],
      },
    },
    insights: {
      type: "array",
      items: {
        type: "object",
        properties: { title: { type: "string" }, body: { type: "string" } },
        required: ["title", "body"],
      },
    },
    watch: {
      type: "array",
      items: {
        type: "object",
        properties: { event: { type: "string" }, when: { type: "string" }, why: { type: "string" } },
        required: ["event", "when", "why"],
      },
    },
    moves: { type: "array", items: { type: "string" } },
    sources: { type: "array", items: source },
  },
  required: ["as_of", "headline", "mood", "summary", "stocks", "forex", "crypto", "movers", "insights", "watch", "moves", "sources"],
};

export const PERKS_SCHEMA = {
  type: "object",
  properties: {
    as_of: { type: "string" },
    perks: {
      type: "array",
      items: {
        type: "object",
        properties: {
          bank: { type: "string", description: "bank id: bpi, unionbank, eastwest, maya, gotyme" },
          cards: { type: "array", items: { type: "string" }, description: "Eligible card products; empty if all cards" },
          title: { type: "string" },
          merchant: { type: "string", description: "Merchant or brand name as customers know it; empty if many merchants" },
          category: { type: "string", enum: [...EXPENSE_CATEGORIES] },
          benefit: { type: "string", description: "The deal in a few words, e.g. '10% cashback, up to ₱500'" },
          min_spend: nullable("number"),
          valid_until: { type: ["string", "null"], description: "YYYY-MM-DD" },
          url: { type: "string", description: "Official promo page URL" },
          how: { type: "string", description: "How to avail, one or two short sentences" },
        },
        required: ["bank", "cards", "title", "merchant", "category", "benefit", "min_spend", "valid_until", "url", "how"],
      },
    },
    sources: { type: "array", items: source },
  },
  required: ["as_of", "perks", "sources"],
};

export const FUEL_SCHEMA = {
  type: "object",
  properties: {
    as_of: { type: "string" },
    city: { type: "string" },
    fuel: { type: "string" },
    advisory: {
      type: "object",
      properties: {
        effective: { type: ["string", "null"], description: "YYYY-MM-DD the latest weekly adjustment takes effect" },
        summary: { type: "string", description: "e.g. 'Gasoline up ₱0.90/L, diesel down ₱0.40/L on Tuesday'" },
        changes: {
          type: "array",
          items: {
            type: "object",
            properties: { product: { type: "string" }, change: nullable("number") },
            required: ["product", "change"],
          },
        },
      },
      required: ["effective", "summary", "changes"],
    },
    prices: {
      type: "array",
      items: {
        type: "object",
        properties: {
          brand: { type: "string" },
          product: { type: "string", description: "e.g. 'RON 91', 'RON 95', 'Diesel'" },
          low: nullable("number"),
          high: nullable("number"),
          area: { type: "string", description: "City or area the price applies to" },
        },
        required: ["brand", "product", "low", "high", "area"],
      },
    },
    tips: { type: "array", items: { type: "string" } },
    sources: { type: "array", items: source },
  },
  required: ["as_of", "city", "fuel", "advisory", "prices", "tips", "sources"],
};

export const NEWS_SCHEMA = {
  type: "object",
  properties: {
    picks: {
      type: "array",
      items: {
        type: "object",
        properties: {
          index: { type: "integer", description: "Index of the headline in the list given" },
          why: { type: "string", description: "One sentence: what this means for an ordinary Filipino's money" },
          tag: { type: "string", enum: ["Rates", "Inflation", "Peso & FX", "Stocks", "Crypto", "Banking", "Tax", "Jobs & pay", "Business"] },
        },
        required: ["index", "why", "tag"],
      },
    },
  },
  required: ["picks"],
};

const peso = (n: number) => `₱${Math.round(n).toLocaleString("en-US")}`;

function personal(ctx: Context) {
  const s = ctx.spending;
  const saving = s.avg_monthly_income - s.avg_monthly_spend;
  const efMonths = s.avg_monthly_spend > 0 ? ctx.profile.emergency_saved / s.avg_monthly_spend : 0;
  return [
    `Risk comfort: ${ctx.profile.risk}.`,
    s.months_of_data
      ? `Average monthly spend ${peso(s.avg_monthly_spend)}, income ${peso(s.avg_monthly_income)} (≈${peso(saving)} left over a month).`
      : "Not enough history for monthly averages yet.",
    `Emergency fund: ${peso(ctx.profile.emergency_saved)} (≈${efMonths.toFixed(1)} months of expenses).`,
    `Cards: ${ctx.cards.map((c) => `${c.bank.toUpperCase()} ${c.type}${c.product ? ` (${c.product})` : ""}`).join(", ") || "none"}.`,
  ].join("\n");
}

export function marketPrompt(ctx: Context, today: string) {
  return `You are Pitaka's market analyst for one person in the Philippines. Today is ${today} (Asia/Manila).

Research today's markets with WebSearch and WebFetch and fill the JSON schema. Use the most recent close or live quote you can verify; never invent a number. If you can't verify a price, set it to null and say so in the note.

Cover:
- stocks: PSEi first, then these watchlist items that are stocks or indices: ${ctx.profile.watchlist}. Add the S&P 500 and Nasdaq if missing. 5–10 rows.
- forex: USD/PHP first (most important), then EUR/PHP, JPY/PHP, SGD/PHP, plus any currency pairs in the watchlist. 3–6 rows.
- crypto: BTC, ETH, plus any coins in the watchlist, prices in USD. 2–5 rows.
- movers: 3–6 notable movers today (PSE or global) with the reason.
- watch: upcoming 7–14 days events that move Philippine money: BSP Monetary Board, US Fed, PH/US CPI, jobs data, weekly fuel price adjustments, RTB or bond offers, big IPOs.
- insights: 3–5 "what it means for you" notes written for THIS person, in pesos, e.g. what a weaker peso does to their imported costs or dollar savings, what rate moves mean for their savings and loans.
- moves: 3–5 practical, educational next steps suited to their risk comfort. Frame them as "consider…", e.g. keep peso-cost averaging, top up the emergency fund first, look at the next RTB issue. No guaranteed-return language, no leverage, no single-stock "buy now" calls.
- sources: the pages you used.

About the person:
${personal(ctx)}

Style: plain English, short sentences, no hype, peso amounts with ₱. change_pct is the day's % change as a number (e.g. -0.42).`;
}

export function perksPrompt(ctx: Context, today: string) {
  const credit = ctx.cards.filter((c) => c.type === "credit" && c.bank !== "cash");
  const banks = [...new Set((credit.length ? credit : ctx.cards).map((c) => c.bank))];
  return `You find live credit card promos and perks in the Philippines for one person. Today is ${today}.

Their cards:
${(credit.length ? credit : ctx.cards).map((c) => `- ${c.bank.toUpperCase()} ${c.type} card${c.product ? `: ${c.product}` : " (product unknown, so include promos open to all of this bank's credit cards)"}`).join("\n")}

Where they spend most (last 90 days):
${ctx.spending.top_merchants_90d.slice(0, 12).map((m) => `- ${m.merchant}: ${peso(m.total)}`).join("\n") || "- (no data)"}
Top categories: ${ctx.spending.top_categories_90d.map((c) => c.category).join(", ") || "(none)"}

Research with WebFetch and WebSearch. Start from the official promo pages:
${banks.includes("bpi") ? "- BPI: https://www.bpi.com.ph/personal/rewards-and-promotions/promos and https://www2.bpi.com.ph/creditcards/promos (and its category pages: dining, shopping-and-essentials, online, travel)\n" : ""}${banks.includes("unionbank") ? "- UnionBank: https://www.unionbankph.com (look for Promos / Deals for credit cards) and search 'UnionBank credit card promo' for this month\n" : ""}${banks.filter((b) => !["bpi", "unionbank"].includes(b)).map((b) => `- ${b}: search its official site for current card promos\n`).join("")}If an official page blocks you, use reputable aggregators (Moneymax, the merchant's own promo page) but always prefer and link the official page.

Rules:
- Only promos still valid on ${today} or later. Skip expired ones. valid_until = promo end date (YYYY-MM-DD) or null if ongoing.
- Prioritize promos at the merchants and categories this person already uses, then fuel, groceries, dining, bills, installment (0%) and cashback/rebate promos.
- 15–40 perks. One perk per distinct offer, no duplicates.
- category must be one of the allowed values; fuel stations go under Transport.
- bank uses the lowercase id: ${banks.join(", ") || "bpi, unionbank"}.
- Never invent a promo. If you can't open a page, leave that promo out.`;
}

export function fuelPrompt(ctx: Context, today: string) {
  const city = ctx.profile.city || "Metro Manila";
  return `You research fuel prices in the Philippines for one driver. Today is ${today}. Area: ${city}. Their fuel: ${ctx.profile.fuel}.

Use WebSearch and WebFetch to find:
1. advisory: this week's oil price adjustment (announced by oil companies on Monday, effective Tuesday 6 AM). Give per-product changes in ₱/L (positive = increase, negative = rollback): Gasoline, Diesel, Kerosene. If the next adjustment is only forecast, say "forecast" in the summary.
2. prices: the latest pump price ranges per brand (Petron, Shell, Caltex, Seaoil, Phoenix, Cleanfuel, Unioil, Jetti, Flying V, and others) for ${city} or the nearest city covered. The DOE publishes weekly "Prevailing Retail Pump Prices" per city and brand (doe.gov.ph, Oil Monitor / Retail Pump Prices). Community trackers and news reports are fallbacks. Include rows for ${ctx.profile.fuel} for every brand you find, and add Diesel and RON 95 rows if easy. Product names: "RON 91", "RON 95", "RON 97", "Diesel", "Premium Diesel".
3. tips: 3–5 short, specific ways to spend less on fuel this week in ${city} (timing vs the adjustment, cheapest brand, loyalty cards, driving habits).

Never invent prices. If the data is a week or more old, say so in advisory.summary and still report it. low/high are ₱ per liter.`;
}

export function newsPrompt(headlines: { title: string; source: string; summary: string }[], ctx: Context, today: string) {
  return `Today is ${today}. Below are recent Philippine business headlines. Pick the 12–15 that matter most for an ordinary Filipino's personal finances (prices, rates, the peso, jobs and pay, taxes, banking, investing, crypto) and, for each, write ONE plain sentence on what it means for their money. Skip corporate news with no personal-finance angle.

The reader: ${personal(ctx).replace(/\n/g, " ")}

Headlines:
${headlines.map((h, i) => `[${i}] ${h.title} (${h.source}) ${h.summary.slice(0, 180)}`).join("\n")}`;
}
