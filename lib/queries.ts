import { query, type Account, type EmailSource, type Rule, type Txn } from "./db";
import { DEFAULT_SENDERS } from "./sources";

const MONTH = `to_char(t.occurred_at at time zone 'Asia/Manila', 'YYYY-MM')`;
const TXN_COLS = `t.id::int as id, t.occurred_at, t.amount::float8 as amount, t.direction, t.description,
  t.merchant, t.category, t.account, t.account_id::int as account_id, a.bank as account_bank,
  t.source, t.raw, t.needs_review`;
const TXN_FROM = `transactions t left join accounts a on a.id = t.account_id`;

export async function getSummary(month: string) {
  const [row] = await query<{ spent: number; received: number; count: number }>(
    `select coalesce(sum(t.amount) filter (where t.direction = 'out'), 0)::float8 as spent,
            coalesce(sum(t.amount) filter (where t.direction = 'in'), 0)::float8  as received,
            count(*)::int as count
       from transactions t where ${MONTH} = $1`,
    [month],
  );
  return row;
}

export function getSpendingByCategory(month: string) {
  return query<{ category: string; total: number; count: number }>(
    `select t.category, sum(t.amount)::float8 as total, count(*)::int as count
       from transactions t
      where t.direction = 'out' and ${MONTH} = $1
      group by t.category order by total desc`,
    [month],
  );
}

export function getDailySpending(month: string) {
  return query<{ day: number; total: number }>(
    `select extract(day from t.occurred_at at time zone 'Asia/Manila')::int as day,
            sum(t.amount)::float8 as total
       from transactions t
      where t.direction = 'out' and ${MONTH} = $1
      group by 1 order by 1`,
    [month],
  );
}

export async function listTransactions(opts: {
  month?: string;
  category?: string;
  search?: string;
  review?: boolean;
  limit?: number;
}) {
  const where: string[] = [];
  const params: unknown[] = [];
  if (opts.month) {
    params.push(opts.month);
    where.push(`${MONTH} = $${params.length}`);
  }
  if (opts.category) {
    params.push(opts.category);
    where.push(`t.category = $${params.length}`);
  }
  if (opts.search) {
    params.push(`%${opts.search}%`);
    where.push(`(t.description ilike $${params.length} or t.merchant ilike $${params.length})`);
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
    `select ${MONTH} as month,
            coalesce(sum(t.amount) filter (where t.direction = 'out'), 0)::float8 as spent,
            coalesce(sum(t.amount) filter (where t.direction = 'in'), 0)::float8 as received
       from transactions t
      where ${MONTH} >= $1 and ${MONTH} <= $2
      group by 1`,
    [from, to],
  );
}

export function getTopCounterparties(month: string, opts: { category?: string; limit?: number } = {}) {
  const params: unknown[] = [month];
  const cat = opts.category ? (params.push(opts.category), `and t.category = $2`) : "";
  params.push(opts.limit ?? 6);
  return query<{ merchant: string; total: number; count: number }>(
    `select coalesce(nullif(trim(t.merchant), ''), '(unknown)') as merchant,
            sum(t.amount)::float8 as total,
            count(*)::int as count
       from transactions t
      where t.direction = 'out' and ${MONTH} = $1 ${cat}
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

export async function ensureWallet() {
  await query(
    `insert into accounts (bank, card_type, nickname)
     select 'cash', 'cash', 'Cash'
      where not exists (select 1 from accounts where bank = 'cash')`,
  );
  await query(
    `update transactions
        set account_id = (select id from accounts where bank = 'cash' order by id limit 1)
      where account_id is null and source = 'manual'`,
  );
  await query(
    `update transactions t
        set account_id = a.id
       from accounts a
      where t.account_id is null
        and a.last4 is not null
        and t.account = a.last4`,
  );
}

export async function getAccounts() {
  await ensureWallet();
  return query<Account>(
    `select id::int as id, bank, card_type, nickname, last4, keyword
       from accounts
      order by bank = 'cash' desc, created_at, id`,
  );
}

export type AccountSpend = Account & { spent: number; received: number; count: number };

export function getAccountSpend(month: string) {
  return query<AccountSpend>(
    `select a.id::int as id, a.bank, a.card_type, a.nickname, a.last4, a.keyword,
            coalesce(sum(t.amount) filter (where t.direction = 'out'), 0)::float8 as spent,
            coalesce(sum(t.amount) filter (where t.direction = 'in'), 0)::float8 as received,
            count(t.id)::int as count
       from accounts a
       left join transactions t
         on t.account_id = a.id and ${MONTH} = $1
      group by a.id
      order by a.bank = 'cash' desc, spent desc, a.id`,
    [month],
  );
}

export async function getUnmatchedSpend(month: string) {
  const [row] = await query<{ spent: number; count: number }>(
    `select coalesce(sum(t.amount), 0)::float8 as spent, count(*)::int as count
       from transactions t
      where t.direction = 'out' and ${MONTH} = $1 and t.account_id is null`,
    [month],
  );
  return row;
}

export function getLargestTransactions(month: string, limit = 5) {
  return query<Txn>(
    `select ${TXN_COLS} from ${TXN_FROM}
      where t.direction = 'out' and ${MONTH} = $1
      order by t.amount desc, t.occurred_at desc
      limit $2`,
    [month, limit],
  );
}
