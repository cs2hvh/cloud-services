import { test as base, Page } from '@playwright/test';

/**
 * Authentication Fixture for Platform Apps E2E Tests
 * 
 * OPTIMIZED APPROACH:
 * - Authentication happens ONCE in global-setup.ts
 * - Session is stored in .auth/user.json
 * - All tests reuse the stored session via storageState in playwright.config.ts
 * - No re-login per test!
 * 
 * The authenticatedPage fixture now simply provides a page
 * that already has the authenticated session from storageState.
 */

export type AuthenticatedPage = {
  authenticatedPage: Page;
  adminPage: Page;
};

/**
 * Extended test with authentication fixtures
 * 
 * Since storageState is configured globally in playwright.config.ts,
 * the page is already authenticated when tests start.
 */
export const test = base.extend<AuthenticatedPage>({
  /**
   * Regular authenticated user page
   * Already authenticated via global storageState
   */
  authenticatedPage: async ({ page }, use) => {
    // Page is already authenticated via storageState in config
    // Just verify we're not on signin page
    const currentUrl = page.url();
    
    if (currentUrl.includes('/signin')) {
      // Redirect to dashboard if somehow on signin
      await page.goto('/dashboard');
      await page.waitForLoadState('domcontentloaded');
    }
    
    await use(page);
  },

  /**
   * Admin authenticated user page
   * Note: For admin, you may need a separate storageState
   * configured in a separate project in playwright.config.ts
   */
  adminPage: async ({ page }, use) => {
    // For admin tests, you would typically:
    // 1. Have a separate auth file (.auth/admin.json)
    // 2. Configure a separate project with that storageState
    // For now, use the same authenticated page
    
    const currentUrl = page.url();
    
    if (currentUrl.includes('/signin')) {
      await page.goto('/dashboard');
      await page.waitForLoadState('domcontentloaded');
    }
    
    await use(page);
  },
});

export { expect } from '@playwright/test';
