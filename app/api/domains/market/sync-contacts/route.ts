import { timingSafeEqual, createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { getDomainMarketplaceService } from "@/lib/domain-service/marketplace";
import { logError } from "@/lib/api/error-sanitizer";
import { createServiceClient } from "@/lib/supabase/server";

/**
 * POST /api/domains/market/sync-contacts
 * Reconciliation job — retries setRegistrantContact for completed domain purchases
 * where the initial async call failed or was skipped (registrant_email IS NULL).
 *
 * Called by the cron worker every hour. Protected by CRON_SECRET.
 */
export async function POST(req: Request) {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    return NextResponse.json(
      { error: "INTERNAL_ERROR", message: "Cron secret not configured" },
      { status: 500 }
    );
  }

  const token = authHeader?.replace(/^Bearer\s+/i, "").trim();
  if (!token || !safeCompare(token, cronSecret)) {
    return NextResponse.json(
      { error: "UNAUTHORIZED", message: "Invalid or missing authorization" },
      { status: 401 }
    );
  }

  try {
    const body = await req.json().catch(() => ({}));
    const limit = typeof body.limit === "number" ? Math.min(body.limit, 50) : 20;

    const service = getDomainMarketplaceService();
    const supabase = await createServiceClient();

    const result = await service.reconcileRegistrantContacts({
      limit,
      lookupUser: async (userId: string) => {
        const { data } = await supabase.auth.admin.getUserById(userId);
        const user = data?.user;
        if (!user?.email) return null;
        const meta = (user.user_metadata ?? {}) as Record<string, string>;
        // Try common name fields; fall back to splitting the email prefix
        const fullName = (
          meta.full_name || meta.name || meta.display_name || meta.username || ""
        ).trim();
        const [rawFirst, ...rest] = fullName
          ? fullName.split(" ")
          : user.email.split("@")[0].replace(/[._-]+/g, " ").split(" ");
        const firstName = rawFirst || undefined;
        const lastName = rest.join(" ") || undefined;
        return { email: user.email, firstName, lastName };
      },
    });

    return NextResponse.json({
      data: result,
      message: `Contact sync: ${result.processed} synced, ${result.failed} failed, ${result.skipped} skipped`,
      ...(result.failures?.length ? { failures: result.failures } : {}),
    });
  } catch (error: unknown) {
    logError("domains/market/sync-contacts", error);
    return NextResponse.json(
      { error: "INTERNAL_ERROR", message: "Contact sync reconciliation failed" },
      { status: 500 }
    );
  }
}

function safeCompare(a: string, b: string): boolean {
  try {
    // Hash both sides to a fixed-length digest before comparing. This eliminates
    // length-based timing leaks even when the two secrets differ in byte length.
    const hashA = createHash("sha256").update(a).digest();
    const hashB = createHash("sha256").update(b).digest();
    return timingSafeEqual(hashA, hashB);
  } catch {
    return false;
  }
}
