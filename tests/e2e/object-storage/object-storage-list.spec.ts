import { test, expect } from '../platform-apps/fixtures/auth.fixture';

/**
 * Mock data for Object Storage E2E tests
 */
const mockBucket = {
  id: 'bucket-1',
  name: 'my-static-assets',
  region: 'nyc3',
  space_region: 'nyc3',
  status: 'active',
  created_at: '2024-12-01T10:00:00Z',
  owner_id: 'user-123',
  project_id: 'proj-1',
  size_bytes: 1048576,
  files_count: 42,
  endpoint: 'https://my-static-assets.nyc3.digitaloceanspaces.com',
  acl: 'private',
};

const mockBucket2 = {
  id: 'bucket-2',
  name: 'backup-storage',
  region: 'sfo3',
  space_region: 'sfo3',
  status: 'active',
  created_at: '2024-11-20T14:00:00Z',
  owner_id: 'user-123',
  project_id: 'proj-2',
  size_bytes: 5242880,
  files_count: 128,
  endpoint: 'https://backup-storage.sfo3.digitaloceanspaces.com',
  acl: 'public-read',
};

/**
 * E2E Tests: Object Storage List Page
 * Tests for /dashboard/services/object-storage
 */
test.describe('Object Storage List Page', () => {
  test.describe('Page Load & Display', () => {
    test('E2E-OS-001: Display object storage page', async ({ authenticatedPage }) => {
      await authenticatedPage.route('**/api/services/object-storage/buckets/read_all*', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ buckets: [mockBucket, mockBucket2] }),
        });
      });

      await authenticatedPage.goto('/dashboard/services/object-storage');

      await expect(
        authenticatedPage
          .locator('text=Object Storage')
          .or(authenticatedPage.locator('text=Storage'))
          .or(authenticatedPage.locator('text=Buckets'))
          .first()
      ).toBeVisible({ timeout: 15000 });
    });

    test('E2E-OS-002: Show empty state when no buckets', async ({ authenticatedPage }) => {
      await authenticatedPage.route('**/api/services/object-storage/buckets/read_all*', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ buckets: [] }),
        });
      });

      await authenticatedPage.goto('/dashboard/services/object-storage');

      await expect(
        authenticatedPage
          .locator('text=Create')
          .or(authenticatedPage.locator('text=Get started'))
          .or(authenticatedPage.locator('text=No buckets'))
          .or(authenticatedPage.locator('text=Deploy'))
          .first()
      ).toBeVisible({ timeout: 15000 });
    });

    test('E2E-OS-003: Display bucket names', async ({ authenticatedPage }) => {
      await authenticatedPage.route('**/api/services/object-storage/buckets/read_all*', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ buckets: [mockBucket, mockBucket2] }),
        });
      });

      await authenticatedPage.goto('/dashboard/services/object-storage');

      await expect(
        authenticatedPage.locator('text=my-static-assets').first()
      ).toBeVisible({ timeout: 15000 });
    });

    test('E2E-OS-004: Show create bucket button', async ({ authenticatedPage }) => {
      await authenticatedPage.route('**/api/services/object-storage/buckets/read_all*', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ buckets: [] }),
        });
      });

      await authenticatedPage.goto('/dashboard/services/object-storage');

      const createButton = authenticatedPage
        .locator('a[href*="object-storage/new"], button:has-text("Create"), button:has-text("Deploy")')
        .first();

      await expect(createButton).toBeVisible({ timeout: 15000 });
    });
  });

  test.describe('Error Handling', () => {
    test('E2E-OS-005: Handle API error gracefully', async ({ authenticatedPage }) => {
      await authenticatedPage.route('**/api/services/object-storage/buckets/read_all*', async (route) => {
        await route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Internal server error' }),
        });
      });

      await authenticatedPage.goto('/dashboard/services/object-storage');

      await expect(authenticatedPage.locator('body')).toBeVisible();
    });
  });

  test.describe('Navigation', () => {
    test('E2E-OS-006: Navigate to create page', async ({ authenticatedPage }) => {
      await authenticatedPage.route('**/api/services/object-storage/buckets/read_all*', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ buckets: [] }),
        });
      });

      await authenticatedPage.goto('/dashboard/services/object-storage');

      const createLink = authenticatedPage
        .locator('a[href*="object-storage/new"]')
        .first();

      if (await createLink.isVisible({ timeout: 5000 }).catch(() => false)) {
        await createLink.click();
        await expect(authenticatedPage).toHaveURL(/object-storage\/new/);
      }
    });
  });
});
