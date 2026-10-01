import postgres from "postgres";

// Schema is applied lazily on first query, so a fresh database works with no
// manual migration step. Every statement is idempotent — append new ones, never edit old ones.
const SCHEMA = [
  `create table if not exists transactions (
    id           bigserial primary key,
    occurred_at  timestamptz not null,
    amount       numeric(14,2) not null check (amount >= 0),
    direction    text not null check (direction in ('in','out')),
    description  text not null default '',
    merchant     text,
    category     text not null default 'Uncategorized',
    account      text,
    source       text not null default 'manual',
    source_id    text unique,
    raw          text,
    needs_review boolean not null default false,
    created_at   timestamptz not null default now()
  )`,
  `create index if not exists transactions_occurred_at_idx on transactions (occurred_at desc)`,
  `create table if not exists category_rules (
    id         bigserial primary key,
    keyword    text not null unique,
    category   text not null,
    created_at timestamptz not null default now()
  )`,
  // Supabase exposes the public schema through its Data API with the public anon key.
  // RLS with no policies (plus revoking the API roles) keeps these tables private;
  // the app connects as the postgres role, which bypasses RLS.
  `alter table transactions enable row level security`,
  `alter table category_rules enable row level security`,
  `do $$ begin
     if exists (select 1 from pg_roles where rolname = 'anon') then
       revoke all on transactions, category_rules from anon, authenticated;
     end if;
   end $$`,
  `create table if not exists ingest_runs (
    id              bigserial primary key,
    created_at      timestamptz not null default now(),
    received        int not null,
    inserted        int not null,
    duplicates      int not null,
    skipped         int not null,
    skipped_sample  jsonb
  )`,
  `alter table ingest_runs enable row level security`,
  `do $$ begin
     if exists (select 1 from pg_roles where rolname = 'anon') then
       revoke all on ingest_runs from anon, authenticated;
     end if;
   end $$`,
  `create table if not exists email_sources (
    id         bigserial primary key,
    sender     text not null unique,
    created_at timestamptz not null default now()
  )`,
  `alter table email_sources enable row level security`,
  `do $$ begin
     if exists (select 1 from pg_roles where rolname = 'anon') then
       revoke all on email_sources from anon, authenticated;
     end if;
   end $$`,
  `create table if not exists accounts (
    id         bigserial primary key,
    bank       text not null check (bank in ('bpi','eastwest','maya','gotyme','unionbank','cash')),
    card_type  text not null check (card_type in ('credit','debit','cash')),
    nickname   text,
    last4      text,
    keyword    text,
    created_at timestamptz not null default now()
  )`,
  // Shared sender keywords are allowed (BPI debit + credit both use bpi.com.ph).
  // This slot used to CREATE UNIQUE INDEX, which throws 23505 on duplicates
  // and never reached the DROP below. Drop here so schema apply can finish.
  `drop index if exists accounts_keyword_idx`,
  `alter table accounts enable row level security`,
  `do $$ begin
     if exists (select 1 from pg_roles where rolname = 'anon') then
       revoke all on accounts from anon, authenticated;
     end if;
   end $$`,
  `alter table transactions add column if not exists account_id bigint`,
  `do $$ begin
     if not exists (select 1 from pg_constraint where conname = 'transactions_account_id_fkey') then
       alter table transactions
         add constraint transactions_account_id_fkey
         foreign key (account_id) references accounts(id) on delete set null;
     end if;
   end $$`,
  `create index if not exists transactions_account_id_idx on transactions (account_id)`,
  `alter table accounts add column if not exists statement_day int`,
  `alter table accounts add column if not exists due_days int`,
  `alter table accounts add column if not exists plan_months int not null default 1`,
  `alter table transactions add column if not exists plan_months int`,
  // Debit + credit at the same bank share a sender; last 4 tells them apart.
  `drop index if exists accounts_keyword_idx`,
  `alter table accounts add column if not exists pay_days int[]`,
  `insert into accounts (bank, card_type, nickname)
   select 'cash', 'cash', 'Cash'
    where not exists (select 1 from accounts where bank = 'cash')`,
  `alter table transactions add column if not exists self_transfer boolean not null default false`,
  `create table if not exists payment_completions (
    id           bigserial primary key,
    account_id   bigint not null references accounts(id) on delete cascade,
    statement    date not null,
    due_date     date not null,
    amount       numeric(14,2) not null,
    completed_at timestamptz not null default now(),
    unique (account_id, statement, due_date)
  )`,
  `create index if not exists payment_completions_account_idx
     on payment_completions (account_id, statement)`,
  `alter table payment_completions enable row level security`,
  `do $$ begin
     if exists (select 1 from pg_roles where rolname = 'anon') then
       revoke all on payment_completions from anon, authenticated;
     end if;
   end $$`,
  // ---- Grow: research snapshots pushed by the local agent (or refreshed in-app) ----
  `alter table accounts add column if not exists product text`,
  `create table if not exists grow_reports (
    id           bigserial primary key,
    kind         text not null check (kind in ('market','perks','fuel','news')),
    generated_at timestamptz not null default now(),
    data         jsonb not null,
    source       text not null default 'agent'
  )`,
  `create index if not exists grow_reports_kind_idx on grow_reports (kind, generated_at desc)`,
  `create table if not exists grow_profile (
    id              int primary key default 1 check (id = 1),
    city            text,
    fuel            text not null default 'Gasoline (RON 91)',
    watchlist       text not null default 'PSEi, BDO, SM, ALI, JFC, S&P 500, Nasdaq, USD/PHP, BTC, ETH',
    risk            text not null default 'moderate' check (risk in ('conservative','moderate','aggressive')),
    emergency_saved numeric(14,2) not null default 0,
    updated_at      timestamptz not null default now()
  )`,
  `insert into grow_profile (id) values (1) on conflict (id) do nothing`,
  `create table if not exists budgets (
    category   text primary key,
    monthly    numeric(14,2) not null check (monthly > 0),
    created_at timestamptz not null default now()
  )`,
  `alter table grow_reports enable row level security`,
  `alter table grow_profile enable row level security`,
  `alter table budgets enable row level security`,
  `do $$ begin
     if exists (select 1 from pg_roles where rolname = 'anon') then
       revoke all on grow_reports, grow_profile, budgets from anon, authenticated;
     end if;
   end $$`,
];

type Sql = ReturnType<typeof postgres>;

// Reuse one client across hot reloads in dev (and across invocations of a warm function).
const g = globalThis as unknown as {
  __pitakaSql?: Sql;
  __pitakaReady?: Promise<void> | null;
  __pitakaSchemaN?: number;
};

function getClient() {
  if (!g.__pitakaSql) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is not set");
    const local = /@(localhost|127\.0\.0\.1|\[::1\])[:/]/.test(url);
    g.__pitakaSql = postgres(url, {
      ssl: local ? false : "require",
      // Supabase's transaction pooler (port 6543) doesn't support prepared statements.
      prepare: false,
      max: 5,
      idle_timeout: 20,
      connect_timeout: 10,
      onnotice: () => {}, // silence "already exists, skipping" from the idempotent schema
    });
  }
  return g.__pitakaSql;
}

async function applySchema() {
  const sql = getClient();
  // Own table — public.pitaka_meta already exists as key/value and is not this.
  await sql.unsafe(
    `create table if not exists pitaka_schema_version (
       id int primary key default 1 check (id = 1),
       applied int not null
     )`,
  );
  const rows = (await sql.unsafe(`select applied from pitaka_schema_version where id = 1`)) as { applied: number }[];
  const applied = Number(rows[0]?.applied ?? 0);
  for (let i = applied; i < SCHEMA.length; i++) await sql.unsafe(SCHEMA[i]);
  if (applied !== SCHEMA.length) {
    await sql.unsafe(
      `insert into pitaka_schema_version (id, applied) values (1, ${SCHEMA.length})
       on conflict (id) do update set applied = excluded.applied`,
    );
  }
}

function ensureSchema() {
  if (g.__pitakaSchemaN !== SCHEMA.length) {
    g.__pitakaReady = null;
    g.__pitakaSchemaN = SCHEMA.length;
  }
  if (!g.__pitakaReady) {
    g.__pitakaReady = applySchema().catch((err) => {
      g.__pitakaReady = null;
      throw err;
    });
  }
  return g.__pitakaReady;
}

/** An untyped SQL literal, so Postgres infers its type exactly like an unbound $n. */
export function literal(v: unknown): string {
  if (v === null || v === undefined) return "null";
  let s: string;
  if (v instanceof Date) s = v.toISOString();
  else if (Array.isArray(v))
    s = `{${v.map((x) => (x === null || x === undefined ? "NULL" : `"${String(x).replace(/["\\]/g, "\\$&")}"`)).join(",")}}`;
  else if (typeof v === "object") s = JSON.stringify(v);
  else s = String(v);
  // E'' escapes backslashes itself, so this is safe whatever standard_conforming_strings is.
  return `E'${s.replace(/\\/g, "\\\\").replace(/'/g, "''")}'`;
}

/** Replace $1..$n with literals. */
export function inline(text: string, params: unknown[]): string {
  return text.replace(/\$(\d+)/g, (_, n: string) => {
    const i = Number(n) - 1;
    if (i < 0 || i >= params.length) throw new Error(`query: no value for $${n}`);
    return literal(params[i]);
  });
}

export async function query<T = Record<string, unknown>>(
  text: string,
  params: unknown[] = [],
): Promise<T[]> {
  await ensureSchema();
  // With prepare: false, postgres.js sends a parameterized query in two round trips
  // (Parse/Describe/Flush, then Bind/Execute/Sync). On the transaction pooler, a function
  // frozen or aborted between them leaves the backend stuck mid-statement until
  // statement_timeout fires, and the 57014 lands on whichever request gets that backend next.
  // Without bound params, every query is a single message ending in Sync.
  return (await getClient().unsafe(params.length ? inline(text, params) : text)) as unknown as T[];
}

export type Direction = "in" | "out";

export type Txn = {
  id: number;
  occurred_at: Date;
  amount: number;
  direction: Direction;
  description: string;
  merchant: string | null;
  category: string;
  account: string | null;
  account_id: number | null;
  account_bank: string | null;
  account_nickname: string | null;
  account_card_type: string | null;
  account_last4: string | null;
  source: string;
  raw: string | null;
  needs_review: boolean;
  plan_months: number | null;
  self_transfer: boolean;
};

export type PaymentCompletion = {
  account_id: number;
  statement: string;
  due_date: string;
  amount: number;
  completed_at: Date;
};

export type Rule = { id: number; keyword: string; category: string };

export type EmailSource = { id: number; sender: string };

export type Account = {
  id: number;
  bank: string;
  card_type: string;
  nickname: string | null;
  last4: string | null;
  keyword: string | null;
  statement_day: number | null;
  due_days: number | null;
  plan_months: number | null;
  pay_days: number[] | null;
  product: string | null;
};

/** Apply the schema now and close the connection (used by `npm run db:migrate`). */
export async function migrate() {
  await ensureSchema();
  await getClient().end();
}
