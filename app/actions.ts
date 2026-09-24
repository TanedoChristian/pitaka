"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { checkPassword, requireAuth, SESSION_COOKIE, SESSION_MAX_AGE, sessionToken } from "@/lib/auth";
import { ALL_CATEGORIES } from "@/lib/categories";
import { query } from "@/lib/db";

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
    account: String(form.get("account") ?? "").trim().slice(0, 20) || null,
  };
}

export async function addTransaction(form: FormData) {
  await requireAuth();
  const t = readTxnForm(form);
  await query(
    `insert into transactions (occurred_at, amount, direction, description, merchant, category, account, source)
     values ($1::timestamp at time zone 'Asia/Manila', $2, $3, $4, $5, $6, $7, 'manual')`,
    [t.when, t.amount, t.direction, t.description, t.merchant, t.category, t.account],
  );
  revalidatePath("/", "layout");
  redirect("/transactions");
}

export async function updateTransaction(form: FormData) {
  await requireAuth();
  const id = Number(form.get("id"));
  const t = readTxnForm(form);
  await query(
    `update transactions set occurred_at = $2::timestamp at time zone 'Asia/Manila', amount = $3,
            direction = $4, description = $5, merchant = $6, category = $7, account = $8,
            needs_review = false
      where id = $1`,
    [id, t.when, t.amount, t.direction, t.description, t.merchant, t.category, t.account],
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
