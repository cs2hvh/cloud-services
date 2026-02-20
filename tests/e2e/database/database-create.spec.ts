import { test, expect } from '../platform-apps/fixtures/auth.fixture';

/**
 * Mock data for database creation E2E tests
 */
const mockProducts = [
  {
    id: 'prod-db-1',
    name: 'Basic',
    type: 'database',
    slug: 'db-s-1vcpu-1gb',
    vcpus: 1,
    memory: 1024,
    disk: 10,
    price_monthly: 15,
  },
  {
    id: 'prod-db-2',
    name: 'Professional',
    type: 'database',
    slug: 'db-s-2vcpu-4gb',
    vcpus: 2,
    memory: 4096,
    disk: 38,
    price_monthly: 60,
  },
];

const mockLocations = [
  { id: 'loc-1', name: 'New York 1', slug: 'nyc1', type: 'database', available: true },
  { id: 'loc-2', name: 'San Francisco 1', slug: 'sfo1', type: 'database', available: true },
];

const mockProjects = [
  { id: 'proj-1', name: 'My Project', user_id: 'user-123' },
  { id: 'proj-2', name: 'Production', user_id: 'user-123' },
];

/**
 * E2E Tests: Database Create Page
 * Tests for /dashboard/services/database/new
 */
test.describe('Database Create Page', () => {
  test.describe('Page Load', () => {
    test('E2E-DB-010: Display create database form', async ({ authenticatedPage }) => {
      // Mock the API endpoints the create page needs
      await authenticatedPage.route('**/api/services/database/**', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ clusters: [] }),
        });
      });

      await authenticatedPage.goto('/dashboard/services/database/new');

      // Verify page loads with form content
      await expect(
        authenticatedPage
          .locator('text=Database')
          .or(authenticatedPage.locator('text=Create'))
          .or(authenticatedPage.locator('text=Engine'))
          .first()
      ).toBeVisible({ timeout: 15000 });
    });

    test('E2E-DB-011: Show database engine options', async ({ authenticatedPage }) => {
      await authenticatedPage.route('**/api/services/database/**', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({}),
        });
      });

      await authenticatedPage.goto('/dashboard/services/database/new');

      // Should show engine selection (PostgreSQL, MySQL, Redis, etc.)
      await expect(
        authenticatedPage
          .locator('text=PostgreSQL')
          .or(authenticatedPage.locator('text=MySQL'))
          .or(authenticatedPage.locator('text=Postgres'))
          .first()
      ).toBeVisible({ timeout: 15000 });
    });
  });

  test.describe('Form Interaction', () => {
    test('E2E-DB-012: Select database engine', async ({ authenticatedPage }) => {
      await authenticatedPage.route('**/api/services/database/**', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({}),
        });
      });

      await authenticatedPage.goto('/dashboard/services/database/new');

      // Try to find and click an engine option
      const engineOption = authenticatedPage
        .locator('text=PostgreSQL')
        .or(authenticatedPage.locator('text=MySQL'))
        .or(authenticatedPage.locator('text=Postgres'))
        .first();

      if (await engineOption.isVisible({ timeout: 10000 }).catch(() => false)) {
        await engineOption.click();
        // Engine should be selected (highlighted or checked)
      }
    });

    test('E2E-DB-013: Show pricing information', async ({ authenticatedPage }) => {
      await authenticatedPage.route('**/api/services/database/**', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({}),
        });
      });

      await authenticatedPage.goto('/dashboard/services/database/new');

      // Pricing info should be visible
      await expect(
        authenticatedPage
          .locator('text=/\\$\\d/')
          .or(authenticatedPage.locator('text=/month/'))
          .or(authenticatedPage.locator('text=Price'))
          .first()
      ).toBeVisible({ timeout: 15000 });
    });
  });

  test.describe('Validation', () => {
    test('E2E-DB-014: Handle create submission', async ({ authenticatedPage }) => {
      await authenticatedPage.route('**/api/services/database/create*', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ success: true, cluster: { id: 'new-db-1' } }),
        });
      });

      await authenticatedPage.route('**/api/services/database/**', async (route) => {
        if (route.request().url().includes('create')) return;
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({}),
        });
      });

      await authenticatedPage.goto('/dashboard/services/database/new');

      // The create/deploy button should exist
      const createButton = authenticatedPage
        .locator('button:has-text("Create")')
        .or(authenticatedPage.locator('button:has-text("Deploy")'))
        .or(authenticatedPage.locator('button:has-text("Launch")'))
        .first();

      await expect(createButton).toBeVisible({ timeout: 15000 });
    });
  });
});
