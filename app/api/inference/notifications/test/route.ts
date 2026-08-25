/**
 * POST /api/inference/notifications/test — fire a synthetic event at the
 * org's configured channels. Lets the customer verify their webhook
 * receiver / email recipients without waiting for a real FT to complete.
 *
 * Owner/admin only. Rate-limited (5 / min) so a customer can't spam
 * their own receiver and get blacklisted by their own infra.
 *
 * Bypasses the events_subscribed filter — the whole point of a test is
 * "do my channels work?", which is independent of which events the org
 * has chosen to be notified about.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { actingUserId, controlPlaneAuth } from "@/lib/inference/control-plane-auth";
import { limitByUser } from "@/lib/cooldown/userbased";
import { emitInferenceEvent } from "@/lib/inference/notifications";

export async function POST(request: NextRequest) {
  void request;
  const authResult = await controlPlaneAuth(request, { session: "cookie", requireOrgKey: true });
  if (!authResult.ok) return authResult.response;
  const auth = authResult.auth;

  const rl = await limitByUser(auth.subject, {
    prefix: "rl:inf-notif-test",
    limit: 5,
    windowMs: 60_000,
  });
  if (!rl.allowed) return NextResponse.json({ error: "Too Many Requests" }, { status: 429 });

  const org = { org_id: auth.orgId, role: auth.orgRole };
  if (auth.via === "session" && org.role !== "owner" && org.role !== "admin") {
    return NextResponse.json({ error: "Owner/admin only" }, { status: 403 });
  }

  // Peek at the org's settings so we can report back which channels
  // will actually receive the test. Saves the customer from wondering
  // why their inbox is empty when they haven't added an email recipient.
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
  const { data: settings } = await supabase
    .schema("inference")
    .from("notification_settings")
    .select("email_recipients, in_app_enabled, webhook_enabled, webhook_url, webhook_secret")
    .eq("org_id", org.org_id)
    .maybeSingle<{
      email_recipients: string[];
      in_app_enabled: boolean;
      webhook_enabled: boolean;
      webhook_url: string | null;
      webhook_secret: string | null;
    }>();

  const channels = {
    in_app: settings?.in_app_enabled !== false,
    email: !!settings?.email_recipients && settings.email_recipients.length > 0,
    webhook: !!(
      settings?.webhook_enabled &&
      settings?.webhook_url &&
      settings?.webhook_secret
    ),
  };

  // Synthetic event — same shape as a real finetune.succeeded payload so
  // the customer's receiver code can test against it without specials.
  await emitInferenceEvent({
    orgId: org.org_id,
    event: "finetune.succeeded",
    resourceId: "test_" + Math.random().toString(36).slice(2, 10),
    title: "Test notification",
    summary: "This is a synthetic event from the notifications test endpoint. If you're reading this, your channel is wired up correctly.",
    details: [
      { label: "Job", value: "test-job" },
      { label: "Base model", value: "microsoft/phi-4" },
      { label: "Runtime", value: "0 min" },
      { label: "Cost", value: "$0.00" },
    ],
    dashboardPath: "/dashboard/services/inference/notifications",
    actionLabel: "Open notifications",
    userId: (await actingUserId(auth))!, // in-app goes to the user who clicked Test
    bypassSubscriptionFilter: true,
  });

  return NextResponse.json({ success: true, channels });
}
