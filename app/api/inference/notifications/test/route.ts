/**
 * POST /api/inference/notifications/test — fire a synthetic event at the
 * org's configured channels. Lets the customer verify their webhook
 * receiver / email recipients without waiting for a real FT to complete.
 *
 * Owner/admin only. Rate-limited (5 / min) so a customer can't spam
 * their own receiver and get blacklisted by their own infra.
 */
import { NextRequest, NextResponse } from "next/server";
import { authenticateUser } from "@/lib/auth/server-auth";
import { limitByUser } from "@/lib/cooldown/userbased";
import { getActiveOrgForUser } from "@/lib/inference/orgs";
import { emitInferenceEvent } from "@/lib/inference/notifications";

export async function POST(request: NextRequest) {
  void request;
  const auth = await authenticateUser();
  if (!auth.authenticated) return auth.response;

  const rl = await limitByUser(auth.user!.id, {
    prefix: "rl:inf-notif-test",
    limit: 5,
    windowMs: 60_000,
  });
  if (!rl.allowed) return NextResponse.json({ error: "Too Many Requests" }, { status: 429 });

  const org = await getActiveOrgForUser(auth.user!.id);
  if (!org) return NextResponse.json({ error: "No inference org" }, { status: 404 });
  if (org.role !== "owner" && org.role !== "admin") {
    return NextResponse.json({ error: "Owner/admin only" }, { status: 403 });
  }

  // Synthetic event — same shape as a real finetune.succeeded payload so
  // the customer's receiver code can test against it without specials.
  await emitInferenceEvent({
    orgId: org.org_id,
    event: "finetune.succeeded",
    resourceId: "test_" + Math.random().toString(36).slice(2, 10),
    title: "Test notification",
    summary: "This is a synthetic event from /api/inference/notifications/test.",
    details: [
      { label: "Job", value: "test-job" },
      { label: "Base model", value: "microsoft/phi-4" },
      { label: "Runtime", value: "0 min" },
      { label: "Cost", value: "$0.00" },
    ],
    dashboardPath: "/dashboard/services/inference/notifications",
    actionLabel: "Open notifications",
    userId: auth.user!.id, // in-app goes to the user who clicked Test
  });

  return NextResponse.json({ success: true });
}
