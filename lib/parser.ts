import type { Direction } from "./db";

export type ParsedEmail = {
  amount: number;
  /** null when the email didn't say clearly whether money came in or went out */
  direction: Direction | null;
  merchant: string | null;
  account: string | null;
  description: string;
  /** Transaction time stated in the email, when present (else use the email's date) */
  occurredAt?: Date;
};

// PHP 1,234.56 · Php1234.56 · ₱ 50.00 · P 500.00
const AMOUNT_RE =
  /(?:PHP|Php|php|₱|\bP)\s?((?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d{1,2})?)\b/g;

const IN_RE =
  /\b(credited|received|receive|deposit(?:ed)?|incoming|cash[- ]?in|refund(?:ed)?|reversal|interest earned|has been added)\b/i;
const OUT_RE =
  /\b(debited|withdr[ae]wn?|withdrawal|sent|send|transferred|paid|pay|payment|purchased?|deducted|charged|bills? ?pay(?:ment)?|cash[- ]?out)\b/i;

const MERCHANT_RE =
  /\b(?:[Tt]o|[Aa]t|[Ff]rom)\s+([A-Z0-9][\w&'/-]*(?:\.[\w&'/-]+)*(?:\s+[\w&'/-]+(?:\.[\w&'/-]+)*){0,5}?)(?=\s+(?:on|with|using|via|ref|reference|for|thru|through|account|acct|was|is|has)\b|\s*[.,;:(]|\s*$)/;

const ACCOUNT_RE =
  /(?:ending(?:\s+in)?|acc(?:oun)?t\.?(?:\s+(?:no\.?|number))?)\s*[:#]?\s*[Xx*•\-\s]*(\d{4})\b/i;

/**
 * Best-effort parse of a BPI alert email. Returns null when no transaction
 * amount is found (promos, OTPs, statements) so the caller can skip it.
 *
 * BPI's wording changes over time and differs per alert type, so this is
 * deliberately lenient; anything uncertain is flagged for review in the UI.
 */
export function parseBpiEmail({
  subject,
  body,
}: {
  subject: string;
  body: string;
}): ParsedEmail | null {
  const text = `${toPlain(subject)}. ${toPlain(body)}`.replace(/\s+/g, " ").trim();

  const table = parseDetailsTable(subject, text);
  if (table) return table;

  const amountMatch = findTransactionAmount(text);
  if (!amountMatch) return null;
  const { amount, index } = amountMatch;

  const inAt = text.search(IN_RE);
  const outAt = text.search(OUT_RE);
  let direction: Direction | null = null;
  if (inAt >= 0 && (outAt < 0 || inAt < outAt)) direction = "in";
  else if (outAt >= 0) direction = "out";

  // Look for the counterparty near the amount first, then anywhere.
  const around = text.slice(Math.max(0, index - 40), index + 160);
  let merchant = cleanMerchant(around.match(MERCHANT_RE)?.[1]);
  if (!merchant) merchant = cleanMerchant(text.match(MERCHANT_RE)?.[1]);

  const account = text.match(ACCOUNT_RE)?.[1] ?? null;

  const description = (subject.trim() || text.slice(0, 120)).slice(0, 200);

  return { amount, direction, merchant, account, description };
}

// Labels used in BPI's "Transaction Details" table emails (e.g. Interbank /
// InstaPay Funds Transfer Confirmation). Longer labels first so "Total Amount"
// isn't read as "Amount".
const TABLE_LABELS = [
  "Interbank Funds Transfer Transaction Details",
  "Transaction Date and Time",
  "Transaction Ref No.",
  "Confirmation Number",
  "Reference Number",
  "Transfer Amount",
  "Transfer Service",
  "Transfer From",
  "Transfer To",
  "Total Amount",
  "Service Fee",
  "Account Name",
  "Bank Name",
  "Biller",
  "Merchant",
  "Notes",
];

function parseDetailsTable(subject: string, text: string): ParsedEmail | null {
  const f = extractFields(text, TABLE_LABELS);
  const amountStr = f["Total Amount"] ?? f["Transfer Amount"];
  const amount = amountStr ? parseAmount(amountStr) : null;
  if (!amount) return null;

  // "Transfer From: XXXX-XXXX-882 (SAVINGS ACCOUNT)" = money left your account.
  const fromYours = !!f["Transfer From"] && /x{2,}|\*{2,}|savings|checking|account/i.test(f["Transfer From"]);
  const direction: Direction | null = fromYours || /transfer|payment/i.test(subject) ? "out" : null;

  const bank = f["Bank Name"] || f["Biller"] || f["Merchant"] || null;
  const to = f["Account Name"] || f["Transfer To"] || null;
  const merchant = bank && to ? `${bank} · ${to}` : bank || to;

  const account = f["Transfer From"]?.match(/(\d{3,4})\b(?!.*\d)/)?.[1] ?? null;
  const notes = f["Notes"]?.trim();
  const description = [subject.trim(), notes].filter(Boolean).join(" — ").slice(0, 200);

  const occurredAt = parseBpiDate(f["Transaction Date and Time"]);

  return { amount, direction, merchant: merchant?.slice(0, 80) ?? null, account, description, occurredAt };
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

/** "Thursday, Sep 24 2026; 07:10:53 PM (GMT +8)" → Date. Assumes +08:00 when no offset. */
function parseBpiDate(s: string | undefined) {
  const m = s?.match(/([A-Za-z]{3})[a-z]*\.? (\d{1,2}),? (\d{4})[;,]? (\d{1,2}):(\d{2})(?::(\d{2}))? ?([AP]M)?(?: \(GMT ?([+-]\d{1,2})\))?/i);
  if (!m) return undefined;
  const mon = MONTHS.indexOf(m[1].toLowerCase());
  if (mon < 0) return undefined;
  let hour = Number(m[4]);
  if (m[7]) hour = (hour % 12) + (m[7].toUpperCase() === "PM" ? 12 : 0);
  const off = Number(m[8] ?? 8);
  const utc = Date.UTC(Number(m[3]), mon, Number(m[2]), hour - off, Number(m[5]), Number(m[6] ?? 0));
  return Number.isNaN(utc) ? undefined : new Date(utc);
}

/** Values between known labels, whatever separators the plain-text body uses. */
function extractFields(text: string, labels: string[]) {
  const hits: { label: string; start: number; end: number }[] = [];
  const taken: [number, number][] = [];
  for (const label of labels) {
    const re = new RegExp(`\\b${label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![A-Za-z])\\s*:?`, "i");
    const m = re.exec(text);
    if (!m) continue;
    const start = m.index;
    if (taken.some(([a, b]) => start >= a && start < b)) continue; // inside a longer label
    taken.push([start, start + m[0].length]);
    hits.push({ label, start, end: start + m[0].length });
  }
  hits.sort((a, b) => a.start - b.start);
  const out: Record<string, string> = {};
  hits.forEach((h, i) => {
    const value = text.slice(h.end, hits[i + 1]?.start ?? text.length).trim();
    if (value) out[h.label] = value;
  });
  return out;
}

function parseAmount(s: string) {
  const m = s.match(/(?:PHP|Php|₱)\s?((?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d{1,2})?)/);
  const n = m ? Number(m[1].replace(/,/g, "")) : NaN;
  return Number.isFinite(n) && n > 0 ? n : null;
}

function findTransactionAmount(text: string) {
  for (const m of text.matchAll(AMOUNT_RE)) {
    const before = text.slice(Math.max(0, m.index! - 30), m.index!).toLowerCase();
    // Skip "available balance: PHP 12,000.00" and similar.
    if (/balance|limit|min(?:imum)? amount due/.test(before)) continue;
    const amount = Number(m[1].replace(/,/g, ""));
    if (Number.isFinite(amount) && amount > 0) return { amount, index: m.index! };
  }
  return null;
}

/** Collapse HTML emails (most BPI alerts) down to readable text. */
export function toPlain(s: string) {
  if (!s) return "";
  if (!/<[a-z][\s\S]*>/i.test(s)) return s;
  return s
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<(br|\/p|\/div|\/tr|\/h[1-6]|\/li|\/table)\b[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/g, "&")
    .replace(/&peso;|&#8369;/gi, "₱")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function cleanMerchant(s: string | undefined) {
  if (!s) return null;
  const t = s.trim().replace(/[.,;:]+$/, "");
  if (!t || /^(your|you|the|my|an?|php|account)\b/i.test(t)) return null;
  if (/^\d+$/.test(t)) return null;
  return t.slice(0, 80);
}
