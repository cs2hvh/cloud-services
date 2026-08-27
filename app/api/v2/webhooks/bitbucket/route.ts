/**
 * Bitbucket webhook receiver.
 *
 * Records a queued deployment and returns; the build worker builds it. Same
 * reasoning as the other two receivers — a build takes minutes and a webhook
 * gets seconds.
 *
 * Service role, and legitimate for the same reason: the signature proves the
 * request came from a hook we configured and the repository identifies the
 * project. No filter from the request body ever reads tenant data on behalf of
 * a caller.
 *
 * THE HEADER IS `X-Hub-Signature`, WITHOUT `-256`, despite the algorithm being
 * SHA-256. GitHub's is `X-Hub-Signature-256`. Reading the wrong one here
 * refuses every legitimate push, which is loud and safe; reading this one on
 * GitHub's route would make every GitHub push unverifiable, where the tempting
 * fix is to stop verifying.
 */

import { verifySignature, parsePushEvent, BITBUCKET_SIGNATURE_HEADER } from "@/lib/paas/bitbucket/webhook";
import { providerConfig } from "@/lib/paas/providers/config";
import { decidePush } from "@/lib/paas/providers/policy";
import { resolveRepoTarget } from "@/lib/paas/repo-target";
import { projects, environments, deployments, db } from "@/lib/paas/db";

export const dynamic = "force-dynamic";

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

export async function POST(req: Request) {
  // RAW BYTES. Parsing first and re-serialising changes whitespace and breaks
  // the digest, and the usual "fix" for that is to stop verifying.
  const raw = Buffer.from(await req.arrayBuffer());

  let secret: string | undefined;
  try {
    secret = providerConfig.bitbucket.webhookSecret();
  } catch {
    secret = undefined;
  }

  const verdict = verifySignature(raw, req.headers.get(BITBUCKET_SIGNATURE_HEADER), secret);
  if (!verdict.ok) {
    if (verdict.reason === "no-secret") {
      console.error("[webhook/bitbucket] V2_BITBUCKET_WEBHOOK_SECRET is not configured — refusing all deliveries");
      return json(500, { error: "webhook secret not configured" });
    }
    // `no-signature` lands here too, and deliberately: a hook configured
    // WITHOUT a secret sends no header at all, which is indistinguishable from
    // someone stripping it. Both refuse.
    return json(401, { error: "invalid signature" });
  }

  const eventKey = req.headers.get("x-event-key");
  if (eventKey && eventKey !== "repo:push") return json(202, { ok: true, ignored: `event ${eventKey}` });

  let payload: unknown;
  try {
    payload = JSON.parse(raw.toString("utf8"));
  } catch {
    return json(400, { error: "body is not JSON" });
  }

  const push = parsePushEvent(payload);
  if (!push) return json(400, { error: "not a usable push event" });

  if (push.additionalChanges > 0) {
    // One Bitbucket delivery can move several branches. Only the first is
    // built, and saying so beats a silent partial deploy that looks complete.
    console.warn(
      `[webhook/bitbucket] ${push.repoFullName}: ${push.additionalChanges} further ref change(s) in this delivery were not built`,
    );
  }

  if (!(await db.reachable())) {
    // 503 so Bitbucket RETRIES rather than us acknowledging a push we never
    // recorded.
    return json(503, { error: "control plane unreachable" });
  }

  const target = resolveRepoTarget(
    await projects.matchingRepo("bitbucket", push.repoFullName),
    push.repoFullName,
    "bitbucket",
  );

  if (target.kind === "none") return json(202, { ok: true, ignored: target.reason });
  if (target.kind === "ambiguous") {
    // 202, not 5xx — a retry cannot resolve data we made ambiguous ourselves.
    console.error(`[webhook/bitbucket] ${target.reason} — building nothing (${target.refs.join(", ")})`);
    return json(202, { ok: false, ignored: target.reason, refs: target.refs });
  }
  const project = target.project;

  const decision = decidePush(push, project.production_branch);
  if (!decision.deploy) return json(202, { ok: true, ignored: decision.reason });

  const env =
    decision.kind === "production"
      ? (await environments.production(project.id)) ??
        (await environments.create({ projectId: project.id, kind: "production", name: "production" }))
      : await environments.forBranch(project.id, decision.branch);

  const existing = await deployments.byEnvironmentAndSha(env.id, push.sha);
  if (existing) {
    return json(200, { ok: true, deployment: existing.ref, note: "already recorded for this commit" });
  }

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
