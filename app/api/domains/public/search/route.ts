import { NextRequest, NextResponse } from "next/server";
import { getDomainMarketplaceService } from "@/lib/domain-service/marketplace";
import { DomainMarketplaceSearchRequestSchema } from "@/lib/domain-service/contracts/schemas";
import { toDashboardDomainErrorResponse } from "@/lib/domain-service/http/dashboard-error-mapper";
import { validateRequest } from "@/lib/middleware/validate-request";
import { redis } from "@/lib/redis";

/**
 * Public domain search endpoint — no authentication required.
 * Uses IP-based rate limiting (stricter than authenticated search).
 */

const IS_DEV = process.env.NODE_ENV === "development";
const WINDOW_MS = 60_000;
const MAX_REQUESTS = IS_DEV ? 30 : 10; // Stricter than authenticated (10/min vs 40/min)

function getClientIp(req: NextRequest): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown"
  );
}

async function limitByIp(
  ip: string
): Promise<{ allowed: true } | { allowed: false; retryAfterSec: number }> {
  try {
    const windowKey = Math.floor(Date.now() / WINDOW_MS);
    const key = `rl:domain-public-search:${ip}:${windowKey}`;

    const count = await redis.incr(key);
    if (count === 1) {
      await redis.expire(key, Math.ceil(WINDOW_MS / 1000));
    }

    if (count > MAX_REQUESTS) {
      const ttl = await redis.ttl(key);
      return { allowed: false, retryAfterSec: Math.max(ttl, 1) };
    }
  } catch (error) {
    // Keep public search available even if Redis is temporarily unavailable.
    console.warn("[Domain Public Search] Rate-limit backend unavailable:", error);
  }

  return { allowed: true };
}

export async function POST(req: NextRequest) {
  try {
    const ip = getClientIp(req);
    const rl = await limitByIp(ip);

    if (!rl.allowed) {
      return NextResponse.json(
        {
          error: "TOO_MANY_REQUESTS",
          message: `Too many searches. Retry after ${rl.retryAfterSec}s`,
        },
        {
          status: 429,
          headers: { "Retry-After": String(rl.retryAfterSec) },
        }
      );
    }

    const body = await req.json();
    const parsed = validateRequest(DomainMarketplaceSearchRequestSchema, body);
    if (!parsed.success) return parsed.response;

    const service = getDomainMarketplaceService();
    const result = await service.search({
      query: parsed.data.query,
      tlds: parsed.data.tlds,
    });

    return NextResponse.json({ data: result });
  } catch (error: unknown) {
    return toDashboardDomainErrorResponse(error);
  }
}
