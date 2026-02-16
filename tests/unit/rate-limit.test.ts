import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { rateLimit, clearRateLimits } from '@/lib/rate-limit';
import { NextRequest } from 'next/server';

function createMockNextRequest(headers: Record<string, string> = {}): NextRequest {
  const req = new NextRequest('http://localhost:3000/api/test', {
    headers: new Headers(headers),
  });
  return req;
}

describe('rate-limit', () => {
  beforeEach(() => {
    clearRateLimits();
  });

  afterEach(() => {
    clearRateLimits();
  });

  // ============================================
  // rateLimit.check — Basic Functionality
  // ============================================
  describe('rateLimit.check', () => {
    it('should allow requests within limit', async () => {
      const limiter = rateLimit({ interval: 60000, uniqueTokenPerInterval: 500 });
      const req = createMockNextRequest({ 'x-forwarded-for': '1.2.3.4' });

      // Should not throw for first request
      await expect(limiter.check(req, 5)).resolves.toBeUndefined();
    });

    it('should allow multiple requests up to limit', async () => {
      const limiter = rateLimit({ interval: 60000, uniqueTokenPerInterval: 500 });
      const req = createMockNextRequest({ 'x-forwarded-for': '1.2.3.4' });

      // Should allow up to 5 requests
      for (let i = 0; i < 5; i++) {
        await expect(limiter.check(req, 5)).resolves.toBeUndefined();
      }
    });

    it('should throw after limit exceeded', async () => {
      const limiter = rateLimit({ interval: 60000, uniqueTokenPerInterval: 500 });
      const req = createMockNextRequest({ 'x-forwarded-for': '1.2.3.4' });

      // Use up all 3 allowed
      for (let i = 0; i < 3; i++) {
        await limiter.check(req, 3);
      }

      // 4th request should throw
      await expect(limiter.check(req, 3)).rejects.toThrow('Rate limit exceeded');
    });

    it('should track different IPs separately', async () => {
      const limiter = rateLimit({ interval: 60000, uniqueTokenPerInterval: 500 });
      const req1 = createMockNextRequest({ 'x-forwarded-for': '1.1.1.1' });
      const req2 = createMockNextRequest({ 'x-forwarded-for': '2.2.2.2' });

      // Use up limit for IP 1
      for (let i = 0; i < 2; i++) {
        await limiter.check(req1, 2);
      }
      await expect(limiter.check(req1, 2)).rejects.toThrow('Rate limit exceeded');

      // IP 2 should still be allowed
      await expect(limiter.check(req2, 2)).resolves.toBeUndefined();
    });

    it('should use custom token when provided', async () => {
      const limiter = rateLimit({ interval: 60000, uniqueTokenPerInterval: 500 });
      const req = createMockNextRequest({ 'x-forwarded-for': '1.2.3.4' });

      // Use custom token
      await limiter.check(req, 2, 'user-123');
      await limiter.check(req, 2, 'user-123');
      await expect(limiter.check(req, 2, 'user-123')).rejects.toThrow('Rate limit exceeded');

      // Same IP but different token should still work
      await expect(limiter.check(req, 2, 'user-456')).resolves.toBeUndefined();
    });

    it('should default limit to 5 when not specified', async () => {
      const limiter = rateLimit({ interval: 60000, uniqueTokenPerInterval: 500 });
      const req = createMockNextRequest({ 'x-forwarded-for': '5.5.5.5' });

      // Default limit is 5, so 5 requests should pass
      for (let i = 0; i < 5; i++) {
        await expect(limiter.check(req)).resolves.toBeUndefined();
      }

      // 6th should throw
      await expect(limiter.check(req)).rejects.toThrow('Rate limit exceeded');
    });
  });

  // ============================================
  // IP Extraction
  // ============================================
  describe('IP extraction', () => {
    it('should prefer x-forwarded-for header', async () => {
      const limiter = rateLimit({ interval: 60000, uniqueTokenPerInterval: 500 });

      const req = createMockNextRequest({
        'x-forwarded-for': '10.0.0.1',
        'x-real-ip': '10.0.0.2',
      });

      await limiter.check(req, 1);
      // Now check that using x-forwarded-for IP is used (rate limited)
      await expect(limiter.check(req, 1)).rejects.toThrow();
    });

    it('should fall back to x-real-ip', async () => {
      const limiter = rateLimit({ interval: 60000, uniqueTokenPerInterval: 500 });

      const req = createMockNextRequest({ 'x-real-ip': '10.0.0.2' });

      await limiter.check(req, 1);
      await expect(limiter.check(req, 1)).rejects.toThrow();
    });

    it('should use anonymous when no IP headers', async () => {
      const limiter = rateLimit({ interval: 60000, uniqueTokenPerInterval: 500 });

      const req = createMockNextRequest({});

      await limiter.check(req, 1);
      await expect(limiter.check(req, 1)).rejects.toThrow();
    });
  });

  // ============================================
  // clearRateLimits
  // ============================================
  describe('clearRateLimits', () => {
    it('should clear all stored limits', async () => {
      const limiter = rateLimit({ interval: 60000, uniqueTokenPerInterval: 500 });
      const req = createMockNextRequest({ 'x-forwarded-for': '9.9.9.9' });

      // Exhaust the limit
      await limiter.check(req, 1);
      await expect(limiter.check(req, 1)).rejects.toThrow();

      // Clear and try again
      clearRateLimits();

      await expect(limiter.check(req, 1)).resolves.toBeUndefined();
    });
  });

  // ============================================
  // Interval Reset
  // ============================================
  describe('Interval-based key rotation', () => {
    it('should reset counts in a new interval window', async () => {
      // Use a very short interval to test rotation
      const limiter = rateLimit({ interval: 100, uniqueTokenPerInterval: 500 });
      const req = createMockNextRequest({ 'x-forwarded-for': '7.7.7.7' });

      await limiter.check(req, 1);
      await expect(limiter.check(req, 1)).rejects.toThrow();

      // Wait for interval to pass
      await new Promise((resolve) => setTimeout(resolve, 150));

      // New interval window — should be allowed again
      await expect(limiter.check(req, 1)).resolves.toBeUndefined();
    });
  });

  // ============================================
  // Multiple Limiter Instances
  // ============================================
  describe('Multiple limiter instances', () => {
    it('should share the same underlying store', async () => {
      const limiter1 = rateLimit({ interval: 60000, uniqueTokenPerInterval: 500 });
      const limiter2 = rateLimit({ interval: 60000, uniqueTokenPerInterval: 500 });
      const req = createMockNextRequest({ 'x-forwarded-for': '8.8.8.8' });

      // Use limiter1
      await limiter1.check(req, 2);

      // limiter2 uses same store key pattern, so count should be shared
      await limiter2.check(req, 2);

      // 3rd request from either should fail
      await expect(limiter1.check(req, 2)).rejects.toThrow();
    });
  });
});
