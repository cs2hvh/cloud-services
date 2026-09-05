import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';

/**
 * Signed, ENCRYPTED connection capability for the VNC proxy in server.ts.
 *
 * Until 2026-09-05 the token was a base64url JSON payload plus an HMAC. The
 * signature stopped tampering, but the payload was readable by anyone who saw
 * the URL, and it carried `pveTicket`, the Proxmox API session ticket for the
 * platform's own hypervisor account, plus the VNC ticket, the host URL, node
 * and VM id. A token in a browser address bar, a proxy log or a screenshot
 * was therefore a usable Proxmox credential for the ticket's lifetime.
 *
 * The payload is now AES-256-GCM encrypted under a key derived from the
 * signing secret. GCM authenticates as well as encrypts, so the separate HMAC
 * is gone: a tampered or forged token fails to decrypt. The browser holds an
 * opaque blob it can only hand back to the proxy, which is all it ever needed.
 *
 * Format: `v2.<iv>.<ciphertext>.<tag>`, each part base64url. Tokens of the
 * previous format are not accepted; they lived five minutes, and the deploy
 * that ships this restarts the process that would have honoured them.
 */

function getSecret(): string {
  const secret = process.env.VNC_TOKEN_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) {
    throw new Error(
      'VNC_TOKEN_SECRET or SUPABASE_SERVICE_ROLE_KEY must be set — refusing to use insecure fallback'
    );
  }
  return secret;
}

/** A 32-byte key for AES-256, derived so the raw secret is never used directly. */
function deriveKey(): Buffer {
  return createHash('sha256').update(`vnc-token:${getSecret()}`).digest();
}

export interface VncTokenPayload {
  proxmoxUrl: string;
  allowInsecureTls: boolean;
  node: string;
  vmid: number;
  vncPort: number;
  vncTicket: string;
  pveTicket: string;
  userId: string;
  nonce: string;
  exp: number;
}

export function createVncToken(
  data: Omit<VncTokenPayload, 'nonce' | 'exp'>,
  ttlSeconds = 300
): string {
  const payload: VncTokenPayload = {
    ...data,
    nonce: randomBytes(8).toString('hex'),
    exp: Math.floor(Date.now() / 1000) + ttlSeconds,
  };
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', deriveKey(), iv);
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(payload), 'utf8'),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return `v2.${iv.toString('base64url')}.${ciphertext.toString('base64url')}.${tag.toString('base64url')}`;
}

export function validateVncToken(token: string): VncTokenPayload | null {
  const parts = token.split('.');
  if (parts.length !== 4 || parts[0] !== 'v2') return null;
  const [, ivStr, ctStr, tagStr] = parts;
  try {
    const iv = Buffer.from(ivStr, 'base64url');
    const tag = Buffer.from(tagStr, 'base64url');
    if (iv.length !== 12 || tag.length !== 16) return null;
    const decipher = createDecipheriv('aes-256-gcm', deriveKey(), iv);
    decipher.setAuthTag(tag);
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(ctStr, 'base64url')),
      decipher.final(),
    ]).toString('utf8');
    const payload = JSON.parse(plaintext) as VncTokenPayload;
    if (typeof payload.exp !== 'number' || payload.exp < Math.floor(Date.now() / 1000)) return null;
    if (typeof payload.vmid !== 'number' || typeof payload.node !== 'string') return null;
    return payload;
  } catch {
    // Wrong key, tampered ciphertext, or not our token: all the same answer.
    return null;
  }
}
