import { revalidatePath } from "next/cache";
import { safeEqual } from "@/lib/session";
import { matchAccount } from "@/lib/banks";
import { categorize } from "@/lib/categories";
import { query } from "@/lib/db";
import { parseBpiEmail } from "@/lib/parser";
import { getAccounts, getRules, getSources } from "@/lib/queries";
import { ALERT_SUBJECTS, gmailQuery } from "@/lib/sources";

export const dynamic = "force-dynamic";

type IncomingMessage = { id?: unknown; subject?: unknown; body?: unknown; date?: unknown };

function authorized(req: Request) {
  const secret = process.env.INGEST_SECRET;
  const auth = req.headers.get("authorization") ?? "";
  return !!secret && safeEqual(auth, `Bearer ${secret}`);
}

/** Apps Script asks for the current Gmail `from:` query (senders from Settings). */
export async function GET(req: Request) {
  if (!authorized(req)) return Response.json({ error: "unauthorized" }, { status: 401 });
  const [sources, accounts] = await Promise.all([getSources(), getAccounts()]);
  const senders = sources.map((s) => s.sender);
  const keywords = accounts.map((a) => a.keyword).filter((k): k is string => !!k);
  return Response.json(
    { query: gmailQuery(senders, keywords), senders, subjects: ALERT_SUBJECTS, keywords },
    { headers: { "Cache-Control": "no-store" } },
  );
}

/**
 * Webhook called by the Google Apps Script (apps-script/Code.gs).
 * Body: { messages: [{ id, subject, body, date }] }  — id is the Gmail message id,
 * used to de-duplicate, so re-sending the same email is harmless.
 */
export async function POST(req: Request) {
  if (!authorized(req)) return Response.json({ error: "unauthorized" }, { status: 401 });

  const payload = await req.json().catch(() => null);
  const messages: IncomingMessage[] | null = Array.isArray(payload?.messages)
    ? payload.messages.slice(0, 200)
    : null;
  if (!messages) return Response.json({ error: "expected { messages: [...] }" }, { status: 400 });

  const [rules, accounts] = await Promise.all([getRules(), getAccounts()]);
  let inserted = 0;
  let duplicates = 0;
  const skipped: { id: string; reason: string }[] = [];

  for (const m of messages) {
    const id = typeof m.id === "string" ? m.id : "";
    const subject = typeof m.subject === "string" ? m.subject : "";
    const body = typeof m.body === "string" ? m.body.slice(0, 20_000) : "";
    if (!id) {
      skipped.push({ id: "", reason: "missing id" });
      continue;
    }

    const parsed = parseBpiEmail({ subject, body });
    if (!parsed) {
      skipped.push({ id, reason: "no transaction amount found" });
      continue;
    }

    const direction = parsed.direction ?? "out";
    const emailDate = typeof m.date === "string" && !Number.isNaN(Date.parse(m.date)) ? new Date(m.date) : new Date();
    const date = parsed.occurredAt ?? emailDate;
    const category = categorize(`${parsed.description} ${parsed.merchant ?? ""} ${body}`, direction, rules);
    const matched = matchAccount(accounts, `${subject}\n${body}`, parsed.account);

    const rows = await query(
      `insert into transactions
         (occurred_at, amount, direction, description, merchant, category, account,
          account_id, source, source_id, raw, needs_review)
       values ($1, $2, $3, $4, $5, $6, $7, $8, 'email', $9, $10, $11)
       on conflict (source_id) do nothing
       returning id`,
      [
        date,
        parsed.amount,
        direction,
        parsed.description,
        parsed.merchant,
        category,
        parsed.account,
        matched?.id ?? null,
        `gmail:${id}`,
        `${subject}\n\n${body}`,
        parsed.direction === null,
      ],
    );
    if (rows.length) inserted++;
    else duplicates++;
  }

  await query(
    `insert into ingest_runs (received, inserted, duplicates, skipped, skipped_sample)
     values ($1, $2, $3, $4, $5::jsonb)`,
    [messages.length, inserted, duplicates, skipped.length, JSON.stringify(skipped.slice(0, 20))],
  );

  if (inserted) revalidatePath("/", "layout");
  return Response.json({ inserted, duplicates, skipped: skipped.length, skippedSample: skipped.slice(0, 8) });
}
