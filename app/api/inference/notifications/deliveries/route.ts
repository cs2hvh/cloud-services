/**
 * GET /api/inference/notifications/deliveries — recent webhook delivery
 * attempts for the active org. Drives the "delivery log" panel on the
 * settings page so customers can debug their own receiver failures
 * without us digging through logs.
 *
 * Bounded to last 50 deliveries.
 */
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { authenticateUser } from "@/lib/auth/server-auth";
import { getActiveOrgForUser } from "@/lib/inference/orgs";

interface DeliveryRow {
  id: string;
  event: string;
  webhook_url: string;
  attempt: number;
  status: string;
  http_status: number | null;
  response_excerpt: string | null;
  created_at: string;
  delivered_at: string | null;
}

export async function GET() {
  const auth = await authenticateUser();
  if (!auth.authenticated) return auth.response;
  const org = await getActiveOrgForUser(auth.user!.id);
  if (!org) return NextResponse.json({ error: "No inference org" }, { status: 404 });

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );

  const { data, error } = await supabase
    .schema("inference")
    .from("webhook_deliveries")
    .select("id, event, webhook_url, attempt, status, http_status, response_excerpt, created_at, delivered_at")
    .eq("org_id", org.org_id)
    .order("created_at", { ascending: false })
    .limit(50)
    .returns<DeliveryRow[]>();

  if (error) {
    console.error("[notifications.deliveries] list error:", error);
    return NextResponse.json({ error: "Failed to list deliveries" }, { status: 500 });
  }

  return NextResponse.json({ deliveries: data ?? [] });
}
