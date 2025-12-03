import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DNSService } from '@/lib/services/dns';

describe('DNSService Integration', () => {
  beforeEach(() => {
    // Set required environment variables
    process.env.CLOUDFLARE_ZONE_ID = 'test-zone-id';
    process.env.CLOUDFLARE_API_TOKEN = 'test-api-token';
  });

  afterEach(() => {
    // Clear environment variables
    delete process.env.CLOUDFLARE_ZONE_ID;
    delete process.env.CLOUDFLARE_API_TOKEN;
  });

  describe('createRecord', () => {
    it('should validate required environment variables', async () => {
      // Test missing CLOUDFLARE_ZONE_ID
      delete process.env.CLOUDFLARE_ZONE_ID;
      await expect(DNSService.createRecord('test-app', '192.168.1.1'))
        .rejects
        .toThrow('CLOUDFLARE_ZONE_ID not configured');

      // Test missing CLOUDFLARE_API_TOKEN
      process.env.CLOUDFLARE_ZONE_ID = 'test-zone-id';
      delete process.env.CLOUDFLARE_API_TOKEN;
      await expect(DNSService.createRecord('test-app', '192.168.1.1'))
        .rejects
        .toThrow('CLOUDFLARE_API_TOKEN not configured');
    });
  });

  describe('deleteRecord', () => {
    it('should validate required environment variables', async () => {
      // Test missing CLOUDFLARE_ZONE_ID
      delete process.env.CLOUDFLARE_ZONE_ID;
      await expect(DNSService.deleteRecord('test-app'))
        .rejects
        .toThrow('CLOUDFLARE_ZONE_ID not configured');
    });
  });
});