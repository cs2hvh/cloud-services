import { test as base, Page } from '@playwright/test';

/**
 * Authentication Fixture
 * Provides authenticated page contexts for testing
 */

export type AuthenticatedPage = {
  authenticatedPage: Page;
  adminPage: Page;
};

/**
 * Extended test with authentication fixtures
 */
export const test = base.extend<AuthenticatedPage>({
  /**
   * Regular authenticated user page
   */
  authenticatedPage: async ({ page }, use) => {
    // Navigate to sign-in page
    await page.goto('/signin');

    // Fill in credentials from env or test-data
    const email = process.env.TEST_USER_EMAIL || 'pankajsoni93444@gmail.com';
    const password = process.env.TEST_USER_PASSWORD || 'Pankaj11@';

    console.log(`[Auth] Attempting login with email: ${email}`);

    // Wait for the form to load
    await page.waitForLoadState('domcontentloaded');

    // Look for email input (try multiple selectors)
    const emailInput = page.locator('input[type="email"], input[name="email"], input[id="email"]').first();
    await emailInput.waitFor({ state: 'visible', timeout: 10000 });
    await emailInput.fill(email);
    console.log('[Auth] Email filled');

    // Look for password input
    const passwordInput = page.locator('input[type="password"], input[name="password"], input[id="password"]').first();
    await passwordInput.waitFor({ state: 'visible', timeout: 10000 });
    await passwordInput.fill(password);
    console.log('[Auth] Password filled');

    // Look for submit button
    const submitButton = page.locator('button[type="submit"]').first();
    await submitButton.waitFor({ state: 'visible', timeout: 10000 });
    console.log('[Auth] Clicking submit button');
    await submitButton.click();

    // Wait for navigation away from signin page with better error handling
    console.log('[Auth] Waiting for navigation...');
    try {
      await page.waitForURL((url) => !url.pathname.includes('/signin'), { timeout: 45000 });
      console.log(`[Auth] Navigated to: ${page.url()}`);
    } catch (error) {
      console.error(`[Auth] Failed to navigate away from signin. Current URL: ${page.url()}`);
      throw error;
    }

    // Wait for page to be fully loaded
    await page.waitForLoadState('domcontentloaded', { timeout: 10000 });
    console.log('[Auth] Authentication successful');

    await use(page);
  },

  /**
   * Admin authenticated user page
   */
  adminPage: async ({ page }, use) => {
    // Navigate to sign-in page
    await page.goto('/signin');

    // Fill in admin credentials
    const email = process.env.TEST_ADMIN_EMAIL || 'admin@example.com';
    const password = process.env.TEST_ADMIN_PASSWORD || 'admin-password';

    // Wait for the form to load
    await page.waitForLoadState('networkidle');

    // Look for email input
    const emailInput = page.locator('input[type="email"], input[name="email"], input[placeholder*="email" i]').first();
    await emailInput.waitFor({ state: 'visible', timeout: 10000 });
    await emailInput.fill(email);

    // Look for password input
    const passwordInput = page.locator('input[type="password"], input[name="password"]').first();
    await passwordInput.fill(password);

    // Look for submit button
    const submitButton = page.locator('button[type="submit"], button:has-text("Sign in"), button:has-text("Login")').first();
    await submitButton.click();

    // Wait for navigation away from signin page
    await page.waitForURL((url) => !url.pathname.includes('/signin'), { timeout: 30000 });

    // Wait for page to be fully loaded (with reduced timeout)
    await page.waitForLoadState('domcontentloaded', { timeout: 10000 });

    await use(page);
  },
});

export { expect } from '@playwright/test';
