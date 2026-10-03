// Grow: shapes of the research snapshots (market, perks, fuel, news) and the
// sanitizers the ingest endpoint runs on them. Everything the local agent sends
// is untrusted JSON, so each field is coerced, trimmed and capped here.

export const GROW_KINDS = ["market", "perks", "fuel", "news"] as const;
export type GrowKind = (typeof GROW_KINDS)[number];

export const FUEL_TYPES = ["Gasoline (RON 91)", "Gasoline (RON 95)", "Gasoline (RON 97+)", "Diesel", "Kerosene"] as const;
export const RISK_LEVELS = ["conservative", "moderate", "aggressive"] as const;
export type Risk = (typeof RISK_LEVELS)[number];

export type Source = { title: string; url: string };

export const DIRECTIONS = ["up", "down", "sideways"] as const;
export type Direction = (typeof DIRECTIONS)[number];
export const CONFIDENCE = ["low", "medium", "high"] as const;
export type Confidence = (typeof CONFIDENCE)[number];

/** A sourced outlook for one asset: direction plus a likely range, never a promise. */
export type Forecast = {
  asset: string;
  group: string;
  horizon: string;
  direction: Direction;
  price: number | null;
  low: number | null;
  high: number | null;
  unit: string;
  confidence: Confidence;
  drivers: string;
  url: string;
};

/** "Where to put money now": an idea matched to a risk level, with how to start. */
export type InvestIdea = {
  title: string;
  vehicle: string;
  risk: Risk;
  horizon: string;
  why: string;
  how: string;
  min_amount: number | null;
  url: string;
};

export type Quote = {
  symbol: string;
  name: string;
  price: number | null;
  change_pct: number | null;
  note: string;
};

export type MarketReport = {
  as_of: string;
  headline: string;
  mood: "risk-on" | "risk-off" | "mixed";
  summary: string;
  stocks: Quote[];
  forex: Quote[];
  crypto: Quote[];
  /** Added later: older briefs in the database don't have these. */
  commodities?: Quote[];
  forecasts?: Forecast[];
  ideas?: InvestIdea[];
  movers: { symbol: string; name: string; change_pct: number | null; reason: string }[];
  insights: { title: string; body: string }[];
  watch: { event: string; when: string; why: string }[];
  moves: string[];
  sources: Source[];
};

export type Perk = {
  bank: string;
  cards: string[];
  title: string;
  merchant: string;
  category: string;
  benefit: string;
  min_spend: number | null;
  valid_until: string | null;
  url: string;
  how: string;
};

export type PerksReport = { as_of: string; perks: Perk[]; sources: Source[] };

export type FuelPrice = { brand: string; product: string; low: number | null; high: number | null; area: string };

export type FuelForecast = {
  effective: string | null;
  direction: Direction;
  summary: string;
  changes: { product: string; low: number | null; high: number | null }[];
  drivers: string[];
};

export type FuelReport = {
  as_of: string;
  city: string;
  fuel: string;
  advisory: { effective: string | null; summary: string; changes: { product: string; change: number | null }[] };
  /** Next week's expected adjustment (estimates from oil firms/DOE); missing in older reports. */
  forecast?: FuelForecast | null;
  prices: FuelPrice[];
  tips: string[];
  sources: Source[];
};

export type NewsItem = {
  title: string;
  url: string;
  source: string;
  published: string | null;
  summary: string;
  why: string;
  tag: string;
  /** "ph" or "global"; older reports don't have it and are all Philippine. */
  region?: "ph" | "global";
};

export type NewsReport = { as_of: string; items: NewsItem[] };

export type GrowData = {
  market: MarketReport;
  perks: PerksReport;
  fuel: FuelReport;
  news: NewsReport;
};

export type GrowReport<K extends GrowKind = GrowKind> = {
  id: number;
  kind: K;
  generated_at: Date;
  source: string;
  data: GrowData[K];
};

export type GrowProfile = {
  city: string | null;
  fuel: string;
  watchlist: string;
  risk: Risk;
  emergency_saved: number;
  updated_at: Date;
};

export function isGrowKind(k: unknown): k is GrowKind {
  return typeof k === "string" && (GROW_KINDS as readonly string[]).includes(k);
}

// ---------- coercion helpers ----------

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj => (v && typeof v === "object" && !Array.isArray(v) ? (v as Obj) : {});
const arr = (v: unknown, max: number): unknown[] => (Array.isArray(v) ? v.slice(0, max) : []);

export function str(v: unknown, max = 300): string {
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  if (typeof v !== "string") return "";
  return v.replace(/\s+/g, " ").trim().slice(0, max);
}

export function num(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string") {
    const n = Number(v.replace(/[₱$,%\s]/g, ""));
    return v.trim() && Number.isFinite(n) ? n : null;
  }
  return null;
}

/** Only http(s) links survive — no javascript: or data: URLs reach an href. */
export function safeUrl(v: unknown): string {
  const s = str(v, 600);
  try {
    const u = new URL(s);
    return u.protocol === "https:" || u.protocol === "http:" ? u.toString() : "";
  } catch {
    return "";
  }
}

/** YYYY-MM-DD or null. */
export function ymd(v: unknown): string | null {
  const s = str(v, 40);
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return d.getUTCMonth() === +m[2] - 1 ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

function isoOrNow(v: unknown): string {
  const s = str(v, 60);
  const t = Date.parse(s);
  return Number.isNaN(t) ? new Date().toISOString() : new Date(t).toISOString();
}

function sources(v: unknown): Source[] {
  return arr(v, 20)
    .map((x) => ({ title: str(obj(x).title, 160), url: safeUrl(obj(x).url) }))
    .filter((s) => s.url);
}

function strings(v: unknown, max: number, len = 300): string[] {
  return arr(v, max).map((x) => str(x, len)).filter(Boolean);
}

function quotes(v: unknown): Quote[] {
  return arr(v, 24)
    .map((x) => {
      const o = obj(x);
      return {
        symbol: str(o.symbol, 24),
        name: str(o.name, 80),
        price: num(o.price),
        change_pct: num(o.change_pct),
        note: str(o.note, 200),
      };
    })
    .filter((q) => q.symbol || q.name);
}

const pick = <T extends string>(v: unknown, allowed: readonly T[], fallback: T): T =>
  typeof v === "string" && (allowed as readonly string[]).includes(v.toLowerCase()) ? (v.toLowerCase() as T) : fallback;

function forecasts(v: unknown): Forecast[] {
  return arr(v, 16)
    .map((x) => {
      const o = obj(x);
      let low = num(o.low);
      let high = num(o.high);
      if (low !== null && high !== null && low > high) [low, high] = [high, low];
      return {
        asset: str(o.asset, 60),
        group: str(o.group, 30) || "Other",
        horizon: str(o.horizon, 40),
        direction: pick(o.direction, DIRECTIONS, "sideways"),
        price: num(o.price),
        low,
        high,
        unit: str(o.unit, 16),
        confidence: pick(o.confidence, CONFIDENCE, "low"),
        drivers: str(o.drivers, 500),
        url: safeUrl(o.url),
      };
    })
    .filter((f) => f.asset && f.drivers);
}

function ideas(v: unknown): InvestIdea[] {
  return arr(v, 10)
    .map((x) => {
      const o = obj(x);
      return {
        title: str(o.title, 120),
        vehicle: str(o.vehicle, 60),
        risk: pick(o.risk, RISK_LEVELS, "moderate"),
        horizon: str(o.horizon, 40),
        why: str(o.why, 500),
        how: str(o.how, 400),
        min_amount: num(o.min_amount),
        url: safeUrl(o.url),
      };
    })
    .filter((i) => i.title && i.why);
}

function fuelForecast(v: unknown): FuelForecast | null {
  const o = obj(v);
  const summary = str(o.summary, 600);
  const changes = arr(o.changes, 8)
    .map((x) => {
      const c = obj(x);
      let low = num(c.low);
      let high = num(c.high);
      if (low !== null && high !== null && low > high) [low, high] = [high, low];
      return { product: str(c.product, 40), low, high };
    })
    .filter((c) => c.product && (c.low !== null || c.high !== null));
  if (!summary && !changes.length) return null;
  return {
    effective: ymd(o.effective),
    direction: pick(o.direction, DIRECTIONS, "sideways"),
    summary,
    changes,
    drivers: strings(o.drivers, 5, 200),
  };
}

// ---------- per-kind sanitizers ----------

export function sanitizeMarket(raw: unknown): MarketReport | null {
  const o = obj(raw);
  const headline = str(o.headline, 200);
  if (!headline) return null;
  const mood = o.mood === "risk-on" || o.mood === "risk-off" ? o.mood : "mixed";
  return {
    as_of: isoOrNow(o.as_of),
    headline,
    mood,
    summary: str(o.summary, 1600),
    stocks: quotes(o.stocks),
    forex: quotes(o.forex),
    crypto: quotes(o.crypto),
    commodities: quotes(o.commodities),
    forecasts: forecasts(o.forecasts),
    ideas: ideas(o.ideas),
    movers: arr(o.movers, 12)
      .map((x) => {
        const m = obj(x);
        return { symbol: str(m.symbol, 24), name: str(m.name, 80), change_pct: num(m.change_pct), reason: str(m.reason, 300) };
      })
      .filter((m) => m.symbol || m.name),
    insights: arr(o.insights, 8)
      .map((x) => ({ title: str(obj(x).title, 120), body: str(obj(x).body, 700) }))
      .filter((i) => i.title && i.body),
    watch: arr(o.watch, 10)
      .map((x) => ({ event: str(obj(x).event, 160), when: str(obj(x).when, 60), why: str(obj(x).why, 300) }))
      .filter((w) => w.event),
    moves: strings(o.moves, 8),
    sources: sources(o.sources),
  };
}

export function sanitizePerks(raw: unknown): PerksReport | null {
  const o = obj(raw);
  const perks = arr(o.perks, 150)
    .map((x): Perk => {
      const p = obj(x);
      return {
        bank: str(p.bank, 20).toLowerCase(),
        cards: strings(p.cards, 10, 60),
        title: str(p.title, 160),
        merchant: str(p.merchant, 80),
        category: str(p.category, 40) || "Other",
        benefit: str(p.benefit, 200),
        min_spend: num(p.min_spend),
        valid_until: ymd(p.valid_until),
        url: safeUrl(p.url),
        how: str(p.how, 400),
      };
    })
    .filter((p) => p.bank && p.title);
  if (!perks.length) return null;
  return { as_of: isoOrNow(o.as_of), perks, sources: sources(o.sources) };
}

export function sanitizeFuel(raw: unknown): FuelReport | null {
  const o = obj(raw);
  const prices = arr(o.prices, 80)
    .map((x) => {
      const p = obj(x);
      return { brand: str(p.brand, 40), product: str(p.product, 40), low: num(p.low), high: num(p.high), area: str(p.area, 80) };
    })
    // Averages ("All brands (avg)") aren't a place you can fill up.
    .filter((p) => p.brand && !/\bavg\b|average|all brands/i.test(p.brand) && (p.low !== null || p.high !== null));
  const adv = obj(o.advisory);
  const advisory = {
    effective: ymd(adv.effective),
    summary: str(adv.summary, 900),
    changes: arr(adv.changes, 8)
      .map((x) => ({ product: str(obj(x).product, 40), change: num(obj(x).change) }))
      .filter((c) => c.product),
  };
  if (!prices.length && !advisory.summary) return null;
  return {
    as_of: isoOrNow(o.as_of),
    city: str(o.city, 80),
    fuel: str(o.fuel, 40),
    advisory,
    forecast: fuelForecast(o.forecast),
    prices,
    tips: strings(o.tips, 8),
    sources: sources(o.sources),
  };
}

export function sanitizeNews(raw: unknown): NewsReport | null {
  const o = obj(raw);
  const items = arr(o.items, 60)
    .map((x) => {
      const n = obj(x);
      const published = str(n.published, 60);
      return {
        title: str(n.title, 240),
        url: safeUrl(n.url),
        source: str(n.source, 60),
        published: published && !Number.isNaN(Date.parse(published)) ? new Date(published).toISOString() : null,
        summary: str(n.summary, 500),
        why: str(n.why, 400),
        tag: str(n.tag, 30),
        region: n.region === "global" ? ("global" as const) : ("ph" as const),
      };
    })
    .filter((n) => n.title && n.url);
  if (!items.length) return null;
  return { as_of: isoOrNow(o.as_of), items };
}

export function sanitizeGrow<K extends GrowKind>(kind: K, raw: unknown): GrowData[K] | null {
  const fn = { market: sanitizeMarket, perks: sanitizePerks, fuel: sanitizeFuel, news: sanitizeNews }[kind];
  return fn(raw) as GrowData[K] | null;
}

// ---------- display helpers ----------

export function formatPct(n: number | null) {
  if (n === null) return "—";
  const sign = n > 0 ? "+" : n < 0 ? "−" : "";
  return `${sign}${Math.abs(n).toFixed(2)}%`;
}

export function formatPrice(n: number | null) {
  if (n === null) return "—";
  const abs = Math.abs(n);
  const digits = abs >= 1000 ? 2 : abs >= 1 ? 2 : 4;
  return n.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

/** "3h ago" style age for a report timestamp. */
export function ageLabel(d: Date | string, now = new Date()) {
  const ms = now.getTime() - new Date(d).getTime();
  const min = Math.round(ms / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const h = Math.round(min / 60);
  if (h < 48) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

/** Days until a YYYY-MM-DD date (Manila calendar), negative when past. */
export function daysUntil(date: string, today: string) {
  const a = Date.UTC(+today.slice(0, 4), +today.slice(5, 7) - 1, +today.slice(8, 10));
  const b = Date.UTC(+date.slice(0, 4), +date.slice(5, 7) - 1, +date.slice(8, 10));
  return Math.round((b - a) / 86_400_000);
}
