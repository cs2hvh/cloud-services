/**
 * GET    /api/inference/vector/collections/[id] — details + stats
 * DELETE /api/inference/vector/collections/[id]
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { authenticateUserFromHeader } from "@/lib/auth/server-auth";
import { limitByUser } from "@/lib/cooldown/userbased";
import { getActiveOrgForUser } from "@/lib/inference/orgs";
import { auditContextFrom, recordAudit } from "@/lib/inference/audit";
import { closeActiveBilling } from "@/config/billing-flow";
import { BillingCredits } from "@/lib/billing/credits";

function isUuid(s: string): boolean {
  return /^[0-9a-f-]{36}$/i.test(s);
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await authenticateUserFromHeader(request);
  if (!auth.authenticated) return auth.response;
  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: "Invalid collection id" }, { status: 400 });

  const org = await getActiveOrgForUser(auth.user!.id);
  if (!org) return NextResponse.json({ error: "No inference org" }, { status: 404 });

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );

  const { data, error } = await supabase
    .schema("inference")
    .from("vector_collections")
    .select("*")
    .eq("id", id)
    .eq("org_id", org.org_id)
    .maybeSingle();

  if (error || !data) {
    return NextResponse.json({ error: "Collection not found in this org" }, { status: 404 });
  }
  return NextResponse.json({ success: true, data });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await authenticateUserFromHeader(request);
  if (!auth.authenticated) return auth.response;
  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: "Invalid collection id" }, { status: 400 });

  const rl = await limitByUser(auth.user!.id, {
    prefix: "rl:inf-vec-delete",
    limit: 10,
    windowMs: 60_000,
  });
  if (!rl.allowed) return NextResponse.json({ error: "Too Many Requests" }, { status: 429 });

  const org = await getActiveOrgForUser(auth.user!.id);
  if (!org) return NextResponse.json({ error: "No inference org" }, { status: 404 });
  if (org.role !== "owner" && org.role !== "admin") {
    return NextResponse.json(
      { error: "Only org owners and admins can delete collections" },
      { status: 403 }
    );
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );

  // Fetch name for audit before deleting
  const { data: existing } = await supabase
    .schema("inference")
    .from("vector_collections")
    .select("name")
    .eq("id", id)
    .eq("org_id", org.org_id)
    .maybeSingle<{ name: string }>();

  // ON DELETE CASCADE on vector_rows handles row cleanup
  const { error, count } = await supabase
    .schema("inference")
    .from("vector_collections")
    .delete({ count: "exact" })
    .eq("id", id)
    .eq("org_id", org.org_id);

  if (error) {
    console.error("[Inference Vector] delete error:", error);
    return NextResponse.json({ error: "Failed to delete collection" }, { status: 500 });
  }
  if (!count) {
    return NextResponse.json({ error: "Collection not found" }, { status: 404 });
  }

  const ctx = auditContextFrom(request);
  void recordAudit({
    orgId: org.org_id,
    actorUserId: auth.user!.id,
    action: "collection.deleted",
    targetType: "vector_collection",
    targetId: id,
    metadata: { name: existing?.name },
    ipAddress: ctx.ipAddress,
    userAgent: ctx.userAgent,
  });

  // Stop billing: prorate the final partial period and remove the meter row.
  //
  // Still best-effort — a billing hiccup must not fail the delete the customer
  // asked for, and the collection is already gone by this point. But "best
  // effort" was doing real harm: a single `console.warn` on failure meant the
  // meter survived, the customer kept paying for a collection that no longer
  // existed, and nothing anywhere recorded it. On 2026-08-05 that had left 11
  // live meters billing $88/month between them.
  //
  // Three changes, none of which make the delete itself fail:
  //   1. ONE RETRY. Most failures here are transient (a dropped connection to
  //      the billing schema), and a second attempt costs one round trip against
  //      the alternative of charging someone indefinitely.
  //   2. console.ERROR, structured. A warn is filtered out of most log views;
  //      this is a customer being wrongly charged, which is an error.
  //   3. It names the reconciliation. The real backstop is the billing-integrity
  //      check on /dashboard/admin/inference-rag, which compares every meter
  //      against its collection and can close an orphan. Deliberately reconciled
  //      rather than made transactional: the collection and the meter live in
  //      different schemas with different failure modes, and refusing the
  //      customer's delete because billing is briefly down would be worse.
  let billingClosed = false;
  for (let attempt = 1; attempt <= 2 && !billingClosed; attempt++) {
    try {
      const { data: orgRow } = await supabase
        .schema("inference")
        .from("orgs")
        .select("billing_user_id, owner_user_id")
        .eq("id", org.org_id)
        .maybeSingle<{ billing_user_id: string | null; owner_user_id: string | null }>();
      const payerUserId = orgRow?.billing_user_id || orgRow?.owner_user_id || auth.user!.id;
      await closeActiveBilling({
        userId: payerUserId,
        serviceId: id,
        serviceType: "inference_vector",
        closeActive: () => BillingCredits.closeActiveVectorCollection({ serviceId: id }),
      });
      billingClosed = true;
    } catch (billingErr) {
      if (attempt === 2) {
        console.error(
          JSON.stringify({
            level: "error",
            event: "vector_collection.billing_close_failed",
            collection_id: id,
            org_id: org.org_id,
            attempts: attempt,
            message: billingErr instanceof Error ? billingErr.message : String(billingErr),
            consequence: "meter left active — customer is still being charged for a deleted collection",
            remedy: "/dashboard/admin/inference-rag → billing integrity → Stop charge",
          })
        );
      }
    }
  }

  // Told to the caller so a script deleting collections in bulk can notice,
  // rather than having to read server logs it cannot see.
  return NextResponse.json({ success: true, deleted_id: id, billing_closed: billingClosed });
}
