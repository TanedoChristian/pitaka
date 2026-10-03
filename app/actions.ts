"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { checkPassword, requireAuth, SESSION_COOKIE, SESSION_MAX_AGE, sessionToken } from "@/lib/auth";
import { getBank, isBankId, normalizeKeyword } from "@/lib/banks";
import { isPlanMonths, normalizePayDays } from "@/lib/billing";
import { ALL_CATEGORIES, EXPENSE_CATEGORIES } from "@/lib/categories";
import { query } from "@/lib/db";
import { FUEL_TYPES, RISK_LEVELS } from "@/lib/grow";
import { fetchNews } from "@/lib/news";
import { attachEmailsToCards, saveReport } from "@/lib/queries";
import { normalizeSender } from "@/lib/sources";

// ---------- auth ----------

export async function login(_prev: string | null, form: FormData): Promise<string | null> {
  const password = String(form.get("password") ?? "");
  if (!checkPassword(password)) {
    await new Promise((r) => setTimeout(r, 800)); // slow down guessing
    return "Wrong password";
  }
  (await cookies()).set(SESSION_COOKIE, sessionToken(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
  redirect("/");
}

export async function logout() {
  (await cookies()).delete(SESSION_COOKIE);
  redirect("/login");
}

export async function setTheme(theme: "light" | "dark") {
  (await cookies()).set("pitaka_theme", theme === "dark" ? "dark" : "light", {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
  });
}

// ---------- transactions ----------

function readTxnForm(form: FormData) {
  const amount = Number(String(form.get("amount") ?? "").replace(/,/g, ""));
  if (!Number.isFinite(amount) || amount <= 0) throw new Error("Amount must be a positive number");
  const direction = form.get("direction") === "in" ? "in" : "out";
  const category = String(form.get("category") ?? "");
  const when = String(form.get("occurred_at") ?? "");
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(when)) throw new Error("Invalid date");
  return {
    amount,
    direction,
    category: ALL_CATEGORIES.includes(category) ? category : "Uncategorized",
    when,
    description: String(form.get("description") ?? "").trim().slice(0, 200),
    merchant: String(form.get("merchant") ?? "").trim().slice(0, 80) || null,
    accountKey: String(form.get("account_id") ?? ""),
    planMonths: Number(form.get("plan_months")),
    selfTransfer: form.get("self_transfer") === "on",
  };
}

type ResolvedAccount = { id: number | null; last4: string | null; cardType: string | null };

async function resolveAccount(key: string): Promise<ResolvedAccount> {
  if (key.startsWith("bank:")) {
    const bank = key.slice(5);
    if (!isBankId(bank)) return { id: null, last4: null, cardType: null };
    const [existing] = await query<{ id: number; last4: string | null; card_type: string }>(
      `select id::int as id, last4, card_type from accounts where bank = $1 order by id limit 1`,
      [bank],
    );
    if (existing) return { id: existing.id, last4: existing.last4, cardType: existing.card_type };
    const info = getBank(bank);
    const [row] = await query<{ id: number; last4: string | null; card_type: string }>(
      `insert into accounts (bank, card_type, nickname, keyword)
       values ($1, 'debit', $2, $3)
       returning id::int as id, last4, card_type`,
      [bank, info?.label ?? bank, info?.defaultKeyword ?? null],
    );
    return row ? { id: row.id, last4: row.last4, cardType: row.card_type } : { id: null, last4: null, cardType: null };
  }
  const accountId = Number(key) || 0;
  if (!accountId) return { id: null, last4: null, cardType: null };
  const [row] = await query<{ id: number; last4: string | null; card_type: string }>(
    `select id::int as id, last4, card_type from accounts where id = $1`,
    [accountId],
  );
  return row ? { id: row.id, last4: row.last4, cardType: row.card_type } : { id: null, last4: null, cardType: null };
}

function planForAccount(account: ResolvedAccount, raw: number) {
  if (account.cardType !== "credit") return null;
  return isPlanMonths(raw) ? raw : null;
}

function safeBack(form: FormData, fallback: string) {
  const back = String(form.get("back") ?? "");
  return back.startsWith("/") && !back.startsWith("//") ? back : fallback;
}

export async function addTransaction(form: FormData) {
  await requireAuth();
  const t = readTxnForm(form);
  const account = await resolveAccount(t.accountKey);
  await query(
    `insert into transactions (occurred_at, amount, direction, description, merchant, category, account, account_id, source, plan_months, self_transfer)
     values ($1::timestamp at time zone 'Asia/Manila', $2, $3, $4, $5, $6, $7, $8, 'manual', $9, $10)`,
    [
      t.when,
      t.amount,
      t.direction,
      t.description,
      t.merchant,
      t.category,
      account.last4,
      account.id,
      planForAccount(account, t.planMonths),
      t.direction === "out" && t.selfTransfer,
    ],
  );
  revalidatePath("/", "layout");
  redirect(safeBack(form, "/transactions"));
}

export async function updateTransaction(form: FormData) {
  await requireAuth();
  const id = Number(form.get("id"));
  const t = readTxnForm(form);
  const account = await resolveAccount(t.accountKey);
  await query(
    `update transactions set occurred_at = $2::timestamp at time zone 'Asia/Manila', amount = $3,
            direction = $4, description = $5, merchant = $6, category = $7, account = $8,
            account_id = $9, needs_review = false, plan_months = $10, self_transfer = $11
      where id = $1`,
    [
      id,
      t.when,
      t.amount,
      t.direction,
      t.description,
      t.merchant,
      t.category,
      account.last4,
      account.id,
      planForAccount(account, t.planMonths),
      t.direction === "out" && t.selfTransfer,
    ],
  );
  if (form.get("remember") === "on" && t.merchant && t.category !== "Uncategorized") {
    await saveRule(t.merchant, t.category, true);
  }
  revalidatePath("/", "layout");
  redirect(safeBack(form, "/transactions"));
}

export async function deleteTransaction(form: FormData) {
  await requireAuth();
  await query(`delete from transactions where id = $1`, [Number(form.get("id"))]);
  revalidatePath("/", "layout");
  redirect("/transactions");
}

// ---------- category rules ----------

async function saveRule(keyword: string, category: string, recategorize: boolean) {
  const kw = keyword.trim().toLowerCase();
  if (!kw || !ALL_CATEGORIES.includes(category)) return;
  await query(
    `insert into category_rules (keyword, category) values ($1, $2)
     on conflict (keyword) do update set category = excluded.category`,
    [kw, category],
  );
  if (recategorize) {
    // Apply to older uncategorized rows from the same merchant.
    await query(
      `update transactions set category = $2
        where category = 'Uncategorized'
          and (lower(coalesce(merchant, '')) like '%' || $1 || '%' or lower(description) like '%' || $1 || '%')`,
      [kw, category],
    );
  }
}

export async function addRule(form: FormData) {
  await requireAuth();
  await saveRule(String(form.get("keyword") ?? ""), String(form.get("category") ?? ""), true);
  revalidatePath("/", "layout");
}

export async function deleteRule(form: FormData) {
  await requireAuth();
  await query(`delete from category_rules where id = $1`, [Number(form.get("id"))]);
  revalidatePath("/settings");
}

// ---------- email senders ----------

export async function addSource(_prev: string | null, form: FormData): Promise<string | null> {
  await requireAuth();
  const sender = normalizeSender(String(form.get("sender") ?? ""));
  if (!sender) return "Use a domain (gcash.com) or an email (alerts@maya.ph).";
  await query(`insert into email_sources (sender) values ($1) on conflict (sender) do nothing`, [sender]);
  revalidatePath("/settings");
  return null;
}

export async function deleteSource(form: FormData) {
  await requireAuth();
  await query(`delete from email_sources where id = $1`, [Number(form.get("id"))]);
  revalidatePath("/settings");
}

// ---------- cards / accounts ----------

function readCardForm(form: FormData) {
  const bank = String(form.get("bank") ?? "");
  if (!isBankId(bank)) return { ok: false as const, error: "Pick a bank." };
  const keyword = normalizeKeyword(String(form.get("keyword") ?? ""));
  if (!keyword) return { ok: false as const, error: "Add the keyword Gmail should use to find this card’s emails." };
  const digits = String(form.get("last4") ?? "").replace(/\D/g, "");
  const last4 = digits ? digits.slice(-4) : null;
  if (last4 && last4.length !== 4) return { ok: false as const, error: "Last 4 should be four digits." };
  const cardType = form.get("card_type") === "credit" ? "credit" : "debit";
  let statementDay: number | null = null;
  let dueDays: number | null = null;
  let payDays: number[] = [];
  let planMonths = 1;
  if (cardType === "credit") {
    statementDay = Number(form.get("statement_day"));
    dueDays = Number(form.get("due_days"));
    payDays = normalizePayDays(form.getAll("pay_days").map((v) => Number(v)));
    planMonths = Number(form.get("plan_months"));
    if (!Number.isInteger(statementDay) || statementDay < 1 || statementDay > 28) {
      return { ok: false as const, error: "Statement date should be a day of the month from 1 to 28." };
    }
    if (!Number.isInteger(dueDays) || dueDays < 1 || dueDays > 45) {
      return { ok: false as const, error: "Days until due should be between 1 and 45." };
    }
    if (!payDays.length) return { ok: false as const, error: "Add at least one pay day each month, like the 15th and 30th." };
    if (!isPlanMonths(planMonths)) planMonths = 1;
  }
  return {
    ok: true as const,
    bank,
    cardType,
    keyword,
    last4,
    nickname: String(form.get("nickname") ?? "").trim().slice(0, 40) || null,
    product: String(form.get("product") ?? "").trim().slice(0, 60) || null,
    statementDay,
    dueDays,
    payDays,
    planMonths,
  };
}

async function rememberSender(keyword: string) {
  const sender = normalizeSender(keyword);
  if (sender) {
    await query(`insert into email_sources (sender) values ($1) on conflict (sender) do nothing`, [sender]);
  }
}

export async function addAccount(_prev: string | null, form: FormData): Promise<string | null> {
  await requireAuth();
  const t = readCardForm(form);
  if (!t.ok) return t.error;

  const [row] = await query<{ id: number }>(
    `insert into accounts (bank, card_type, nickname, last4, keyword, statement_day, due_days, plan_months, pay_days, product)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9::int[], $10)
     returning id::int as id`,
    [t.bank, t.cardType, t.nickname, t.last4, t.keyword, t.statementDay, t.dueDays, t.planMonths, t.payDays, t.product],
  );

  await rememberSender(t.keyword);
  if (row) await attachEmailsToCards();

  revalidatePath("/", "layout");
  if (row && t.cardType === "credit") redirect(`/accounts/${row.id}`);
  return null;
}

export async function updateAccount(_prev: string | null, form: FormData): Promise<string | null> {
  await requireAuth();
  const id = Number(form.get("id"));
  if (!Number.isInteger(id) || id <= 0) return "Card not found.";
  const t = readCardForm(form);
  if (!t.ok) return t.error;

  const rows = await query(
    `update accounts
        set bank = $2, card_type = $3, nickname = $4, last4 = $5, keyword = $6,
            statement_day = $7, due_days = $8, plan_months = $9, pay_days = $10::int[], product = $11
      where id = $1 and bank <> 'cash'
      returning id`,
    [id, t.bank, t.cardType, t.nickname, t.last4, t.keyword, t.statementDay, t.dueDays, t.planMonths, t.payDays, t.product],
  );
  if (!rows.length) return "Card not found.";

  await rememberSender(t.keyword);
  await attachEmailsToCards();

  revalidatePath("/", "layout");
  redirect(t.cardType === "credit" ? `/accounts/${id}` : "/accounts");
}

export async function updateAccountPlan(form: FormData) {
  await requireAuth();
  const id = Number(form.get("id"));
  const planMonths = Number(form.get("plan_months"));
  const dueDays = Number(form.get("due_days"));
  const payDays = normalizePayDays(form.getAll("pay_days").map((v) => Number(v)));
  if (
    !Number.isInteger(id) ||
    id <= 0 ||
    !isPlanMonths(planMonths) ||
    !payDays.length ||
    !Number.isInteger(dueDays) ||
    dueDays < 1 ||
    dueDays > 45
  ) {
    return;
  }
  await query(
    `update accounts set plan_months = $2, pay_days = $3::int[], due_days = $4
      where id = $1 and bank <> 'cash' and card_type = 'credit'`,
    [id, planMonths, payDays, dueDays],
  );
  revalidatePath("/", "layout");
}

export async function markPaymentComplete(form: FormData) {
  await requireAuth();
  const accountId = Number(form.get("account_id"));
  const statement = String(form.get("statement") ?? "");
  const due = String(form.get("due_date") ?? "");
  const amount = Number(form.get("amount"));
  if (
    !Number.isInteger(accountId) ||
    accountId <= 0 ||
    !/^\d{4}-\d{2}-\d{2}$/.test(statement) ||
    !/^\d{4}-\d{2}-\d{2}$/.test(due) ||
    !Number.isFinite(amount) ||
    amount < 0
  ) {
    return;
  }
  await query(
    `insert into payment_completions (account_id, statement, due_date, amount)
     values ($1, $2::date, $3::date, $4)
     on conflict (account_id, statement, due_date)
     do update set amount = excluded.amount, completed_at = now()`,
    [accountId, statement, due, amount],
  );
  revalidatePath("/", "layout");
}

export async function unmarkPaymentComplete(form: FormData) {
  await requireAuth();
  const accountId = Number(form.get("account_id"));
  const statement = String(form.get("statement") ?? "");
  const due = String(form.get("due_date") ?? "");
  if (
    !Number.isInteger(accountId) ||
    accountId <= 0 ||
    !/^\d{4}-\d{2}-\d{2}$/.test(statement) ||
    !/^\d{4}-\d{2}-\d{2}$/.test(due)
  ) {
    return;
  }
  await query(
    `delete from payment_completions
      where account_id = $1 and statement = $2::date and due_date = $3::date`,
    [accountId, statement, due],
  );
  revalidatePath("/", "layout");
}

export async function deleteAccount(form: FormData) {
  await requireAuth();
  await query(`delete from accounts where id = $1 and bank <> 'cash'`, [Number(form.get("id"))]);
  revalidatePath("/", "layout");
}

// ---------- grow ----------

export async function saveGrowProfile(form: FormData) {
  await requireAuth();
  const fields: string[] = [];
  const params: unknown[] = [];
  const set = (col: string, v: unknown) => {
    params.push(v);
    fields.push(`${col} = $${params.length}`);
  };
  if (form.has("city")) set("city", String(form.get("city") ?? "").trim().slice(0, 80) || null);
  if (form.has("fuel")) {
    const fuel = String(form.get("fuel") ?? "");
    if ((FUEL_TYPES as readonly string[]).includes(fuel)) set("fuel", fuel);
  }
  if (form.has("watchlist")) {
    const list = String(form.get("watchlist") ?? "")
      .split(/[,\n]/)
      .map((s) => s.trim().slice(0, 24))
      .filter(Boolean)
      .slice(0, 30);
    if (list.length) set("watchlist", list.join(", "));
  }
  if (form.has("risk")) {
    const risk = String(form.get("risk") ?? "");
    if ((RISK_LEVELS as readonly string[]).includes(risk)) set("risk", risk);
  }
  if (form.has("emergency_saved")) {
    const saved = Number(String(form.get("emergency_saved") ?? "").replace(/,/g, ""));
    if (Number.isFinite(saved) && saved >= 0) set("emergency_saved", Math.min(saved, 1e11));
  }
  if (!fields.length) return;
  await query(`update grow_profile set ${fields.join(", ")}, updated_at = now() where id = 1`, params);
  revalidatePath("/grow", "layout");
}

export async function saveBudget(form: FormData) {
  await requireAuth();
  const category = String(form.get("category") ?? "");
  const monthly = Number(String(form.get("monthly") ?? "").replace(/,/g, ""));
  if (!(EXPENSE_CATEGORIES as readonly string[]).includes(category)) return;
  if (!Number.isFinite(monthly) || monthly <= 0) return;
  await query(
    `insert into budgets (category, monthly) values ($1, $2)
     on conflict (category) do update set monthly = excluded.monthly`,
    [category, Math.min(monthly, 1e10)],
  );
  revalidatePath("/grow");
}

export async function deleteBudget(form: FormData) {
  await requireAuth();
  await query(`delete from budgets where category = $1`, [String(form.get("category") ?? "")]);
  revalidatePath("/grow");
}

/** Pull fresh headlines straight from the RSS feeds (no AI notes). */
export async function refreshNews() {
  await requireAuth();
  const items = await fetchNews(60);
  if (items.length) {
    await saveReport("news", { as_of: new Date().toISOString(), items }, "rss");
  }
  revalidatePath("/grow/news");
}
