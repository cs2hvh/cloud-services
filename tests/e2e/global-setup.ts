//@ts-nocheck
import { chromium, FullConfig } from '@playwright/test';
import path from 'path';
import fs from 'fs';

/**
 * Global Setup for Playwright E2E Tests
 * 
 * This runs ONCE before all tests to:
 * 1. Authenticate the user
 * 2. Save the session storage state
 * 3. All tests reuse this authenticated state
 * 
 * Benefits:
 * - Login happens only once, not per test
 * - Dramatically faster test execution
 * - More reliable tests (no auth timeouts per test)
 */

const AUTH_FILE = path.join(__dirname, '.auth', 'user.json');
const ADMIN_AUTH_FILE = path.join(__dirname, '.auth', 'admin.json');

async function globalSetup(config: FullConfig) {
  const baseURL = config.projects[0].use?.baseURL || 'http://localhost:3000';
  
  console.log('[Global Setup] Starting authentication setup...');
  console.log(`[Global Setup] Base URL: ${baseURL}`);

  // Ensure .auth directory exists
  const authDir = path.dirname(AUTH_FILE);
  if (!fs.existsSync(authDir)) {
    fs.mkdirSync(authDir, { recursive: true });
  }

  // Check if we already have valid auth state (skip re-auth if recent)
  if (fs.existsSync(AUTH_FILE)) {
    const stats = fs.statSync(AUTH_FILE);
    const ageInMinutes = (Date.now() - stats.mtimeMs) / (1000 * 60);
    
    // Reuse auth if less than 30 minutes old
    if (ageInMinutes < 30) {
      console.log(`[Global Setup] Reusing existing auth state (${Math.round(ageInMinutes)} min old)`);
      return;
    }
  }

  const browser = await chromium.launch({ 
    headless: true,
    // Faster browser launch
    args: ['--disable-gpu', '--no-sandbox', '--disable-dev-shm-usage']
  });
  
  try {
    // Authenticate regular user
    await authenticateUser(browser, baseURL, AUTH_FILE);
    
    // Optionally authenticate admin (uncomment if needed)
    // await authenticateAdmin(browser, baseURL, ADMIN_AUTH_FILE);
    
    console.log('[Global Setup] Authentication setup completed successfully!');
  } finally {
    await browser.close();
  }
}

async function authenticateUser(browser: any, baseURL: string, authFile: string) {
  const context = await browser.newContext();
  const page = await context.newPage();
  
  const email = process.env.TEST_USER_EMAIL || 'pankajsoni93444@gmail.com';
  const password = process.env.TEST_USER_PASSWORD || 'Pankaj11@';

  console.log(`[Global Setup] Authenticating user: ${email}`);

  try {
    // Navigate to sign-in page
    await page.goto(`${baseURL}/signin`, { waitUntil: 'networkidle' });
    
    // Wait for the React form to be fully loaded
    await page.waitForSelector('form', { timeout: 15000 });
    console.log('[Global Setup] Form found');

    // Fill email field
    const emailInput = page.locator('input[type="email"]').first();
    await emailInput.waitFor({ state: 'visible', timeout: 15000 });
    await emailInput.fill(email);
    console.log('[Global Setup] Email filled');

    // Fill password field
    const passwordInput = page.locator('input[type="password"]').first();
    await passwordInput.waitFor({ state: 'visible', timeout: 10000 });
    await passwordInput.fill(password);
    console.log('[Global Setup] Password filled');

    // Find the submit button and click it
    // Match the form's submit button, not its label: the button currently reads
    // "Log In", and pinning the copy meant a wording change silently broke
    // authentication for every e2e suite.
    const submitButton = page.locator('form button[type="submit"]').first();
    await submitButton.waitFor({ state: 'visible', timeout: 10000 });
    console.log('[Global Setup] Submit button found, clicking...');
    
    // Click and wait for the API response and navigation
    await Promise.race([
      // Option 1: Wait for navigation to complete (success case)
      (async () => {
        await Promise.all([
          page.waitForResponse(
            response => response.url().includes('/api/auth/signin/email') && response.status() === 200,
            { timeout: 30000 }
          ),
          submitButton.click()
        ]);
        console.log('[Global Setup] API response received');
        
        // Wait for client-side navigation
        await page.waitForURL((url: URL) => !url.pathname.includes('/signin'), { 
          timeout: 30000,
          waitUntil: 'networkidle'
        });
      })(),
      
      // Option 2: Handle 2FA case - if we're still on signin with 2FA
      (async () => {
        await page.waitForSelector('text=Two-Factor', { timeout: 60000 }).catch(() => {});
        throw new Error('2FA is enabled - please disable it for test user or provide TOTP setup');
      })()
    ]);

    console.log(`[Global Setup] Navigated to: ${page.url()}`);
    
    // Wait for app to be fully loaded
    await page.waitForLoadState('networkidle');
    
    // Small delay to ensure cookies/storage are set
    await page.waitForTimeout(2000);

    // Save the authenticated state
    await context.storageState({ path: authFile });
    
    console.log(`[Global Setup] User authenticated and state saved to: ${authFile}`);
  } catch (error) {
    console.error('[Global Setup] Authentication failed:', error);
    console.log(`[Global Setup] Current URL: ${page.url()}`);
    
    // Take a screenshot for debugging
    try {
      await page.screenshot({ path: 'auth-failure-screenshot.png', fullPage: true });
      console.log('[Global Setup] Screenshot saved to auth-failure-screenshot.png');
    } catch {}
    throw error;
  } finally {
    await context.close();
  }
}

async function authenticateAdmin(browser: any, baseURL: string, authFile: string) {
  const context = await browser.newContext();
  const page = await context.newPage();
  
  const email = process.env.TEST_ADMIN_EMAIL || 'admin@example.com';
  const password = process.env.TEST_ADMIN_PASSWORD || 'admin-password';

  console.log(`[Global Setup] Authenticating admin: ${email}`);

  try {
    await page.goto(`${baseURL}/signin`, { waitUntil: 'domcontentloaded' });
    
    const emailInput = page.locator('input[type="email"], input[name="email"]').first();
    await emailInput.waitFor({ state: 'visible', timeout: 15000 });
    await emailInput.fill(email);

    const passwordInput = page.locator('input[type="password"]').first();
    await passwordInput.fill(password);

    const submitButton = page.locator('button[type="submit"]').first();
    await submitButton.click();

    await page.waitForURL((url: URL) => !url.pathname.includes('/signin'), { 
      timeout: 60000 
    });

    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(1000);

    await context.storageState({ path: authFile });
    
    console.log(`[Global Setup] Admin authenticated and state saved to: ${authFile}`);
  } catch (error) {
    console.error('[Global Setup] Admin authentication failed:', error);
    // Don't throw - admin auth is optional
  } finally {
    await context.close();
  }
}

export default globalSetup;
