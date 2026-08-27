/**
 * GitLab webhook receiver.
 *
 * Records a queued deployment and returns; `scripts/v2/build-worker.ts` builds
 * it. Same reasoning as the GitHub receiver: a build takes minutes, a webhook
 * gets seconds, and building inline produces timed-out deliveries and duplicate
 * builds of one commit.
 *
 * WHAT THIS ROUTE MAY AND MAY NOT DO. There is no requesting user — GitLab
 * cannot present a session — so it uses the service role. That is legitimate
 * only because the AUTHORIZATION DECISION is not elevated: the token proves the
 * request came from a hook we configured, and the repository identifies the
 * project. This route must never grow a filter taken from the request body to
 * read tenant data on behalf of a caller.
 *
 * THE TOKEN IS WEAKER THAN GITHUB'S SIGNATURE and that is stated at the
 * verification site rather than assumed equivalent — see gitlab/webhook.ts. It
 * authenticates the sender and does not bind to the body.
 */

import { verifyToken, parsePushEvent } from "@/lib/paas/gitlab/webhook";
import { providerConfig } from "@/lib/paas/providers/config";
import { decidePush, matchProject, type ProjectRow } from "@/lib/paas/providers/policy";
import { environments, deployments, db } from "@/lib/paas/db";

export const dynamic = "force-dynamic";

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

export async function POST(req: Request) {
  // RAW BYTES, even though GitLab's check does not cover them. Reading the body
  // this way keeps every receiver identical, so the one place a verifier DOES
  // need the exact bytes cannot be the place someone forgot.
  const raw = Buffer.from(await req.arrayBuffer());

  let secret: string | undefined;
  try {
    secret = providerConfig.gitlab.webhookSecret();
  } catch {
    // Left undefined so verifyToken reports `no-secret` — one refusal path
    // rather than two, and the config throw does not become a 500 that reads
    // like a bug in the payload.
    secret = undefined;
  }

  const verdict = verifyToken(raw, req.headers.get("x-gitlab-token"), secret);
  if (!verdict.ok) {
    if (verdict.reason === "no-secret") {
      // OUR misconfiguration. Loud, because the usual symptom of this going
      // unnoticed is an endpoint that accepts nothing and a customer whose
      // pushes silently stop deploying.
      console.error("[webhook/gitlab] V2_GITLAB_WEBHOOK_SECRET is not configured — refusing all deliveries");
      return json(500, { error: "webhook secret not configured" });
    }
    return json(401, { error: "invalid token" });
  }

  // GitLab sends merge requests, pipelines and issues to the same URL. The
  // header is convenient but is not part of the authenticated material either
  // way, so the payload's own object_kind is what parsePushEvent checks.
  const event = req.headers.get("x-gitlab-event");
  if (event && !/push/i.test(event)) return json(202, { ok: true, ignored: `event ${event}` });

  let payload: unknown;
  try {
    payload = JSON.parse(raw.toString("utf8"));
  } catch {
    return json(400, { error: "body is not JSON" });
  }

  const push = parsePushEvent(payload);
  if (!push) return json(400, { error: "not a usable push event" });

  if (!(await db.reachable())) {
    // 503 so GitLab RETRIES. A 200 here acknowledges a push we never recorded
    // and the deploy is silently lost.
    return json(503, { error: "control plane unreachable" });
  }

  // Scoped by PROVIDER as well as name: `acme/api` on GitLab and on GitHub are
  // different repositories, and a provider-blind lookup would deploy one
  // customer's commit onto another customer's hostname.
  const rows = await db.select<ProjectRow>(
    "projects",
    "select=id,ref,provider,repo_full_name,production_branch&deleted_at=is.null",
  );
  const found = matchProject(rows, "gitlab", push.repoFullName);

  if (!found.project) {
    if (found.ambiguous) {
      // Two live projects claiming one repo on one provider. Something is
      // already wrong; picking either would build a commit onto whichever row
      // sorted first.
      console.error(`[webhook/gitlab] ${push.repoFullName} matches more than one live project — building nothing`);
      return json(409, { error: "repository matches more than one project" });
    }
    return json(202, { ok: true, ignored: `no gitlab project for ${push.repoFullName}` });
  }
  const project = found.project;

  const decision = decidePush(push, project.production_branch);
  if (!decision.deploy) return json(202, { ok: true, ignored: decision.reason });

  // The environment is resolved BEFORE the idempotency check because it is part
  // of the key. Deduping on project+sha alone drops the first push of every
  // branch cut from the production head — same commit, already deployed, so a
  // preview looks like a retry.
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
