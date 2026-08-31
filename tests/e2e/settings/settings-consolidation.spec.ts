import { test, expect } from '@playwright/test';

/**
 * Covers the /dashboard/nav/{profile,account} -> /dashboard/settings consolidation
 * and the OAuth returnTo separator fix that it forced.
 */

const b64url = (o: unknown) => Buffer.from(JSON.stringify(o), 'utf8').toString('base64url');

test.describe('legacy nav routes redirect into settings', () => {
  test('profile lands on the Profile tab', async ({ page }) => {
    await page.goto('/dashboard/nav/profile');
    await expect(page).toHaveURL(/\/dashboard\/settings\?tab=profile$/);
  });

  test('account lands on the Connections tab', async ({ page }) => {
    await page.goto('/dashboard/nav/account');
    await expect(page).toHaveURL(/\/dashboard\/settings\?tab=account$/);
  });

  test('reconnect + returnTo survive the redirect', async ({ page }) => {
    await page.goto('/dashboard/nav/account?reconnect=github&returnTo=%2Fdashboard%2Fservices%2Fapps%2Fabc');
    const url = new URL(page.url());
    expect(url.pathname).toBe('/dashboard/settings');
    expect(url.searchParams.get('tab')).toBe('account');
    // consumed by the Accounts effect, so assert the toast instead of the params
    await expect(page.getByText(/token has expired/i)).toBeVisible();
  });
});

test.describe('tab state lives in the URL', () => {
  test('bare /dashboard/settings defaults to profile', async ({ page }) => {
    await page.goto('/dashboard/settings');
    await expect(page.getByRole('button', { name: /^profile$/i })).toBeVisible();
  });

  test('clicking a tab writes ?tab=', async ({ page }) => {
    await page.goto('/dashboard/settings?tab=profile');
    await page.getByRole('button', { name: /security/i }).first().click();
    await expect(page).toHaveURL(/tab=security/);
  });

  test('deep link to a tab is honoured on load', async ({ page }) => {
    await page.goto('/dashboard/settings?tab=security');
    await expect(page).toHaveURL(/tab=security/);
  });
});

test.describe('OAuth error params surface and are stripped', () => {
  test('error toast shows and tab= survives the strip', async ({ page }) => {
    await page.goto('/dashboard/settings?tab=account&error=token_exchange_failed');
    await expect(page.getByText(/provider rejected the connection/i)).toBeVisible();
    const url = new URL(page.url());
    expect(url.searchParams.get('error')).toBeNull();      // consumed
    expect(url.searchParams.get('tab')).toBe('account');   // preserved
  });
});

test.describe('callback routes build a valid returnTo query', () => {
  test('gitlab invalid state -> &error, not ?error', async ({ request }) => {
    const res = await request.get('/api/gitlab/callback?code=x&state=garbage', { maxRedirects: 0 });
    const loc = new URL(res.headers()['location']);
    expect(loc.pathname).toBe('/dashboard/settings');
    expect(loc.searchParams.get('tab')).toBe('account');
    expect(loc.searchParams.get('error')).toBe('invalid_state');
  });

  test('bitbucket bad signature keeps payload returnTo intact', async ({ request }) => {
    const state = `${b64url({ returnTo: '/dashboard/settings?tab=account' })}.badsignature`;
    const res = await request.get(`/api/bitbucket/callback?code=x&state=${state}`, { maxRedirects: 0 });
    const loc = new URL(res.headers()['location']);
    expect(loc.pathname).toBe('/dashboard/settings');
    expect(loc.searchParams.get('tab')).toBe('account');       // would be "account?error=..." before the fix
    expect(loc.searchParams.get('error')).toBe('invalid_state');
  });

  test('missing code falls back to the account tab', async ({ request }) => {
    const res = await request.get('/api/gitlab/callback', { maxRedirects: 0 });
    const loc = new URL(res.headers()['location']);
    expect(loc.searchParams.get('tab')).toBe('account');
    expect(loc.searchParams.get('error')).toBe('missing_code');
  });
});

test.describe('repaired links resolve', () => {
  for (const path of ['/docs', '/terms', '/privacy', '/signin']) {
    test(`${path} is not a 404`, async ({ request }) => {
      const res = await request.get(path);
      expect(res.status(), `${path} returned ${res.status()}`).toBeLessThan(400);
    });
  }
});
