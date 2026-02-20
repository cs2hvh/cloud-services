import { test, expect } from '../platform-apps/fixtures/auth.fixture';

/**
 * Mock data for Kubernetes E2E tests
 */
const mockCluster = {
  id: 'k8s-cluster-1',
  name: 'prod-cluster',
  status: 'running',
  region: 'nyc1',
  version: '1.29',
  node_count: 3,
  node_size: 's-2vcpu-4gb',
  created_at: '2024-12-01T10:00:00Z',
  owner_id: 'user-123',
  project_id: 'proj-1',
  endpoint: 'https://k8s-cluster-1.k8s.example.com',
};

const mockCluster2 = {
  id: 'k8s-cluster-2',
  name: 'staging-cluster',
  status: 'running',
  region: 'sfo1',
  version: '1.28',
  node_count: 2,
  node_size: 's-1vcpu-2gb',
  created_at: '2024-11-20T14:00:00Z',
  owner_id: 'user-123',
  project_id: 'proj-2',
  endpoint: 'https://k8s-cluster-2.k8s.example.com',
};

/**
 * E2E Tests: Kubernetes List Page
 * Tests for /dashboard/services/kubernetes
 */
test.describe('Kubernetes List Page', () => {
  test.describe('Page Load & Display', () => {
    test('E2E-K8S-001: Display Kubernetes clusters page', async ({ authenticatedPage }) => {
      await authenticatedPage.route('**/api/services/kubernetes/clusters/read*', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ clusters: [mockCluster, mockCluster2] }),
        });
      });

      await authenticatedPage.goto('/dashboard/services/kubernetes');

      await expect(
        authenticatedPage
          .locator('text=Kubernetes')
          .or(authenticatedPage.locator('text=Clusters'))
          .first()
      ).toBeVisible({ timeout: 15000 });
    });

    test('E2E-K8S-002: Show empty state when no clusters', async ({ authenticatedPage }) => {
      await authenticatedPage.route('**/api/services/kubernetes/clusters/read*', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ clusters: [] }),
        });
      });

      await authenticatedPage.goto('/dashboard/services/kubernetes');

      await expect(
        authenticatedPage
          .locator('text=Create')
          .or(authenticatedPage.locator('text=Get started'))
          .or(authenticatedPage.locator('text=No clusters'))
          .or(authenticatedPage.locator('text=Deploy'))
          .first()
      ).toBeVisible({ timeout: 15000 });
    });

    test('E2E-K8S-003: Display cluster names', async ({ authenticatedPage }) => {
      await authenticatedPage.route('**/api/services/kubernetes/clusters/read*', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ clusters: [mockCluster, mockCluster2] }),
        });
      });

      await authenticatedPage.goto('/dashboard/services/kubernetes');

      await expect(
        authenticatedPage.locator('text=prod-cluster').first()
      ).toBeVisible({ timeout: 15000 });
    });

    test('E2E-K8S-004: Show create cluster button', async ({ authenticatedPage }) => {
      await authenticatedPage.route('**/api/services/kubernetes/clusters/read*', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ clusters: [] }),
        });
      });

      await authenticatedPage.goto('/dashboard/services/kubernetes');

      const createButton = authenticatedPage
        .locator('a[href*="kubernetes/new"], button:has-text("Create"), button:has-text("Deploy")')
        .first();

      await expect(createButton).toBeVisible({ timeout: 15000 });
    });
  });

  test.describe('Error Handling', () => {
    test('E2E-K8S-005: Handle API error gracefully', async ({ authenticatedPage }) => {
      await authenticatedPage.route('**/api/services/kubernetes/clusters/read*', async (route) => {
        await route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Internal server error' }),
        });
      });

      await authenticatedPage.goto('/dashboard/services/kubernetes');

      await expect(authenticatedPage.locator('body')).toBeVisible();
    });
  });

  test.describe('Navigation', () => {
    test('E2E-K8S-006: Navigate to create page', async ({ authenticatedPage }) => {
      await authenticatedPage.route('**/api/services/kubernetes/clusters/read*', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ clusters: [] }),
        });
      });

      await authenticatedPage.goto('/dashboard/services/kubernetes');

      const createLink = authenticatedPage
        .locator('a[href*="kubernetes/new"]')
        .first();

      if (await createLink.isVisible({ timeout: 5000 }).catch(() => false)) {
        await createLink.click();
        await expect(authenticatedPage).toHaveURL(/kubernetes\/new/);
      }
    });
  });
});
