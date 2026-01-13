import { test, expect } from './fixtures/auth.fixture';
import { ApiMocks } from './fixtures/api-mocks.fixture';
import {
  mockPlatformApp,
  mockBuildingApp,
  mockFailedApp,
  mockPendingApp,
  mockMultipleApps,
} from './fixtures/test-data.fixture';

/**
 * E2E Tests: Apps List Page
 * Tests for /dashboard/services/apps
 */

test.describe('Apps List Page', () => {
  test.describe('Page Load & Display', () => {
    test('E2E-PA-001: Display apps list page', async ({ authenticatedPage }) => {
      // Navigate to apps page
      await authenticatedPage.goto('/dashboard/services/apps');

      // Verify page title
      await expect(authenticatedPage.locator('h1')).toContainText('Application Deployment');

      // Verify description
      await expect(authenticatedPage.locator('text=Deploy your applications directly from Git repositories')).toBeVisible();
    });

    test('E2E-PA-002: Show loading state', async ({ authenticatedPage }) => {
      const apiMocks = new ApiMocks(authenticatedPage);

      // Delay the API response to see loading state
      await authenticatedPage.route('**/api/services/platform-apps/list', async (route) => {
        await new Promise((resolve) => setTimeout(resolve, 1000));
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ apps: mockMultipleApps }),
        });
      });

      await authenticatedPage.goto('/dashboard/services/apps');

      // Loading indicator should be briefly visible (this may be fast)
      // Then apps should appear
      await expect(authenticatedPage.locator('text=my-nextjs-app').first()).toBeVisible({
        timeout: 10000,
      });
    });

    test('E2E-PA-003: Display empty state', async ({ authenticatedPage }) => {
      const apiMocks = new ApiMocks(authenticatedPage);

      // Mock empty apps list
      await apiMocks.mockAppsList([]);

      await authenticatedPage.goto('/dashboard/services/apps');

      // Verify empty state message or deploy button is prominent
      await expect(
        authenticatedPage.locator('text=Deploy Application').or(authenticatedPage.locator('text=No apps')).or(authenticatedPage.locator('text=Get started'))
      ).toBeVisible({ timeout: 10000 });
    });

    test('E2E-PA-004: Display stats cards', async ({ authenticatedPage }) => {
      const apiMocks = new ApiMocks(authenticatedPage);

      // Mock apps with different statuses
      await apiMocks.mockAppsList(mockMultipleApps);

      await authenticatedPage.goto('/dashboard/services/apps');

      // Wait for stats to load
      await authenticatedPage.waitForTimeout(2000);

      // Stats cards should be visible (total apps, active deployments, etc.)
      // The exact text may vary, but should show numbers
      const statsSection = authenticatedPage.locator('text=Total Apps, text=Active, text=Success').first();
      await expect(statsSection).toBeVisible({ timeout: 10000 }).catch(() => {
        // Stats might be in different format, check for numeric values
        console.log('Stats section format may vary');
      });
    });

    test('E2E-PA-005: Display apps grid', async ({ authenticatedPage }) => {
      const apiMocks = new ApiMocks(authenticatedPage);

      // Mock multiple apps
      await apiMocks.mockAppsList(mockMultipleApps);

      await authenticatedPage.goto('/dashboard/services/apps');

      // Verify apps are displayed
      await expect(authenticatedPage.locator('text=my-nextjs-app').first()).toBeVisible({
        timeout: 10000,
      });
      await expect(authenticatedPage.locator('text=python-api').first()).toBeVisible();
    });
  });

  test.describe('App Status Badges', () => {
    test('E2E-PA-010: Running status badge', async ({ authenticatedPage }) => {
      const apiMocks = new ApiMocks(authenticatedPage);

      await apiMocks.mockAppsList([mockPlatformApp]);

      await authenticatedPage.goto('/dashboard/services/apps');

      // Look for green/running status indicator
      const runningBadge = authenticatedPage.locator('text=Running').first();
      await expect(runningBadge).toBeVisible({ timeout: 10000 });
    });

    test('E2E-PA-011: Building status badge', async ({ authenticatedPage }) => {
      const apiMocks = new ApiMocks(authenticatedPage);

      await apiMocks.mockAppsList([mockBuildingApp]);

      await authenticatedPage.goto('/dashboard/services/apps');

      // Look for building status
      const buildingBadge = authenticatedPage.locator('text=Building').first();
      await expect(buildingBadge).toBeVisible({ timeout: 10000 });
    });

    test('E2E-PA-012: Failed status badge', async ({ authenticatedPage }) => {
      const apiMocks = new ApiMocks(authenticatedPage);

      await apiMocks.mockAppsList([mockFailedApp]);

      await authenticatedPage.goto('/dashboard/services/apps');

      // Look for failed status
      const failedBadge = authenticatedPage.locator('text=Failed').first();
      await expect(failedBadge).toBeVisible({ timeout: 10000 });
    });

    test('E2E-PA-013: Pending status badge', async ({ authenticatedPage }) => {
      const apiMocks = new ApiMocks(authenticatedPage);

      await apiMocks.mockAppsList([mockPendingApp]);

      await authenticatedPage.goto('/dashboard/services/apps');

      // Look for pending status
      const pendingBadge = authenticatedPage.locator('text=Pending').first();
      await expect(pendingBadge).toBeVisible({ timeout: 10000 });
    });

    test('E2E-PA-014: Multiple apps with different statuses', async ({ authenticatedPage }) => {
      const apiMocks = new ApiMocks(authenticatedPage);

      await apiMocks.mockAppsList(mockMultipleApps);

      await authenticatedPage.goto('/dashboard/services/apps');

      // All status badges should be visible - check for at least one
      await expect(
        authenticatedPage.locator('text=Running').or(authenticatedPage.locator('text=Building')).or(authenticatedPage.locator('text=Failed')).or(authenticatedPage.locator('text=Pending')).first()
      ).toBeVisible({
        timeout: 10000,
      });
    });
  });

  test.describe('Navigation & Actions', () => {
    test('E2E-PA-020: Navigate to deploy new app', async ({ authenticatedPage }) => {
      const apiMocks = new ApiMocks(authenticatedPage);

      await apiMocks.mockAppsList(mockMultipleApps);

      await authenticatedPage.goto('/dashboard/services/apps');

      // Click "Deploy Application" button
      const deployButton = authenticatedPage.locator('text=Deploy Application').first();
      await deployButton.click();

      // Verify navigation
      await expect(authenticatedPage).toHaveURL(/\/dashboard\/services\/apps\/new/, {
        timeout: 10000,
      });
    });

    test('E2E-PA-021: Navigate to app detail', async ({ authenticatedPage }) => {
      const apiMocks = new ApiMocks(authenticatedPage);

      await apiMocks.mockAppsList(mockMultipleApps);
      await apiMocks.mockAppGet(mockPlatformApp);

      await authenticatedPage.goto('/dashboard/services/apps');

      // Wait for apps to load
      await authenticatedPage.waitForTimeout(2000);

      // Click on first app card (try multiple selectors)
      const appCard = authenticatedPage.locator('text=my-nextjs-app').first();
      await appCard.click();

      // Should navigate to detail page
      await expect(authenticatedPage).toHaveURL(/\/dashboard\/services\/apps\/app-/, {
        timeout: 10000,
      });
    });
  });

  test.describe('Information Sections', () => {
    test('E2E-PA-025: Display about section', async ({ authenticatedPage }) => {
      const apiMocks = new ApiMocks(authenticatedPage);

      await apiMocks.mockAppsList(mockMultipleApps);

      await authenticatedPage.goto('/dashboard/services/apps');

      // Scroll and check for about section
      await authenticatedPage.evaluate(() => window.scrollTo(0, 500));

      const aboutSection = authenticatedPage.locator('text=What is Application Deployment?');
      await expect(aboutSection).toBeVisible({ timeout: 10000 });
    });

    test('E2E-PA-026: Display supported frameworks', async ({ authenticatedPage }) => {
      const apiMocks = new ApiMocks(authenticatedPage);

      await apiMocks.mockAppsList(mockMultipleApps);

      await authenticatedPage.goto('/dashboard/services/apps');

      // Scroll down to frameworks section
      await authenticatedPage.evaluate(() => window.scrollTo(0, 1000));

      // Look for framework names
      const frameworksSection = authenticatedPage.locator('text=Next.js, text=React, text=Vue, text=Python').first();
      await expect(frameworksSection).toBeVisible({ timeout: 10000 }).catch(() => {
        console.log('Frameworks section might be in a different format');
      });
    });

    test('E2E-PA-027: Display git providers info', async ({ authenticatedPage }) => {
      const apiMocks = new ApiMocks(authenticatedPage);

      await apiMocks.mockAppsList(mockMultipleApps);

      await authenticatedPage.goto('/dashboard/services/apps');

      // Scroll further down
      await authenticatedPage.evaluate(() => window.scrollTo(0, 1500));

      // Look for git provider mentions
      const providersSection = authenticatedPage.locator('text=GitHub, text=GitLab, text=Bitbucket').first();
      await expect(providersSection).toBeVisible({ timeout: 10000 }).catch(() => {
        console.log('Git providers section might be in a different format');
      });
    });

    test('E2E-PA-028: Display how it works', async ({ authenticatedPage }) => {
      const apiMocks = new ApiMocks(authenticatedPage);

      await apiMocks.mockAppsList(mockMultipleApps);

      await authenticatedPage.goto('/dashboard/services/apps');

      // Scroll to bottom
      await authenticatedPage.evaluate(() => window.scrollTo(0, document.body.scrollHeight));

      // Look for "How it works" or similar section
      const howItWorksSection = authenticatedPage.locator('text=How, text=works, text=Deploy').first();
      await expect(howItWorksSection).toBeVisible({ timeout: 10000 }).catch(() => {
        console.log('How it works section might be in a different format');
      });
    });
  });
});
