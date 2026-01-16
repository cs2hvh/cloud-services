import { defineConfig, devices } from '@playwright/test';
import path from 'path';

/**
 * Playwright Configuration for Platform Apps E2E Tests
 * 
 * Optimized for:
 * - Fast test execution (session reuse)
 * - Minimal artifact generation (only final report)
 * - Interactive mode performance
 * 
 * @see https://playwright.dev/docs/test-configuration
 */

// Auth state file path
const AUTH_FILE = path.join(__dirname, 'tests/e2e/.auth/user.json');

export default defineConfig({
  testDir: './tests/e2e',
  
  /* Global setup - runs ONCE before all tests to authenticate */
  globalSetup: './tests/e2e/global-setup.ts',
  
  /* Run tests in files in parallel - enabled for speed */
  fullyParallel: true,
  
  /* Fail the build on CI if you accidentally left test.only in the source code */
  forbidOnly: !!process.env.CI,
  
  /* Retry configuration */
  retries: process.env.CI ? 2 : 0, // No retries locally for faster feedback
  
  /* Workers - more workers for faster parallel execution */
  workers: process.env.CI ? 2 : 4,
  
  /* Global timeout for each test */
  timeout: 30000,
  
  /* Expect timeout */
  expect: {
    timeout: 10000,
  },
  
  /**
   * Reporter Configuration
   * - 'list' for console output
   * - 'html' for final report only (not per-test)
   */
  reporter: process.env.CI 
    ? [['github'], ['html', { open: 'never' }]]
    : [
        ['list'],
        ['html', { 
          outputFolder: 'playwright-report',
          open: 'never' // Don't auto-open report
        }]
      ],
  
  /* Shared settings for all projects */
  use: {
    /* Base URL */
    baseURL: process.env.BASE_URL || 'http://localhost:3000',
    
    /**
     * Storage State - REUSE AUTHENTICATED SESSION
     * This is the key setting that prevents re-login for every test
     */
    storageState: AUTH_FILE,
    
    /**
     * Trace collection - DISABLED by default for speed
     * Only enable on CI or when debugging
     */
    trace: process.env.CI ? 'on-first-retry' : 'off',
    
    /**
     * Screenshots - DISABLED for speed
     * Only capture on CI failures
     */
    screenshot: process.env.CI ? 'only-on-failure' : 'off',
    
    /**
     * Video - DISABLED for speed
     * Only capture on CI failures
     */
    video: process.env.CI ? 'retain-on-failure' : 'off',
    
    /* Faster action timeout */
    actionTimeout: 8000,
    
    /* Navigation timeout */
    navigationTimeout: 20000,
    
    /* Bypass CSP for faster loading */
    bypassCSP: true,
    
    /* Reduce motion for faster animations */
    reducedMotion: 'reduce',
    
    /* Locale for consistency */
    locale: 'en-US',
  },

  /**
   * Projects Configuration
   * 
   * For faster local development, only run Chromium
   * CI can run multiple browsers
   */
  projects: process.env.CI 
    ? [
        // CI: Run on multiple browsers
        {
          name: 'chromium',
          use: { ...devices['Desktop Chrome'] },
        },
        {
          name: 'firefox',
          use: { ...devices['Desktop Firefox'] },
        },
        {
          name: 'webkit',
          use: { ...devices['Desktop Safari'] },
        },
      ]
    : [
        // Local: Only Chromium for speed
        {
          name: 'chromium',
          use: { 
            ...devices['Desktop Chrome'],
            // Headless is faster
            headless: true,
            // Disable animations for speed
            launchOptions: {
              args: [
                '--disable-gpu',
                '--disable-dev-shm-usage',
                '--disable-setuid-sandbox',
                '--no-sandbox',
                '--disable-animations',
                '--disable-background-timer-throttling',
                '--disable-backgrounding-occluded-windows',
                '--disable-renderer-backgrounding',
              ],
            },
          },
        },
      ],

  /* Web Server configuration */
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: true, // Always reuse if running
    timeout: 120000,
    stdout: 'ignore',
    stderr: 'pipe',
  },
  
  /**
   * Output directory for test artifacts
   * Centralized location for easier cleanup
   */
  outputDir: './test-results',
  
  /**
   * Preserve output on failure only
   * This prevents cluttering the filesystem
   */
  preserveOutput: 'failures-only',
});
