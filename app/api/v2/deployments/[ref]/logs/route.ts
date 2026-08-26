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

/** Cap what a single response can return; a runaway build can write a lot. */
const MAX_BYTES = 2 * 1024 * 1024;

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

  const full = body.toString("utf8");
  const truncated = body.byteLength > MAX_BYTES;
  // Keep the TAIL when truncating: the failure is at the end of a build log,
  // not the beginning.
  const text = truncated ? full.slice(-MAX_BYTES) : full;

  const asText = new URL(request.url).searchParams.get("format") === "text";
  if (asText) {
    return new Response(text, {
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
    log: text,
    bytes: body.byteLength,
    truncated,
    ...(truncated
      ? { note: `Showing the last ${MAX_BYTES} bytes of ${body.byteLength}.` }
      : {}),
  });
}
