import { isIP } from "node:net";
import type { ActorContext, DomainAuditContext } from "@/lib/domain-service/core/types";

function getDomainAuditContextFromRequest(req: Request): DomainAuditContext {
  return {
    ipAddress: getClientIp(req),
    userAgent: req.headers.get("user-agent") || undefined,
    requestId: getRequestId(req),
  };
}

export function createDomainActor(params: {
  req: Request;
  userId: string;
  userEmail?: string;
  userName?: string;
  userRole?: ActorContext["userRole"];
}): ActorContext {
  return {
    userId: params.userId,
    userEmail: params.userEmail,
    userName: params.userName,
    userRole: params.userRole || "user",
    auditContext: getDomainAuditContextFromRequest(params.req),
  };
}

export function resolveIdempotencyKey(req: Request, bodyIdempotencyKey?: string): string | undefined {
  const fromHeader = req.headers.get("idempotency-key")?.trim();
  if (fromHeader) {
    return fromHeader;
  }

  const fromBody = bodyIdempotencyKey?.trim();
  return fromBody ? fromBody : undefined;
}

function getClientIp(req: Request): string | undefined {
  const forwardedFor = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const realIp = req.headers.get("x-real-ip")?.trim();
  const candidate = forwardedFor || realIp;
  if (!candidate) return undefined;

  const withoutPort = /^\d{1,3}(?:\.\d{1,3}){3}:\d+$/.test(candidate)
    ? candidate.split(":")[0]
    : candidate;

  if (isIP(withoutPort)) {
    return withoutPort;
  }

  return undefined;
}

function getRequestId(req: Request): string {
  const requestId = req.headers.get("x-request-id")?.trim();
  if (requestId && isUuid(requestId)) {
    return requestId;
  }

  return crypto.randomUUID();
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
