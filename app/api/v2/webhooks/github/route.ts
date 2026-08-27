/**
 * GitHub webhook receiver — the thing that makes `git push` deploy.
 *
 * WHY IT RECORDS INSTEAD OF BUILDING
 *
 * A build takes two to four minutes. GitHub gives a webhook ten seconds before
 * it records a delivery failure, and a serverless route may be torn down the
 * moment it responds. So building inline would produce timed-out deliveries,
 * retried pushes, and duplicate builds of the same commit.
 *
 * This records a queued deployment and returns. `scripts/v2/build-worker.ts`
 * picks it up. That also means a push received while the builder is down is
 * still built when it comes back, instead of being lost with the request.
 *
 * WHAT THIS ROUTE MAY AND MAY NOT DO
 *
 * There is no requesting user here — GitHub cannot present a session — so this
 * uses the service role. Under the rule we hold across all three lanes, that is
 * only legitimate because the AUTHORIZATION DECISION is not being elevated:
 * the signature proves the request came from GitHub, and the repository
 * identifies the project. This route must never grow a filter taken from the
 * request body to read tenant data on behalf of a caller.
 */

import { verifyWebhookSignature, parsePushEvent, shouldDeploy } from "@/lib/paas/github/webhook";
import { projects, environments, deployments, db } from "@/lib/paas/db";
import { resolveRepoTarget } from "@/lib/paas/repo-target";

export const dynamic = "force-dynamic";

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export async function POST(req: Request) {
  // RAW BYTES. Parsing first and re-serialising changes whitespace and breaks
  // the digest — and the usual "fix" for that is to stop verifying.
  const raw = Buffer.from(await req.arrayBuffer());

  const verdict = verifyWebhookSignature(raw, req.headers.get("x-hub-signature-256"));
  if (!verdict.ok) {
    // A missing secret is OUR misconfiguration and must be loud; a mismatch is
    // someone probing a public endpoint and must not be. Both refuse, but they
    // are different operational events.
    if (verdict.reason === "no-secret") {
      console.error("[webhook] GITHUB_WEBHOOK_SECRET is not configured — refusing all deliveries");
      return json(500, { error: "webhook secret not configured" });
    }
    return json(401, { error: "invalid signature" });
  }

  const event = req.headers.get("x-github-event");
  if (event === "ping") return json(200, { ok: true, pong: true });
  if (event !== "push") return json(202, { ok: true, ignored: `event ${event}` });

  let payload: unknown;
  try {
    payload = JSON.parse(raw.toString("utf8"));
  } catch {
    return json(400, { error: "body is not JSON" });
  }

  const push = parsePushEvent(payload);
  if (!push) return json(400, { error: "not a usable push event" });

  if (!(await db.reachable())) {
    // 503 so GitHub RETRIES. Returning 200 here would acknowledge a push we
    // never recorded, and the deploy would be silently lost.
    return json(503, { error: "control plane unreachable" });
  }

  // Provider-scoped, and a LIST. Two teams may each connect the same public
  // repository; the old lookup took whichever row came back first and built
  // one customer’s commit onto the other’s hostname — succeeding, silently.
  const target = resolveRepoTarget(
    await projects.matchingRepo("github", push.repoFullName),
    push.repoFullName,
    "github",
  );

  if (target.kind === "none") {
    return json(202, { ok: true, ignored: target.reason });
  }

  if (target.kind === "ambiguous") {
    // 202, NOT 5xx. A retry cannot resolve this — the ambiguity is in our own
    // data, so GitHub would redeliver against it until the delivery expired.
    // Loud in the log because the customer just sees a push that did nothing.
    console.error("[v2/webhooks/github] refusing ambiguous repo:", target.reason, target.refs);
    return json(202, { ok: true, ignored: target.reason, projects: target.refs });
  }

  const project = target.project;

  const decision = shouldDeploy(push, project.production_branch);
  if (!decision.deploy) {
    return json(202, { ok: true, ignored: decision.reason });
  }

  // The environment is resolved BEFORE the idempotency check, because it is part
  // of the key. Deduping on project+sha alone would drop the first push of every
  // branch cut from the production head — same commit, already deployed to
  // production, so a preview would look like a retry. See
  // deployments.byEnvironmentAndSha.
  const env =
    decision.kind === "production"
      ? (await environments.production(project.id)) ??
        (await environments.create({ projectId: project.id, kind: "production", name: "production" }))
      : await environments.forBranch(project.id, decision.branch);

  // Idempotency. GitHub retries deliveries, and a retry must not build the same
  // commit twice — that is double spend and two racing deploys of one commit.
  const existing = await deployments.byEnvironmentAndSha(env.id, push.sha);
  if (existing) {
    return json(200, { ok: true, deployment: existing.ref, note: "already recorded for this commit" });
  }

  // The sha IS known here, unlike a manual deploy — it came from the event.
  const d = await deployments.create({
    projectId: project.id,
    environmentId: env.id,
    trigger: "git_push",
    gitSha: push.sha,
    gitRef: decision.branch,
    gitMessage: push.message,
  });

  return json(202, {
    ok: true,
    deployment: d.ref,
    sha: push.sha.slice(0, 7),
    kind: decision.kind,
    environment: env.ref,
  });
}
