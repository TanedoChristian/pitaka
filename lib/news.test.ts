import { test } from "node:test";
import assert from "node:assert/strict";
import { decodeEntities, parseFeed, plain, rankNews, tagFor } from "./news";

const RSS = `<?xml version="1.0"?><rss><channel><title>GMA</title>
<item> <title><![CDATA[BSP cuts policy rate by 25 bps]]></title>
 <link>https://www.gmanetwork.com/news/money/1</link>
 <description><![CDATA[<img src="x.jpg"/><br/>The Bangko Sentral &amp; the peso&#8217;s path.]]></description>
 <pubDate>Thu, 01 Oct 2026 02:55:44 +0800</pubDate></item>
<item><title>Telco earnings rise</title><link>https://example.com/2</link>
 <description>&lt;p&gt;Quarterly results&lt;/p&gt;</description><pubDate>Wed, 30 Sep 2026 10:00:00 +0800</pubDate></item>
<item><title>No link here</title></item>
</channel></rss>`;

test("parseFeed reads CDATA, strips HTML and skips bad items", () => {
  const items = parseFeed(RSS, "GMA Money");
  assert.equal(items.length, 2);
  assert.equal(items[0].title, "BSP cuts policy rate by 25 bps");
  assert.equal(items[0].url, "https://www.gmanetwork.com/news/money/1");
  assert.equal(items[0].summary, "The Bangko Sentral & the peso’s path.");
  assert.equal(items[0].published, "2026-09-30T18:55:44.000Z");
  assert.equal(items[0].tag, "Rates");
  assert.equal(items[1].summary, "Quarterly results");
});

test("parseFeed reads Atom entries", () => {
  const atom = `<feed><entry><title>Peso hits 58</title><link href="https://x.ph/a"/><updated>2026-10-01T00:00:00Z</updated><summary>FX</summary></entry></feed>`;
  const [e] = parseFeed(atom, "X");
  assert.equal(e.url, "https://x.ph/a");
  assert.equal(e.tag, "Peso & FX");
});

test("entities and tags", () => {
  assert.equal(decodeEntities("Tom &amp; Jerry &#8212; &#x20B1;5"), "Tom & Jerry — ₱5");
  assert.equal(plain("<b>Hi</b>   there", 5), "Hi t…");
  assert.equal(tagFor("Bitcoin tops $100k"), "Crypto");
  assert.equal(tagFor("Meralco rate hike this month"), "Inflation");
  assert.equal(tagFor("Company opens new office"), "Business");
});

test("rankNews dedupes titles and prefers money-relevant stories", () => {
  const now = Date.parse("2026-10-01T04:00:00Z");
  const base = { url: "https://x", source: "S", summary: "", why: "", tag: "" };
  const ranked = rankNews(
    [
      { ...base, title: "Company opens new office", published: "2026-10-01T03:00:00Z" },
      { ...base, title: "Inflation slows; BSP may cut rates", published: "2026-10-01T01:00:00Z" },
      { ...base, title: "Inflation slows; BSP may cut rates!", published: "2026-10-01T01:00:00Z" },
    ],
    10,
    now,
  );
  assert.equal(ranked.length, 2);
  assert.equal(ranked[0].title, "Inflation slows; BSP may cut rates");
});
