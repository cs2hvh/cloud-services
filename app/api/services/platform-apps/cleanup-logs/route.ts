import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { PlatformAppLogRetentionService } from "@/lib/services/platform-app-log-retention";
import { hasValidCronBearerToken } from "@/lib/security/cron-auth";
import { sanitizeError, logError } from "@/lib/api/error-sanitizer";

const CleanupLogsSchema = z
  .object({
    limit: z.number().int().min(1).max(500).optional(),
    dry_run: z.boolean().optional(),
  })
  .optional();

export async function POST(req: NextRequest) {
  if (!hasValidCronBearerToken(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json().catch(() => undefined);
    const parsed = CleanupLogsSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request body", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const result = await PlatformAppLogRetentionService.cleanupExpiredBuildLogs({
      limit: parsed.data?.limit,
      dryRun: parsed.data?.dry_run,
    });

    return NextResponse.json({
      success: true,
      ...result,
    });
  } catch (error) {
    logError("services/platform-apps/cleanup-logs", error);
    return NextResponse.json({ error: sanitizeError(error) }, { status: 500 });
  }
}
