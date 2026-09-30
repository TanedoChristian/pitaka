# Pitaka research agent

A small command-line service that runs **Claude Code on your computer** to research
the day's markets, your card promos, fuel prices and money news, then sends the
results to your Pitaka app (the **Grow** tab).

```
your computer ── claude -p (WebSearch + WebFetch) ──▶ JSON ──▶ POST /api/grow ──▶ Grow tab
```

Why run it locally? Bank promo pages often block servers, research needs a real
browser-grade fetcher, and it uses your own Claude Code login, so the app on Vercel
stays free and holds no AI keys.

## One-time setup

1. Claude Code is installed and logged in (`claude --version` works).
2. Copy the config and fill it in:

   ```bash
   cp agent/.env.example agent/.env
   ```

   - `PITAKA_URL`: your app, e.g. `https://pitaka.vercel.app` (or `http://localhost:3100`).
   - `INGEST_SECRET`: the same secret the Gmail Apps Script uses.

3. In Pitaka, fill in what the agent should research:
   - **Accounts**: set the *Card product* on each credit card (e.g. BPI *Amore Cashback*,
     UnionBank *Rewards*). Promos differ per product.
   - **Grow → Fuel**: your city and fuel type.
   - **Grow → Markets → What the agent tracks**: your watchlist and risk comfort.

## Run it

```bash
npm run agent -- markets     # stocks, forex & crypto brief (≈2–5 min)
npm run agent -- perks       # live promos for your cards (≈3–8 min)
npm run agent -- fuel        # this week's price change + cheapest brands (≈2–4 min)
npm run agent -- news        # headlines + one-line "why it matters" (≈30 s)
npm run agent -- all         # all four in parallel
```

Options:

| Flag | What it does |
|---|---|
| `--dry-run` | Print the result instead of sending it |
| `--model opus` | Deeper research (default `sonnet`; `haiku` is cheapest) |
| `--budget 2` | Max USD per task per run (default 3) |

Each run prints what it cost. With `sonnet`, `all` typically costs a few dollars on
API billing, or counts against your Claude plan's usage.

`agent/run.sh` does the same but works from cron or Windows (it loads nvm and
`~/.local/bin` itself) and appends to `agent/logs/`.

## Run it automatically (optional)

**Windows Task Scheduler** (works even though WSL has no cron running):
create a task that runs at e.g. 8:00 AM with

```
Program:   wsl.exe
Arguments: -e bash -lc "/home/<you>/projects/pitaka/agent/run.sh all"
```

**cron inside WSL** (start the service first with `sudo service cron start`):

```cron
# weekdays 8:15 AM: markets + news; Monday 6 PM: fuel (after the price announcement); daily 9 AM: perks
15 8 * * 1-5  /home/<you>/projects/pitaka/agent/run.sh markets news
0 18 * * 1    /home/<you>/projects/pitaka/agent/run.sh fuel
0 9 * * *     /home/<you>/projects/pitaka/agent/run.sh perks
```

## How it stays safe

- Claude runs with **only** `WebSearch` and `WebFetch`: no shell, no file edits.
  It runs from a temp folder, not this repo.
- Output is forced into a JSON schema (`agent/tasks.ts`), then the server
  re-validates every field (`lib/grow.ts`): links must be http(s), numbers must
  be numbers, and lists are capped.
- News links come straight from the RSS feeds; Claude only picks and explains
  them, so it can't invent an article.
- The agent sends Claude your spending *summary* (monthly averages, top
  categories and merchants) so insights fit you. It never sends raw transactions.
