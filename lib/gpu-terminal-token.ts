/**
 * GPU web-terminal tokens — short-lived HMAC-signed tickets for the SSH
 * WebSocket proxy.
 *
 * Flow:
 *   1. An authenticated API route confirms the caller owns the pod.
 *   2. It signs a ticket naming ONLY the pod id and the user id.
 *   3. The client opens /ws/gpu-terminal?token=… with that ticket.
 *   4. server.ts validates it, then looks up the host, port and private key
 *      itself, and opens the SSH session.
 *
 * DELIBERATE DIFFERENCE FROM lib/vnc-token.ts
 * -------------------------------------------
 * The VNC token embeds the upstream credential (a Proxmox ticket) in its
 * payload, which then travels in a URL query string. That is tolerable for a
 * ticket that dies in seconds, but an SSH private key must never go near a
 * URL: query strings land in server logs, proxy logs, browser history and
 * `Referer` headers.
 *
 * So this ticket is a *reference*, not a credential. It proves "user U asked
 * for pod P, recently". Everything sensitive — the address to dial and the key
 * to dial it with — is resolved server-side, from the database, at connect
 * time. A leaked ticket is useless after 60 seconds and cannot be replayed
 * against a different pod, because the pod id is inside the signature.
 *
 * TTL is 60s rather than the VNC module's 300s: this ticket is redeemed
 * immediately by a WebSocket opened in the same click, so a longer window buys
 * nothing and only widens the replay gap.
 */
import { createHmac, randomBytes, timingSafeEqual } from "crypto";

/** Resolved lazily so Next.js has loaded env by first use. */
function getSecret(): string {
  const secret =
    process.env.VNC_TOKEN_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) {
    throw new Error(
      "VNC_TOKEN_SECRET or SUPABASE_SERVICE_ROLE_KEY must be set — refusing to use insecure fallback"
    );
  }
  return secret;
}

export interface GpuTerminalTokenPayload {
  /** gpu_pods.id — the ONLY thing identifying what to connect to. */
  podId: number;
  /** Owner at mint time. Re-checked against the pod row on redemption. */
  userId: string;
  /** Uniqueness, so two tickets for the same pod never collide. */
  nonce: string;
  /** Expiry, unix seconds. */
  exp: number;
}

export function createGpuTerminalToken(
  data: Omit<GpuTerminalTokenPayload, "nonce" | "exp">,
  ttlSeconds = 60
): string {
  const payload: GpuTerminalTokenPayload = {
    ...data,
    nonce: randomBytes(12).toString("hex"),
    exp: Math.floor(Date.now() / 1000) + ttlSeconds,
  };
  const payloadStr = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = createHmac("sha256", getSecret())
    .update(payloadStr)
    .digest("base64url");
  return `${payloadStr}.${sig}`;
}

/** Validate and decode. Returns null on any tampering, malformation or expiry. */
export function validateGpuTerminalToken(
  token: string
): GpuTerminalTokenPayload | null {
  const parts = token.split(".");
  if (parts.length !== 2) return null;

  const [payloadStr, sig] = parts;
  if (!payloadStr || !sig) return null;

  const expected = createHmac("sha256", getSecret())
    .update(payloadStr)
    .digest("base64url");

  // Constant-time compare. Lengths are checked first because timingSafeEqual
  // throws on a mismatch, and that throw would itself be a timing signal.
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return null;
  if (!timingSafeEqual(a, b)) return null;

  try {
    const payload = JSON.parse(
      Buffer.from(payloadStr, "base64url").toString()
    ) as GpuTerminalTokenPayload;
    if (typeof payload.podId !== "number" || typeof payload.userId !== "string") {
      return null;
    }
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}
