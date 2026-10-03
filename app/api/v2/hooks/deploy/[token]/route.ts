/**
 * POST /api/v2/hooks/deploy/[token] — a deploy hook.
 *
 * A secret URL that deploys an app's production branch when POSTed. It is how a
 * customer's CI deploys only after their own tests pass, which a plain push
 * cannot express — the push has already happened by the time the tests run.
 *
 * THE TOKEN IS THE AUTHENTICATION, and it identifies the project. Nothing taken
 * from the request body or query string chooses what is deployed; the body is
 * not read at all. That is why this route may use the service role and is on
 * the allowlist in lib/paas/boundary.test.ts beside the git webhooks, which
 * have exactly the same shape.
 *
 * WHY POST ONLY. A GET-triggered deploy fires whenever anything fetches the
 * URL: a chat app unfurling a pasted link, a browser prefetching, a crawler.
 * Each of those would lease a build machine.
 *
 * WHAT A LEAKED URL CAN DO, bounded deliberately:
 *   - deploy the production branch that is already configured, and nothing else
 *   - at most one waiting build per app — repeat calls coalesce onto it
 *   - at most HOOK_LIMIT accepted triggers per hook per hour
 * It cannot read anything, change settings, or choose a branch.
 *
 * Unknown, malformed and revoked tokens all receive the same 404, so the
 * endpoint confirms nothing about which hooks exist.
 */

import { acceptQueuedDeployment } from "@/lib/paas/deploy.ts";
import { deployHooks, deployments, environments, projects, teamMembers, db } from "@/lib/paas/db";
import { hashHookToken, isWellFormedHookToken } from "@/lib/paas/deploy-hooks";
import { limitByUser } from "@/lib/cooldown/userbased";
import { apiError, json } from "../../../_lib/http";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ token: string }> };

/** Accepted triggers per hook per hour. Generous for CI, tight for a loop. */
const HOOK_LIMIT = 30;
/** Lookups per client address per minute, valid or not — protects the database. */
const IP_LIMIT = 60;

const NOT_FOUND = () => apiError("not_found", "Deploy hook not found.", 404);

function rateLimited(retryAfterSec: number) {
  return new Response(
    JSON.stringify({
      error: {
        code: "rate_limited",
        message: "This deploy hook has been called too often. Try again later.",
        retry_after: retryAfterSec,
      },
    }),
    {
      status: 429,
      headers: { "content-type": "application/json", "Retry-After": String(retryAfterSec) },
    },
  );
}

/**
 * Rate limit, failing OPEN.
 *
 * The limiter is Redis. If Redis is unreachable, refusing every hook call would
 * stop every customer's CI from deploying because of an outage in a component
 * that exists only to bound abuse. Failing open is safe HERE because the real
 * cost bound does not depend on Redis: repeated calls coalesce onto one waiting
 * build per app, enforced by the database.
 */
async function limit(key: string, opts: { prefix: string; limit: number; windowMs: number }) {
  try {
    return await limitByUser(key, opts);
  } catch (err) {
    console.error(`[v2/hooks] rate limiter unavailable (${opts.prefix}); allowing:`, err);
    return { allowed: true as const, remaining: 0 };
  }
}

function clientAddress(req: Request): string {
  return (
    req.headers.get("cf-connecting-ip") ??
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "unknown"
  );
}

export async function GET() {
  return apiError(
    "invalid_request",
    "Deploy hooks are triggered with POST. A GET would deploy every time a link preview or crawler fetched the URL.",
    405,
  );
}

export async function POST(req: Request, { params }: Params) {
  const { token } = await params;

  // Shape first, so random traffic costs no query. Same 404 as a real miss.
  if (!isWellFormedHookToken(token)) return NOT_FOUND();

  const byIp = await limit(clientAddress(req), { prefix: "hook:ip", limit: IP_LIMIT, windowMs: 60_000 });
  if (!byIp.allowed) return rateLimited(byIp.retryAfterSec);

  try {
    const hook = await deployHooks.byTokenHash(hashHookToken(token));
    if (!hook) return NOT_FOUND();

    const byHook = await limit(hook.ref, { prefix: "hook:fire", limit: HOOK_LIMIT, windowMs: 3_600_000 });
    if (!byHook.allowed) return rateLimited(byHook.retryAfterSec);

    const project = await projects.byId(hook.project_id);
    if (!project || project.deleted_at) return NOT_FOUND();

    // A hook dies with its creator's access. Revoked rather than merely refused,
    // so the dashboard shows the truth instead of an active hook that fails.
    if (!(await teamMembers.isMember(project.team_id, hook.created_by))) {
      await db
        .update("deploy_hooks", `id=eq.${hook.id}`, { revoked_at: new Date().toISOString() })
        .catch(() => {});
      return apiError(
        "conflict",
        "This deploy hook was created by someone who is no longer on the team, so it has been revoked. Create a new one in the app's settings.",
        410,
      );
    }

    const env = await environments.production(project.id);
    if (!env) {
      return apiError("conflict", "This app has no production environment, so there is nowhere to deploy.", 409);
    }

    // Coalesce. A build already waiting will pick up the branch head anyway.
    const waiting = await deployments.queuedForEnvironment(env.id);
    if (waiting) {
      await deployHooks.touch(hook.id);
      return json({ deployment: { ref: waiting.ref }, status: "already_queued" }, 202);
    }

    const created = await deployments.create({
      projectId: project.id,
      environmentId: env.id,
      trigger: "deploy_hook",
      gitSha: null, // resolved by the build, never invented here
      gitRef: project.production_branch,
      createdBy: hook.created_by,
    });

    await deployHooks.touch(hook.id);
    console.log(`[v2/hooks] ${hook.ref} queued ${created.ref} for ${project.ref}`);

    let accepted: Awaited<ReturnType<typeof acceptQueuedDeployment>>;
    try {
      accepted = await acceptQueuedDeployment(created.ref);
    } catch (err) {
      // The row is durable, so this is a queued deployment nobody has picked up
      // yet — visible and not lost.
      console.error("[v2/hooks] handoff failed:", err);
      return json({ deployment: { ref: created.ref }, status: "queued" }, 202);
    }

    return json(
      { deployment: { ref: created.ref }, status: accepted.accepted ? "queued" : "queued_not_accepted" },
      202,
    );
  } catch (err) {
    console.error("[v2/hooks] trigger failed:", err);
    return apiError("internal", "Could not start the deployment. Try again shortly.", 500);
  }
}
