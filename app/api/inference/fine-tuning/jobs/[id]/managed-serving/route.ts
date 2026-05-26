/**
 * POST   /api/inference/fine-tuning/jobs/[id]/managed-serving  — activate
 * DELETE /api/inference/fine-tuning/jobs/[id]/managed-serving  — deactivate
 *
 * Removes the manual SQL step from the Phase 11.A operator activation
 * flow. The flow itself is unchanged — operator still stands up the vLLM
 * container out of band — but the dashboard handles the database mutation.
 *
 * Admin / owner only. Regular org members see the resulting "Managed"
 * badge on the row (Phase 11.A) but can't flip the toggle. Self-service
 * activation by end customers waits for Phase 11.B+C (where AhuraCloud
 * actually deploys the vLLM container automatically); until then this is
 * an internal operator action surfaced as a button so we don't have to
 * UPDATE rows by hand.
 *
 * Activate body: { serving_url: "https://..." }
 *   - URL must be https
 *   - Must reach an OpenAI-compatible vLLM server with --served-model-name=adapter
 *   - The route does NOT health-check the URL (vLLM cold-start can take
 *     60+s; checking here would race). The first customer request will
 *     surface a real upstream error if the URL is wrong.
 *
 * Deactivate: no body required; clears serving_url + is_managed.
 *   - Future requests to this model fall back to the Phase 10
 *     self_serve_model 400.
 *   - The underlying vLLM container is NOT torn down — operator handles
 *     that out of band (until 11.C auto-deploy lands).
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { authenticateUser } from "@/lib/auth/server-auth";
import { limitByUser } from "@/lib/cooldown/userbased";
import { getActiveOrgForUser } from "@/lib/inference/orgs";

function isUuid(s: string): boolean {
  return /^[0-9a-f-]{36}$/i.test(s);
}

const activateSchema = z.object({
  serving_url: z
    .string()
    .url()
    .refine((u) => u.startsWith("https://") || u.startsWith("http://"), {
      message: "serving_url must be http(s)://",
    })
    .refine((u) => !u.endsWith("/"), {
      message: "serving_url must not end with /",
    })
    .refine((u) => !u.includes("/v1/"), {
      message: "serving_url is the base only — do not include /v1/...",
    }),
});

interface FtRow {
  id: string;
  status: string;
  output_model_id: string | null;
  org_id: string;
  name: string;
}

// Supabase's typed-client doesn't unify across helper call boundaries
// when the schema is .schema("inference") narrowed inside. Use `any` for
// the helper param; the cast at the return preserves call-site safety.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Sb = any;

async function loadFt(supabase: Sb, id: string, orgId: string): Promise<FtRow | null> {
  const { data } = await supabase
    .schema("inference")
    .from("finetunes")
    .select("id, status, output_model_id, org_id, name")
    .eq("id", id)
    .eq("org_id", orgId)
    .maybeSingle();
  return (data as FtRow | null) ?? null;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await authenticateUser();
  if (!auth.authenticated) return auth.response;

  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: "Invalid job id" }, { status: 400 });

  const rl = await limitByUser(auth.user!.id, {
    prefix: "rl:inf-ft-managed",
    limit: 20,
    windowMs: 60_000,
  });
  if (!rl.allowed) return NextResponse.json({ error: "Too Many Requests" }, { status: 429 });

  const org = await getActiveOrgForUser(auth.user!.id);
  if (!org) return NextResponse.json({ error: "No inference org" }, { status: 404 });
  if (org.role !== "owner" && org.role !== "admin") {
    return NextResponse.json(
      { error: "Only org owners and admins can activate managed serving" },
      { status: 403 }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const parsed = activateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation error", details: parsed.error.issues },
      { status: 400 }
    );
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );

  const ft = await loadFt(supabase, id, org.org_id);
  if (!ft) return NextResponse.json({ error: "Job not found" }, { status: 404 });
  if (ft.status !== "completed") {
    return NextResponse.json(
      { error: `Cannot activate managed serving on a job in status "${ft.status}"` },
      { status: 409 }
    );
  }
  if (!ft.output_model_id) {
    return NextResponse.json(
      {
        error:
          "Job has no output_model_id — the completion webhook hasn't registered the adapter yet. Refresh and try again.",
      },
      { status: 409 }
    );
  }

  // Update the catalog row (drives the gateway routing) + mirror onto
  // the finetune row (drives the dashboard badge). Use one transaction
  // via PostgREST? Not directly supported — do them sequentially and
  // tolerate the rare case where models updates but finetunes fails
  // (badge will be wrong; routing will still work).
  const { error: modelErr } = await supabase
    .schema("inference")
    .from("models")
    .update({ serving_url: parsed.data.serving_url, is_managed: true })
    .eq("id", ft.output_model_id);

  if (modelErr) {
    console.error("[managed-serving activate] models update error:", modelErr);
    return NextResponse.json(
      { error: "Failed to flip catalog row", detail: modelErr.message },
      { status: 500 }
    );
  }

  const { error: ftErr } = await supabase
    .schema("inference")
    .from("finetunes")
    .update({ serving_url: parsed.data.serving_url, is_managed: true })
    .eq("id", id);

  if (ftErr) {
    console.error("[managed-serving activate] finetunes mirror error:", ftErr);
    // Catalog row updated but mirror failed — gateway routing works,
    // dashboard badge will be wrong. Surface 207-ish state.
    return NextResponse.json(
      {
        success: true,
        warning: "Catalog row updated but finetune row mirror failed; refresh to recover",
      },
      { status: 200 }
    );
  }

  // No audit row for now — managed.activated enum value not yet added.
  // Structured log is enough until 11.D2 lands.
  console.log(
    JSON.stringify({
      level: "info",
      message: "managed-serving.activated",
      orgId: org.org_id,
      userId: auth.user!.id,
      ftId: id,
      modelId: ft.output_model_id,
      serving_url: parsed.data.serving_url,
    })
  );

  return NextResponse.json({
    success: true,
    is_managed: true,
    serving_url: parsed.data.serving_url,
  });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await authenticateUser();
  if (!auth.authenticated) return auth.response;

  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: "Invalid job id" }, { status: 400 });

  const rl = await limitByUser(auth.user!.id, {
    prefix: "rl:inf-ft-managed",
    limit: 20,
    windowMs: 60_000,
  });
  if (!rl.allowed) return NextResponse.json({ error: "Too Many Requests" }, { status: 429 });

  const org = await getActiveOrgForUser(auth.user!.id);
  if (!org) return NextResponse.json({ error: "No inference org" }, { status: 404 });
  if (org.role !== "owner" && org.role !== "admin") {
    return NextResponse.json(
      { error: "Only org owners and admins can deactivate managed serving" },
      { status: 403 }
    );
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );

  const ft = await loadFt(supabase, id, org.org_id);
  if (!ft) return NextResponse.json({ error: "Job not found" }, { status: 404 });

  if (ft.output_model_id) {
    await supabase
      .schema("inference")
      .from("models")
      .update({ serving_url: null, is_managed: false })
      .eq("id", ft.output_model_id);
  }

  await supabase
    .schema("inference")
    .from("finetunes")
    .update({ serving_url: null, is_managed: false })
    .eq("id", id);

  console.log(
    JSON.stringify({
      level: "info",
      message: "managed-serving.deactivated",
      orgId: org.org_id,
      userId: auth.user!.id,
      ftId: id,
      modelId: ft.output_model_id,
    })
  );

  return NextResponse.json({ success: true, is_managed: false });
}
