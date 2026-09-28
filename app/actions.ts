"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { checkPassword, requireAuth, SESSION_COOKIE, SESSION_MAX_AGE, sessionToken } from "@/lib/auth";
import { getBank, isBankId, normalizeKeyword } from "@/lib/banks";
import { isPlanMonths, normalizePayDays } from "@/lib/billing";
import { ALL_CATEGORIES } from "@/lib/categories";
import { query } from "@/lib/db";
import { attachEmailsToCards } from "@/lib/queries";
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
    `insert into transactions (occurred_at, amount, direction, description, merchant, category, account, account_id, source, plan_months)
     values ($1::timestamp at time zone 'Asia/Manila', $2, $3, $4, $5, $6, $7, $8, 'manual', $9)`,
    [t.when, t.amount, t.direction, t.description, t.merchant, t.category, account.last4, account.id, planForAccount(account, t.planMonths)],
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
            account_id = $9, needs_review = false, plan_months = $10
      where id = $1`,
    [id, t.when, t.amount, t.direction, t.description, t.merchant, t.category, account.last4, account.id, planForAccount(account, t.planMonths)],
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
  let payDays: number[] = [];
  let planMonths = 1;
  if (cardType === "credit") {
    statementDay = Number(form.get("statement_day"));
    payDays = normalizePayDays(form.getAll("pay_days").map((v) => Number(v)));
    planMonths = Number(form.get("plan_months"));
    if (!Number.isInteger(statementDay) || statementDay < 1 || statementDay > 28) {
      return { ok: false as const, error: "Statement date should be a day of the month from 1 to 28." };
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
    statementDay,
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
    `insert into accounts (bank, card_type, nickname, last4, keyword, statement_day, due_days, plan_months, pay_days)
     values ($1, $2, $3, $4, $5, $6, null, $7, $8::int[])
     returning id::int as id`,
    [t.bank, t.cardType, t.nickname, t.last4, t.keyword, t.statementDay, t.planMonths, t.payDays],
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
            statement_day = $7, due_days = null, plan_months = $8, pay_days = $9::int[]
      where id = $1 and bank <> 'cash'
      returning id`,
    [id, t.bank, t.cardType, t.nickname, t.last4, t.keyword, t.statementDay, t.planMonths, t.payDays],
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
  const payDays = normalizePayDays(form.getAll("pay_days").map((v) => Number(v)));
  if (!Number.isInteger(id) || id <= 0 || !isPlanMonths(planMonths) || !payDays.length) return;
  await query(
    `update accounts set plan_months = $2, pay_days = $3::int[], due_days = null
      where id = $1 and bank <> 'cash' and card_type = 'credit'`,
    [id, planMonths, payDays],
  );
  revalidatePath("/", "layout");
}

export async function deleteAccount(form: FormData) {
  await requireAuth();
  await query(`delete from accounts where id = $1 and bank <> 'cash'`, [Number(form.get("id"))]);
  revalidatePath("/", "layout");
}
