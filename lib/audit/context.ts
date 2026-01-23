// ============================================
// REQUEST CONTEXT EXTRACTION
// Captures IP address, user agent, and request ID
// ============================================

import { NextRequest } from "next/server";
import type { AuditContext } from "./types";

/**
 * Extract audit context from Next.js request
 * @param req - Next.js request object
 * @returns Audit context with IP, user agent, and request ID
 */
export function getAuditContext(req: NextRequest): AuditContext {
  return {
    ipAddress: getClientIp(req),
    userAgent: req.headers.get('user-agent') || 'unknown',
    requestId: req.headers.get('x-request-id') || crypto.randomUUID(),
  };
}

/**
 * Get client IP address from request headers
 * Handles proxies and load balancers
 */
function getClientIp(req: NextRequest): string {
  // Check x-forwarded-for (most common with proxies)
  const forwardedFor = req.headers.get('x-forwarded-for');
  if (forwardedFor) {
    // Take the first IP in the chain
    return forwardedFor.split(',')[0].trim();
  }

  // Check x-real-ip (some proxies use this)
  const realIp = req.headers.get('x-real-ip');
  if (realIp) {
    return realIp.trim();
  }

  // Fallback to unknown
  return 'unknown';
}

/**
 * Create context from primitive values (for non-HTTP contexts)
 */
export function createAuditContext(
  ipAddress?: string,
  userAgent?: string,
  requestId?: string
): AuditContext {
  return {
    ipAddress: ipAddress || 'system',
    userAgent: userAgent || 'system',
    requestId: requestId || crypto.randomUUID(),
  };
}
