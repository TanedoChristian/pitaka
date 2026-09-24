# Pitaka

Personal expense tracker: *where did my money go?* BPI alert emails land in Gmail, a
small Google Apps Script forwards them to this app every minute, and the app parses,
categorizes and charts them. Cash and anything else can be added by hand.

```
BPI ──email──▶ Gmail ──Apps Script (every 1 min)──▶ POST /api/ingest ──▶ Postgres (Supabase) ──▶ Next.js UI
```

Stack: Next.js 16 (App Router, server actions) · Supabase Postgres (via postgres.js) · plain CSS.
Mobile-first; add it to your phone's home screen and it runs full-screen.

## Deploy to Vercel

1. Push this folder to a GitHub repo and **Import** it in Vercel.
2. Create the tables once: put your Supabase connection string in `.env.local`
   (Supabase → **Connect** → *Transaction pooler*) and run `npm run db:migrate`.
   (The app also applies the schema on first request, so this is optional.)
3. **Settings → Environment Variables** — add:

   | Name | Value |
   |---|---|
   | `DATABASE_URL` | Supabase pooler connection string (port 6543) |
   | `APP_PASSWORD` | the password you'll log in with (make it long) |
   | `SESSION_SECRET` | `openssl rand -hex 32` |
   | `INGEST_SECRET` | `openssl rand -hex 32` (the Apps Script uses this too) |

4. Redeploy, open the site, log in.

## Connect Gmail (Apps Script)

1. In the BPI app, turn on **email** notifications for transactions.
2. Go to [script.google.com](https://script.google.com) → New project → paste
   [`apps-script/Code.gs`](apps-script/Code.gs).
3. Project Settings → **Script properties**:
   - `WEBHOOK_URL` = `https://<your-app>.vercel.app/api/ingest`
   - `INGEST_SECRET` = same value as in Vercel
   - `GMAIL_QUERY` *(optional)* — defaults to `from:bpi.com.ph`. Check the sender
     address on a real BPI alert and adjust if it differs.
4. Select `install` → Run → allow access. It now checks Gmail every minute.
5. Run `backfill` once to import the last 90 days.

The Settings page in the app shows your exact webhook URL and when the last email arrived.

Everything is free-tier: Apps Script and Gmail need no billing, Supabase and Vercel free
tiers are more than enough for one person.

## How parsing works

[`lib/parser.ts`](lib/parser.ts) looks for a peso amount (skipping "available balance"),
whether money came in or went out, the merchant/recipient, and the last 4 digits of the
account. Emails with no amount (OTPs, promos) are skipped. If it can't tell in vs. out, the
row is saved as an expense and flagged **Check this**.

Categories come from your rules first (Settings, or tick *"Always use this category for
this merchant"* when editing), then built-in keyword guesses in
[`lib/categories.ts`](lib/categories.ts).

**BPI's exact email wording isn't documented**, so the parser was written against
representative samples. When a real alert parses wrong, paste it (redacted) into
[`lib/parser.test.ts`](lib/parser.test.ts), fix the regex, and run `npm test`.

## Local development

Needs Node 20+. Point `DATABASE_URL` in `.env.local` at Supabase, or at a local Postgres
from `docker-compose.yml` (`npm run db:up`, port 54329, data kept in a Docker volume).

```bash
npm install
npm run db:up        # optional: local Postgres instead of Supabase
cp .env.example .env.local
```

Set these in `.env.local` for local use:

```
DATABASE_URL=postgres://postgres:postgres@localhost:54329/postgres   # or your Supabase URL
APP_PASSWORD=pitaka-local
SESSION_SECRET=<openssl rand -hex 32>
INGEST_SECRET=<openssl rand -hex 32>
```

```bash
npm run db:migrate   # create tables
npm run dev          # http://localhost:3100
npm run db:psql      # SQL shell
npm run db:down      # stop (data kept); add -v to docker compose down to wipe it
```

Send a fake alert:

```bash
curl -X POST localhost:3100/api/ingest -H "Authorization: Bearer $INGEST_SECRET" \
  -H 'content-type: application/json' \
  -d '{"messages":[{"id":"t1","subject":"Bills Payment","body":"You paid PHP 1,200.00 to MERALCO.","date":"2026-09-25T02:00:00Z"}]}'
```

## Security notes

- Single user. Every page and server action is behind the password (checked in
  [`proxy.ts`](proxy.ts)); the session cookie is an HMAC of the password, so changing
  `APP_PASSWORD` logs out all devices.
- `/api/ingest` only accepts requests with `Authorization: Bearer $INGEST_SECRET`, and
  de-duplicates by Gmail message id, so retries are harmless.
- The app stores the raw alert text so you can check a parse. It never sees your BPI login.
