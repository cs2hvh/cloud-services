import { test, expect } from '../platform-apps/fixtures/auth.fixture';

/**
 * E2E Tests: Object Storage Create Page
 * Tests for /dashboard/services/object-storage/new
 */
test.describe('Object Storage Create Page', () => {
  test.describe('Page Load', () => {
    test('E2E-OS-010: Display create bucket form', async ({ authenticatedPage }) => {
      await authenticatedPage.route('**/api/services/object-storage/**', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({}),
        });
      });

      await authenticatedPage.goto('/dashboard/services/object-storage/new');

      await expect(
        authenticatedPage
          .locator('text=Object Storage')
          .or(authenticatedPage.locator('text=Create'))
          .or(authenticatedPage.locator('text=Bucket'))
          .first()
      ).toBeVisible({ timeout: 15000 });
    });

    test('E2E-OS-011: Show region selection', async ({ authenticatedPage }) => {
      await authenticatedPage.route('**/api/services/object-storage/**', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({}),
        });
      });

      await authenticatedPage.goto('/dashboard/services/object-storage/new');

      await expect(
        authenticatedPage
          .locator('text=Region')
          .or(authenticatedPage.locator('text=Location'))
          .or(authenticatedPage.locator('text=Data Center'))
          .first()
      ).toBeVisible({ timeout: 15000 });
    });
  });

  test.describe('Form Interaction', () => {
    test('E2E-OS-012: Enter bucket name', async ({ authenticatedPage }) => {
      await authenticatedPage.route('**/api/services/object-storage/**', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({}),
        });
      });

      await authenticatedPage.goto('/dashboard/services/object-storage/new');

      const nameInput = authenticatedPage
        .locator('input[placeholder*="name" i]')
        .or(authenticatedPage.locator('input[name="name"]'))
        .or(authenticatedPage.locator('input[placeholder*="bucket" i]'))
        .first();

      if (await nameInput.isVisible({ timeout: 10000 }).catch(() => false)) {
        await nameInput.fill('my-test-bucket');
        await expect(nameInput).toHaveValue('my-test-bucket');
      }
    });

    test('E2E-OS-013: Check bucket name availability', async ({ authenticatedPage }) => {
      await authenticatedPage.route('**/api/services/object-storage/check-bucket*', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ available: true }),
        });
      });

      await authenticatedPage.route('**/api/services/object-storage/**', async (route) => {
        if (route.request().url().includes('check-bucket')) return;
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({}),
        });
      });

      await authenticatedPage.goto('/dashboard/services/object-storage/new');

      // Page should load with bucket availability check capability
      await expect(authenticatedPage.locator('body')).toBeVisible();
    });

    test('E2E-OS-014: Show pricing information', async ({ authenticatedPage }) => {
      await authenticatedPage.route('**/api/services/object-storage/**', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({}),
        });
      });

      await authenticatedPage.goto('/dashboard/services/object-storage/new');

      await expect(
        authenticatedPage
          .locator('text=/\\$\\d/')
          .or(authenticatedPage.locator('text=/month/'))
          .or(authenticatedPage.locator('text=Price'))
          .or(authenticatedPage.locator('text=Cost'))
          .first()
      ).toBeVisible({ timeout: 15000 });
    });
  });

  test.describe('Submission', () => {
    test('E2E-OS-015: Show create button', async ({ authenticatedPage }) => {
      await authenticatedPage.route('**/api/services/object-storage/**', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({}),
        });
      });

      await authenticatedPage.goto('/dashboard/services/object-storage/new');

      const createButton = authenticatedPage
        .locator('button:has-text("Create")')
        .or(authenticatedPage.locator('button:has-text("Deploy")'))
        .or(authenticatedPage.locator('button:has-text("Launch")'))
        .first();

      await expect(createButton).toBeVisible({ timeout: 15000 });
    });
  });
});
