// GET  /api/admin/inference/switches — every AI capability switch and its state
// PUT  /api/admin/inference/switches — turn one on or off
//
// Doc 21 §4 (A5 — Safety & switches). Before this the platform had exactly one
// kill switch, `gpu_deploy_enabled`, and nothing covering inference, agents,
// media, connector syncs or fine-tuning: when an upstream provider degraded the
// only lever was deactivating catalog models one at a time.
//
// Every rule lives in lib/admin/feature-switches.ts; this is auth + IO.
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/supabase/auth";
import {
  FEATURE_SWITCHES,
  findSwitch,
  readAllSwitches,
  setFeatureEnabled,
} from "@/lib/admin/feature-switches";
import { actorContext, featureSwitchEntry, recordAdminAudit } from "@/lib/admin/audit";

export const dynamic = "force-dynamic";

export async function GET() {
  const adminCheck = await requireAdmin();
  if (!adminCheck.ok) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const state = await readAllSwitches();
  const switches = FEATURE_SWITCHES.map((spec) => ({ ...spec, enabled: state[spec.key] }));

  return NextResponse.json({
    switches,
    summary: { total: switches.length, disabled: switches.filter((s) => !s.enabled).length },
    note:
      "Switches fail OPEN: if the setting cannot be read, the capability stays enabled. " +
      "A kill switch that takes the platform down when its own storage hiccups is a bigger outage than the one it contains.",
  });
}

export async function PUT(req: NextRequest) {
  const adminCheck = await requireAdmin();
  if (!adminCheck.ok) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const key = body?.key;
  const enabled = body?.enabled;

  if (typeof key !== "string" || typeof enabled !== "boolean") {
    return NextResponse.json({ error: "key and enabled (boolean) are required" }, { status: 400 });
  }
  // Only switches this codebase actually enforces. Writing an arbitrary key
  // would create a switch an operator believes in and nothing checks.
  const spec = findSwitch(key);
  if (!spec) {
    return NextResponse.json(
      { error: `Unknown switch '${key}'`, known: FEATURE_SWITCHES.map((s) => s.key) },
      { status: 400 }
    );
  }

  const before = (await readAllSwitches())[key];
  if (before === enabled) {
    return NextResponse.json({ key, enabled, unchanged: true });
  }

  try {
    await setFeatureEnabled(key, enabled, adminCheck.userId);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to save the switch" },
      { status: 500 }
    );
  }

  void recordAdminAudit(
    featureSwitchEntry(key, enabled, before, typeof body?.reason === "string" ? body.reason : null),
    { userId: adminCheck.userId, email: adminCheck.email },
    actorContext(req)
  );

  return NextResponse.json({
    key,
    enabled,
    unchanged: false,
    // The gateway answers from a per-isolate cache and refreshes it BEHIND the
    // request, so a flip is not instant everywhere. Saying so stops an operator
    // concluding the switch did not work and flipping it twice.
    note: enabled
      ? `${spec.label} is enabled again. Edge caches clear within ~30 seconds.`
      : `${spec.label} is now OFF. ${spec.effect} Edge locations pick this up within ~30 seconds and each serves one more request while it refreshes, so expect a handful to get through.`,
  });
}
