// Evergreen money habits for someone earning and spending in pesos.
// General education, not personal financial advice: rates and rules change,
// so each tip points to where to check the current numbers.

export type Tip = {
  id: string;
  group: "Foundations" | "Cards & debt" | "Grow your money" | "Everyday savings" | "Protect";
  title: string;
  body: string;
  link?: { label: string; url: string };
};

export const TIPS: Tip[] = [
  {
    id: "pay-yourself-first",
    group: "Foundations",
    title: "Pay yourself first on payday",
    body: "Move 20% to savings the day salary lands, before anything else. Spending what's left is easier than saving what's left.",
  },
  {
    id: "emergency-fund",
    group: "Foundations",
    title: "Build 3–6 months of expenses in cash",
    body: "Keep it in a separate high-yield savings account (many digital banks pay far more than a regular savings account) so it's reachable in a day but not in your everyday wallet.",
  },
  {
    id: "50-30-20",
    group: "Foundations",
    title: "Start with 50 / 30 / 20",
    body: "About 50% needs (rent, bills, food), 30% wants, 20% savings and debt payoff. Use your Pitaka budgets to hold the line per category.",
  },
  {
    id: "sinking-funds",
    group: "Foundations",
    title: "Sinking funds for the known big-ticket items",
    body: "Christmas, school fees, insurance renewals, car registration: divide the yearly cost by 12 and set it aside monthly so it never lands on a credit card.",
  },
  {
    id: "13th-month",
    group: "Foundations",
    title: "Give your 13th-month pay a job before December",
    body: "Decide the split now (e.g. half to the emergency fund or investments, half to gifts). Unplanned bonuses usually disappear in the malls.",
  },
  {
    id: "pay-in-full",
    group: "Cards & debt",
    title: "Always pay the full statement balance",
    body: "Paying only the minimum triggers interest and finance charges of roughly 3% a month on the balance, around 36% a year. Pitaka's payment plan on each card shows the exact amounts and dates.",
  },
  {
    id: "zero-installment",
    group: "Cards & debt",
    title: "0% installment is only free if you'd buy it anyway",
    body: "Installments lock up part of your credit limit for months and make big purchases feel small. Treat each monthly amortization as a fixed bill in your budget.",
  },
  {
    id: "card-per-category",
    group: "Cards & debt",
    title: "Use the right card for each kind of spend",
    body: "Cashback cards usually reward groceries and utilities, and rewards or miles cards reward dining and travel. Check Grow → Perks for this month's promos on your cards.",
  },
  {
    id: "cash-advance",
    group: "Cards & debt",
    title: "Avoid credit card cash advances",
    body: "They charge a fee up front and interest from day one, with no grace period. A salary loan or Pag-IBIG MPL is usually far cheaper.",
  },
  {
    id: "mp2",
    group: "Grow your money",
    title: "Pag-IBIG MP2: government-guaranteed, tax-free dividends",
    body: "A 5-year voluntary savings program with dividends historically well above bank deposits. Good for money you won't need for 5 years once your emergency fund is complete.",
    link: { label: "Pag-IBIG MP2", url: "https://www.pagibigfund.gov.ph/mp2.html" },
  },
  {
    id: "rtb",
    group: "Grow your money",
    title: "Retail Treasury Bonds: lend to the government from ₱5,000",
    body: "The Bureau of the Treasury issues RTBs a few times a year through banks and apps like GCash (GBonds). Fixed coupon, low risk, and a good place for medium-term money.",
    link: { label: "Bureau of the Treasury", url: "https://www.treasury.gov.ph/" },
  },
  {
    id: "index-funds",
    group: "Grow your money",
    title: "Index funds for long-term (5+ years) money",
    body: "PSEi or S&P 500 index funds and UITFs spread your risk across many companies at low cost. Invest a fixed amount every payday (peso-cost averaging) instead of timing the market.",
  },
  {
    id: "crypto-size",
    group: "Grow your money",
    title: "Keep crypto a small slice",
    body: "Crypto can swing 50% in months. If you hold any, cap it at a small share of investments (many planners say 5% or less) that you can afford to lose, and only use SEC/BSP-registered platforms.",
  },
  {
    id: "forex-remit",
    group: "Grow your money",
    title: "Compare the rate, not only the fee, when converting dollars",
    body: "The spread between banks, e-wallets and remittance apps can cost more than the fee. Check the live USD/PHP rate in Grow → Markets before converting.",
  },
  {
    id: "fuel-tuesday",
    group: "Everyday savings",
    title: "Fill up before Tuesday price hikes",
    body: "Oil companies announce weekly price changes on Monday, effective Tuesday at 6 AM. If Grow → Fuel shows an increase, fill up Monday; if it shows a rollback, wait a day.",
  },
  {
    id: "subscriptions-audit",
    group: "Everyday savings",
    title: "Audit subscriptions every quarter",
    body: "Grow → Insights lists the charges that repeat every month. Cancel the ones you haven't used in 30 days and rotate streaming services instead of stacking them.",
  },
  {
    id: "grocery-list",
    group: "Everyday savings",
    title: "Shop groceries with a list and a cap",
    body: "Plan meals for the week, buy house brands for staples, and stick to one big grocery run. Most of the overspending is on the small unplanned trips.",
  },
  {
    id: "delivery-fees",
    group: "Everyday savings",
    title: "Watch the delivery tax",
    body: "Delivery apps add platform, delivery and small-order fees, and menu prices are often marked up too. Pick-up or a weekly cook-up can cut Food & Dining sharply.",
  },
  {
    id: "hmo",
    group: "Protect",
    title: "Health cover before investments",
    body: "Check your company HMO limits and keep PhilHealth contributions active. One hospital stay can wipe out years of savings.",
  },
  {
    id: "term-insurance",
    group: "Protect",
    title: "If people depend on you, term life beats VUL for most",
    body: "Buy term life insurance and invest the difference yourself. It's usually far cheaper and simpler than insurance-plus-investment (VUL) products.",
  },
  {
    id: "scams",
    group: "Protect",
    title: "Banks never ask for your OTP",
    body: "No real bank, e-wallet or courier will ask for an OTP, PIN or password by call, SMS or chat. Treat 'too good' investment returns as a scam until proven otherwise.",
  },
];

export type TipContext = {
  emergencyMonths: number;
  savingsRate: number | null;
  hasCreditCard: boolean;
  subscriptionsMonthly: number;
  foodShare: number;
  fuelMonthly: number;
  month: number; // 1–12
};

/** The few tips that fit this person right now, most urgent first. */
export function pickTips(ctx: TipContext, limit = 4): Tip[] {
  const byId = new Map(TIPS.map((t) => [t.id, t]));
  const ids: string[] = [];
  if (ctx.emergencyMonths < 3) ids.push("emergency-fund");
  if (ctx.savingsRate !== null && ctx.savingsRate < 0.2) ids.push("pay-yourself-first");
  if (ctx.hasCreditCard) ids.push("pay-in-full", "card-per-category");
  if (ctx.subscriptionsMonthly > 0) ids.push("subscriptions-audit");
  if (ctx.foodShare > 0.3) ids.push("delivery-fees");
  if (ctx.fuelMonthly > 0) ids.push("fuel-tuesday");
  if (ctx.month >= 9 && ctx.month <= 12) ids.push("13th-month");
  if (ctx.emergencyMonths >= 6) ids.push("mp2", "rtb", "index-funds");
  else if (ctx.emergencyMonths >= 3) ids.push("mp2");
  ids.push("50-30-20", "sinking-funds");
  return [...new Set(ids)]
    .map((id) => byId.get(id))
    .filter((t): t is Tip => !!t)
    .slice(0, limit);
}

export const TIP_GROUPS = ["Foundations", "Cards & debt", "Grow your money", "Everyday savings", "Protect"] as const;
