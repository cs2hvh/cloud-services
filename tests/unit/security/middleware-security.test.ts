import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

/**
 * Security Tests: Middleware & Security Headers
 *
 * Verifies security headers are configured in next.config.ts
 * and documents rate limiting behavior.
 */

vi.mock('@/lib/supabase/middleware', () => ({
  updateSession: vi.fn().mockResolvedValue(NextResponse.next()),
}));

describe('Security: Middleware & Security Headers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ==================================================================
  // Security Headers — Now configured in next.config.ts
  // ==================================================================
  describe('Security Header Configuration', () => {
    it('SEC-HDR-001: next.config.ts should have headers function configured', async () => {
      const nextConfig = await import('@/next.config');
      const config = nextConfig.default;

      // After fix: headers function should exist
      expect(config).toHaveProperty('headers');
      expect(typeof config.headers).toBe('function');
    });

    it('SEC-HDR-002: should configure all required security headers', async () => {
      const nextConfig = await import('@/next.config');
      const config = nextConfig.default;

      const headersList = await config.headers!();
      const globalHeaders = headersList[0];

      const headerNames = globalHeaders.headers.map(
        (h: { key: string }) => h.key
      );

      expect(headerNames).toContain('X-Frame-Options');
      expect(headerNames).toContain('X-Content-Type-Options');
      expect(headerNames).toContain('Strict-Transport-Security');
      expect(headerNames).toContain('Referrer-Policy');
      expect(headerNames).toContain('X-XSS-Protection');
      expect(headerNames).toContain('Permissions-Policy');
    });

    it('SEC-HDR-003: X-Frame-Options should be DENY', async () => {
      const nextConfig = await import('@/next.config');
      const config = nextConfig.default;

      const headersList = await config.headers!();
      const globalHeaders = headersList[0];

      const xFrameOptions = globalHeaders.headers.find(
        (h: { key: string }) => h.key === 'X-Frame-Options'
      );

      expect(xFrameOptions?.value).toBe('DENY');
    });

    it('SEC-HDR-004: HSTS should have long max-age with includeSubDomains', async () => {
      const nextConfig = await import('@/next.config');
      const config = nextConfig.default;

      const headersList = await config.headers!();
      const globalHeaders = headersList[0];

      const hsts = globalHeaders.headers.find(
        (h: { key: string }) => h.key === 'Strict-Transport-Security'
      );

      expect(hsts?.value).toContain('max-age=');
      expect(hsts?.value).toContain('includeSubDomains');
    });
  });

  // ==================================================================
  // Rate Limiting Behavior
  // ==================================================================
  describe('Rate Limiting', () => {
    it('SEC-MW-001: auth routes should be rate-limited', async () => {
      const { middleware } = await import('@/middleware');

      let blocked = false;
      for (let i = 0; i < 25; i++) {
        const req = new NextRequest('http://localhost:3000/api/auth/signin', {
          headers: { 'x-forwarded-for': 'rate-test-mw001' },
        });
        const res = await middleware(req);
        if (res?.status === 429) {
          blocked = true;
          break;
        }
      }

      expect(blocked).toBe(true);
    });

    it('SEC-MW-002: SSE routes bypass middleware entirely', async () => {
      const { middleware } = await import('@/middleware');

      const req = new NextRequest(
        'http://localhost:3000/api/ai-agents/agent-123/test'
      );

      const res = await middleware(req);
      expect(res?.status).toBe(200);
    });
  });
});
