"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { checkPassword, requireAuth, SESSION_COOKIE, SESSION_MAX_AGE, sessionToken } from "@/lib/auth";
import { getBank, isBankId, normalizeKeyword } from "@/lib/banks";
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
  };
}

async function resolveAccount(key: string) {
  if (key.startsWith("bank:")) {
    const bank = key.slice(5);
    if (!isBankId(bank)) return { id: null as number | null, last4: null as string | null };
    const [existing] = await query<{ id: number; last4: string | null }>(
      `select id::int as id, last4 from accounts where bank = $1 order by id limit 1`,
      [bank],
    );
    if (existing) return existing;
    const info = getBank(bank);
    const [row] = await query<{ id: number; last4: string | null }>(
      `insert into accounts (bank, card_type, nickname, keyword)
       values ($1, 'debit', $2, $3)
       returning id::int as id, last4`,
      [bank, info?.label ?? bank, info?.defaultKeyword ?? null],
    );
    return row ?? { id: null, last4: null };
  }
  const accountId = Number(key) || 0;
  if (!accountId) return { id: null as number | null, last4: null as string | null };
  const [row] = await query<{ id: number; last4: string | null }>(
    `select id::int as id, last4 from accounts where id = $1`,
    [accountId],
  );
  return row ? { id: row.id, last4: row.last4 } : { id: null, last4: null };
}

export async function addTransaction(form: FormData) {
  await requireAuth();
  const t = readTxnForm(form);
  const account = await resolveAccount(t.accountKey);
  await query(
    `insert into transactions (occurred_at, amount, direction, description, merchant, category, account, account_id, source)
     values ($1::timestamp at time zone 'Asia/Manila', $2, $3, $4, $5, $6, $7, $8, 'manual')`,
    [t.when, t.amount, t.direction, t.description, t.merchant, t.category, account.last4, account.id],
  );
  revalidatePath("/", "layout");
  redirect("/transactions");
}

export async function updateTransaction(form: FormData) {
  await requireAuth();
  const id = Number(form.get("id"));
  const t = readTxnForm(form);
  const account = await resolveAccount(t.accountKey);
  await query(
    `update transactions set occurred_at = $2::timestamp at time zone 'Asia/Manila', amount = $3,
            direction = $4, description = $5, merchant = $6, category = $7, account = $8,
            account_id = $9, needs_review = false
      where id = $1`,
    [id, t.when, t.amount, t.direction, t.description, t.merchant, t.category, account.last4, account.id],
  );
  if (form.get("remember") === "on" && t.merchant && t.category !== "Uncategorized") {
    await saveRule(t.merchant, t.category, true);
  }
  revalidatePath("/", "layout");
  const back = String(form.get("back") ?? "");
  redirect(back.startsWith("/") && !back.startsWith("//") ? back : "/transactions");
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
  return {
    ok: true as const,
    bank,
    cardType: form.get("card_type") === "credit" ? "credit" : "debit",
    keyword,
    last4,
    nickname: String(form.get("nickname") ?? "").trim().slice(0, 40) || null,
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

  const [exists] = await query<{ n: number }>(
    `select count(*)::int as n from accounts where lower(keyword) = $1`,
    [t.keyword],
  );
  if (exists.n) return "That email keyword is already on another card.";

  const [row] = await query<{ id: number }>(
    `insert into accounts (bank, card_type, nickname, last4, keyword)
     values ($1, $2, $3, $4, $5)
     returning id::int as id`,
    [t.bank, t.cardType, t.nickname, t.last4, t.keyword],
  );

  await rememberSender(t.keyword);
  if (row) await attachEmailsToCards();

  revalidatePath("/", "layout");
  return null;
}

export async function updateAccount(_prev: string | null, form: FormData): Promise<string | null> {
  await requireAuth();
  const id = Number(form.get("id"));
  if (!Number.isInteger(id) || id <= 0) return "Card not found.";
  const t = readCardForm(form);
  if (!t.ok) return t.error;

  const [exists] = await query<{ n: number }>(
    `select count(*)::int as n from accounts where lower(keyword) = $1 and id <> $2`,
    [t.keyword, id],
  );
  if (exists.n) return "That email keyword is already on another card.";

  const rows = await query(
    `update accounts
        set bank = $2, card_type = $3, nickname = $4, last4 = $5, keyword = $6
      where id = $1 and bank <> 'cash'
      returning id`,
    [id, t.bank, t.cardType, t.nickname, t.last4, t.keyword],
  );
  if (!rows.length) return "Card not found.";

  await rememberSender(t.keyword);
  await attachEmailsToCards();

  revalidatePath("/", "layout");
  redirect("/accounts");
}

export async function deleteAccount(form: FormData) {
  await requireAuth();
  await query(`delete from accounts where id = $1 and bank <> 'cash'`, [Number(form.get("id"))]);
  revalidatePath("/", "layout");
}
