/**
 * Inference management middleware.
 *
 * Wraps /api/inference/* routes with the same three-step pipeline the
 * fat routes were doing inline:
 *   1. Auth          — cookie or Bearer token (authenticateUserFromHeader)
 *   2. Rate limit    — per-user, per-operation, same limitByUser used everywhere
 *   3. Org resolve   — getOrBootstrapOrgForUser, called once, injected into ctx
 *
 * Auth accepts both cookies (dashboard) and Bearer tokens (API / curl).
 * The inference gateway (api.ahurasense.com) has its own auth on ahu_ keys —
 * that is separate and unchanged.
 *
 * Usage:
 *   export const GET = withInferenceAuth("keys-list", { limit: 30 }, async (_req, ctx) => {
 *     const result = await InferenceApiKeyService.list(ctx.orgId);
 *     ...
 *   });
 */
import { NextRequest, NextResponse } from "next/server";
import { authenticateUserFromHeader } from "@/lib/auth/server-auth";
import { limitByUser } from "@/lib/cooldown/userbased";
import { getActiveOrgForUser, getOrBootstrapOrgForUser } from "@/lib/inference/orgs";

// Resolved context injected into every handler
export interface InferenceAuthContext {
  userId: string;
  email: string;
  orgId: string;
  orgSlug: string;
  orgName: string;
  orgRole: "owner" | "admin" | "developer" | "viewer";
}

type RouteContext = { params: Promise<{ [key: string]: string | string[] }> };

type InferenceHandler = (
  req: NextRequest,
  ctx: InferenceAuthContext,
  routeCtx: RouteContext
) => Promise<NextResponse>;

interface RateLimitOptions {
  limit: number;
  windowMs?: number;
  bootstrapOrg?: boolean;
}

/**
 * @param operation  Rate-limit key suffix, e.g. "keys-list". Keep it matching
 *                   the existing `rl:inf-<operation>` keys so live counters
 *                   aren't silently reset on deploy.
 * @param rlOptions  { limit, windowMs } — per-operation, same values as the
 *                   original inline limitByUser calls.
 * @param handler    Thin route body — receives a fully-resolved ctx.
 */
export function withInferenceAuth(
  operation: string,
  rlOptions: RateLimitOptions,
  handler: InferenceHandler
) {
  const { limit, windowMs = 60_000, bootstrapOrg = false } = rlOptions;

  return async (req: NextRequest, routeCtx: RouteContext): Promise<NextResponse> => {
    // 1. Auth — cookie or Bearer token
    const auth = await authenticateUserFromHeader(req);
    if (!auth.authenticated) return auth.response;

    const userId = auth.user!.id;
    const email = auth.user!.email ?? "";

    // 2. Rate limit — prefix matches original `rl:inf-<operation>` keys
    const rl = await limitByUser(userId, {
      prefix: `rl:inf-${operation}`,
      limit,
      windowMs,
    });
    if (!rl.allowed) {
      return NextResponse.json({ error: "Too Many Requests" }, { status: 429 });
    }

    // 3. Org resolve — preserve each route's previous active/bootstrap behavior
    let org: Awaited<ReturnType<typeof getOrBootstrapOrgForUser>> | null;
    try {
      org = bootstrapOrg
        ? await getOrBootstrapOrgForUser(userId, email)
        : await getActiveOrgForUser(userId);
    } catch (err) {
      console.error(`[inf/${operation}] org resolution failed:`, err);
      return NextResponse.json(
        { error: err instanceof Error ? err.message : "Org resolution failed" },
        { status: 500 }
      );
    }
    if (!org) {
      return NextResponse.json({ error: "No inference org" }, { status: 404 });
    }

    const ctx: InferenceAuthContext = {
      userId,
      email,
      orgId: org.org_id,
      orgSlug: org.org_slug,
      orgName: org.org_name,
      orgRole: org.role as InferenceAuthContext["orgRole"],
    };

    try {
      return await handler(req, ctx, routeCtx);
    } catch (err) {
      console.error(`[inf/${operation}]`, err);
      return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
  };
}
