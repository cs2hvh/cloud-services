import { timingSafeEqual, createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { getDomainTransferService } from "@/lib/domain-service/transfer";
import { logError } from "@/lib/api/error-sanitizer";

/**
 * POST /api/domains/transfer/poll
 * Poll Name.com for status updates on pending transfers.
 *
 * Protected by a shared secret — called by the cron worker, not by end users.
 */
export async function POST(req: Request) {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET || process.env.TRANSFER_POLL_SECRET;

  if (!cronSecret) {
    return NextResponse.json(
      { error: "INTERNAL_ERROR", message: "Polling secret not configured" },
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
    const limit = typeof body.limit === "number" ? body.limit : 50;

    // Only poll transfers that haven't been polled in the last 10 minutes
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();

    const service = getDomainTransferService();
    const result = await service.pollPendingTransfers({
      limit,
      staleBefore: tenMinutesAgo,
    });

    return NextResponse.json({
      data: result,
      message: `Polled ${result.polled} transfers: ${result.processed} processed, ${result.errors} errors`,
    });
  } catch (error: unknown) {
    logError("domains/transfer/poll", error);
    return NextResponse.json(
      { error: "INTERNAL_ERROR", message: "Polling failed" },
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
