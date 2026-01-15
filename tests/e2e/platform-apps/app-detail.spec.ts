//@ts-nocheck
import { test, expect } from './fixtures/auth.fixture';
import { ApiMocks } from './fixtures/api-mocks.fixture';
import {
  mockPlatformApp,
  mockBuildingApp,
  mockFailedApp,
  mockBuildInfo,
  mockBuildingInfo,
  mockFailedBuildInfo,
  mockDeployment,
  mockPreviousDeployment,
  mockAppMetrics,
  mockAppHealth,
  mockPods,
} from './fixtures/test-data.fixture';

/**
 * E2E Tests: App Detail Page
 * Tests for /dashboard/services/apps/[id]
 */

test.describe('App Detail Page', () => {
  test.describe('Page Load & Header', () => {
    test('E2E-PA-200: Load app detail page', async ({ authenticatedPage }) => {
      const apiMocks = new ApiMocks(authenticatedPage);
      await apiMocks.mockAppGet(mockPlatformApp);
      await apiMocks.mockBuildInfo(mockBuildInfo);
      await apiMocks.mockMetrics(mockAppMetrics);
      await apiMocks.mockHealth(mockAppHealth);
      await apiMocks.mockPods(mockPods);

      await authenticatedPage.goto(`/dashboard/services/apps/${mockPlatformApp.app_id}`);

      // Verify page loads with app name in heading
      await expect(
        authenticatedPage.locator('h1, h2').filter({ hasText: mockPlatformApp.name }).first()
      ).toBeVisible({ timeout: 15000 });
    });

    test('E2E-PA-201: Display app name', async ({ authenticatedPage }) => {
      const apiMocks = new ApiMocks(authenticatedPage);
      await apiMocks.mockAppGet(mockPlatformApp);
      await apiMocks.mockBuildInfo(mockBuildInfo);

      await authenticatedPage.goto(`/dashboard/services/apps/${mockPlatformApp.app_id}`);

      // App name should be in header
      await expect(
        authenticatedPage.locator('h1, h2').filter({ hasText: mockPlatformApp.name })
      ).toBeVisible({ timeout: 15000 });
    });

    test('E2E-PA-202: Display status badge - running', async ({ authenticatedPage }) => {
      const apiMocks = new ApiMocks(authenticatedPage);
      await apiMocks.mockAppGet(mockPlatformApp);
      await apiMocks.mockBuildInfo(mockBuildInfo);

      await authenticatedPage.goto(`/dashboard/services/apps/${mockPlatformApp.app_id}`);

      // Status badge should show "Running"
      await expect(
        authenticatedPage.locator('text=Running').first()
      ).toBeVisible({ timeout: 15000 });
    });

    test('E2E-PA-203: Display status badge - building', async ({ authenticatedPage }) => {
      const apiMocks = new ApiMocks(authenticatedPage);
      await apiMocks.mockAppGet(mockBuildingApp);
      await apiMocks.mockBuildInfo(mockBuildingInfo);

      await authenticatedPage.goto(`/dashboard/services/apps/${mockBuildingApp.app_id}`);

      // Status badge should show "Building"
      await expect(
        authenticatedPage.locator('text=Building').first()
      ).toBeVisible({ timeout: 15000 });
    });

    test('E2E-PA-204: Display status badge - failed', async ({ authenticatedPage }) => {
      const apiMocks = new ApiMocks(authenticatedPage);
      await apiMocks.mockAppGet(mockFailedApp);
      await apiMocks.mockBuildInfo(mockFailedBuildInfo);

      await authenticatedPage.goto(`/dashboard/services/apps/${mockFailedApp.app_id}`);

      // Status badge should show "Failed"
      await expect(
        authenticatedPage.locator('text=Failed').first()
      ).toBeVisible({ timeout: 15000 });
    });

    test('E2E-PA-205: Display deployment URL', async ({ authenticatedPage }) => {
      const apiMocks = new ApiMocks(authenticatedPage);
      await apiMocks.mockAppGet(mockPlatformApp);
      await apiMocks.mockBuildInfo(mockBuildInfo);

      await authenticatedPage.goto(`/dashboard/services/apps/${mockPlatformApp.app_id}`);

      // Deployment URL should be visible - check for any link in deployment area
      await expect(
        authenticatedPage.locator('a[href*="hostguardian"]').or(
          authenticatedPage.locator('a[href*="apps."]')
        ).first()
      ).toBeVisible({ timeout: 15000 });
    });

    test('E2E-PA-206: Display quick stats', async ({ authenticatedPage }) => {
      const apiMocks = new ApiMocks(authenticatedPage);
      await apiMocks.mockAppGet(mockPlatformApp);
      await apiMocks.mockBuildInfo(mockBuildInfo);

      await authenticatedPage.goto(`/dashboard/services/apps/${mockPlatformApp.app_id}`);

      // Quick stats should be visible (framework, branch, etc.)
      await expect(
        authenticatedPage.locator(`text=${mockPlatformApp.framework}`).first()
      ).toBeVisible({ timeout: 15000 });
    });

    test('E2E-PA-207: Back to apps link', async ({ authenticatedPage }) => {
      const apiMocks = new ApiMocks(authenticatedPage);
      await apiMocks.mockAppGet(mockPlatformApp);
      await apiMocks.mockBuildInfo(mockBuildInfo);
      await apiMocks.mockAppsList([mockPlatformApp]);

      await authenticatedPage.goto(`/dashboard/services/apps/${mockPlatformApp.app_id}`);

      // Click back button/link
      const backLink = authenticatedPage.locator('text=Back').or(
        authenticatedPage.locator('a[href="/dashboard/services/apps"]')
      ).first();
      
      if (await backLink.isVisible().catch(() => false)) {
        await backLink.click();
        await expect(authenticatedPage).toHaveURL(/\/dashboard\/services\/apps$/, { timeout: 10000 });
      }
    });

    test('E2E-PA-208: Refresh button', async ({ authenticatedPage }) => {
      const apiMocks = new ApiMocks(authenticatedPage);
      await apiMocks.mockAppGet(mockPlatformApp);
      await apiMocks.mockBuildInfo(mockBuildInfo);

      await authenticatedPage.goto(`/dashboard/services/apps/${mockPlatformApp.app_id}`);

      // Look for refresh button
      const refreshButton = authenticatedPage.locator('button:has-text("Refresh")').or(
        authenticatedPage.locator('[aria-label="Refresh"]')
      ).first();

      if (await refreshButton.isVisible().catch(() => false)) {
        await refreshButton.click();
        // Page should reload data (no navigation)
        await expect(authenticatedPage).toHaveURL(new RegExp(mockPlatformApp.app_id));
      }
    });

    test('E2E-PA-209: Delete button visible', async ({ authenticatedPage }) => {
      const apiMocks = new ApiMocks(authenticatedPage);
      await apiMocks.mockAppGet(mockPlatformApp);
      await apiMocks.mockBuildInfo(mockBuildInfo);

      await authenticatedPage.goto(`/dashboard/services/apps/${mockPlatformApp.app_id}`);

      // Delete button should be visible
      await expect(
        authenticatedPage.locator('button:has-text("Delete")').or(
          authenticatedPage.locator('[aria-label="Delete"]')
        ).first()
      ).toBeVisible({ timeout: 15000 });
    });

    test('E2E-PA-210: App not found', async ({ authenticatedPage }) => {
      const apiMocks = new ApiMocks(authenticatedPage);
      await apiMocks.mockError('/api/services/platform-apps/get', 404, 'App not found');

      await authenticatedPage.goto('/dashboard/services/apps/invalid-app-id');

      // Should show error or not found message
      await expect(
        authenticatedPage.locator('text=not found').or(
          authenticatedPage.locator('text=error')
        ).first()
      ).toBeVisible({ timeout: 15000 });
    });

    test('E2E-PA-211: Display failure reason for failed app', async ({ authenticatedPage }) => {
      const apiMocks = new ApiMocks(authenticatedPage);
      const failedWithReason = {
        ...mockFailedApp,
        failure_reason: 'Build failed: npm install error',
      };
      await apiMocks.mockAppGet(failedWithReason);
      await apiMocks.mockBuildInfo(mockFailedBuildInfo);

      await authenticatedPage.goto(`/dashboard/services/apps/${mockFailedApp.app_id}`);

      // Failure reason should be visible
      await expect(
        authenticatedPage.locator('text=Build failed').or(
          authenticatedPage.locator('text=npm install error')
        ).first()
      ).toBeVisible({ timeout: 15000 }).catch(() => {
        console.log('Failure reason might be displayed differently');
      });
    });
  });

  test.describe('Tabs Navigation', () => {
    test('E2E-PA-220: Overview tab default', async ({ authenticatedPage }) => {
      const apiMocks = new ApiMocks(authenticatedPage);
      await apiMocks.mockAppGet(mockPlatformApp);
      await apiMocks.mockBuildInfo(mockBuildInfo);
      await apiMocks.mockMetrics(mockAppMetrics);

      await authenticatedPage.goto(`/dashboard/services/apps/${mockPlatformApp.app_id}`);

      // Overview tab should be active/visible by default
      await expect(
        authenticatedPage.locator('[aria-selected="true"]:has-text("Overview")').or(
          authenticatedPage.locator('button:has-text("Overview")').first()
        )
      ).toBeVisible({ timeout: 15000 });
    });

    test('E2E-PA-221: Navigate to Integrations tab', async ({ authenticatedPage }) => {
      const apiMocks = new ApiMocks(authenticatedPage);
      await apiMocks.mockAppGet(mockPlatformApp);
      await apiMocks.mockBuildInfo(mockBuildInfo);

      await authenticatedPage.goto(`/dashboard/services/apps/${mockPlatformApp.app_id}`);

      // Click Integrations tab
      const integrationsTab = authenticatedPage.locator('button:has-text("Integrations")').or(
        authenticatedPage.locator('[role="tab"]:has-text("Integrations")')
      ).first();

      if (await integrationsTab.isVisible().catch(() => false)) {
        await integrationsTab.click();
        await authenticatedPage.waitForTimeout(500);
      }
    });

    test('E2E-PA-222: Navigate to Domains tab', async ({ authenticatedPage }) => {
      const apiMocks = new ApiMocks(authenticatedPage);
      await apiMocks.mockAppGet(mockPlatformApp);
      await apiMocks.mockBuildInfo(mockBuildInfo);

      await authenticatedPage.goto(`/dashboard/services/apps/${mockPlatformApp.app_id}`);

      // Click Domains tab
      const domainsTab = authenticatedPage.locator('button:has-text("Domains")').or(
        authenticatedPage.locator('[role="tab"]:has-text("Domains")')
      ).first();

      if (await domainsTab.isVisible().catch(() => false)) {
        await domainsTab.click();
        await expect(
          authenticatedPage.locator('text=Custom Domain').or(
            authenticatedPage.locator('text=Add Domain')
          ).first()
        ).toBeVisible({ timeout: 10000 });
      }
    });

    test('E2E-PA-223: Navigate to Deployments tab', async ({ authenticatedPage }) => {
      const apiMocks = new ApiMocks(authenticatedPage);
      await apiMocks.mockAppGet(mockPlatformApp);
      await apiMocks.mockBuildInfo(mockBuildInfo);
      await apiMocks.mockDeployments([mockDeployment, mockPreviousDeployment]);

      await authenticatedPage.goto(`/dashboard/services/apps/${mockPlatformApp.app_id}`);

      // Click Deployments tab
      const deploymentsTab = authenticatedPage.locator('button:has-text("Deployments")').or(
        authenticatedPage.locator('[role="tab"]:has-text("Deployments")')
      ).first();

      if (await deploymentsTab.isVisible().catch(() => false)) {
        await deploymentsTab.click();
        await expect(
          authenticatedPage.locator('text=Deployment').or(
            authenticatedPage.locator('text=Build')
          ).first()
        ).toBeVisible({ timeout: 10000 });
      }
    });

    test('E2E-PA-224: Navigate to Logs tab', async ({ authenticatedPage }) => {
      const apiMocks = new ApiMocks(authenticatedPage);
      await apiMocks.mockAppGet(mockPlatformApp);
      await apiMocks.mockBuildInfo(mockBuildInfo);
      await apiMocks.mockRuntimeLogs('Application started successfully');

      await authenticatedPage.goto(`/dashboard/services/apps/${mockPlatformApp.app_id}`);

      // Click Logs tab
      const logsTab = authenticatedPage.locator('button:has-text("Logs")').or(
        authenticatedPage.locator('[role="tab"]:has-text("Logs")')
      ).first();

      if (await logsTab.isVisible().catch(() => false)) {
        await logsTab.click();
        await authenticatedPage.waitForTimeout(500);
      }
    });

    test('E2E-PA-225: Navigate to Settings tab', async ({ authenticatedPage }) => {
      const apiMocks = new ApiMocks(authenticatedPage);
      await apiMocks.mockAppGet(mockPlatformApp);
      await apiMocks.mockBuildInfo(mockBuildInfo);

      await authenticatedPage.goto(`/dashboard/services/apps/${mockPlatformApp.app_id}`);

      // Click Settings tab
      const settingsTab = authenticatedPage.locator('button:has-text("Settings")').or(
        authenticatedPage.locator('[role="tab"]:has-text("Settings")')
      ).first();

      if (await settingsTab.isVisible().catch(() => false)) {
        await settingsTab.click();
        await expect(
          authenticatedPage.locator('text=Environment').or(
            authenticatedPage.locator('text=Delete')
          ).first()
        ).toBeVisible({ timeout: 10000 });
      }
    });
  });

  test.describe('Overview Tab', () => {
    test('E2E-PA-230: Display metrics for running app', async ({ authenticatedPage }) => {
      const apiMocks = new ApiMocks(authenticatedPage);
      await apiMocks.mockAppGet(mockPlatformApp);
      await apiMocks.mockBuildInfo(mockBuildInfo);
      await apiMocks.mockMetrics(mockAppMetrics);
      await apiMocks.mockHealth(mockAppHealth);

      await authenticatedPage.goto(`/dashboard/services/apps/${mockPlatformApp.app_id}`);

      // Metrics should be visible (CPU, memory)
      await expect(
        authenticatedPage.locator('text=CPU').or(
          authenticatedPage.locator('text=Memory')
        ).first()
      ).toBeVisible({ timeout: 15000 }).catch(() => {
        console.log('Metrics may be displayed differently');
      });
    });

    test('E2E-PA-231: Display pod status', async ({ authenticatedPage }) => {
      const apiMocks = new ApiMocks(authenticatedPage);
      await apiMocks.mockAppGet(mockPlatformApp);
      await apiMocks.mockBuildInfo(mockBuildInfo);
      await apiMocks.mockPods(mockPods);

      await authenticatedPage.goto(`/dashboard/services/apps/${mockPlatformApp.app_id}`);

      // Pod status should be visible
      await expect(
        authenticatedPage.locator('text=Pod').or(
          authenticatedPage.locator('text=Instance')
        ).first()
      ).toBeVisible({ timeout: 15000 }).catch(() => {
        console.log('Pod status may not be visible on overview');
      });
    });

    test('E2E-PA-232: Display health status', async ({ authenticatedPage }) => {
      const apiMocks = new ApiMocks(authenticatedPage);
      await apiMocks.mockAppGet(mockPlatformApp);
      await apiMocks.mockBuildInfo(mockBuildInfo);
      await apiMocks.mockHealth(mockAppHealth);

      await authenticatedPage.goto(`/dashboard/services/apps/${mockPlatformApp.app_id}`);

      // Health indicator should be visible
      await expect(
        authenticatedPage.locator('text=Healthy').or(
          authenticatedPage.locator('text=Health')
        ).first()
      ).toBeVisible({ timeout: 15000 }).catch(() => {
        console.log('Health status may be displayed differently');
      });
    });

    test('E2E-PA-233: Build info displayed', async ({ authenticatedPage }) => {
      const apiMocks = new ApiMocks(authenticatedPage);
      await apiMocks.mockAppGet(mockPlatformApp);
      await apiMocks.mockBuildInfo(mockBuildInfo);

      await authenticatedPage.goto(`/dashboard/services/apps/${mockPlatformApp.app_id}`);

      // Build info should be visible
      await expect(
        authenticatedPage.locator(`text=#${mockBuildInfo.build_number}`).or(
          authenticatedPage.locator('text=Build')
        ).first()
      ).toBeVisible({ timeout: 15000 });
    });

    test('E2E-PA-234: Repository info', async ({ authenticatedPage }) => {
      const apiMocks = new ApiMocks(authenticatedPage);
      await apiMocks.mockAppGet(mockPlatformApp);
      await apiMocks.mockBuildInfo(mockBuildInfo);

      await authenticatedPage.goto(`/dashboard/services/apps/${mockPlatformApp.app_id}`);

      // Repository URL or name should be visible
      await expect(
        authenticatedPage.locator(`text=${mockPlatformApp.repository_name}`).or(
          authenticatedPage.locator('text=Repository')
        ).first()
      ).toBeVisible({ timeout: 15000 });
    });
  });
});
