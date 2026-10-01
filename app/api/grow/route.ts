import { revalidatePath } from "next/cache";
import { currentMonth } from "@/lib/format";
import { isGrowKind, sanitizeGrow, str } from "@/lib/grow";
import { safeEqual } from "@/lib/session";
import {
  getAccounts,
  getCategoriesSince,
  getMonthlyAverages,
  getProfile,
  getTopMerchantsSince,
  listReportDates,
  saveReport,
} from "@/lib/queries";

export const dynamic = "force-dynamic";

/** Callers already hold the secret, so tell the agent what broke instead of an empty 500. */
async function withErrors(fn: () => Promise<Response>) {
  try {
    return await fn();
  } catch (e) {
    console.error("/api/grow failed:", e);
    const err = e as { message?: string; code?: string };
    return Response.json({ error: err.message ?? String(e), code: err.code ?? null }, { status: 500 });
  }
}

function authorized(req: Request) {
  const secret = process.env.INGEST_SECRET;
  const auth = req.headers.get("authorization") ?? "";
  return !!secret && safeEqual(auth, `Bearer ${secret}`);
}

/**
 * The local research agent (agent/pitaka-agent.ts) asks what to research:
 * your cards, fuel/city, watchlist and a spending summary it can tailor insights to.
 */
export async function GET(req: Request) {
  if (!authorized(req)) return Response.json({ error: "unauthorized" }, { status: 401 });
  return withErrors(() => context());
}

async function context() {
  const month = currentMonth();
  const [profile, accounts, averages, categories, merchants, market, perks, fuel, news] = await Promise.all([
    getProfile(),
    getAccounts(),
    getMonthlyAverages(month, 3),
    getCategoriesSince(90),
    getTopMerchantsSince(90, 15),
    listReportDates("market", 1),
    listReportDates("perks", 1),
    listReportDates("fuel", 1),
    listReportDates("news", 1),
  ]);
  return Response.json(
    {
      profile,
      cards: accounts
        .filter((a) => a.bank !== "cash")
        .map((a) => ({ bank: a.bank, type: a.card_type, product: a.product, nickname: a.nickname })),
      spending: {
        avg_monthly_spend: Math.round(averages.spend),
        avg_monthly_income: Math.round(averages.income),
        months_of_data: averages.months,
        top_categories_90d: categories.slice(0, 8).map((c) => ({ category: c.category, total: Math.round(c.total) })),
        top_merchants_90d: merchants.map((m) => ({ merchant: m.merchant, total: Math.round(m.total) })),
      },
      last: {
        market: market[0]?.generated_at ?? null,
        perks: perks[0]?.generated_at ?? null,
        fuel: fuel[0]?.generated_at ?? null,
        news: news[0]?.generated_at ?? null,
      },
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

/** Body: { kind: "market" | "perks" | "fuel" | "news", data: {...} } */
export async function POST(req: Request) {
  if (!authorized(req)) return Response.json({ error: "unauthorized" }, { status: 401 });
  return withErrors(() => save(req));
}

async function save(req: Request) {
  const body = await req.json().catch(() => null);
  const kind = body?.kind;
  if (!isGrowKind(kind)) return Response.json({ error: "kind must be market, perks, fuel or news" }, { status: 400 });
  const data = sanitizeGrow(kind, body?.data);
  if (!data) return Response.json({ error: `no usable ${kind} data after validation` }, { status: 422 });
  const id = await saveReport(kind, data, str(body?.source, 40) || "agent");
  revalidatePath("/grow", "layout");
  return Response.json({ ok: true, id, kind });
}
