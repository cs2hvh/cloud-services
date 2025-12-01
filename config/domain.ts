/**
 * Domain Configuration
 * Centralized domain settings for app deployments
 */

// Get the app domain from environment or use default
export const APP_DOMAIN = process.env.APP_DOMAIN || 'galaxyhvh.com';

/**
 * Get the full domain for an app
 * @param appName - The app name (subdomain)
 * @returns Full domain string like "myapp.galaxyhvh.com"
 */
export function getAppDomain(appName: string): string {
  return `${appName}.${APP_DOMAIN}`;
}

/**
 * Get the full URL for an app
 * @param appName - The app name (subdomain)
 * @param protocol - Protocol to use (default: https)
 * @returns Full URL string like "https://myapp.galaxyhvh.com"
 */
export function getAppUrl(appName: string, protocol: string = 'https'): string {
  return `${protocol}://${getAppDomain(appName)}`;
}
