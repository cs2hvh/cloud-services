//@ts-nocheck
// The version dropdown is fed from the database_types table, but the create
// endpoints validate against the hardcoded VALID_*_VERSIONS allowlists. The two
// drifted in production — the table offered MySQL 8.4, PostgreSQL 18 and
// MongoDB 8.0 — so customers configured a whole cluster before being told the
// version "isn't available for the selected engine". This route now reconciles
// the two at read time.
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { GET } from '@/app/api/database-types/route';

vi.mock('@/lib/supabase/server');
vi.mock('@/lib/auth/server-auth');

function mockRows(rows: Array<{ code: string; name: string; versions: unknown }>) {
  return import('@/lib/supabase/server').then(({ createClient }) => {
    vi.mocked(createClient).mockResolvedValue({
      from: () => ({
        select: () => ({
          eq: () => ({
            order: () => Promise.resolve({ data: rows, error: null }),
          }),
        }),
      }),
    } as never);
  });
}

beforeEach(async () => {
  vi.clearAllMocks();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});

  const { authenticateUser } = await import('@/lib/auth/server-auth');
  vi.mocked(authenticateUser).mockResolvedValue({
    authenticated: true,
    user: { id: 'user-1' },
  } as never);
});

async function versionsFor(rows: Parameters<typeof mockRows>[0]) {
  await mockRows(rows);
  const body = await (await GET()).json();
  return Object.fromEntries(body.data.map((r: any) => [r.code, r.versions]));
}

async function enginesFor(rows: Parameters<typeof mockRows>[0]) {
  await mockRows(rows);
  const body = await (await GET()).json();
  return Object.fromEntries(body.data.map((r: any) => [r.code, r]));
}

describe('GET /api/database-types', () => {
  it('hides versions the provider would reject', async () => {
    const versions = await versionsFor([
      { code: 'mysql', name: 'MySQL', versions: ['8.4', '8'] },
      { code: 'pg', name: 'PostgreSQL', versions: ['18', '17', '14'] },
      { code: 'mongodb', name: 'MongoDB', versions: ['8.0', '8', '7.0'] },
    ]);

    expect(versions.mysql).toEqual(['8.4']);
    expect(versions.pg).toEqual(['18', '17']);
    expect(versions.mongodb).toEqual(['8.0', '7.0']);
  });

  it('passes through the live table unchanged now that the two agree', async () => {
    // These are the actual production rows. They were never wrong — the
    // allowlist was stale — so nothing should be filtered.
    const versions = await versionsFor([
      { code: 'mysql', name: 'MySQL', versions: ['8.4'] },
      { code: 'mongodb', name: 'MongoDB', versions: ['7.0', '8.0'] },
      { code: 'pg', name: 'PostgreSQL', versions: ['15', '16', '17', '18'] },
    ]);

    expect(versions.mysql).toEqual(['8.4']);
    expect(versions.mongodb).toEqual(['7.0', '8.0']);
    expect(versions.pg).toEqual(['15', '16', '17', '18']);
  });

  it('marks an engine unavailable when nothing it offers is purchasable', async () => {
    // The live rows: MySQL offers only 8.4 and MongoDB only 7.0/8.0, none of
    // which the create endpoint accepts. The wizard greys out an unavailable
    // engine, which beats letting it be configured and fail on deploy — and
    // beats deleting it from the catalog with no explanation.
    const engines = await enginesFor([
      { code: 'mysql', name: 'MySQL', versions: ['5.7'], available: true },
      { code: 'mongodb', name: 'MongoDB', versions: ['4', '5'], available: true },
      { code: 'pg', name: 'PostgreSQL', versions: ['17'], available: true },
    ]);

    expect(engines.mysql.available).toBe(false);
    expect(engines.mongodb.available).toBe(false);
    expect(engines.pg.available).toBe(true);
  });

  it('still names the engine on the card it greys out', async () => {
    // versions feeds the card label; blanking it would render a nameless
    // version on a disabled card.
    const engines = await enginesFor([
      { code: 'mysql', name: 'MySQL', versions: ['5.7'], available: true },
    ]);

    expect(engines.mysql.name).toBe('MySQL');
    expect(engines.mysql.versions).toEqual(['5.7']);
  });

  it('leaves a healthy engine available', async () => {
    const engines = await enginesFor([
      { code: 'pg', name: 'PostgreSQL', versions: ['14', '15', '16', '17', '18'], available: true },
    ]);

    expect(engines.pg.available).toBe(true);
    expect(engines.pg.versions).toEqual(['15', '16', '17', '18']);
  });

  it('every returned version passes the validator the create route uses', async () => {
    const { validateEngineVersion } = await import('@/lib/validation/database');

    await mockRows([
      { code: 'mysql', name: 'MySQL', versions: ['8.4', '8', '5.7'] },
      { code: 'pg', name: 'PostgreSQL', versions: ['18', '14'] },
      { code: 'mongodb', name: 'MongoDB', versions: ['8.0', '7'] },
      { code: 'redis', name: 'Redis', versions: ['8', '7'] },
    ]);
    const body = await (await GET()).json();

    expect(body.data.length).toBeGreaterThan(0);
    // Every version on a SELECTABLE engine must provision. An unavailable
    // engine keeps its declared versions for the card label only — the wizard
    // will not let it be picked, so it can never reach the create endpoint.
    for (const engine of body.data.filter((e: any) => e.available)) {
      expect(engine.versions.length).toBeGreaterThan(0);
      for (const version of engine.versions) {
        expect(validateEngineVersion(engine.code, version)).toBe(true);
      }
    }
  });

  it('tolerates a malformed versions column instead of throwing', async () => {
    await mockRows([
      { code: 'mysql', name: 'MySQL', versions: null },
      { code: 'pg', name: 'PostgreSQL', versions: '18' },
      { code: 'redis', name: 'Redis', versions: ['7'] },
    ]);
    const res = await GET();

    expect(res.status).toBe(200);
    const body = await res.json();
    const byCode = Object.fromEntries(body.data.map((r: any) => [r.code, r]));
    expect(byCode.mysql.available).toBe(false);
    expect(byCode.pg.available).toBe(false);
    expect(byCode.redis.available).toBe(true);
  });
});
