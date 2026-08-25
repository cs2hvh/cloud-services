/**
 * GET  /api/inference/evals/datasets — list org eval datasets (with case count)
 * POST /api/inference/evals/datasets — create a new dataset
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { controlPlaneAuth } from "@/lib/inference/control-plane-auth";
import { limitByUser } from "@/lib/cooldown/userbased";

const createSchema = z.object({
  name: z
    .string()
    .min(1)
    .max(80)
    .regex(/^[a-z0-9][a-z0-9-_ ]*$/i, "Letters, digits, hyphens, underscores, spaces"),
  description: z.string().max(500).optional().nullable(),
});

function makeSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

export async function GET(request: NextRequest) {
  const authResult = await controlPlaneAuth(request, { session: "header", org: "bootstrap", requireOrgKey: true });
  if (!authResult.ok) return authResult.response;
  const auth = authResult.auth;

  const rl = await limitByUser(auth.subject, { prefix: "rl:evals-ds-list", limit: 30, windowMs: 60_000 });
  if (!rl.allowed) return NextResponse.json({ error: "Too Many Requests" }, { status: 429 });

  const org = { org_id: auth.orgId, role: auth.orgRole };

  const supabase = makeSupabase();

  const { data, error } = await supabase
    .schema("inference")
    .from("eval_datasets")
    .select("id, name, description, created_at, updated_at, eval_cases(count)")
    .eq("org_id", org.org_id)
    .order("updated_at", { ascending: false });

  if (error) return NextResponse.json({ error: "Failed to list eval datasets" }, { status: 500 });

  const datasets = (data ?? []).map((d) => ({
    id: d.id,
    name: d.name,
    description: d.description,
    case_count: (d.eval_cases as unknown as { count: number }[])[0]?.count ?? 0,
    created_at: d.created_at,
    updated_at: d.updated_at,
  }));

  return NextResponse.json({ success: true, data: datasets });
}

export async function POST(request: NextRequest) {
  const authResult = await controlPlaneAuth(request, { session: "header", org: "bootstrap", requireOrgKey: true });
  if (!authResult.ok) return authResult.response;
  const auth = authResult.auth;

  const rl = await limitByUser(auth.subject, { prefix: "rl:evals-ds-create", limit: 10, windowMs: 60_000 });
  if (!rl.allowed) return NextResponse.json({ error: "Too Many Requests" }, { status: 429 });

  const org = { org_id: auth.orgId, role: auth.orgRole };

  let body: unknown;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({
      error: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "),
    }, { status: 400 });
  }

  const supabase = makeSupabase();

  const { data, error } = await supabase
    .schema("inference")
    .from("eval_datasets")
    .insert({
      org_id:     org.org_id,
      name:       parsed.data.name,
      description: parsed.data.description ?? null,
      created_by: auth.userId,
    })
    .select("id, name, description, created_at")
    .single();

  if (error) {
    if (error.code === "23505")
      return NextResponse.json({ error: `A dataset named "${parsed.data.name}" already exists` }, { status: 409 });
    return NextResponse.json({ error: "Failed to create eval dataset" }, { status: 500 });
  }

  return NextResponse.json({ success: true, data }, { status: 201 });
}
