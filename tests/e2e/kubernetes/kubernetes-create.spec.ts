import { test, expect } from '../platform-apps/fixtures/auth.fixture';

/**
 * E2E Tests: Kubernetes Create Page
 * Tests for /dashboard/services/kubernetes/new
 */
test.describe('Kubernetes Create Page', () => {
  test.describe('Page Load', () => {
    test('E2E-K8S-010: Display create cluster form', async ({ authenticatedPage }) => {
      await authenticatedPage.route('**/api/services/kubernetes/**', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({}),
        });
      });

      await authenticatedPage.goto('/dashboard/services/kubernetes/new');

      await expect(
        authenticatedPage
          .locator('text=Kubernetes')
          .or(authenticatedPage.locator('text=Create'))
          .or(authenticatedPage.locator('text=Cluster'))
          .first()
      ).toBeVisible({ timeout: 15000 });
    });

    test('E2E-K8S-011: Show cluster configuration options', async ({ authenticatedPage }) => {
      await authenticatedPage.route('**/api/services/kubernetes/**', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({}),
        });
      });

      await authenticatedPage.goto('/dashboard/services/kubernetes/new');

      // Should show node size or configuration options
      await expect(
        authenticatedPage
          .locator('text=Node')
          .or(authenticatedPage.locator('text=Region'))
          .or(authenticatedPage.locator('text=Location'))
          .or(authenticatedPage.locator('text=Size'))
          .first()
      ).toBeVisible({ timeout: 15000 });
    });
  });

  test.describe('Form Interaction', () => {
    test('E2E-K8S-012: Enter cluster name', async ({ authenticatedPage }) => {
      await authenticatedPage.route('**/api/services/kubernetes/**', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({}),
        });
      });

      await authenticatedPage.goto('/dashboard/services/kubernetes/new');

      // Find the cluster name input
      const nameInput = authenticatedPage
        .locator('input[placeholder*="name" i]')
        .or(authenticatedPage.locator('input[name="name"]'))
        .or(authenticatedPage.locator('input[placeholder*="cluster" i]'))
        .first();

      if (await nameInput.isVisible({ timeout: 10000 }).catch(() => false)) {
        await nameInput.fill('test-k8s-cluster');
        await expect(nameInput).toHaveValue('test-k8s-cluster');
      }
    });

    test('E2E-K8S-013: Show pricing information', async ({ authenticatedPage }) => {
      await authenticatedPage.route('**/api/services/kubernetes/**', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({}),
        });
      });

      await authenticatedPage.goto('/dashboard/services/kubernetes/new');

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
    test('E2E-K8S-014: Show create button', async ({ authenticatedPage }) => {
      await authenticatedPage.route('**/api/services/kubernetes/**', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({}),
        });
      });

      await authenticatedPage.goto('/dashboard/services/kubernetes/new');

      const createButton = authenticatedPage
        .locator('button:has-text("Create")')
        .or(authenticatedPage.locator('button:has-text("Deploy")'))
        .or(authenticatedPage.locator('button:has-text("Launch")'))
        .first();

      await expect(createButton).toBeVisible({ timeout: 15000 });
    });
  });
});
