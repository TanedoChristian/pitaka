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

export async function query<T = Record<string, unknown>>(
  text: string,
  params: unknown[] = [],
): Promise<T[]> {
  await ensureSchema();
  return (await getClient().unsafe(text, params as postgres.ParameterOrJSON<never>[])) as unknown as T[];
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
  source: string;
  raw: string | null;
  needs_review: boolean;
  plan_months: number | null;
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
};

/** Apply the schema now and close the connection (used by `npm run db:migrate`). */
export async function migrate() {
  await ensureSchema();
  await getClient().end();
}
