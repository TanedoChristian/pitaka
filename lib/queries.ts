import { query, type EmailSource, type Rule, type Txn } from "./db";
import { DEFAULT_SENDERS } from "./sources";

const MONTH = `to_char(occurred_at at time zone 'Asia/Manila', 'YYYY-MM')`;
const TXN_COLS = `id::int as id, occurred_at, amount::float8 as amount, direction, description,
  merchant, category, account, source, raw, needs_review`;

export async function getSummary(month: string) {
  const [row] = await query<{ spent: number; received: number; count: number }>(
    `select coalesce(sum(amount) filter (where direction = 'out'), 0)::float8 as spent,
            coalesce(sum(amount) filter (where direction = 'in'), 0)::float8  as received,
            count(*)::int as count
       from transactions where ${MONTH} = $1`,
    [month],
  );
  return row;
}

export function getSpendingByCategory(month: string) {
  return query<{ category: string; total: number; count: number }>(
    `select category, sum(amount)::float8 as total, count(*)::int as count
       from transactions
      where direction = 'out' and ${MONTH} = $1
      group by category order by total desc`,
    [month],
  );
}

export function getDailySpending(month: string) {
  return query<{ day: number; total: number }>(
    `select extract(day from occurred_at at time zone 'Asia/Manila')::int as day,
            sum(amount)::float8 as total
       from transactions
      where direction = 'out' and ${MONTH} = $1
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
    where.push(`category = $${params.length}`);
  }
  if (opts.search) {
    params.push(`%${opts.search}%`);
    where.push(`(description ilike $${params.length} or merchant ilike $${params.length})`);
  }
  if (opts.review) where.push(`(needs_review or category = 'Uncategorized')`);
  params.push(opts.limit ?? 500);
  return query<Txn>(
    `select ${TXN_COLS} from transactions
      ${where.length ? `where ${where.join(" and ")}` : ""}
      order by occurred_at desc, id desc
      limit $${params.length}`,
    params,
  );
}

export async function getTransaction(id: number) {
  const [row] = await query<Txn>(`select ${TXN_COLS} from transactions where id = $1`, [id]);
  return row ?? null;
}

export async function countNeedsReview() {
  const [row] = await query<{ n: number }>(
    `select count(*)::int as n from transactions where needs_review or category = 'Uncategorized'`,
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
            coalesce(sum(amount) filter (where direction = 'out'), 0)::float8 as spent,
            coalesce(sum(amount) filter (where direction = 'in'), 0)::float8 as received
       from transactions
      where ${MONTH} >= $1 and ${MONTH} <= $2
      group by 1`,
    [from, to],
  );
}

export function getTopCounterparties(month: string, opts: { category?: string; limit?: number } = {}) {
  const params: unknown[] = [month];
  const cat = opts.category ? (params.push(opts.category), `and category = $2`) : "";
  params.push(opts.limit ?? 6);
  return query<{ merchant: string; total: number; count: number }>(
    `select coalesce(nullif(trim(merchant), ''), '(unknown)') as merchant,
            sum(amount)::float8 as total,
            count(*)::int as count
       from transactions
      where direction = 'out' and ${MONTH} = $1 ${cat}
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
