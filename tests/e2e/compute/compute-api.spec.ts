import { test, expect, type APIRequestContext } from '@playwright/test';

/**
 * Compute (Linode) API sweep — everything that needs NO server.
 *
 * Runs against a live app using the shared auth state from global-setup, so it
 * costs nothing and creates nothing. The server-dependent half lives in
 * compute-lifecycle.spec.ts.
 *
 *   npx playwright test tests/e2e/compute/compute-api.spec.ts
 *
 * Every admin mutation here reverts itself in the same test, so the suite is
 * safe to re-run and leaves the catalog exactly as it found it.
 */

const ADMIN = '/api/admin/linode';
const V1 = '/api/v1/compute';

// playwright.config sets fullyParallel with 4 workers. Several tests here flip
// PLATFORM-WIDE state (the deploy kill-switch, plan markups, region toggles)
// and revert it, so running them alongside tests that depend on that state made
// the suite lie: the kill-switch test disabled deploys while the rate-limit
// test was mid-run, and that test failed with 503 instead of the 400 it
// asserts. Shared mutable state means this file must run serially.
test.describe.configure({ mode: 'serial' });

// The global actionTimeout is 8s, tuned for UI clicks. These are API calls that
// reach Supabase and the upstream provider — a catalog sync alone takes ~8s —
// so the default produced timeouts that looked like product failures.
test.use({ actionTimeout: 60_000 });
test.setTimeout(120_000);

async function json(req: APIRequestContext, url: string) {
  const res = await req.get(url);
  return { status: res.status(), body: await res.json().catch(() => ({})) };
}

test.describe('compute: customer read surfaces', () => {
  test('deploy options return a usable catalog', async ({ request }) => {
    const { status, body } = await json(request, '/api/services/compute/options');
    expect(status).toBe(200);
    expect(body.data.regions.length).toBeGreaterThan(0);
    expect(body.data.plans.length).toBeGreaterThan(0);
    expect(body.data.images.length).toBeGreaterThan(0);
  });

  test('no plan or image shown to customers names the upstream provider', async ({ request }) => {
    // docs/LINODE_COMPUTE.md forbids the provider in customer surfaces, and the
    // rename happens at this boundary — so assert it here, not in the UI.
    const { body } = await json(request, '/api/services/compute/options');
    const labels = body.data.plans.map((p: { label: string }) => p.label).join(' ');
    expect(labels).not.toMatch(/linode|nanode|akamai/i);
  });

  test('GPU and accelerated classes are excluded from resale', async ({ request }) => {
    const { body } = await json(request, '/api/services/compute/options');
    const classes = new Set(body.data.plans.map((p: { class: string }) => p.class));
    expect(classes.has('gpu')).toBe(false);
    expect(classes.has('accelerated')).toBe(false);
  });
});

test.describe('compute: SSH key vault', () => {
  // Covers the full CRUD, including rename and delete.
  let keyId = '';
  const label = `e2e-key-${Date.now()}`;
  // Static, syntactically valid ed25519 key — never used for real access.
  const publicKey =
    'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIFXjxdF34ZeZOQZqMpqzaiz2jmH7iNzqbtySvlaTZ+KP e2e';

  test('create → list → rename → delete', async ({ request }) => {
    // publicKey is a fixed literal and the vault rejects duplicate
    // fingerprints with 409, so a key left behind by an earlier run — or by
    // manual testing with the same key — fails this at the first assertion.
    // Clear it first so the test is idempotent.
    const existing = await (await request.get('/api/user/ssh-keys')).json();
    for (const k of existing.data ?? []) {
      if (k.fingerprint_sha256 === 'SHA256:plAlsigE1YCshhMYMFUkq1IVe8NWt1NB0scYgDbHfvA') {
        await request.delete(`/api/user/ssh-keys/${k.id}`);
      }
    }

    const created = await request.post('/api/user/ssh-keys', {
      data: { label, public_key: publicKey },
    });
    expect(created.status()).toBe(201);
    keyId = (await created.json()).data.id;
    expect(keyId).toBeTruthy();

    const listed = await json(request, '/api/user/ssh-keys');
    expect(listed.body.data.some((k: { id: string }) => k.id === keyId)).toBe(true);

    const renamed = await request.patch(`/api/user/ssh-keys/${keyId}`, {
      data: { label: `${label}-renamed` },
    });
    expect(renamed.status()).toBe(200);

    const removed = await request.delete(`/api/user/ssh-keys/${keyId}`);
    expect(removed.status()).toBe(200);

    const after = await json(request, '/api/user/ssh-keys');
    expect(after.body.data.some((k: { id: string }) => k.id === keyId)).toBe(false);
  });

  test.describe('rejects malformed keys', () => {
    const cases: Array<[string, string]> = [
      ['a private key', '-----BEGIN OPENSSH PRIVATE KEY-----\nabc\n-----END'],
      ['invalid base64', 'ssh-ed25519 !!!!notbase64!!!! x'],
      ['an unsupported type', 'ssh-dss AAAAB3NzaC1kc3MAAACBAJ x'],
      ['an empty key', ''],
    ];
    for (const [name, key] of cases) {
      test(name, async ({ request }) => {
        const res = await request.post('/api/user/ssh-keys', {
          data: { label: 'bad', public_key: key },
        });
        expect(res.status()).toBe(400);
      });
    }
  });
});

test.describe('compute: create validation (creates nothing)', () => {
  const base = {
    provider: 'linode',
    region: 'nl-ams',
    type: 'g6-nanode-1',
    image: 'linode/ubuntu24.04',
    label: 'e2e-neg',
    root_pass: 'Qa1!aaaaaaaaaa',
    ssh_key_ids: [] as string[],
    backups_enabled: false,
  };

  const cases: Array<[string, Record<string, unknown>, number]> = [
    ['password too short', { root_pass: 'short' }, 400],
    ['password one character class', { root_pass: 'aaaaaaaaaaaaaa' }, 400],
    ['label too short', { label: 'ab' }, 400],
    ['label starting with a dash', { label: '-bad' }, 400],
    ['unknown region', { region: 'zz-nowhere' }, 404],
    ['unknown plan', { type: 'g6-fake-99' }, 400],
    ['unknown image', { image: 'linode/fake' }, 400],
    ['a GPU plan, which is not resold', { type: 'g1-gpu-rtx6000-1' }, 400],
    ['an SSH key that does not exist', { ssh_key_ids: ['00000000-0000-0000-0000-000000000000'] }, 400],
  ];

  for (const [name, override, expected] of cases) {
    test(`rejects ${name}`, async ({ request }) => {
      const res = await request.post('/api/services/compute/vms/create', {
        headers: { 'Idempotency-Key': `e2e-neg-${Date.now()}-${Math.random()}` },
        data: { ...base, ...override },
      });
      expect(res.status()).toBe(expected);
    });
  }

  test('rejected attempts do not consume the create rate limit', async ({ request }) => {
    // The limiter allows 5 per 5 min and used to charge a slot before
    // validation, so six bad passwords locked deploys for five minutes.
    for (let i = 0; i < 6; i++) {
      const res = await request.post('/api/services/compute/vms/create', {
        headers: { 'Idempotency-Key': `e2e-rl-${Date.now()}-${i}` },
        data: { ...base, root_pass: 'short' },
      });
      expect(res.status(), `attempt ${i + 1} must not be rate limited`).toBe(400);
    }
  });
});

test.describe('compute: admin', () => {
  test('status card reports a healthy integration', async ({ request }) => {
    const { status, body } = await json(request, `${ADMIN}/status`);
    expect(status).toBe(200);
    // Must not regress to probing /account, which a least-privilege token
    // cannot read — that reported a working integration as broken.
    expect(body.token.valid).toBe(true);
    expect(body.catalog.regions).toBeGreaterThan(0);
    expect(body.catalog.types).toBeGreaterThan(0);
  });

  test('every admin tab endpoint responds', async ({ request }) => {
    for (const ep of ['plans', 'regions', 'images', 'instances', 'settings']) {
      const res = await request.get(`${ADMIN}/${ep}`);
      expect(res.status(), ep).toBe(200);
    }
  });

  test('catalog sync succeeds', async ({ request }) => {
    // A full sync pulls regions, types, images and ~2.5k availability pairs
    // from upstream and takes roughly 8s, which sits right on the default
    // request timeout. Allow real headroom rather than failing intermittently.
    const res = await request.post(`${ADMIN}/sync`, { timeout: 60_000 });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.summary.regions).toBeGreaterThan(0);
  });

  test('admin reconcile reports a clean fleet', async ({ request }) => {
    const res = await request.post(`${ADMIN}/reconcile`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    // Never auto-deletes; a flood of orphans aborts the pass instead.
    expect(body.summary.orphanPassAborted).toBe(false);
  });

  test('markup change reaches the customer price, then reverts', async ({ request }) => {
    const priceOf = async () => {
      const { body } = await json(request, '/api/services/compute/options');
      return body.data.plans.find((p: { id: string }) => p.id === 'g6-nanode-1')?.price.hourlyUSD;
    };
    const before = await priceOf();
    expect(before).toBeGreaterThan(0);

    await request.patch(`${ADMIN}/plans`, {
      data: { type_id: 'g6-nanode-1', markup_pct: 1.5, floor_per_hour_usd: 0 },
    });
    expect(await priceOf()).toBeCloseTo(Number((before * 1.5).toFixed(5)), 5);

    await request.patch(`${ADMIN}/plans`, {
      data: { type_id: 'g6-nanode-1', markup_pct: 1.0, floor_per_hour_usd: 0 },
    });
    expect(await priceOf()).toBeCloseTo(before, 5);
  });

  test('markup below 1.0 is rejected by the database check', async ({ request }) => {
    const res = await request.patch(`${ADMIN}/plans`, {
      data: { type_id: 'g6-nanode-1', markup_pct: 0.5, floor_per_hour_usd: 0 },
    });
    expect((await res.json()).ok).toBe(false);
  });

  test('disabling a region hides it from customers, then reverts', async ({ request }) => {
    const count = async () => {
      const { body } = await json(request, '/api/services/compute/options');
      return body.data.regions.length;
    };
    const before = await count();

    await request.patch(`${ADMIN}/regions`, { data: { id: 'nl-ams', is_active: false } });
    expect(await count()).toBe(before - 1);

    await request.patch(`${ADMIN}/regions`, { data: { id: 'nl-ams', is_active: true } });
    expect(await count()).toBe(before);
  });

  // The revert below is inline, so any failure between disabling and restoring
  // leaves customer deployments switched OFF platform-wide — which is exactly
  // what happened on the first run of this suite. Guarantee the restore.
  test.afterAll(async ({ playwright, baseURL }) => {
    const ctx = await playwright.request.newContext({
      baseURL,
      storageState: 'tests/e2e/.auth/user.json',
    });
    await ctx.patch(`${ADMIN}/settings`, {
      data: { linode_deploy_enabled: true },
      timeout: 60_000, // must not fail — this is the safety net itself
    });
    await ctx.dispose();
  });

  test('the deploy kill-switch blocks creates, then reverts', async ({ request }) => {
    await request.patch(`${ADMIN}/settings`, { data: { linode_deploy_enabled: false } });
    // The switch is cached for ~10s.
    await new Promise((r) => setTimeout(r, 11_000));

    const blocked = await request.post('/api/services/compute/vms/create', {
      headers: { 'Idempotency-Key': `e2e-killswitch-${Date.now()}` },
      data: {
        provider: 'linode', region: 'nl-ams', type: 'g6-nanode-1',
        image: 'linode/ubuntu24.04', label: 'e2e-blocked',
        root_pass: 'Qa1!aaaaaaaaaa', ssh_key_ids: [], backups_enabled: false,
      },
    });
    expect(blocked.status()).toBe(503);

    await request.patch(`${ADMIN}/settings`, { data: { linode_deploy_enabled: true } });
  });
});

test.describe('compute: public v1 API', () => {
  // The v1 surface authenticates with an API key, NOT the dashboard session —
  // sending only the session cookie returns 401 on every endpoint. Mint a key
  // once for this block and pass it as a bearer token.
  let auth: { Authorization: string };

  test.beforeAll(async ({ playwright, baseURL }) => {
    const ctx = await playwright.request.newContext({
      baseURL,
      storageState: 'tests/e2e/.auth/user.json',
    });
    const res = await ctx.post('/api/auth/api-keys', {
      data: { name: `e2e-compute-${Date.now()}` },
    });
    const body = await res.json().catch(() => ({}));
    const key = body.key ?? body.api_key ?? body.data?.key ?? body.data?.api_key;
    if (!key) throw new Error(`could not mint an API key: ${res.status()} ${JSON.stringify(body).slice(0, 200)}`);
    auth = { Authorization: `Bearer ${key}` };
    await ctx.dispose();
  });

  test('read endpoints respond', async ({ request }) => {
    for (const ep of ['regions', 'types', 'images', 'instances']) {
      const res = await request.get(`${V1}/${ep}`, { headers: auth });
      expect(res.status(), ep).toBe(200);
    }
  });

  test('plan labels do not name the provider', async ({ request }) => {
    const body = await (await request.get(`${V1}/types`, { headers: auth })).json();
    const labels = body.data.map((t: { label: string }) => t.label).join(' ');
    expect(labels).not.toMatch(/\blinode\b|\bnanode\b/i);
  });

  test('write payloads are validated', async ({ request }) => {
    const bad: Array<[string, Record<string, unknown>]> = [
      ['instances', {}],
      ['instances', { label: 'ab', region: 'nl-ams', type: 'g6-nanode-1', image: 'linode/ubuntu24.04', root_pass: 'Qa1!aaaaaaaaaa' }],
    ];
    for (const [ep, data] of bad) {
      const res = await request.post(`${V1}/${ep}`, { data, headers: auth });
      expect(res.status()).toBe(400);
      expect((await res.json()).error).toBe('VALIDATION_ERROR');
    }
  });

  test('unknown and malformed instance ids are handled', async ({ request }) => {
    expect((await request.get(`${V1}/instances/999999999`, { headers: auth })).status()).toBe(404);
    expect((await request.get(`${V1}/instances/not-a-number`, { headers: auth })).status()).toBe(400);
  });
});
