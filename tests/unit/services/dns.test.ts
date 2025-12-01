import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { DNSService } from '@/lib/services/dns';
import cloudflare from '@/lib/cloudflare';

// Mock the cloudflare module
vi.mock('@/lib/cloudflare', () => ({
  default: {
    dns: {
      records: {
        create: vi.fn(),
        list: vi.fn(),
        delete: vi.fn(),
      },
    },
  },
}));

// Mock the domain config to use test domain
vi.mock('@/config/domain', () => ({
  APP_DOMAIN: 'galaxyhvh.com',
  getAppDomain: (appName: string) => `${appName}.galaxyhvh.com`,
  getAppUrl: (appName: string, protocol: string = 'https') => `${protocol}://${appName}.galaxyhvh.com`,
}));

describe('DNSService', () => {
  beforeEach(() => {
    // Clear all mocks before each test
    vi.clearAllMocks();
    
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
    it('should create a DNS record successfully', async () => {
      // Arrange
      const appName = 'test-app';
      const ipAddress = '192.168.1.1';
      
      // Act
      await DNSService.createRecord(appName, ipAddress);

      // Assert
      expect(cloudflare.dns.records.create).toHaveBeenCalledWith({
        type: 'A',
        name: appName,
        proxied: false,
        content: ipAddress,
        ttl: 300,
        zone_id: 'test-zone-id',
      });
    });

    it('should throw an error if CLOUDFLARE_ZONE_ID is not configured', async () => {
      // Arrange
      delete process.env.CLOUDFLARE_ZONE_ID;
      const appName = 'test-app';
      const ipAddress = '192.168.1.1';

      // Act & Assert
      await expect(DNSService.createRecord(appName, ipAddress)).rejects.toThrow(
        'CLOUDFLARE_ZONE_ID not configured'
      );
    });

    it('should throw an error if CLOUDFLARE_API_TOKEN is not configured', async () => {
      // Arrange
      delete process.env.CLOUDFLARE_API_TOKEN;
      const appName = 'test-app';
      const ipAddress = '192.168.1.1';

      // Act & Assert
      await expect(DNSService.createRecord(appName, ipAddress)).rejects.toThrow(
        'CLOUDFLARE_API_TOKEN not configured'
      );
    });

    it('should handle Cloudflare API errors gracefully', async () => {
      // Arrange
      const appName = 'test-app';
      const ipAddress = '192.168.1.1';
      const errorMessage = 'Cloudflare API error';
      
      vi.mocked(cloudflare.dns.records.create).mockRejectedValue(
        new Error(errorMessage)
      );

      // Act & Assert
      await expect(DNSService.createRecord(appName, ipAddress)).rejects.toThrow(
        `Failed to create DNS record: ${errorMessage}`
      );
    });
  });

  describe('deleteRecord', () => {
    it('should delete DNS records successfully', async () => {
      // Arrange
      const appName = 'test-app';
      
      vi.mocked(cloudflare.dns.records.list).mockResolvedValue({
        result: [
          {
            id: 'record-1',
            name: `${appName}.galaxyhvh.com`,
            type: 'A',
          },
          {
            id: 'record-2',
            name: `${appName}.galaxyhvh.com`,
            type: 'TXT',
          },
        ],
      } as any);
      
      vi.mocked(cloudflare.dns.records.delete).mockResolvedValue({} as any);

      // Act
      await DNSService.deleteRecord(appName);

      // Assert
      expect(cloudflare.dns.records.list).toHaveBeenCalledWith({
        zone_id: 'test-zone-id',
      });
      
      // Should delete both records
      expect(cloudflare.dns.records.delete).toHaveBeenCalledTimes(2);
      expect(cloudflare.dns.records.delete).toHaveBeenCalledWith('record-1', {
        zone_id: 'test-zone-id',
      });
      expect(cloudflare.dns.records.delete).toHaveBeenCalledWith('record-2', {
        zone_id: 'test-zone-id',
      });
    });

    it('should handle when no matching records are found', async () => {
      // Arrange
      const appName = 'non-existent-app';
      
      vi.mocked(cloudflare.dns.records.list).mockResolvedValue({
        result: [
          {
            id: 'record-1',
            name: 'other-app.galaxyhvh.com',
            type: 'A',
          },
        ],
      } as any);

      // Act
      await DNSService.deleteRecord(appName);

      // Assert
      expect(cloudflare.dns.records.list).toHaveBeenCalledWith({
        zone_id: 'test-zone-id',
      });
      
      // Should not attempt to delete any records
      expect(cloudflare.dns.records.delete).not.toHaveBeenCalled();
    });
  });
});