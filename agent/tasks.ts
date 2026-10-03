// Prompts + JSON schemas for each research task. Claude Code (claude -p) fills
// the schema using WebSearch/WebFetch; the Pitaka server re-validates everything
// in lib/grow.ts, so these schemas guide the model rather than guard the app.

import { EXPENSE_CATEGORIES } from "../lib/categories";
import type { FuelReport, MarketReport, NewsReport } from "../lib/grow";

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
  /** Only with GET /api/grow?reports=1: the latest research, which "analyze" works from. */
  reports?: {
    market: { generated_at: string; data: MarketReport } | null;
    fuel: { generated_at: string; data: FuelReport } | null;
    news: { generated_at: string; data: NewsReport } | null;
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

const forecast = {
  type: "object",
  properties: {
    asset: { type: "string", description: "e.g. 'Bitcoin (BTC)', 'USD/PHP', 'PSEi', 'Brent crude', 'Gold'" },
    group: { type: "string", enum: ["Crypto", "Stocks", "Forex", "Commodities", "Rates", "Fuel"] },
    horizon: { type: "string", description: "e.g. 'Next 2 weeks', 'By end of October', 'End of 2026'" },
    direction: { type: "string", enum: ["up", "down", "sideways"] },
    price: { ...nullable("number"), description: "Latest price, same unit as low/high" },
    low: { ...nullable("number"), description: "Low end of the likely range over the horizon" },
    high: { ...nullable("number"), description: "High end of the likely range over the horizon" },
    unit: { type: "string", description: "'USD', '₱', 'pts', '$/bbl', '$/oz', '%'" },
    confidence: { type: "string", enum: ["low", "medium", "high"] },
    drivers: { type: "string", description: "1-2 sentences: what drives this view and whose view it is (bank, analyst, futures, options market)" },
    url: { type: "string", description: "Link to the outlook or data the range is based on" },
  },
  required: ["asset", "group", "horizon", "direction", "price", "low", "high", "unit", "confidence", "drivers", "url"],
};

const idea = {
  type: "object",
  properties: {
    title: { type: "string", description: "Short, e.g. 'Lock in today's RTB yield'" },
    vehicle: { type: "string", description: "e.g. 'Retail Treasury Bonds', 'Pag-IBIG MP2', 'Digital bank time deposit', 'PSEi index fund', 'Bitcoin (small slice)', 'Gold'" },
    risk: { type: "string", enum: ["conservative", "moderate", "aggressive"] },
    horizon: { type: "string", description: "How long the money should stay, e.g. '6–12 months', '5+ years'" },
    why: { type: "string", description: "Why it fits NOW: the current rate, price or trend, with numbers" },
    how: { type: "string", description: "Concrete first step in the Philippines: where to buy and how" },
    min_amount: { ...nullable("number"), description: "Minimum to start, in pesos" },
    url: { type: "string", description: "Official page for the product or offer" },
  },
  required: ["title", "vehicle", "risk", "horizon", "why", "how", "min_amount", "url"],
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
    commodities: { type: "array", items: quote },
    forecasts: { type: "array", items: forecast },
    ideas: { type: "array", items: idea },
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
  required: ["as_of", "headline", "mood", "summary", "stocks", "forex", "crypto", "commodities", "forecasts", "ideas", "movers", "insights", "watch", "moves", "sources"],
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
        summary: { type: "string", description: "1-2 short sentences, e.g. 'Gasoline up ₱0.90/L, diesel down ₱0.40/L on Tuesday.'" },
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
    forecast: {
      type: "object",
      description: "The NEXT weekly adjustment (the one after advisory), as estimated by oil firms, DOE or analysts",
      properties: {
        effective: { type: ["string", "null"], description: "YYYY-MM-DD the next adjustment would take effect (a Tuesday)" },
        direction: { type: "string", enum: ["up", "down", "sideways"] },
        summary: { type: "string", description: "1-2 sentences, e.g. 'Early estimates point to a ₱0.50–0.80/L gasoline hike next Tuesday.'" },
        changes: {
          type: "array",
          items: {
            type: "object",
            properties: { product: { type: "string" }, low: nullable("number"), high: nullable("number") },
            required: ["product", "low", "high"],
          },
        },
        drivers: { type: "array", items: { type: "string" }, description: "2-4 short reasons: MOPS/Brent trend, peso, OPEC+, geopolitics" },
      },
      required: ["effective", "direction", "summary", "changes", "drivers"],
    },
    tips: { type: "array", items: { type: "string" } },
    sources: { type: "array", items: source },
  },
  required: ["as_of", "city", "fuel", "advisory", "forecast", "prices", "tips", "sources"],
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
          tag: {
            type: "string",
            enum: ["Rates", "Oil & fuel", "Inflation", "Peso & FX", "Stocks", "Crypto", "Gold & metals", "Banking", "Tax", "Jobs & pay", "Business"],
          },
        },
        required: ["index", "why", "tag"],
      },
    },
  },
  required: ["picks"],
};

export const ANALYSIS_SCHEMA = {
  type: "object",
  properties: {
    as_of: { type: "string" },
    headline: { type: "string", description: "One-line verdict on where to put money now, max ~90 chars" },
    mood: { type: "string", enum: ["risk-on", "risk-off", "mixed"] },
    summary: { type: "string", description: "4-6 plain sentences: what the research says, what is likely next, and what that means for this person" },
    forecasts: { type: "array", items: forecast },
    picks: {
      type: "array",
      description: "Best moves right now, best first",
      items: {
        type: "object",
        properties: {
          ...idea.properties,
          expected: { type: "string", description: "Realistic return or outcome, e.g. '≈6.0% a year, fixed' or 'volatile: −30% to +40% in a year'" },
          risks: { type: "string", description: "What can go wrong, one sentence" },
        },
        required: [...idea.required, "expected", "risks"],
      },
    },
    allocation: {
      type: "array",
      description: "How to split the money they have left each month",
      items: {
        type: "object",
        properties: {
          bucket: { type: "string", description: "e.g. 'Emergency fund (digital bank)', 'RTB / MP2', 'PSEi index fund', 'Bitcoin'" },
          pct: { type: "number", description: "Percent of monthly leftover; all rows add up to 100" },
          amount: { ...nullable("number"), description: "Pesos per month" },
          why: { type: "string" },
        },
        required: ["bucket", "pct", "amount", "why"],
      },
    },
    tips: {
      type: "array",
      items: {
        type: "object",
        properties: { title: { type: "string" }, body: { type: "string", description: "Specific and actionable, 1-3 sentences" } },
        required: ["title", "body"],
      },
    },
    avoid: {
      type: "array",
      items: {
        type: "object",
        properties: { title: { type: "string" }, why: { type: "string" } },
        required: ["title", "why"],
      },
    },
    sources: { type: "array", items: source },
  },
  required: ["as_of", "headline", "mood", "summary", "forecasts", "picks", "allocation", "tips", "avoid", "sources"],
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
- crypto: BTC, ETH, SOL, XRP, BNB, plus any coins in the watchlist, prices in USD. Add any coin making big news today. 5–8 rows.
- commodities: Brent crude, WTI crude, gold, silver, plus anything driving PH prices this week (e.g. rice, LNG). Prices in USD with the unit in the note. 3–6 rows.
- movers: 3–6 notable movers today (PSE, global stocks or crypto) with the reason.
- watch: upcoming 7–14 days events that move Philippine money: BSP Monetary Board, US Fed, PH/US CPI, jobs data, weekly fuel price adjustments, RTB or bond offers, big IPOs.
- insights: 3–5 "what it means for you" notes written for THIS person, in pesos, e.g. what a weaker peso does to their imported costs or dollar savings, what rate moves mean for their savings and loans.
- forecasts: 6–10 outlooks covering at least BTC, ETH, one more coin in the news, USD/PHP, PSEi, Brent crude and gold. For each: direction, a likely low–high range over a stated horizon (2 weeks to end of year), confidence, and the drivers. Base every range on something you can cite: published bank/analyst targets, futures curves, options-implied ranges, consensus surveys, or the recent trading range plus scheduled catalysts. Name whose view it is in drivers and link it in url. Use "low" confidence when sources disagree. Never present a forecast as certain.
- ideas: 4–6 "where to put money now" ideas for the Philippines, spread across conservative, moderate and aggressive, with the person's own risk level weighted most. Use today's actual numbers: current RTB / T-bill yields, Pag-IBIG MP2 latest dividend rate, top digital-bank time deposit rates (GoTyme, Maya, CIMB, Tonik, etc.), PSEi valuation vs history, index funds / UITFs / ETFs (FMETF), USD time deposits if the peso is weak, gold, and crypto only as a small slice for aggressive. Each idea says why it fits NOW, how to start (where to buy), and the minimum amount. If the emergency fund is under 3 months, make the first idea about building it in a high-yield account.
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
2. forecast: the NEXT weekly adjustment after the advisory above. Oil firms and the DOE Oil Industry Management Bureau share early estimates from Thursday to Saturday based on four days of MOPS trading; news sites (GMA, Inquirer, Philstar, ABS-CBN) report them as "oil price hike/rollback next week". Give the expected ₱/L range per product (positive = hike, negative = rollback), the direction and 2–4 drivers (Brent/MOPS trend, peso vs dollar, OPEC+, geopolitics). If no estimate is out yet, infer only the likely direction from this week's MOPS and Brent movement, leave changes empty, and say so in summary.
3. prices: the latest pump price ranges per brand (Petron, Shell, Caltex, Seaoil, Phoenix, Cleanfuel, Unioil, Jetti, Flying V, and others) for ${city} or the nearest city covered. The DOE publishes weekly "Prevailing Retail Pump Prices" per city and brand (doe.gov.ph, Oil Monitor / Retail Pump Prices). Community trackers and news reports are fallbacks. Include rows for ${ctx.profile.fuel} for every brand you find, and add Diesel and RON 95 rows if easy. Product names: "RON 91", "RON 95", "RON 97", "Diesel", "Premium Diesel".
4. tips: 3–5 short, specific ways to spend less on fuel this week in ${city} (timing vs the adjustment, cheapest brand, loyalty cards, driving habits).

Never invent prices. If the data is a week or more old, say so in advisory.summary and still report it. low/high are ₱ per liter.`;
}

export function newsPrompt(headlines: { title: string; source: string; summary: string; region?: string }[], ctx: Context, today: string) {
  return `Today is ${today}. Below are recent Philippine and global business headlines. Pick the 18–24 that matter most for an ordinary Filipino's personal finances (prices, rates, the peso, oil and fuel, jobs and pay, taxes, banking, investing, crypto, gold) and, for each, write ONE plain sentence on what it means for their money in the Philippines. Mix roughly two Philippine stories for every global one, and for global stories explain the link to the peso, pump prices, PSE or their crypto. Skip corporate news with no personal-finance angle.

The reader: ${personal(ctx).replace(/\n/g, " ")}

Headlines:
${headlines.map((h, i) => `[${i}] ${h.title} (${h.source}${h.region === "global" ? ", global" : ""}) ${h.summary.slice(0, 180)}`).join("\n")}`;
}

/** Trim the stored research to what the analyst needs, so the prompt stays small. */
function research(ctx: Context) {
  const r = ctx.reports;
  const m = r?.market?.data;
  const f = r?.fuel?.data;
  const n = r?.news?.data;
  const market = m && {
    from: r!.market!.generated_at,
    headline: m.headline,
    mood: m.mood,
    summary: m.summary,
    quotes: [...m.stocks, ...m.forex, ...m.crypto, ...(m.commodities ?? [])].map(({ symbol, price, change_pct, note }) => ({ symbol, price, change_pct, note })),
    movers: m.movers,
    forecasts: m.forecasts ?? [],
    ideas: m.ideas ?? [],
    watch: m.watch,
  };
  const fuel = f && {
    from: r!.fuel!.generated_at,
    city: f.city,
    advisory: f.advisory,
    forecast: f.forecast ?? null,
    cheapest: [...f.prices].sort((a, b) => (a.low ?? a.high ?? 1e9) - (b.low ?? b.high ?? 1e9)).slice(0, 6),
  };
  const news = n && {
    from: r!.news!.generated_at,
    items: n.items.slice(0, 30).map((i) => `[${i.tag}${i.region === "global" ? ", global" : ""}] ${i.title}${i.why ? ` — ${i.why}` : ""}`),
  };
  return JSON.stringify({ market, fuel, news }, null, 1);
}

export function analyzePrompt(ctx: Context, today: string) {
  const s = ctx.spending;
  const leftover = Math.max(0, Math.round(s.avg_monthly_income - s.avg_monthly_spend));
  return `You are Pitaka's investment analyst for one person in the Philippines. Today is ${today} (Asia/Manila).

Below is the research Pitaka already gathered (market brief, fuel prices and news). Analyze it and turn it into a forecast and a plan. You may use WebSearch and WebFetch to check a number that looks stale or to fill a gap (current RTB/T-bill yields, MP2 dividend rate, digital-bank time deposit rates, analyst targets), but build mainly on the research given. Never invent a number; if you can't verify it, say so.

About the person:
${personal(ctx)}
Money left over each month: ≈${peso(leftover)}.
Watchlist: ${ctx.profile.watchlist}.

Research:
${research(ctx)}

Fill the schema:
- headline + summary: your verdict on the market right now and where money is best placed this month.
- forecasts: 8–12 outlooks with a likely low–high range, horizon (2–4 weeks for most; add end-of-year for BTC and PSEi), direction, confidence and drivers. Cover BTC, ETH, at least two other coins (e.g. SOL, XRP, or any in the news/watchlist), PSEi, USD/PHP, gold, Brent crude, and one "Fuel" row for Philippine pump prices next week (unit "₱/L", range = expected change, price = null). Name whose view each range is based on and link it in url. Keep ranges honest: wide when volatile, "low" confidence when sources disagree.
- picks: 5–7 best moves right now, ranked best first FOR THIS PERSON, mixing safe and growth options but weighted to their risk comfort. Use today's actual rates and prices. Each says why now, the expected return or outcome, the main risk, how to start in the Philippines and the minimum amount. If their emergency fund is under 3 months, rank building it first. Crypto only as a small slice, never more than 10% for aggressive and 0–5% otherwise.
- allocation: a split of their ≈${peso(leftover)} monthly leftover across 3–6 buckets that add up to 100%, with peso amounts.${leftover === 0 ? " Their leftover is ₱0 or unknown: give percentages only (amount null) and make the first tip about freeing up money to invest." : ""}
- tips: 6–10 tips and tricks that are specific and current, e.g. timing fuel fill-ups to the forecast, peso-cost averaging into dips, where to get the best time-deposit rate, buying RTBs through bank apps, MP2 annual vs monthly payout, tax-free options, using card promos, rebalancing.
- avoid: 2–4 things to steer clear of right now (e.g. chasing a coin that already ran up, leverage, "guaranteed return" schemes, locking money they'll need soon).
- sources: pages you relied on (from the research or your own checks).

Style: plain English, short sentences, peso amounts with ₱. Frame picks as "consider…", never promise returns, no leverage, no single-stock "buy now" calls. This is education, not licensed advice.`;
}
