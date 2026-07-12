import { describe, it, expect } from 'vitest';
import { createHash } from 'crypto';
import { parseSshPublicKey, isSshKeyParseError } from '@/lib/compute/ssh-keys';
import type { ParsedSshKey } from '@/lib/compute/ssh-keys';

/**
 * Build a syntactically valid OpenSSH public-key blob: a sequence of RFC 4251
 * length-prefixed strings, the first of which is the key type. This matches
 * what ssh-keygen encodes into the base64 column of a .pub line.
 */
function buildKeyBlob(declaredType: string, keyMaterial: Buffer): Buffer {
  const typeBuf = Buffer.from(declaredType, 'ascii');
  const typeLen = Buffer.alloc(4);
  typeLen.writeUInt32BE(typeBuf.length, 0);
  const keyLen = Buffer.alloc(4);
  keyLen.writeUInt32BE(keyMaterial.length, 0);
  return Buffer.concat([typeLen, typeBuf, keyLen, keyMaterial]);
}

/** A structurally real ed25519 public key (32-byte point → 51-byte blob). */
function makeEd25519Key(comment?: string): { raw: string; blob: Buffer; b64: string } {
  const blob = buildKeyBlob('ssh-ed25519', Buffer.alloc(32, 0x07));
  const b64 = blob.toString('base64');
  const raw = comment ? `ssh-ed25519 ${b64} ${comment}` : `ssh-ed25519 ${b64}`;
  return { raw, blob, b64 };
}

describe('parseSshPublicKey', () => {
  describe('valid keys', () => {
    it('accepts a valid ed25519 key and reports its type', () => {
      const { raw } = makeEd25519Key('user@host');
      const result = parseSshPublicKey(raw);
      expect(isSshKeyParseError(result)).toBe(false);
      expect((result as ParsedSshKey).keyType).toBe('ssh-ed25519');
    });

    it('produces the standard OpenSSH SHA256 fingerprint format', () => {
      const { raw } = makeEd25519Key('user@host');
      const result = parseSshPublicKey(raw) as ParsedSshKey;
      expect(result.fingerprint).toMatch(/^SHA256:[A-Za-z0-9+/]+$/);
    });

    it('fingerprint is the SHA-256 of the decoded blob, base64 without padding', () => {
      const { raw, blob } = makeEd25519Key();
      const result = parseSshPublicKey(raw) as ParsedSshKey;
      const expected = createHash('sha256').update(blob).digest('base64').replace(/=+$/, '');
      expect(result.fingerprint).toBe(`SHA256:${expected}`);
    });

    it('preserves the comment', () => {
      const { raw } = makeEd25519Key('pankaj@workstation');
      const result = parseSshPublicKey(raw) as ParsedSshKey;
      expect(result.comment).toBe('pankaj@workstation');
      expect(result.publicKey.endsWith(' pankaj@workstation')).toBe(true);
    });

    it('preserves multi-word comments', () => {
      const { raw } = makeEd25519Key('my laptop key');
      const result = parseSshPublicKey(raw) as ParsedSshKey;
      expect(result.comment).toBe('my laptop key');
    });

    it('returns null comment when none is present', () => {
      const { raw, b64 } = makeEd25519Key();
      const result = parseSshPublicKey(raw) as ParsedSshKey;
      expect(result.comment).toBeNull();
      expect(result.publicKey).toBe(`ssh-ed25519 ${b64}`);
    });

    it('normalizes surrounding whitespace and trailing newlines', () => {
      const { raw, b64 } = makeEd25519Key('user@host');
      const result = parseSshPublicKey(`  ${raw}\r\n`) as ParsedSshKey;
      expect(isSshKeyParseError(result)).toBe(false);
      expect(result.publicKey).toBe(`ssh-ed25519 ${b64} user@host`);
    });
  });

  describe('rejections', () => {
    it('rejects a private key paste with a pointed error', () => {
      const result = parseSshPublicKey(
        '-----BEGIN OPENSSH PRIVATE KEY-----\nb3BlbnNzaC1rZXktdjEAAAAA\n-----END OPENSSH PRIVATE KEY-----'
      );
      expect(isSshKeyParseError(result)).toBe(true);
      expect((result as { error: string }).error).toContain('PRIVATE');
    });

    it('rejects key data that is not valid base64', () => {
      const result = parseSshPublicKey('ssh-ed25519 !!!not-base64!!! user@host');
      expect(isSshKeyParseError(result)).toBe(true);
      expect((result as { error: string }).error).toContain('base64');
    });

    it('rejects base64 that only decodes by dropping characters', () => {
      const { b64 } = makeEd25519Key();
      const result = parseSshPublicKey(`ssh-ed25519 ${b64}%%% user@host`);
      expect(isSshKeyParseError(result)).toBe(true);
    });

    it('rejects unsupported key types', () => {
      const blob = buildKeyBlob('ssh-dss', Buffer.alloc(32, 1));
      const result = parseSshPublicKey(`ssh-dss ${blob.toString('base64')}`);
      expect(isSshKeyParseError(result)).toBe(true);
      expect((result as { error: string }).error).toContain('Unsupported key type');
    });

    it('rejects a blob whose embedded type does not match the declared type', () => {
      // Declared ed25519, but the blob says ssh-rsa.
      const blob = buildKeyBlob('ssh-rsa', Buffer.alloc(32, 2));
      const result = parseSshPublicKey(`ssh-ed25519 ${blob.toString('base64')}`);
      expect(isSshKeyParseError(result)).toBe(true);
      expect((result as { error: string }).error).toContain('does not match');
    });

    it('rejects an empty input', () => {
      expect(isSshKeyParseError(parseSshPublicKey(''))).toBe(true);
      expect(isSshKeyParseError(parseSshPublicKey('   \n '))).toBe(true);
    });

    it('rejects a lone type with no key data', () => {
      expect(isSshKeyParseError(parseSshPublicKey('ssh-ed25519'))).toBe(true);
    });

    it('rejects undersized RSA keys (< 2048 bits)', () => {
      const blob = buildKeyBlob('ssh-rsa', Buffer.alloc(64, 3)); // far below 260 bytes
      const result = parseSshPublicKey(`ssh-rsa ${blob.toString('base64')}`);
      expect(isSshKeyParseError(result)).toBe(true);
      expect((result as { error: string }).error).toContain('2048');
    });

    it('rejects absurdly long inputs', () => {
      const { raw } = makeEd25519Key();
      const result = parseSshPublicKey(raw + ' ' + 'x'.repeat(17_000));
      expect(isSshKeyParseError(result)).toBe(true);
    });
  });

  describe('isSshKeyParseError', () => {
    it('narrows errors and successes correctly', () => {
      const ok = parseSshPublicKey(makeEd25519Key('a@b').raw);
      const bad = parseSshPublicKey('garbage');
      expect(isSshKeyParseError(ok)).toBe(false);
      expect(isSshKeyParseError(bad)).toBe(true);
    });
  });
});
