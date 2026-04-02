/**
 * VNC Token — short-lived HMAC-signed tokens for VNC WebSocket proxy auth.
 *
 * Token flow:
 * 1. Console API route authenticates user, gets VNC ticket from Proxmox
 * 2. Signs a token containing connection details (host, port, ticket, etc.)
 * 3. Client connects to /ws/vnc?token=... with the signed token
 * 4. WS proxy validates token, connects to Proxmox, relays traffic
 */
import { createHmac, randomBytes } from 'crypto';

/** Resolve secret lazily so env vars loaded by Next.js are available */
function getSecret(): string {
  const secret = process.env.VNC_TOKEN_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) {
    throw new Error(
      'VNC_TOKEN_SECRET or SUPABASE_SERVICE_ROLE_KEY must be set — refusing to use insecure fallback'
    );
  }
  return secret;
}

export interface VncTokenPayload {
  /** Proxmox host URL (e.g. https://10.0.0.1:8006) */
  proxmoxUrl: string;
  /** Allow insecure TLS to Proxmox */
  allowInsecureTls: boolean;
  /** Proxmox node name */
  node: string;
  /** VM ID */
  vmid: number;
  /** VNC WebSocket port from vncproxy call */
  vncPort: number;
  /** VNC authentication ticket */
  vncTicket: string;
  /** PVE auth cookie ticket (for WebSocket auth) */
  pveTicket: string;
  /** User ID for audit */
  userId: string;
  /** Nonce for uniqueness */
  nonce: string;
  /** Expiry (unix seconds) */
  exp: number;
}

/**
 * Create a signed VNC token (default TTL: 5 minutes).
 */
export function createVncToken(
  data: Omit<VncTokenPayload, 'nonce' | 'exp'>,
  ttlSeconds = 300
): string {
  const payload: VncTokenPayload = {
    ...data,
    nonce: randomBytes(8).toString('hex'),
    exp: Math.floor(Date.now() / 1000) + ttlSeconds,
  };
  const payloadStr = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = createHmac('sha256', getSecret()).update(payloadStr).digest('base64url');
  return `${payloadStr}.${sig}`;
}

/**
 * Validate and decode a VNC token. Returns null if invalid or expired.
 */
export function validateVncToken(token: string): VncTokenPayload | null {
  const parts = token.split('.');
  if (parts.length !== 2) return null;

  const [payloadStr, sig] = parts;
  const expectedSig = createHmac('sha256', getSecret()).update(payloadStr).digest('base64url');

  // Constant-time comparison
  if (sig.length !== expectedSig.length) return null;
  let diff = 0;
  for (let i = 0; i < sig.length; i++) {
    diff |= sig.charCodeAt(i) ^ expectedSig.charCodeAt(i);
  }
  if (diff !== 0) return null;

  try {
    const payload: VncTokenPayload = JSON.parse(
      Buffer.from(payloadStr, 'base64url').toString()
    );
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}
