import { query, type Rule, type Txn } from "./db";

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
