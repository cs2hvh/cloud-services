import { render, RenderOptions } from '@testing-library/react';
import { ReactElement } from 'react';
import { expect, vi } from 'vitest';

/**
 * Test helper utilities for database cluster tests
 */

/**
 * Custom render function that wraps components with necessary providers
 */
export function renderWithProviders(
  ui: ReactElement,
  options?: Omit<RenderOptions, 'wrapper'>
) {
  return render(ui, { ...options });
}

/**
 * Mock authenticated user session
 */
export function mockAuthenticatedUser(userId?: string) {
  const mockUser = {
    id: userId || '550e8400-e29b-41d4-a716-446655440000',
    email: 'test@example.com',
    name: 'Test User',
  };

  vi.mock('@/lib/auth/server-auth', () => ({
    authenticateUser: vi.fn(() => Promise.resolve({
      authenticated: true,
      user: mockUser,
      response: null,
    })),
  }));

  return mockUser;
}

/**
 * Mock unauthenticated user session
 */
export function mockUnauthenticatedUser() {
  vi.mock('@/lib/auth/server-auth', () => ({
    authenticateUser: vi.fn(() => Promise.resolve({
      authenticated: false,
      user: null,
      response: new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401 }
      ),
    })),
  }));
}

/**
 * Mock DigitalOcean API response
 */
export function mockDigitalOceanAPI(endpoint: string, response: any, status = 200) {
  return vi.fn((url: string) => {
    if (url.includes(endpoint)) {
      return Promise.resolve({
        status,
        data: response,
      });
    }
    return Promise.reject(new Error('Endpoint not mocked'));
  });
}

/**
 * Mock Supabase query
 */
export function mockSupabaseQuery(table: string, operation: string, response: any) {
  const mockResult = {
    success: true,
    data: response,
    error: null,
  };

  return vi.fn(() => Promise.resolve(mockResult));
}

/**
 * Create a mock NextRequest
 */
export function createMockRequest(url: string, options: RequestInit = {}) {
  return new Request(url, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
    ...options,
  }) as any; // Cast to any for Next.js compatibility
}

/**
 * Create a mock POST request with JSON body
 */
export function createMockPostRequest(url: string, body: any) {
  return createMockRequest(url, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

/**
 * Create a mock PUT request with JSON body
 */
export function createMockPutRequest(url: string, body: any) {
  return createMockRequest(url, {
    method: 'PUT',
    body: JSON.stringify(body),
  });
}

/**
 * Create a mock DELETE request
 */
export function createMockDeleteRequest(url: string, body?: any) {
  return createMockRequest(url, {
    method: 'DELETE',
    body: body ? JSON.stringify(body) : undefined,
  });
}

/**
 * Wait for async operations to complete
 */
export function waitForAsync(ms = 0) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Mock encryption/decryption
 */
export function mockEncryption() {
  vi.mock('@/config/functions', () => ({
    Encryption: {
      encrypt: vi.fn((data: string) => ({
        iv: 'test-iv',
        encryptedData: `encrypted-${data}`,
      })),
      decrypt: vi.fn((encryptedData: any) => {
        if (typeof encryptedData === 'string') {
          return encryptedData.replace('encrypted-', '');
        }
        return encryptedData.encryptedData.replace('encrypted-', '');
      }),
    },
  }));
}

/**
 * Mock API axios instance
 */
export function mockAxiosAPI() {
  return {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
    patch: vi.fn(),
  };
}

/**
 * Extract JSON from Response
 */
export async function getResponseJSON(response: Response) {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

/**
 * Assert response status and return JSON
 */
export async function expectResponseStatus(
  response: Response,
  expectedStatus: number
) {
  const json = await getResponseJSON(response);
  expect(response.status).toBe(expectedStatus);
  return json;
}

/**
 * Generate valid UUID for testing
 */
export function generateUUID() {
  return '550e8400-e29b-41d4-a716-446655440000';
}

/**
 * Generate random cluster name
 */
export function generateClusterName(prefix = 'test') {
  return `${prefix}-db-${Math.random().toString(36).substring(7)}`;
}

/**
 * Mock toast notifications
 */
export function mockToast() {
  const toast = {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
    loading: vi.fn(),
  };

  vi.mock('sonner', () => ({
    toast,
  }));

  return toast;
}

/**
 * Mock useRouter from next/navigation
 */
export function mockNextRouter() {
  const push = vi.fn();
  const replace = vi.fn();
  const back = vi.fn();
  const refresh = vi.fn();

  vi.mock('next/navigation', () => ({
    useRouter: () => ({
      push,
      replace,
      back,
      refresh,
      prefetch: vi.fn(),
      forward: vi.fn(),
    }),
    usePathname: () => '/',
    useSearchParams: () => new URLSearchParams(),
    useParams: () => ({}),
  }));

  return { push, replace, back, refresh };
}

/**
 * Verify encryption was called
 */
export function expectEncryptionCalled(encryptFn: any, data: string) {
  expect(encryptFn).toHaveBeenCalledWith(
    data,
    expect.any(String)
  );
}

/**
 * Verify decryption was called
 */
export function expectDecryptionCalled(decryptFn: any, encryptedData: any) {
  expect(decryptFn).toHaveBeenCalledWith(
    encryptedData,
    expect.any(String)
  );
}
