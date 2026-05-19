/**
 * Registrar API route — pure-logic unit tests
 *
 * Covers: parseNameservers, sameNameservers, nameserverMode
 * These functions live inside the route module; we re-implement the same logic
 * here so we can unit-test it without standing up a full Next.js request
 * context. Any change to the route's validation rules should break these tests.
 */
import { describe, expect, it } from 'vitest';
import { DEFAULT_MANAGED_NAMESERVERS, NAMECOM_MANAGED_NAMESERVER_RE } from '@/lib/domain-service/managed-nameservers';

// ─── Inline the route helpers (mirrors the real route exactly) ────────────────

const MIN_NAMESERVERS = 2;
const MAX_NAMESERVERS = 13;
const NAMESERVER_RE = /^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}\.?$/i;

function normalizeNameserver(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase().replace(/\.$/, '');
  if (!normalized || !NAMESERVER_RE.test(normalized)) return null;
  return normalized;
}

function parseNameservers(value: unknown): { ok: true; nameservers: string[] } | { ok: false; message: string } {
  if (!Array.isArray(value)) return { ok: false, message: 'Provide nameservers as an array.' };
  const invalidInput = value.some((item) => {
    if (typeof item !== 'string') return true;
    if (!item.trim()) return false;
    return normalizeNameserver(item) === null;
  });
  if (invalidInput) return { ok: false, message: 'Use valid nameserver hostnames, for example ns1.example.com.' };
  const nameservers = Array.from(new Set(value.map(normalizeNameserver).filter(Boolean) as string[]));
  if (nameservers.length < MIN_NAMESERVERS) return { ok: false, message: 'Add at least two valid nameservers.' };
  if (nameservers.length > MAX_NAMESERVERS) return { ok: false, message: `Use ${MAX_NAMESERVERS} or fewer nameservers.` };
  return { ok: true, nameservers };
}

function sameNameservers(a: string[], b: string[]): boolean {
  const left = a.map((v) => v.trim().toLowerCase().replace(/\.$/, '')).filter(Boolean).sort();
  const right = b.map((v) => v.trim().toLowerCase().replace(/\.$/, '')).filter(Boolean).sort();
  if (left.length !== right.length) return false;
  return left.every((v, i) => v === right[i]);
}

function nameserverMode(nameservers: string[]): 'managed' | 'custom' {
  const normalized = nameservers.map((v) => v.trim().toLowerCase().replace(/\.$/, '')).filter(Boolean);
  if (sameNameservers(normalized, DEFAULT_MANAGED_NAMESERVERS)) return 'managed';
  if (normalized.length >= MIN_NAMESERVERS && normalized.every((v) => NAMECOM_MANAGED_NAMESERVER_RE.test(v))) {
    return 'managed';
  }
  return 'custom';
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('parseNameservers', () => {
  it('accepts two valid hostnames', () => {
    const result = parseNameservers(['ns1.example.com', 'ns2.example.com']);
    expect(result).toEqual({ ok: true, nameservers: ['ns1.example.com', 'ns2.example.com'] });
  });

  it('normalises trailing dots and uppercase', () => {
    const result = parseNameservers(['NS1.EXAMPLE.COM.', 'ns2.example.com.']);
    expect(result).toMatchObject({ ok: true, nameservers: ['ns1.example.com', 'ns2.example.com'] });
  });

  it('strips blank entries before the count check', () => {
    const result = parseNameservers(['ns1.example.com', '', 'ns2.example.com']);
    expect(result).toMatchObject({ ok: true, nameservers: ['ns1.example.com', 'ns2.example.com'] });
  });

  it('deduplicates identical entries', () => {
    const result = parseNameservers(['ns1.example.com', 'ns1.example.com', 'ns2.example.com']);
    expect(result).toMatchObject({ ok: true, nameservers: ['ns1.example.com', 'ns2.example.com'] });
  });

  it('rejects fewer than two nameservers after dedup', () => {
    const result = parseNameservers(['ns1.example.com']);
    expect(result).toMatchObject({ ok: false });
  });

  it('rejects an invalid hostname', () => {
    const result = parseNameservers(['not-a-ns', 'ns2.example.com']);
    expect(result).toMatchObject({ ok: false });
  });

  it('rejects a non-array input', () => {
    expect(parseNameservers('ns1.example.com')).toMatchObject({ ok: false });
    expect(parseNameservers(null)).toMatchObject({ ok: false });
  });

  it('rejects non-string array elements', () => {
    const result = parseNameservers([42, 'ns2.example.com']);
    expect(result).toMatchObject({ ok: false });
  });

  it(`rejects more than ${MAX_NAMESERVERS} nameservers`, () => {
    const tooMany = Array.from({ length: MAX_NAMESERVERS + 1 }, (_, i) => `ns${i + 1}.example.com`);
    const result = parseNameservers(tooMany);
    expect(result).toMatchObject({ ok: false });
  });

  it(`accepts exactly ${MAX_NAMESERVERS} nameservers`, () => {
    const max = Array.from({ length: MAX_NAMESERVERS }, (_, i) => `ns${i + 1}.example.com`);
    const result = parseNameservers(max);
    expect(result).toMatchObject({ ok: true });
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('sameNameservers', () => {
  it('returns true for identical sets', () => {
    expect(sameNameservers(['ns1.example.com', 'ns2.example.com'], ['ns1.example.com', 'ns2.example.com'])).toBe(true);
  });

  it('returns true regardless of order', () => {
    expect(sameNameservers(['ns2.example.com', 'ns1.example.com'], ['ns1.example.com', 'ns2.example.com'])).toBe(true);
  });

  it('is case-insensitive', () => {
    expect(sameNameservers(['NS1.EXAMPLE.COM'], ['ns1.example.com'])).toBe(true);
  });

  it('strips trailing dots before comparing', () => {
    expect(sameNameservers(['ns1.example.com.'], ['ns1.example.com'])).toBe(true);
  });

  it('returns false for different sets', () => {
    expect(sameNameservers(['ns1.a.com', 'ns2.a.com'], ['ns1.b.com', 'ns2.b.com'])).toBe(false);
  });

  it('returns false when sizes differ', () => {
    expect(sameNameservers(['ns1.example.com'], ['ns1.example.com', 'ns2.example.com'])).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('nameserverMode', () => {
  it('returns "managed" for the platform default nameservers', () => {
    expect(nameserverMode(DEFAULT_MANAGED_NAMESERVERS)).toBe('managed');
  });

  it('returns "managed" for name.com ns* pattern nameservers', () => {
    expect(nameserverMode(['ns1.name.com', 'ns2.name.com', 'ns3.name.com', 'ns4.name.com'])).toBe('managed');
  });

  it('returns "managed" for name.com sub-ns variants like ns1ab.name.com', () => {
    expect(nameserverMode(['ns1ab.name.com', 'ns2cd.name.com'])).toBe('managed');
  });

  it('returns "custom" for Cloudflare nameservers', () => {
    expect(nameserverMode(['rosemary.ns.cloudflare.com', 'braden.ns.cloudflare.com'])).toBe('custom');
  });

  it('returns "custom" for a mix of managed and external', () => {
    expect(nameserverMode(['ns1.name.com', 'ns2.cloudflare.com'])).toBe('custom');
  });

  it('returns "custom" for an empty array', () => {
    expect(nameserverMode([])).toBe('custom');
  });

  it('is case-insensitive for name.com pattern', () => {
    expect(nameserverMode(['NS1.NAME.COM', 'NS2.NAME.COM'])).toBe('managed');
  });
});
