/**
 * GitHub webhook signature verification.
 *
 * Timing-safe HMAC-SHA256 over the raw body. A mismatch is rejected before any
 * parsing, so a forged payload never reaches the deploy logic.
 */

import { createHmac, timingSafeEqual } from "node:crypto";
import { paasConfig } from "@/lib/paas/config";

/**
 * Verify an `X-Hub-Signature-256` header against the raw request body.
 * Returns true only on an exact, constant-time match.
 */
export function verifyWebhookSignature(rawBody: string, signatureHeader: string | null): boolean {
  if (!signatureHeader || !signatureHeader.startsWith("sha256=")) return false;
  const expected =
    "sha256=" + createHmac("sha256", paasConfig.github.webhookSecret()).update(rawBody).digest("hex");
  const a = Buffer.from(signatureHeader);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export interface PushEvent {
  ref: string;
  after: string;
  repository: { id: number; full_name: string; default_branch: string };
  installation?: { id: number };
  head_commit?: { id: string; message: string; author: { name: string; username?: string } };
  deleted?: boolean;
}

/** Extract the branch name from a push event's ref (`refs/heads/main` -> `main`). */
export function branchFromRef(ref: string): string | null {
  const m = ref.match(/^refs\/heads\/(.+)$/);
  return m ? m[1] : null;
}
