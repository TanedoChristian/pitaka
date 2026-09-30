import { getBank } from "./banks";
import { query, type Account, type EmailSource, type Rule, type Txn } from "./db";
import type { GrowKind, GrowProfile, GrowReport } from "./grow";
import { DEFAULT_SENDERS } from "./sources";

const MONTH_LABEL = `to_char(t.occurred_at at time zone 'Asia/Manila', 'YYYY-MM')`;
/** Index-friendly month window. Pass `${month}-01` (e.g. 2026-09-01). */
const IN_MONTH = (alias: string, p: number) =>
  `${alias}.occurred_at >= $${p}::timestamp at time zone 'Asia/Manila' and ${alias}.occurred_at < ($${p}::date + interval '1 month')::timestamp at time zone 'Asia/Manila'`;
const monthDay = (month: string) => `${month}-01`;
const TXN_COLS = `t.id::int as id, t.occurred_at, t.amount::float8 as amount, t.direction, t.description,
  t.merchant, t.category, t.account, t.account_id::int as account_id, a.bank as account_bank,
  a.nickname as account_nickname, a.card_type as account_card_type, a.last4 as account_last4,
  t.source, t.raw, t.needs_review, t.plan_months::int as plan_months, t.self_transfer`;
const TXN_FROM = `transactions t left join accounts a on a.id = t.account_id`;
const ACCOUNT_COLS = `id::int as id, bank, card_type, nickname, last4, keyword,
  statement_day::int as statement_day, due_days::int as due_days, plan_months::int as plan_months, pay_days, product`;
/** Real spending — wallet top-ups marked "to myself" are excluded. */
const REAL_OUT = `t.direction = 'out' and not t.self_transfer`;

export async function getSummary(month: string) {
  const [row] = await query<{ spent: number; received: number; moved: number; count: number }>(
    `select coalesce(sum(t.amount) filter (where ${REAL_OUT}), 0)::float8 as spent,
            coalesce(sum(t.amount) filter (where t.direction = 'in'), 0)::float8  as received,
            coalesce(sum(t.amount) filter (where t.direction = 'out' and t.self_transfer), 0)::float8 as moved,
            count(*) filter (where ${REAL_OUT} or t.direction = 'in')::int as count
       from transactions t where ${IN_MONTH("t", 1)}`,
    [monthDay(month)],
  );
  return row;
}

export function getSpendingByCategory(month: string) {
  return query<{ category: string; total: number; count: number }>(
    `select t.category, sum(t.amount)::float8 as total, count(*)::int as count
       from transactions t
      where ${REAL_OUT} and ${IN_MONTH("t", 1)}
      group by t.category order by total desc`,
    [monthDay(month)],
  );
}

export function getDailySpending(month: string) {
  return query<{ day: number; total: number }>(
    `select extract(day from t.occurred_at at time zone 'Asia/Manila')::int as day,
            sum(t.amount)::float8 as total
       from transactions t
      where ${REAL_OUT} and ${IN_MONTH("t", 1)}
      group by 1 order by 1`,
    [monthDay(month)],
  );
}

export async function listTransactions(opts: {
  month?: string;
  category?: string;
  search?: string;
  accountId?: number;
  review?: boolean;
  limit?: number;
}) {
  const where: string[] = [];
  const params: unknown[] = [];
  if (opts.month) {
    params.push(monthDay(opts.month));
    where.push(IN_MONTH("t", params.length));
  }
  if (opts.category) {
    params.push(opts.category);
    where.push(`t.category = $${params.length}`);
  }
  if (opts.search) {
    params.push(`%${opts.search}%`);
    where.push(`(t.description ilike $${params.length} or t.merchant ilike $${params.length})`);
  }
  if (opts.accountId && Number.isInteger(opts.accountId) && opts.accountId > 0) {
    params.push(opts.accountId);
    where.push(`t.account_id = $${params.length}`);
  }
  if (opts.review) where.push(`(t.needs_review or t.category = 'Uncategorized')`);
  params.push(opts.limit ?? 500);
  return query<Txn>(
    `select ${TXN_COLS} from ${TXN_FROM}
      ${where.length ? `where ${where.join(" and ")}` : ""}
      order by t.occurred_at desc, t.id desc
      limit $${params.length}`,
    params,
  );
}

export async function getTransaction(id: number) {
  const [row] = await query<Txn>(`select ${TXN_COLS} from ${TXN_FROM} where t.id = $1`, [id]);
  return row ?? null;
}

export async function countNeedsReview() {
  const [row] = await query<{ n: number }>(
    `select count(*)::int as n from transactions t where t.needs_review or t.category = 'Uncategorized'`,
  );
  return row.n;
}

export function getRules() {
  return query<Rule>(`select id::int as id, keyword, category from category_rules order by keyword`);
}

export async function getSources() {
  // Seed only when empty, in one statement, so two first-loads can't leave a partial list.
  await query(
    `insert into email_sources (sender)
     select s from unnest($1::text[]) as s
      where not exists (select 1 from email_sources)
     on conflict (sender) do nothing`,
    [DEFAULT_SENDERS],
  );
  return query<EmailSource>(`select id::int as id, sender from email_sources order by sender`);
}

export function getMonthlyTrend(from: string, to: string) {
  return query<{ month: string; spent: number; received: number }>(
    `select ${MONTH_LABEL} as month,
            coalesce(sum(t.amount) filter (where ${REAL_OUT}), 0)::float8 as spent,
            coalesce(sum(t.amount) filter (where t.direction = 'in'), 0)::float8 as received
       from transactions t
      where t.occurred_at >= $1::timestamp at time zone 'Asia/Manila'
        and t.occurred_at < ($2::date + interval '1 month')::timestamp at time zone 'Asia/Manila'
      group by 1`,
    [monthDay(from), monthDay(to)],
  );
}

export function getTopCounterparties(month: string, opts: { category?: string; limit?: number } = {}) {
  const params: unknown[] = [monthDay(month)];
  const cat = opts.category ? (params.push(opts.category), `and t.category = $2`) : "";
  // Transfers list keeps self-moves; other merchant tops are real spend only.
  const self = opts.category === "Transfers" ? "" : "and not t.self_transfer";
  params.push(opts.limit ?? 6);
  return query<{ merchant: string; total: number; count: number }>(
    `select coalesce(nullif(trim(t.merchant), ''), '(unknown)') as merchant,
            sum(t.amount)::float8 as total,
            count(*)::int as count
       from transactions t
      where t.direction = 'out' ${self} and ${IN_MONTH("t", 1)} ${cat}
      group by 1
      order by total desc
      limit $${params.length}`,
    params,
  );
}

export async function getLastIngest() {
  const [row] = await query<{
    at: Date;
    received: number;
    inserted: number;
    duplicates: number;
    skipped: number;
  }>(
    `select created_at as at, received, inserted, duplicates, skipped
       from ingest_runs order by id desc limit 1`,
  );
  return row ?? null;
}

/** Stamp unmatched email rows onto the card whose keyword/From they belong to. */
export async function attachEmailsToCards() {
  await query(
    `update transactions t
        set account_id = a.id
       from accounts a
      where t.account_id is null
        and a.last4 is not null
        and t.account = a.last4`,
  );
  await query(
    `update transactions t
        set account_id = a.id
       from accounts a
      where t.account_id is null
        and t.source = 'email'
        and a.bank <> 'cash'
        and a.keyword is not null
        and length(trim(a.keyword)) > 0
        and (
          t.raw ilike '%' || a.keyword || '%'
          or t.description ilike '%' || a.keyword || '%'
        )`,
  );

  const cards = await query<Account>(
    `select ${ACCOUNT_COLS}
       from accounts
      where bank <> 'cash' and keyword is not null`,
  );
  const counts = new Map<string, number>();
  for (const c of cards) counts.set(c.bank, (counts.get(c.bank) ?? 0) + 1);

  for (const card of cards) {
    if ((counts.get(card.bank) ?? 0) !== 1) continue;
    const bank = getBank(card.bank);
    if (!bank) continue;
    const hints = [bank.defaultKeyword, ...bank.extraSenders, ...bank.headerHints];
    if (!hints.length) continue;
    const like = hints.map((_, i) => `t.raw ilike $${i + 2} or t.description ilike $${i + 2}`).join(" or ");
    await query(
      `update transactions t
          set account_id = $1
        where t.account_id is null
          and t.source = 'email'
          and (${like})`,
      [card.id, ...hints.map((h) => `%${h}%`)],
    );
  }
}

export async function getAccounts() {
  return query<Account>(
    `select ${ACCOUNT_COLS}
       from accounts
      order by bank = 'cash' desc, created_at, id`,
  );
}

export async function getAccount(id: number) {
  const [row] = await query<Account>(
    `select ${ACCOUNT_COLS}
       from accounts
      where id = $1 and bank <> 'cash'`,
    [id],
  );
  return row ?? null;
}

export type AccountSpend = Account & { spent: number; received: number; count: number };

export function getAccountSpend(month: string) {
  return query<AccountSpend>(
    `select a.id::int as id, a.bank, a.card_type, a.nickname, a.last4, a.keyword,
            a.statement_day::int as statement_day, a.due_days::int as due_days, a.plan_months::int as plan_months, a.pay_days, a.product,
            coalesce(sum(t.amount) filter (where t.direction = 'out' and not t.self_transfer), 0)::float8 as spent,
            coalesce(sum(t.amount) filter (where t.direction = 'in'), 0)::float8 as received,
            count(t.id) filter (where t.id is not null and (t.direction = 'in' or not t.self_transfer))::int as count
       from accounts a
       left join transactions t
         on t.account_id = a.id and ${IN_MONTH("t", 1)}
      group by a.id
      order by a.bank = 'cash' desc, spent desc, a.id`,
    [monthDay(month)],
  );
}

export async function getUnmatchedSpend(month: string) {
  const [row] = await query<{ spent: number; count: number }>(
    `select coalesce(sum(t.amount), 0)::float8 as spent, count(*)::int as count
       from transactions t
      where ${REAL_OUT} and ${IN_MONTH("t", 1)} and t.account_id is null`,
    [monthDay(month)],
  );
  return row;
}

export function listAccountTransactions(accountId: number) {
  return query<Txn>(
    `select ${TXN_COLS} from ${TXN_FROM}
      where t.account_id = $1
      order by t.occurred_at desc, t.id desc
      limit 2000`,
    [accountId],
  );
}

export function getLargestTransactions(month: string, limit = 5) {
  return query<Txn>(
    `select ${TXN_COLS} from ${TXN_FROM}
      where ${REAL_OUT} and ${IN_MONTH("t", 1)}
      order by t.amount desc, t.occurred_at desc
      limit $2`,
    [monthDay(month), limit],
  );
}

export function getPaymentCompletions(accountId: number, statement: string) {
  return query<{ due_date: string; amount: number; completed_at: Date }>(
    `select due_date::text as due_date, amount::float8 as amount, completed_at
       from payment_completions
      where account_id = $1 and statement = $2::date
      order by due_date`,
    [accountId, statement],
  );
}

// ---------- grow ----------

export async function getLatestReport<K extends GrowKind>(kind: K) {
  const [row] = await query<GrowReport<K>>(
    `select id::int as id, kind, generated_at, source, data
       from grow_reports where kind = $1
      order by generated_at desc, id desc limit 1`,
    [kind],
  );
  return row ?? null;
}

export async function getReport<K extends GrowKind>(kind: K, id: number) {
  const [row] = await query<GrowReport<K>>(
    `select id::int as id, kind, generated_at, source, data from grow_reports where kind = $1 and id = $2`,
    [kind, id],
  );
  return row ?? null;
}

export function listReportDates(kind: GrowKind, limit = 12) {
  return query<{ id: number; generated_at: Date; headline: string | null; mood: string | null }>(
    `select id::int as id, generated_at, data->>'headline' as headline, data->>'mood' as mood
       from grow_reports where kind = $1
      order by generated_at desc, id desc limit $2`,
    [kind, limit],
  );
}

export async function saveReport(kind: GrowKind, data: unknown, source: string) {
  const [row] = await query<{ id: number }>(
    `insert into grow_reports (kind, data, source) values ($1, $2::jsonb, $3) returning id::int as id`,
    // postgres.js serializes objects for jsonb itself; a pre-stringified value would be stored as a JSON string.
    [kind, data, source],
  );
  // Keep the last 60 snapshots per kind; older ones are history nobody reads.
  await query(
    `delete from grow_reports where kind = $1 and id not in (
       select id from grow_reports where kind = $1 order by generated_at desc, id desc limit 60)`,
    [kind],
  );
  return row.id;
}

export async function getProfile() {
  const [row] = await query<GrowProfile>(
    `select city, fuel, watchlist, risk, emergency_saved::float8 as emergency_saved, updated_at
       from grow_profile where id = 1`,
  );
  return row;
}

export function getBudgets() {
  return query<{ category: string; monthly: number }>(
    `select category, monthly::float8 as monthly from budgets order by category`,
  );
}

/** Average monthly spend per category over the `n` full months before `month`. */
export function getCategoryAverages(month: string, n = 3) {
  return query<{ category: string; avg: number }>(
    `select t.category, (sum(t.amount) / $2)::float8 as avg
       from transactions t
      where ${REAL_OUT}
        and t.occurred_at >= ($1::date - make_interval(months => $2::int))::timestamp at time zone 'Asia/Manila'
        and t.occurred_at < $1::timestamp at time zone 'Asia/Manila'
      group by t.category`,
    [monthDay(month), n],
  );
}

/** Average monthly real spend and income over the `n` full months before `month` (months with data only). */
export async function getMonthlyAverages(month: string, n = 3) {
  const [row] = await query<{ spend: number; income: number; months: number }>(
    `select coalesce(avg(spent), 0)::float8 as spend, coalesce(avg(received), 0)::float8 as income, count(*)::int as months
       from (
         select ${MONTH_LABEL} as m,
                sum(t.amount) filter (where ${REAL_OUT}) as spent,
                sum(t.amount) filter (where t.direction = 'in' and not t.self_transfer) as received
           from transactions t
          where t.occurred_at >= ($1::date - make_interval(months => $2::int))::timestamp at time zone 'Asia/Manila'
            and t.occurred_at < $1::timestamp at time zone 'Asia/Manila'
          group by 1
       ) x`,
    [monthDay(month), n],
  );
  return row;
}

/** Real outgoing charges in the last `days` days (for recurring and fuel detection). */
export function getRecentCharges(days = 125) {
  return query<{ merchant: string; amount: number; occurred_at: Date; category: string; description: string }>(
    `select coalesce(nullif(trim(t.merchant), ''), t.description) as merchant, t.amount::float8 as amount,
            t.occurred_at, t.category, t.description
       from transactions t
      where ${REAL_OUT} and t.occurred_at >= now() - make_interval(days => $1::int)`,
    [days],
  );
}

/** Top merchants over the last `days` days, for matching card perks. */
export function getTopMerchantsSince(days = 90, limit = 40) {
  return query<{ merchant: string; total: number }>(
    `select coalesce(nullif(trim(t.merchant), ''), t.description) as merchant, sum(t.amount)::float8 as total
       from transactions t
      where ${REAL_OUT} and t.occurred_at >= now() - make_interval(days => $1::int)
      group by 1 order by total desc limit $2`,
    [days, limit],
  );
}

export function getCategoriesSince(days = 90) {
  return query<{ category: string; total: number }>(
    `select t.category, sum(t.amount)::float8 as total
       from transactions t
      where ${REAL_OUT} and t.occurred_at >= now() - make_interval(days => $1::int)
      group by 1 order by total desc`,
    [days],
  );
}
