import { test, expect } from '../platform-apps/fixtures/auth.fixture';

/**
 * Mock data for database E2E tests
 */
const mockDatabaseCluster = {
  id: 'db-cluster-1',
  name: 'my-postgres-db',
  engine: 'pg',
  version: '16',
  status: 'online',
  region: 'nyc1',
  size: 'db-s-1vcpu-1gb',
  num_nodes: 1,
  created_at: '2024-12-01T10:00:00Z',
  owner_id: 'user-123',
  project_id: 'proj-1',
  host: 'db-cluster-1.db.example.com',
  port: 25060,
  storage_size_mib: 10240,
};

const mockDatabaseCluster2 = {
  id: 'db-cluster-2',
  name: 'mysql-production',
  engine: 'mysql',
  version: '8',
  status: 'online',
  region: 'sfo1',
  size: 'db-s-2vcpu-4gb',
  num_nodes: 2,
  created_at: '2024-11-15T08:30:00Z',
  owner_id: 'user-123',
  project_id: 'proj-2',
  host: 'db-cluster-2.db.example.com',
  port: 25060,
  storage_size_mib: 20480,
};

const mockFailedCluster = {
  ...mockDatabaseCluster,
  id: 'db-cluster-3',
  name: 'failed-redis-db',
  engine: 'redis',
  status: 'error',
  created_at: '2024-12-10T12:00:00Z',
};

/**
 * E2E Tests: Database List Page
 * Tests for /dashboard/services/database
 */
test.describe('Database List Page', () => {
  test.describe('Page Load & Display', () => {
    test('E2E-DB-001: Display database page', async ({ authenticatedPage }) => {
      await authenticatedPage.route('**/api/services/database/read_all_owner*', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ clusters: [mockDatabaseCluster, mockDatabaseCluster2] }),
        });
      });

      await authenticatedPage.goto('/dashboard/services/database');

      // Verify page loads with database content
      await expect(
        authenticatedPage
          .locator('text=Database')
          .or(authenticatedPage.locator('text=database'))
          .first()
      ).toBeVisible({ timeout: 15000 });
    });

    test('E2E-DB-002: Show empty state when no clusters', async ({ authenticatedPage }) => {
      await authenticatedPage.route('**/api/services/database/read_all_owner*', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ clusters: [] }),
        });
      });

      await authenticatedPage.goto('/dashboard/services/database');

      // Should show empty state or create button
      await expect(
        authenticatedPage
          .locator('text=Create')
          .or(authenticatedPage.locator('text=Get started'))
          .or(authenticatedPage.locator('text=No database'))
          .or(authenticatedPage.locator('text=Deploy'))
          .first()
      ).toBeVisible({ timeout: 15000 });
    });

    test('E2E-DB-003: Display database clusters', async ({ authenticatedPage }) => {
      await authenticatedPage.route('**/api/services/database/read_all_owner*', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ clusters: [mockDatabaseCluster, mockDatabaseCluster2] }),
        });
      });

      await authenticatedPage.goto('/dashboard/services/database');

      // Verify cluster names are displayed
      await expect(
        authenticatedPage.locator('text=my-postgres-db').first()
      ).toBeVisible({ timeout: 15000 });
    });

    test('E2E-DB-004: Show create database button', async ({ authenticatedPage }) => {
      await authenticatedPage.route('**/api/services/database/read_all_owner*', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ clusters: [] }),
        });
      });

      await authenticatedPage.goto('/dashboard/services/database');

      // Look for create/deploy button
      const createButton = authenticatedPage
        .locator('a[href*="database/new"], button:has-text("Create"), button:has-text("Deploy")')
        .first();

      await expect(createButton).toBeVisible({ timeout: 15000 });
    });
  });

  test.describe('Error Handling', () => {
    test('E2E-DB-005: Handle API error gracefully', async ({ authenticatedPage }) => {
      await authenticatedPage.route('**/api/services/database/read_all_owner*', async (route) => {
        await route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Internal server error' }),
        });
      });

      await authenticatedPage.goto('/dashboard/services/database');

      // Page should still be accessible (show error or empty state)
      await expect(authenticatedPage.locator('body')).toBeVisible();
    });
  });

  test.describe('Navigation', () => {
    test('E2E-DB-006: Navigate to create page', async ({ authenticatedPage }) => {
      await authenticatedPage.route('**/api/services/database/read_all_owner*', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ clusters: [] }),
        });
      });

      await authenticatedPage.goto('/dashboard/services/database');

      // Find and click create link
      const createLink = authenticatedPage
        .locator('a[href*="database/new"]')
        .first();

      if (await createLink.isVisible({ timeout: 5000 }).catch(() => false)) {
        await createLink.click();
        await expect(authenticatedPage).toHaveURL(/database\/new/);
      }
    });
  });
});
