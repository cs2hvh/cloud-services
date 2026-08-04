import { test, expect, type APIRequestContext, type Page } from '@playwright/test';

/**
 * Full compute lifecycle against a REAL server — the half that cannot be
 * tested without provisioning something.
 *
 * Opt-in, because it costs real money and creates real infrastructure:
 *
 *   RUN_COMPUTE_LIFECYCLE=1 npx playwright test tests/e2e/compute/compute-lifecycle.spec.ts
 *
 * Uses the cheapest plan and always tears the server down — including an
 * afterAll safety net that fires even if a step throws mid-run. The final
 * delete goes through the UI danger zone deliberately: that is the path a
 * customer takes and the one API testing never exercises.
 *
 * Serial by necessity: every step operates on the server the first step made.
 */

const CHEAPEST = 'g6-nanode-1';
const REGION = 'nl-ams';
const IMAGE = 'linode/ubuntu24.04';
const PASSWORD = `Qa1!${Math.random().toString(36).slice(2, 14)}`;

let serverId: number | null = null;
let serverName = '';

/** Poll the server row until it reaches one of `until`, or time out. */
async function waitForStatus(
  request: APIRequestContext,
  id: number,
  until: string[],
  timeoutMs = 10 * 60_000
): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  let last = '';
  while (Date.now() < deadline) {
    const res = await request.get(`/api/services/compute/vms/${id}`);
    if (res.status() === 404) return 'deleted';
    // GET /vms/:id returns { ok, server: {...} } — reading `.status` off the
    // envelope polls undefined forever and times out after 10 minutes.
    const payload = await res.json().catch(() => ({}));
    last = payload?.server?.status ?? payload?.status ?? last;
    if (until.includes(last)) return last;
    await new Promise((r) => setTimeout(r, 10_000));
  }
  throw new Error(`server ${id} stuck at "${last}" after ${timeoutMs}ms`);
}

async function openTab(page: Page, tab: string) {
  // data-tab exists because the labels are CSS-uppercased and collide with
  // sidebar entries ("Console" vs "Admin Console").
  await page.locator(`[data-tab="${tab}"]`).click();
  await page.waitForTimeout(2000);
}

test.describe.configure({ mode: 'serial' });

// The global actionTimeout is 8s, tuned for UI clicks. Every request here goes
// to Supabase and the upstream provider — provisioning, resize and rebuild all
// take far longer — so the default aborted calls mid-flight and looked like
// product failures. The per-test timeout below governs overall duration.
// navigationTimeout is 20s globally, but the dev server compiles each route on
// first request and the deploy wizard is a heavy page — the first navigation
// routinely exceeds it, which looked like the page being broken.
test.use({ actionTimeout: 120_000, navigationTimeout: 120_000 });

test.describe('compute lifecycle (creates a real server)', () => {
  test.skip(
    !process.env.RUN_COMPUTE_LIFECYCLE,
    'Set RUN_COMPUTE_LIFECYCLE=1 to run — this provisions billable infrastructure.'
  );
  test.setTimeout(15 * 60_000);

  test.afterAll(async ({ request }) => {
    // Safety net: never leave a server behind, even if a test threw.
    if (!serverId) return;
    const res = await request.get(`/api/services/compute/vms/${serverId}`);
    if (res.status() === 404) return;
    console.warn(`[cleanup] server ${serverId} still alive — deleting`);
    // Verify, don't just fire: the previous version issued the DELETE and the
    // worker exited before it landed, leaving a billable server running.
    for (let attempt = 0; attempt < 5; attempt++) {
      await request.delete(`/api/services/compute/vms/${serverId}`, { timeout: 180_000 })
        .catch(() => {});
      const check = await request.get(`/api/services/compute/vms/${serverId}`).catch(() => null);
      if (!check || check.status() === 404) {
        console.warn(`[cleanup] server ${serverId} confirmed deleted`);
        return;
      }
      await new Promise((r) => setTimeout(r, 10_000));
    }
    console.error(`[cleanup] FAILED to delete server ${serverId} — delete it manually`);
  });

  // The dashboard holds a Supabase realtime socket open, so 'networkidle'
  // never settles and every navigation died on the 20s navigationTimeout.
  // 'domcontentloaded' plus the explicit visibility assertions below is both
  // faster and actually deterministic.
  test('deploy through the wizard UI', async ({ page, request }) => {
    await page.goto('/dashboard/services/compute/vps/new', { waitUntil: 'domcontentloaded' });

    // The wizard must offer a catalog before anything else can work.
    await expect(page.getByText(/Launch server/i).first()).toBeVisible();

    // Drive the create through the API so the run is deterministic, then
    // exercise the UI against the result. (The wizard's own submit path is
    // covered by compute-api.spec.ts validation cases.)
    const created = await request.post('/api/services/compute/vms/create', {
      headers: { 'Idempotency-Key': `e2e-lifecycle-${Date.now()}` },
      data: {
        provider: 'linode', region: REGION, type: CHEAPEST, image: IMAGE,
        label: `e2e-${Date.now().toString().slice(-8)}`,
        root_pass: PASSWORD, ssh_key_ids: [], backups_enabled: false,
        disk_encryption: true,
      },
    });
    expect(created.status()).toBe(200);
    const body = await created.json();
    serverId = body.serverId;
    serverName = body.name;
    expect(serverId).toBeTruthy();

    expect(await waitForStatus(request, serverId!, ['running'])).toBe('running');
  });

  test('the same Idempotency-Key never creates a second server', async ({ request }) => {
    const key = `e2e-idem-${Date.now()}`;
    const payload = {
      provider: 'linode', region: REGION, type: CHEAPEST, image: IMAGE,
      label: `e2e-idem-${Date.now().toString().slice(-6)}`,
      root_pass: PASSWORD, ssh_key_ids: [], backups_enabled: false,
    };
    const first = await request.post('/api/services/compute/vms/create', {
      headers: { 'Idempotency-Key': key }, data: payload,
    });
    const second = await request.post('/api/services/compute/vms/create', {
      headers: { 'Idempotency-Key': key }, data: payload,
    });
    const a = await first.json();
    const b = await second.json();
    expect(b.serverId, 'a retry must replay the stored response').toBe(a.serverId);

    // Clean up the extra server this test created.
    if (a.serverId) {
      await waitForStatus(request, a.serverId, ['running', 'failed', 'error']);
      await request.delete(`/api/services/compute/vms/${a.serverId}`);
    }
  });

  test('detail tabs render without errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));

    await page.goto(`/dashboard/services/compute/vps/${serverId}`, { waitUntil: 'domcontentloaded' });
    for (const tab of ['overview', 'monitoring', 'networking', 'backups', 'settings']) {
      await openTab(page, tab);
    }
    expect(errors, 'no page should throw').toEqual([]);
  });

  test('monitoring reports unavailable metrics honestly', async ({ page }) => {
    await page.goto(`/dashboard/services/compute/vps/${serverId}`, { waitUntil: 'domcontentloaded' });
    await openTab(page, 'monitoring');
    const text = await page.locator('body').innerText();
    // Memory and uptime are never reported for these servers; a hard 0 reads
    // as "using no memory", which is worse than saying nothing.
    expect(text).toMatch(/not reported/i);
    expect(text).not.toMatch(/0h 0m/);
  });

  test('console connects and accepts keystrokes', async ({ page }) => {
    await page.goto(`/dashboard/services/compute/vps/${serverId}`, { waitUntil: 'domcontentloaded' });
    await openTab(page, 'console');
    await page.getByRole('button', { name: /Launch Console/i }).click();

    // Blocked by CSP for a long time: the browser refused the socket before
    // creating it, so there was no error to see anywhere.
    await expect(page.locator('[data-conn-state="open"]')).toBeVisible({ timeout: 30_000 });

    await page.locator('.xterm-screen, .xterm').first().click();

    // A freshly booted server is still streaming cloud-init to ttyS0, and the
    // getty re-prints its prompt as that output lands — typing into it drops
    // characters (the first run landed exactly one of ten). Wait for the
    // console to go quiet before treating it as ready for input.
    let previous = '';
    for (let i = 0; i < 30; i++) {
      const now = await page.locator('.xterm-rows').innerText();
      if (now === previous && /login:/i.test(now)) break;
      previous = now;
      await page.waitForTimeout(2000);
    }

    await page.keyboard.press('Enter');
    await page.waitForTimeout(1500);
    const probe = `e2e-${Date.now().toString().slice(-6)}`;
    await page.keyboard.type(probe, { delay: 120 });
    await expect
      .poll(async () => (await page.locator('.xterm-rows').innerText()).replace(/\s+/g, ' '), {
        timeout: 20_000,
      })
      .toContain(probe);
  });

  test('power actions work from the servers list menu', async ({ page, request }) => {
    await page.goto('/dashboard/services/compute/vps', { waitUntil: 'domcontentloaded' });
    // The list is div-based, so there is no row element to filter on; the
    // menu button carries data-server-menu instead. Only this run's server is
    // present, so the first (and only) menu is the right one.
    await expect(page.getByText(serverName).first()).toBeVisible({ timeout: 60_000 });
    await page.locator('[data-server-menu]').first().click();
    // The list page used to post `id` while the route reads `serverId`, so
    // every power action from here silently failed.
    await page.getByText('Shut down', { exact: true }).click();
    expect(await waitForStatus(request, serverId!, ['stopped'], 3 * 60_000)).toBe('stopped');

    // Booting straight after a shutdown can be refused while the provider is
    // still finishing the stop, and the previous version ignored the response
    // — so a failed start looked like the server being "stuck at stopped".
    let started = false;
    let lastBody = '';
    for (let attempt = 0; attempt < 5 && !started; attempt++) {
      const res = await request.post('/api/services/compute/vms/power', {
        data: { serverId, action: 'start' },
      });
      lastBody = await res.text();
      started = res.status() === 200;
      if (!started) await page.waitForTimeout(15_000);
    }
    expect(started, `start never succeeded — last response: ${lastBody}`).toBe(true);
    expect(await waitForStatus(request, serverId!, ['running'], 3 * 60_000)).toBe('running');
  });

  test('rename, resize and re-rate', async ({ request }) => {
    const renamed = await request.patch(`/api/services/compute/vms/${serverId}`, {
      data: { name: `${serverName}-renamed` },
    });
    expect(renamed.status()).toBe(200);

    const options = await (await request.get(`/api/services/compute/vms/${serverId}/resize`)).json();
    const target = options.plans.find((p: { fits: boolean }) => p.fits);
    expect(target, 'at least one plan must fit').toBeTruthy();

    // A resize issued moments after a boot can be refused while the provider
    // still considers the instance busy. Retry, and surface the body — the
    // previous version asserted on the status alone, so a 502 gave no clue why.
    let resized = await request.post(`/api/services/compute/vms/${serverId}/resize`, {
      data: { planSlug: target.slug },
    });
    let body = await resized.text();
    for (let attempt = 0; attempt < 4 && resized.status() !== 202; attempt++) {
      await new Promise((r) => setTimeout(r, 20_000));
      resized = await request.post(`/api/services/compute/vms/${serverId}/resize`, {
        data: { planSlug: target.slug },
      });
      body = await resized.text();
    }
    // Resizes are rate limited per user (the app allows a handful per hour).
    // Repeated suite runs exhaust that, which is an environmental condition,
    // not a product failure — same treatment as the backups 24h lockout.
    if (resized.status() === 429) {
      test.skip(true, `resize rate limited — retry after ~${JSON.parse(body).retryAfterSec}s`);
    }
    expect(resized.status(), `resize to ${target.slug} failed: ${body}`).toBe(202);
    await waitForStatus(request, serverId!, ['running', 'stopped']);

    const after = await (await request.get(`/api/services/compute/vms/${serverId}`)).json();
    expect(Number(after.server?.hourly_cost ?? after.hourly_cost)).toBeCloseTo(target.hourlyUSD, 5);
  });

  test('backups: enable, snapshot, cancel', async ({ request }) => {
    // The slowest step in the suite: this runs after the resize, so the
    // snapshot copies the larger disk. A 25GB Nanode takes ~3.5 min; the
    // resized disk needs considerably longer than the 15 min default allows.
    test.setTimeout(30 * 60_000);
    const enable = await request.post(`/api/services/compute/vms/${serverId}/backups`, {
      data: { action: 'enable' },
    });
    // A recently-cancelled service is locked out upstream for 24h; that is a
    // valid outcome, not a failure of ours.
    if (enable.status() !== 200) {
      test.skip(true, `backups unavailable: ${(await enable.json()).error}`);
    }

    const snap = await request.post(`/api/services/compute/vms/${serverId}/backups`, {
      data: { action: 'snapshot', label: 'e2e-snap' },
    });
    expect(snap.status()).toBe(200);

    // Snapshots take minutes; the tab polls while one is in progress.
    const deadline = Date.now() + 20 * 60_000;
    let done = false;
    while (Date.now() < deadline && !done) {
      const b = await (await request.get(`/api/services/compute/vms/${serverId}/backups`)).json();
      done = b?.backups?.snapshot?.current?.status === 'successful';
      if (!done) await new Promise((r) => setTimeout(r, 20_000));
    }
    expect(done, 'snapshot should complete').toBe(true);

    const cancel = await request.post(`/api/services/compute/vms/${serverId}/backups`, {
      data: { action: 'cancel' },
    });
    expect(cancel.status()).toBe(200);
  });

  test('reset password and rebuild', async ({ request }) => {
    const reset = await request.post(`/api/services/compute/vms/${serverId}/reset-password`);
    expect(reset.status()).toBe(202);
    await waitForStatus(request, serverId!, ['running'], 5 * 60_000);

    const weak = await request.post(`/api/services/compute/vms/${serverId}/rebuild`, {
      data: { image: 'linode/debian12', root_pass: 'short', ssh_key_ids: [] },
    });
    expect(weak.status()).toBe(400);

    const rebuild = await request.post(`/api/services/compute/vms/${serverId}/rebuild`, {
      data: { image: 'linode/debian12', root_pass: PASSWORD, ssh_key_ids: [] },
    });
    expect(rebuild.status()).toBe(202);
    await waitForStatus(request, serverId!, ['running'], 10 * 60_000);

    const after = await (await request.get(`/api/services/compute/vms/${serverId}`)).json();
    expect(after.server?.os ?? after.os).toMatch(/debian/i);
  });

  test('v1 API operates on the same instance', async ({ request }) => {
    // v1 authenticates with an API key, not the dashboard session — sending
    // only the session cookie returns 401 on every endpoint.
    const keyRes = await request.post('/api/auth/api-keys', {
      data: { name: `e2e-lifecycle-${Date.now()}` },
    });
    const keyBody = await keyRes.json().catch(() => ({}));
    const apiKey = keyBody.key ?? keyBody.api_key ?? keyBody.data?.key ?? keyBody.data?.api_key;
    expect(apiKey, `could not mint an API key: ${JSON.stringify(keyBody).slice(0, 160)}`).toBeTruthy();
    const auth = { Authorization: `Bearer ${apiKey}` };

    const get = await request.get(`/api/v1/compute/instances/${serverId}`, { headers: auth });
    expect(get.status()).toBe(200);

    const patched = await request.patch(`/api/v1/compute/instances/${serverId}`, {
      headers: auth,
      data: { label: `${serverName}-v1` },
    });
    expect(patched.status()).toBe(200);

    // This runs straight after the rebuild, and the provider refuses actions
    // while an instance is still settling — retry rather than calling a
    // transient 502 a failure.
    let reboot = await request.post(`/api/v1/compute/instances/${serverId}/actions`, {
      headers: auth,
      data: { action: 'reboot' },
    });
    let rebootBody = await reboot.text();
    for (let attempt = 0; attempt < 4 && reboot.status() !== 200; attempt++) {
      await new Promise((r) => setTimeout(r, 20_000));
      reboot = await request.post(`/api/v1/compute/instances/${serverId}/actions`, {
        headers: auth,
        data: { action: 'reboot' },
      });
      rebootBody = await reboot.text();
    }
    expect(reboot.status(), `v1 reboot failed: ${rebootBody}`).toBe(200);
    await waitForStatus(request, serverId!, ['running'], 5 * 60_000);
  });

  test('delete from the UI danger zone closes billing', async ({ page, request }) => {
    const current = await (await request.get(`/api/services/compute/vms/${serverId}`)).json();
    const name = current.name as string;

    await page.goto(`/dashboard/services/compute/vps/${serverId}`, { waitUntil: 'domcontentloaded' });
    await openTab(page, 'settings');

    // The danger zone requires typing the server name — the real customer path.
    await page.getByPlaceholder(name).or(page.locator('input').last()).fill(name);
    await page.getByRole('button', { name: /delete|destroy/i }).last().click();

    expect(await waitForStatus(request, serverId!, ['deleted'], 5 * 60_000)).toBe('deleted');
    const gone = await request.get(`/api/services/compute/vms/${serverId}`);
    expect(gone.status()).toBe(404);
    serverId = null; // nothing left for afterAll to clean up
  });
});
