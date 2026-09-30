/**
 * Pitaka research agent: runs Claude Code on this computer to research markets,
 * card perks, fuel prices and news, then sends the results to your Pitaka app.
 *
 *   npm run agent -- markets            # today's stocks, forex & crypto brief
 *   npm run agent -- perks              # live promos for your cards
 *   npm run agent -- fuel               # weekly price change + cheapest brands
 *   npm run agent -- news               # headlines + "why it matters"
 *   npm run agent -- all                # everything, in parallel
 *
 * Options: --dry-run (print, don't send)  --model <name>  --budget <usd per task>
 * Config: agent/.env (see agent/README.md).
 */
import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { sanitizeGrow, type GrowKind } from "../lib/grow";
import { fetchNews } from "../lib/news";
import {
  type Context,
  FUEL_SCHEMA,
  fuelPrompt,
  MARKET_SCHEMA,
  marketPrompt,
  NEWS_SCHEMA,
  newsPrompt,
  PERKS_SCHEMA,
  perksPrompt,
} from "./tasks";

const here = dirname(fileURLToPath(import.meta.url));
const TASKS = ["markets", "perks", "fuel", "news"] as const;
type Task = (typeof TASKS)[number];
const KIND: Record<Task, GrowKind> = { markets: "market", perks: "perks", fuel: "fuel", news: "news" };

// ---------- config ----------

function loadEnv(file: string) {
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (!m || process.env[m[1]] !== undefined) continue;
    process.env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, "$2");
  }
}
loadEnv(join(here, ".env"));
loadEnv(join(here, "..", ".env.local")); // INGEST_SECRET fallback for local dev

const args = process.argv.slice(2);
const flag = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const dryRun = args.includes("--dry-run");
const model = flag("model") ?? process.env.AGENT_MODEL ?? "sonnet";
const budget = flag("budget") ?? process.env.AGENT_BUDGET_USD ?? "3";
const claudeBin = process.env.CLAUDE_BIN ?? "claude";
const baseUrl = (process.env.PITAKA_URL ?? "http://localhost:3100").replace(/\/+$/, "");
const secret = process.env.INGEST_SECRET ?? "";

// Positional words are task names; skip flags and the values of --model / --budget.
const picked = args.filter((a, i) => !a.startsWith("--") && args[i - 1] !== "--model" && args[i - 1] !== "--budget");
const tasks: Task[] =
  picked.length === 0 || picked.includes("all")
    ? [...TASKS]
    : picked.map((p) => (p === "market" ? "markets" : p)).filter((p): p is Task => (TASKS as readonly string[]).includes(p));

if (!tasks.length) {
  console.error(`Unknown task "${picked.join(" ")}". Use one of: ${TASKS.join(", ")}, all`);
  process.exit(2);
}
if (!secret) {
  console.error("INGEST_SECRET is not set. Create agent/.env (see agent/README.md).");
  process.exit(2);
}

const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Manila" });
const todayLong = new Date().toLocaleDateString("en-PH", {
  timeZone: "Asia/Manila",
  weekday: "long",
  year: "numeric",
  month: "long",
  day: "numeric",
});

// ---------- helpers ----------

const color = (c: number) => (s: string) => (process.stdout.isTTY ? `\x1b[${c}m${s}\x1b[0m` : s);
const dim = color(2);
const green = color(32);
const red = color(31);
const bold = color(1);
const log = (task: string, msg: string) => console.log(`${dim(`[${task}]`)} ${msg}`);

async function api(path: string, init?: RequestInit) {
  const res = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json", ...init?.headers },
    signal: AbortSignal.timeout(30_000),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status} ${JSON.stringify(body)}`);
  return body;
}

type ClaudeResult = { structured_output?: unknown; result?: string; is_error?: boolean; total_cost_usd?: number; num_turns?: number };

/** Run `claude -p` with web tools only and a JSON schema; resolve the structured output. */
function runClaude(task: string, prompt: string, schema: object, tools: string[]): Promise<{ data: unknown; cost: number }> {
  return new Promise((resolve, reject) => {
    const argv = [
      "-p",
      prompt,
      "--output-format",
      "json",
      "--json-schema",
      JSON.stringify(schema),
      "--model",
      model,
      "--max-budget-usd",
      budget,
      "--no-session-persistence",
      "--permission-mode",
      "dontAsk",
      "--tools",
      tools.join(",") || "",
    ];
    if (tools.length) argv.push("--allowedTools", ...tools);
    // Run outside the repo so the project's CLAUDE.md and settings don't leak into research.
    const child = spawn(claudeBin, argv, { cwd: tmpdir(), stdio: ["ignore", "pipe", "pipe"], env: process.env });
    let out = "";
    let err = "";
    const started = Date.now();
    const tick = setInterval(() => log(task, dim(`researching… ${Math.round((Date.now() - started) / 1000)}s`)), 30_000);
    const limit = setTimeout(() => child.kill("SIGTERM"), 20 * 60_000);
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (err += d));
    child.on("error", (e) => {
      clearInterval(tick);
      clearTimeout(limit);
      reject(new Error(`could not start "${claudeBin}": ${e.message}. Is Claude Code installed and on PATH?`));
    });
    child.on("close", (code) => {
      clearInterval(tick);
      clearTimeout(limit);
      let parsed: ClaudeResult;
      try {
        parsed = JSON.parse(out);
      } catch {
        return reject(new Error(`claude exited ${code}: ${(err || out).slice(0, 800)}`));
      }
      if (parsed.is_error || parsed.structured_output === undefined) {
        return reject(new Error(`claude returned no structured output: ${(parsed.result ?? err).slice(0, 800)}`));
      }
      resolve({ data: parsed.structured_output, cost: parsed.total_cost_usd ?? 0 });
    });
  });
}

// ---------- tasks ----------

async function research(task: Task, ctx: Context): Promise<{ data: unknown; cost: number }> {
  const web = ["WebSearch", "WebFetch"];
  if (task === "markets") return runClaude(task, marketPrompt(ctx, todayLong), MARKET_SCHEMA, web);
  if (task === "perks") return runClaude(task, perksPrompt(ctx, today), PERKS_SCHEMA, web);
  if (task === "fuel") return runClaude(task, fuelPrompt(ctx, todayLong), FUEL_SCHEMA, web);

  // news: headlines come straight from RSS (exact links); Claude only picks and explains.
  const items = await fetchNews(45);
  if (!items.length) throw new Error("no headlines from any RSS feed");
  log(task, `${items.length} headlines from RSS, asking Claude what matters…`);
  const { data, cost } = await runClaude(task, newsPrompt(items, ctx, todayLong), NEWS_SCHEMA, []);
  const picks = ((data as { picks?: { index: number; why: string; tag: string }[] }).picks ?? []).filter(
    (p) => Number.isInteger(p.index) && items[p.index],
  );
  const chosen = new Set(picks.map((p) => p.index));
  const annotated = [
    ...picks.map((p) => ({ ...items[p.index], why: p.why, tag: p.tag || items[p.index].tag })),
    ...items.filter((_, i) => !chosen.has(i)).slice(0, 15),
  ];
  return { data: { as_of: new Date().toISOString(), items: annotated }, cost };
}

function summarize(task: Task, data: unknown) {
  const d = data as Record<string, unknown[] | string | undefined>;
  if (task === "markets") return `${d.headline} (${(d.stocks as unknown[]).length} stocks, ${(d.forex as unknown[]).length} FX, ${(d.crypto as unknown[]).length} crypto)`;
  if (task === "perks") return `${(d.perks as unknown[]).length} live perks`;
  if (task === "fuel") return `${(d.prices as unknown[]).length} brand prices · ${(d.advisory as unknown as { summary: string }).summary}`;
  return `${(d.items as unknown[]).length} headlines`;
}

async function runTask(task: Task, ctx: Context) {
  const t0 = Date.now();
  log(task, `starting with ${model}${task === "news" ? "" : " + web search"}…`);
  const { data, cost } = await research(task, ctx);
  const kind = KIND[task];
  const clean = sanitizeGrow(kind, data);
  if (!clean) throw new Error("research came back empty after validation");
  const secs = Math.round((Date.now() - t0) / 1000);
  if (dryRun) {
    console.log(JSON.stringify(clean, null, 2));
    log(task, green(`✓ ${summarize(task, clean)}`) + dim(` · ${secs}s · $${cost.toFixed(2)} · dry run, not sent`));
    return cost;
  }
  await api("/api/grow", { method: "POST", body: JSON.stringify({ kind, data: clean, source: `claude-code (${model})` }) });
  log(task, green(`✓ sent: ${summarize(task, clean)}`) + dim(` · ${secs}s · $${cost.toFixed(2)}`));
  return cost;
}

async function main() {
  console.log(bold(`Pitaka agent → ${baseUrl}`) + dim(` · ${tasks.join(", ")}${dryRun ? " · dry run" : ""}`));
  const ctx = (await api("/api/grow")) as Context;
  const results = await Promise.allSettled(tasks.map((t) => runTask(t, ctx)));
  let cost = 0;
  let failed = 0;
  results.forEach((r, i) => {
    if (r.status === "fulfilled") cost += r.value;
    else {
      failed++;
      log(tasks[i], red(`✗ ${r.reason instanceof Error ? r.reason.message : String(r.reason)}`));
    }
  });
  console.log(dim(`Done: ${tasks.length - failed}/${tasks.length} ok · total $${cost.toFixed(2)}`));
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error(red(`✗ ${e instanceof Error ? e.message : String(e)}`));
  if (String(e).includes("fetch failed")) console.error(dim(`Is Pitaka running at ${baseUrl}? Set PITAKA_URL in agent/.env.`));
  process.exit(1);
});
