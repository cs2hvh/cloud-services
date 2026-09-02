/**
 * GET /api/inference/usage/export
 *
 * Streams the org's usage rows in the requested window as CSV, with the
 * API-key name + masked preview resolved inline so finance / accounting
 * teams can pivot in their own tools.
 *
 * Query params:
 *   ?days=N             — window size, 1..90 (default 30)
 *   ?api_key_id=<uuid>  — optional filter to a single key
 *
 * Caps at 100k rows for safety; if hit, the response body contains a
 * trailing comment row noting truncation. Larger pulls should hit the
 * raw warehouse (Phase 12 — not yet built).
 *
 * Rate-limited tighter than the summary endpoint because each call can
 * be tens of megabytes.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { authenticateUser } from "@/lib/auth/server-auth";
import { limitByUser } from "@/lib/cooldown/userbased";
import { getActiveOrgForUser } from "@/lib/inference/orgs";

interface UsageRow {
  created_at: string;
  request_id: string;
  api_key_id: string;
  model_id: string;
  modality: string;
  input_tokens: number | null;
  output_tokens: number | null;
  cached_tokens: number | null;
  cost_cents: number;
  upstream_cost_cents: number;
  is_off_peak: boolean;
  latency_ms: number | null;
  ttft_ms: number | null;
  status: string;
  error_code: string | null;
  billed_to: string;
  cache_kind: "none" | "l1" | "semantic" | null;
}

const MAX_ROWS = 100_000;

function isUuid(s: string): boolean {
  return /^[0-9a-f-]{36}$/i.test(s);
}

function csvEscape(value: string | number | boolean | null | undefined): string {
  if (value === null || value === undefined) return "";
  const s = String(value);
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export async function GET(request: NextRequest) {
  const auth = await authenticateUser();
  if (!auth.authenticated) return auth.response;

  const rl = await limitByUser(auth.user!.id, {
    prefix: "rl:inf-usage-export",
    limit: 6,
    windowMs: 60_000,
  });
  if (!rl.allowed) {
    return NextResponse.json({ error: "Too Many Requests" }, { status: 429 });
  }

  const org = await getActiveOrgForUser(auth.user!.id);
  if (!org) return NextResponse.json({ error: "No inference org" }, { status: 404 });

  const daysParam = Number(request.nextUrl.searchParams.get("days") ?? "30");
  const days = Number.isFinite(daysParam) ? Math.min(Math.max(1, daysParam), 90) : 30;
  const apiKeyFilter = request.nextUrl.searchParams.get("api_key_id");
  if (apiKeyFilter && !isUuid(apiKeyFilter)) {
    return NextResponse.json({ error: "Invalid api_key_id" }, { status: 400 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );

  const since = new Date();
  since.setUTCHours(0, 0, 0, 0);
  since.setUTCDate(since.getUTCDate() - (days - 1));

  let query = supabase
    .schema("inference")
    .from("usage")
    .select(
      "created_at, request_id, api_key_id, model_id, modality, input_tokens, output_tokens, cached_tokens, cost_cents, upstream_cost_cents, is_off_peak, latency_ms, ttft_ms, status, error_code, billed_to, cache_kind"
    )
    .eq("org_id", org.org_id)
    .gte("created_at", since.toISOString())
    .order("created_at", { ascending: false })
    .limit(MAX_ROWS + 1);

  if (apiKeyFilter) {
    query = query.eq("api_key_id", apiKeyFilter);
  }

  const { data, error } = await query.returns<UsageRow[]>();
  if (error) {
    console.error("[Inference Usage Export] fetch error:", error);
    return NextResponse.json({ error: "Failed to export usage" }, { status: 500 });
  }

  const rows = data ?? [];
  const truncated = rows.length > MAX_ROWS;
  const exportRows = truncated ? rows.slice(0, MAX_ROWS) : rows;

  // Resolve API-key names + masked previews so the CSV is readable
  // without a second lookup. Only fetch keys that actually appear in the
  // result set.
  const keyIds = [...new Set(exportRows.map((r) => r.api_key_id).filter(Boolean))];
  const keyMetaById = new Map<string, { name: string; preview: string }>();
  if (keyIds.length > 0) {
    const { data: keyMeta } = await supabase
      .schema("inference")
      .from("api_keys")
      .select("id, name, key_prefix, key_last_four")
      .in("id", keyIds)
      .returns<
        Array<{
          id: string;
          name: string | null;
          key_prefix: string;
          key_last_four: string;
        }>
      >();
    for (const m of keyMeta ?? []) {
      keyMetaById.set(m.id, {
        name: m.name ?? "(unnamed)",
        preview: `${m.key_prefix}••••${m.key_last_four}`,
      });
    }
  }

  const header = [
    "created_at",
    "request_id",
    "api_key_id",
    "api_key_name",
    "api_key_preview",
    "model_id",
    "modality",
    "input_tokens",
    "output_tokens",
    "cached_tokens",
    "cost_cents",
    "cost_usd",
    "upstream_cost_cents",
    "is_off_peak",
    "latency_ms",
    "ttft_ms",
    "status",
    "error_code",
    "billed_to",
    "cache_kind",
  ].join(",");

  const lines: string[] = [header];
  for (const r of exportRows) {
    const meta = keyMetaById.get(r.api_key_id);
    lines.push(
      [
        r.created_at,
        r.request_id,
        r.api_key_id,
        meta?.name ?? "",
        meta?.preview ?? "",
        r.model_id,
        r.modality,
        r.input_tokens,
        r.output_tokens,
        r.cached_tokens,
        r.cost_cents,
        (r.cost_cents / 100).toFixed(4),
        r.upstream_cost_cents,
        r.is_off_peak,
        r.latency_ms,
        r.ttft_ms,
        r.status,
        r.error_code,
        r.billed_to,
        r.cache_kind ?? "none",
      ]
        .map(csvEscape)
        .join(",")
    );
  }
  if (truncated) {
    lines.push(`# truncated at ${MAX_ROWS} rows — narrow the window or filter by api_key_id for the full set`);
  }

  const filename = `ahurasense-inference-usage-${org.org_slug}-${days}d-${new Date()
    .toISOString()
    .slice(0, 10)}.csv`;

  return new NextResponse(lines.join("\n"), {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "X-Row-Count": String(exportRows.length),
      ...(truncated ? { "X-Truncated": "true" } : {}),
    },
  });
}
