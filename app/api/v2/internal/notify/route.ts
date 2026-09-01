/**
 * POST /api/v2/internal/notify
 *
 * Lifecycle email for one app, sent on behalf of a caller that cannot send it
 * itself.
 *
 * WHY AN ENDPOINT RATHER THAN A DIRECT CALL. The build worker is the only thing
 * that knows a deployment finished, and it runs outside Next entirely — plain
 * `node --experimental-strip-types`, which resolves no `@/` path aliases and
 * does not transform JSX. The email service is built from both. So the worker
 * cannot import it, and duplicating the templates for a second runtime is how
 * two versions of the same email start disagreeing.
 *
 * Same shape as /api/inference/internal/spend-alert, which exists for the same
 * reason and shares the secret.
 *
 * Auth: header `X-Ahura-Internal-Token: <BATCH_PROCESSOR_TOKEN>`.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { notifyAppEvent } from "@/lib/paas/notifications";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const bodySchema = z.object({
  projectRef: z.string().regex(/^prj-[0-9a-f]{12}$/),
  event: z.enum(["created", "deployed", "failed", "deleted"]),
  hostname: z.string().max(253).optional().nullable(),
  reason: z.string().max(2000).optional().nullable(),
  commit: z.string().max(64).optional().nullable(),
});

export async function POST(request: NextRequest) {
  const token = request.headers.get("x-ahura-internal-token");
  const expected = process.env.BATCH_PROCESSOR_TOKEN || process.env.INTERNAL_CRON_TOKEN;
  if (!expected || !token || token !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation error", details: parsed.error.issues },
      { status: 400 },
    );
  }

  // notifyAppEvent never throws, so a failed send returns 200 rather than
  // inviting the worker to retry an email and deliver it twice. Whether the
  // mail left is in this server's logs, not in the caller's control flow.
  await notifyAppEvent(parsed.data);
  return NextResponse.json({ ok: true });
}
