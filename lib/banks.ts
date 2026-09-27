export const BANK_IDS = ["bpi", "eastwest", "maya", "gotyme", "unionbank"] as const;
export type BankId = (typeof BANK_IDS)[number];
export type AccountBank = BankId | "cash";
export type CardType = "credit" | "debit" | "cash";

export type BankInfo = {
  id: BankId;
  label: string;
  wordmark: string;
  defaultKeyword: string;
  hint: string;
  extraSenders: string[];
  headerHints: string[];
};

export const BANKS: BankInfo[] = [
  {
    id: "bpi",
    label: "BPI",
    wordmark: "BPI",
    defaultKeyword: "bpi.com.ph",
    hint: "BPI ExpressOnline / transaction alerts",
    extraSenders: ["bpiexpressonline.com"],
    headerHints: ["interbank funds transfer confirmation", "bpi fund transfer", "bpi express"],
  },
  {
    id: "eastwest",
    label: "EastWest",
    wordmark: "EastWest",
    defaultKeyword: "eastwestbanker.com",
    hint: "EastWest card or bank alerts",
    extraSenders: [],
    headerHints: ["eastwest"],
  },
  {
    id: "maya",
    label: "Maya",
    wordmark: "maya",
    defaultKeyword: "maya.ph",
    hint: "Maya wallet or card alerts",
    extraSenders: ["paymaya.com"],
    headerHints: [],
  },
  {
    id: "gotyme",
    label: "GoTyme",
    wordmark: "GoTyme",
    defaultKeyword: "gotyme.com.ph",
    hint: "GoTyme transaction emails",
    extraSenders: [],
    headerHints: [],
  },
  {
    id: "unionbank",
    label: "UnionBank",
    wordmark: "UnionBank",
    defaultKeyword: "unionbankph.com",
    hint: "UnionBank / UB Online alerts",
    extraSenders: [],
    headerHints: [],
  },
];

export function isBankId(v: string): v is BankId {
  return (BANK_IDS as readonly string[]).includes(v);
}

export function getBank(id: string): BankInfo | null {
  return BANKS.find((b) => b.id === id) ?? null;
}

export function bankLabel(id: string) {
  if (id === "cash") return "Cash";
  return getBank(id)?.label ?? id;
}

export function accountLabel(a: {
  bank: string;
  card_type: string;
  nickname?: string | null;
  last4?: string | null;
}) {
  if (a.nickname?.trim()) return a.nickname.trim();
  if (a.bank === "cash") return "Cash";
  const last = a.last4 ? ` ····${a.last4}` : "";
  return `${bankLabel(a.bank)} ${a.card_type}${last}`;
}

const KEYWORD_RE = /^[a-z0-9][a-z0-9 .:@+_-]{0,79}$/i;

/** Sender domain/email, or a short phrase Gmail should search for. */
export function normalizeKeyword(raw: string) {
  const s = raw.trim().toLowerCase().replace(/^from:\s*/i, "").replace(/^mailto:/i, "");
  if (!s || s.length > 80 || !KEYWORD_RE.test(s)) return null;
  return s;
}

export function isSenderLike(keyword: string) {
  return /@|[a-z0-9-]+\.[a-z]{2,}$/i.test(keyword) && !/\s/.test(keyword);
}

export function paymentChoices(accounts: { id: number; bank: string; card_type: string; nickname?: string | null; last4?: string | null }[]) {
  const cash = accounts.find((a) => a.bank === "cash") ?? null;
  const cards = accounts.filter((a) => a.bank !== "cash");
  const have = new Set(cards.map((a) => a.bank));
  const pending = BANKS.filter((b) => !have.has(b.id));
  return { cash, cards, pending };
}

export type MatchInput = {
  from?: string | null;
  subject?: string | null;
  body?: string | null;
  last4?: string | null;
};

function senderMatchesAccount(from: string, account: { bank?: string; keyword: string | null }) {
  if (account.keyword && senderMatchesKeyword(from, account.keyword)) return true;
  const bank = account.bank ? getBank(account.bank) : null;
  if (!bank || !account.keyword) return false;
  const kw = account.keyword.toLowerCase();
  const related =
    kw === bank.defaultKeyword ||
    kw.includes(bank.id) ||
    senderMatchesKeyword(account.keyword, bank.defaultKeyword) ||
    senderMatchesKeyword(bank.defaultKeyword, account.keyword);
  if (!related) return false;
  return [bank.defaultKeyword, ...bank.extraSenders].some((s) => senderMatchesKeyword(from, s));
}

/** True when Gmail's From matches the email/domain saved on the card. */
export function senderMatchesKeyword(from: string, keyword: string) {
  const f = from.trim().toLowerCase();
  const kw = keyword.trim().toLowerCase();
  if (!f || !kw) return false;
  if (f.includes(kw)) return true;
  const host = kw.includes("@") ? kw.slice(kw.indexOf("@") + 1) : isSenderLike(kw) ? kw : "";
  if (!host) return false;
  return f.includes(`@${host}`) || f.includes(`.${host}`) || f.includes(`${host}>`) || f.endsWith(host);
}

function keywordIn(text: string, keyword: string) {
  const t = text.toLowerCase();
  const kw = keyword.toLowerCase();
  return !!kw && t.includes(kw);
}

function headerHintsFor(account: { bank?: string; keyword: string | null }) {
  const bank = account.bank ? getBank(account.bank) : null;
  if (!bank || !account.keyword) return [] as string[];
  const kw = account.keyword.toLowerCase();
  const related = kw === bank.defaultKeyword || kw.includes(bank.id) || senderMatchesKeyword(bank.defaultKeyword, kw);
  if (!related) return [];
  return [bank.defaultKeyword, ...bank.extraSenders, ...bank.headerHints];
}

function bestKeywordHit<T extends { keyword: string | null }>(cards: T[], text: string) {
  return (
    cards
      .filter((a) => a.keyword && keywordIn(text, a.keyword))
      .sort((a, b) => (b.keyword?.length ?? 0) - (a.keyword?.length ?? 0))[0] ?? null
  );
}

/**
 * Pick the card this email belongs to. From + the card's email keyword win;
 * last 4 and subject hints are fallbacks for older mail that has no From.
 */
export function matchAccount<T extends { bank?: string; keyword: string | null; last4: string | null }>(
  accounts: T[],
  input: MatchInput,
): T | null {
  const cards = accounts.filter((a) => a.bank !== "cash");
  const from = input.from ?? "";
  const subject = input.subject ?? "";
  const body = input.body ?? "";
  const last4 = input.last4 ?? null;
  const header = `${from}\n${subject}`;

  if (last4) {
    const hits = cards.filter((a) => a.last4 === last4);
    if (hits.length === 1) return hits[0];
    const byFrom = hits.filter((a) => senderMatchesAccount(from, a));
    if (byFrom.length === 1) return byFrom[0];
  }

  const fromHits = cards.filter((a) => senderMatchesAccount(from, a));
  if (fromHits.length === 1) return fromHits[0];
  if (fromHits.length > 1) {
    return fromHits.sort((a, b) => (b.keyword?.length ?? 0) - (a.keyword?.length ?? 0))[0];
  }

  const inHeader = bestKeywordHit(cards, header);
  if (inHeader) return inHeader;

  let hintBest: T | null = null;
  let hintLen = 0;
  const headerLower = header.toLowerCase();
  for (const a of cards) {
    for (const h of headerHintsFor(a)) {
      if (headerLower.includes(h) && h.length > hintLen) {
        hintBest = a;
        hintLen = h.length;
      }
    }
  }
  if (hintBest) return hintBest;

  return bestKeywordHit(cards, `${header}\n${body}`);
}
