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
};

export const BANKS: BankInfo[] = [
  {
    id: "bpi",
    label: "BPI",
    wordmark: "BPI",
    defaultKeyword: "bpi.com.ph",
    hint: "BPI ExpressOnline / transaction alerts",
  },
  {
    id: "eastwest",
    label: "EastWest",
    wordmark: "EastWest",
    defaultKeyword: "eastwestbanker.com",
    hint: "EastWest card or bank alerts",
  },
  {
    id: "maya",
    label: "Maya",
    wordmark: "maya",
    defaultKeyword: "maya.ph",
    hint: "Maya wallet or card alerts",
  },
  {
    id: "gotyme",
    label: "GoTyme",
    wordmark: "GoTyme",
    defaultKeyword: "gotyme.com.ph",
    hint: "GoTyme transaction emails",
  },
  {
    id: "unionbank",
    label: "UnionBank",
    wordmark: "UnionBank",
    defaultKeyword: "unionbankph.com",
    hint: "UnionBank / UB Online alerts",
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

export function matchAccount<T extends { keyword: string | null; last4: string | null }>(
  accounts: T[],
  haystack: string,
  last4?: string | null,
): T | null {
  if (last4) {
    const hits = accounts.filter((a) => a.last4 === last4);
    if (hits.length === 1) return hits[0];
  }
  const text = haystack.toLowerCase();
  const ranked = accounts
    .filter((a) => a.keyword)
    .sort((a, b) => (b.keyword?.length ?? 0) - (a.keyword?.length ?? 0));
  for (const a of ranked) {
    if (a.keyword && text.includes(a.keyword.toLowerCase())) return a;
  }
  return null;
}
