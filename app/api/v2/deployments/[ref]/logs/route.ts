/**
 * GET /api/v2/deployments/[ref]/logs — the build log for one deployment.
 *
 * The log lives in R2 at r2Keys.buildLog(ref), written by the build VM. Two
 * things matter here.
 *
 * First, authorization comes before the fetch. The R2 key is derived purely
 * from the deployment ref, so anyone who could guess a ref could read another
 * tenant's build output — which routinely contains dependency names, file
 * paths and occasionally a leaked value. The deployment is resolved through
 * RLS first, and only a row the caller can actually see leads to a read.
 *
 * Second, R2 is reached from the server and the bytes are streamed back
 * through this route rather than handing out a presigned URL. A presigned URL
 * outlives the permission check that produced it.
 */

import { getObject, r2Keys } from "@/lib/paas/build/r2.ts";
import {
  sanitizeBuildLog,
  paginate,
  tail,
  alterationNotice,
} from "@/lib/paas/telemetry/build-log.ts";
import { getCaller } from "../../../_lib/auth";
import {
  json,
  unauthenticated,
  notFound,
  apiError,
  fromPostgrestError,
} from "../../../_lib/http";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ ref: string }> };

/** Lines returned when the caller does not ask for a page. */
const DEFAULT_TAIL_LINES = 200;

export async function GET(request: Request, { params }: Params) {
  const caller = await getCaller();
  if (!caller) return unauthenticated();
  const { ref } = await params;

  // Authorize first — see the file header.
  const { data, error } = await caller.db
    .from("deployments")
    .select("ref, state, started_at")
    .eq("ref", ref)
    .maybeSingle();

  if (error) {
    const mapped = fromPostgrestError(error);
    if (mapped) return mapped;
    console.error("[v2/deployments/:ref/logs] lookup failed:", error);
    return apiError("internal", "Could not load the deployment.", 500);
  }
  if (!data) return notFound("Deployment");

  const deployment = data as {
    ref: string;
    state: string;
    started_at: string | null;
  };

  let body: Buffer | null;
  try {
    body = await getObject(r2Keys.buildLog(deployment.ref));
  } catch (err) {
    console.error("[v2/deployments/:ref/logs] R2 read failed:", err);
    return apiError("upstream_error", "Could not read the build log.", 502);
  }

  if (body === null) {
    // Absent is not an error, and the reason differs by state. Saying which
    // avoids the "empty log, no explanation" case that makes a failed build
    // impossible to debug from the UI.
    const pending = deployment.state === "queued" || !deployment.started_at;
    return json({
      ref: deployment.ref,
      state: deployment.state,
      log: null,
      reason: pending
        ? "The build has not started yet, so there is no log."
        : "No build log was stored for this deployment.",
    });
  }

  // Sanitise the WHOLE log, then page. paginate() takes a SanitizedLog rather
  // than a string precisely so this order cannot be reversed: cutting first
  // would let a credential straddling the boundary through, since each half
  // looks innocuous and a slice cannot know which stage it came from.
  const clean = sanitizeBuildLog(body.toString("utf8"));

  const params = new URL(request.url).searchParams;
  const offsetRaw = params.get("offset");
  const page =
    offsetRaw === null
      ? // No page requested: the end, because a build fails at the end.
        tail(clean, DEFAULT_TAIL_LINES)
      : paginate(clean, {
          offset: Number(offsetRaw) || 0,
          // limit is clamped server-side regardless of what is asked for.
          limit: Number(params.get("limit")) || undefined,
        });

  if (params.get("format") === "text") {
    return new Response(page.lines.join("
"), {
      status: 200,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  }

  return json({
    ref: deployment.ref,
    state: deployment.state,
    lines: page.lines,
    offset: page.offset,
    total: page.total,
    hasMore: page.hasMore,
    sourceBytes: body.byteLength,
    altered: clean.altered,
    // Names the CLASS of thing removed, never what was found — "we removed a
    // GitHub token" is itself a hint.
    alterationNotice: alterationNotice(clean),
  });
}
