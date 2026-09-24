import type { Direction, Rule } from "./db";

export const EXPENSE_CATEGORIES = [
  "Food & Dining",
  "Groceries",
  "Transport",
  "Bills & Utilities",
  "Shopping",
  "Health",
  "Entertainment",
  "Transfers",
  "Cash Withdrawal",
  "Other",
  "Uncategorized",
] as const;

export const INCOME_CATEGORIES = ["Salary", "Income", "Transfers", "Interest", "Refund"] as const;

export const ALL_CATEGORIES = Array.from(
  new Set<string>([...EXPENSE_CATEGORIES, ...INCOME_CATEGORIES]),
);

// Built-in keyword → category guesses. Your own rules (Settings) win over these.
const BUILTIN: [RegExp, string][] = [
  [/jollibee|mcdo|mcdonald|kfc|chowking|mang inasal|greenwich|starbucks|coffee|cafe|foodpanda|grabfood|restaurant|pizza|burger|milk ?tea/i, "Food & Dining"],
  [/sm (super|hyper)market|puregold|robinsons supermarket|landers|s&r|waltermart|savemore|alfamart|7-?eleven|ministop|grocery/i, "Groceries"],
  [/grab(?!food)|angkas|joyride|move ?it|petron|shell|caltex|seaoil|autosweep|easytrip|beep|lrt|mrt|toll|parking/i, "Transport"],
  [/meralco|maynilad|manila water|pldt|globe|smart|converge|sky ?cable|dito|netflix|spotify|youtube|insurance|bills? ?pay/i, "Bills & Utilities"],
  [/shopee|lazada|zalora|amazon|uniqlo|h&m|ace hardware|wilcon|ikea|mall/i, "Shopping"],
  [/mercury drug|watsons|southstar|hospital|clinic|pharmacy|medical|dental|lab/i, "Health"],
  [/cinema|steam|playstation|nintendo|concert|ticket/i, "Entertainment"],
  [/gcash|maya|paymaya|instapay|pesonet|fund transfer|transfer/i, "Transfers"],
  [/atm|withdraw/i, "Cash Withdrawal"],
];

const BUILTIN_INCOME: [RegExp, string][] = [
  [/payroll|salary/i, "Salary"],
  [/interest/i, "Interest"],
  [/refund|reversal/i, "Refund"],
  [/instapay|pesonet|transfer|gcash|maya/i, "Transfers"],
];

export function categorize(text: string, direction: Direction, rules: Rule[]): string {
  const lower = text.toLowerCase();
  for (const r of rules) {
    if (r.keyword && lower.includes(r.keyword.toLowerCase())) return r.category;
  }
  for (const [re, cat] of direction === "in" ? BUILTIN_INCOME : BUILTIN) {
    if (re.test(text)) return cat;
  }
  return direction === "in" ? "Income" : "Uncategorized";
}
