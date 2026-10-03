import type { NewsItem } from "./grow";

// Business/money feeds that answer plain server requests: Philippine first, then
// the global markets, oil and crypto news that moves the peso and pump prices.
// (Inquirer, Manila Bulletin and BusinessMirror return 403 to non-browsers, so they're left out.)
export const FEEDS = [
  { source: "BusinessWorld", url: "https://bworldonline.com/feed/", region: "ph" },
  { source: "Philstar Business", url: "https://www.philstar.com/rss/business", region: "ph" },
  { source: "GMA Money", url: "https://data.gmanetwork.com/gno/rss/money/feed.xml", region: "ph" },
  { source: "Rappler Business", url: "https://www.rappler.com/business/feed/", region: "ph" },
  { source: "Manila Times Business", url: "https://www.manilatimes.net/news/business/feed", region: "ph" },
  { source: "CNBC Markets", url: "https://www.cnbc.com/id/15839069/device/rss/rss.html", region: "global" },
  { source: "CNBC Economy", url: "https://www.cnbc.com/id/20910258/device/rss/rss.html", region: "global" },
  { source: "OilPrice", url: "https://oilprice.com/rss/main", region: "global" },
  { source: "CoinDesk", url: "https://www.coindesk.com/arc/outboundfeeds/rss/", region: "global" },
  { source: "Cointelegraph", url: "https://cointelegraph.com/rss", region: "global" },
] as const;

// What a peso-saver or small investor cares about. Score decides the order.
const TAGS: [string, RegExp][] = [
  ["Rates", /\bbsp\b|bangko sentral|policy rate|interest rate|rate cut|monetary|\bfed\b|federal reserve|yield|treasury|bond|rtb|t-bill/i],
  ["Oil & fuel", /\boil\b|crude|brent|\bwti\b|opec|fuel price|pump price|gasoline|diesel|rollback|\blng\b/i],
  ["Inflation", /inflation|\bcpi\b|prices of|price hike|rice price|electricity rate|meralco rate|fare/i],
  ["Peso & FX", /\bpeso\b|dollar|forex|exchange rate|\busd\b|remittance/i],
  ["Stocks", /\bpse\b|psei|stock|shares|index|ipo|dividend|equit/i],
  ["Crypto", /crypto|bitcoin|\bbtc\b|ethereum|\beth\b|solana|\bxrp\b|stablecoin|blockchain|\betf\b.*(?:bitcoin|ether)|\bweb3\b/i],
  ["Gold & metals", /\bgold\b|silver|copper|nickel|precious metal/i],
  ["Banking", /\bbank|credit card|loan|deposit|savings|digital bank|gcash|maya|e-wallet|pag-ibig|mp2|sss|gsis|philhealth/i],
  ["Tax", /\bbir\b|\btax|vat\b|excise/i],
  ["Jobs & pay", /wage|salary|jobs|employment|13th month|bonus/i],
];

export type Region = "ph" | "global";

export function tagFor(text: string) {
  for (const [tag, re] of TAGS) if (re.test(text)) return tag;
  return "Business";
}

function relevance(item: NewsItem) {
  const text = `${item.title} ${item.summary}`;
  let score = 0;
  for (const [, re] of TAGS) if (re.test(text)) score += 2;
  if (/how to|tips|guide|what you need to know|explainer/i.test(text)) score += 2;
  return score;
}

const ENTITIES: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", hellip: "…",
  rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“", ndash: "–", mdash: "—", peso: "₱",
};

export function decodeEntities(s: string) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === "#") {
      const code = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : m;
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

function tag(block: string, name: string) {
  const m = block.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, "i"));
  if (!m) return "";
  const inner = m[1].replace(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/, "$1");
  return inner;
}

/** Text only: strips tags (after CDATA), decodes entities, collapses whitespace. */
export function plain(html: string, max = 400) {
  // Some feeds escape their HTML (&lt;p&gt;), so decode before stripping tags too.
  const unwrapped = decodeEntities(html.replace(/<!\[CDATA\[|\]\]>/g, "").replace(/<[^>]*>/g, " "));
  const flat = decodeEntities(unwrapped.replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max - 1).trimEnd()}…` : flat;
}

/** Minimal RSS 2.0 / Atom reader — enough for news feeds, no dependency. */
export function parseFeed(xml: string, source: string, region: Region = "ph"): NewsItem[] {
  const blocks = xml.match(/<item[\s>][\s\S]*?<\/item>/gi) ?? xml.match(/<entry[\s>][\s\S]*?<\/entry>/gi) ?? [];
  const items: NewsItem[] = [];
  for (const b of blocks) {
    const title = plain(tag(b, "title"), 240);
    let url = plain(tag(b, "link"), 600);
    if (!url) url = b.match(/<link[^>]*href="([^"]+)"/i)?.[1] ?? "";
    url = decodeEntities(url);
    if (!title || !/^https?:\/\//i.test(url)) continue;
    const date = plain(tag(b, "pubDate") || tag(b, "published") || tag(b, "updated") || tag(b, "dc:date"), 60);
    const summary = plain(tag(b, "description") || tag(b, "summary") || tag(b, "content"), 320);
    const published = date && !Number.isNaN(Date.parse(date)) ? new Date(date).toISOString() : null;
    items.push({ title, url, source, published, summary, why: "", tag: tagFor(`${title} ${summary}`), region });
  }
  return items;
}

/** Newest, most money-relevant first; one story per title, at most `perSource` per feed. */
export function rankNews(items: NewsItem[], limit = 40, now = Date.now(), perSource = 10) {
  const seen = new Set<string>();
  const unique = items.filter((i) => {
    const key = i.title.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const score = (i: NewsItem) => {
    const ageH = i.published ? Math.max(0, (now - Date.parse(i.published)) / 3_600_000) : 72;
    return relevance(i) * 6 - ageH;
  };
  const taken = new Map<string, number>();
  return unique
    .sort((a, b) => score(b) - score(a))
    .filter((i) => {
      const n = taken.get(i.source) ?? 0;
      taken.set(i.source, n + 1);
      return n < perSource;
    })
    .slice(0, limit);
}

export async function fetchNews(limit = 60): Promise<NewsItem[]> {
  const results = await Promise.allSettled(
    FEEDS.map(async (f) => {
      const res = await fetch(f.url, {
        headers: { "User-Agent": "Mozilla/5.0 (compatible; PitakaNews/1.0)", Accept: "application/rss+xml, application/xml, text/xml" },
        signal: AbortSignal.timeout(12_000),
        cache: "no-store",
      });
      if (!res.ok) throw new Error(`${f.source}: HTTP ${res.status}`);
      return parseFeed(await res.text(), f.source, f.region);
    }),
  );
  const items = results.flatMap((r) => (r.status === "fulfilled" ? r.value : []));
  return rankNews(items, limit, Date.now(), Math.max(6, Math.ceil(limit / 6)));
}
