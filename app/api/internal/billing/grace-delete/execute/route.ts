import { NextResponse } from "next/server";
import { z } from "zod";
import { hasValidCronBearerToken } from "@/lib/security/cron-auth";
import { executeGraceDeletion } from "@/lib/billing/grace/deletion-executor";
import { GRACE_SERVICE_TABLES } from "@/lib/billing/grace/constants";

const RequestSchema = z.object({
  service_table: z.enum(GRACE_SERVICE_TABLES),
  service_id: z.string().uuid(),
  user_id: z.string().uuid(),
});

export async function POST(req: Request) {
  if (!hasValidCronBearerToken(req)) {
    return NextResponse.json(
      { error: "UNAUTHORIZED", message: "Invalid or missing authorization" },
      { status: 401 }
    );
  }

  const raw = await req.json().catch(() => null);
  const parsed = RequestSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "BAD_REQUEST", message: parsed.error.issues[0]?.message || "Invalid payload" },
      { status: 400 }
    );
  }

  const result = await executeGraceDeletion({
    serviceTable: parsed.data.service_table,
    serviceId: parsed.data.service_id,
    userId: parsed.data.user_id,
  });

  if (!result.success) {
    return NextResponse.json(
      {
        success: false,
        error: result.message || "Grace deletion failed",
      },
      { status: 500 }
    );
  }

  return NextResponse.json({
    success: true,
    already_deleted: Boolean(result.alreadyDeleted),
    message: result.message || "Grace deletion completed",
    metadata: result.metadata ?? null,
  });
}
