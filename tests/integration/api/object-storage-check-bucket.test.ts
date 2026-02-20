import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET } from '@/app/api/services/object-storage/check-bucket/route';

vi.mock('@aws-sdk/client-s3');
vi.mock('@/lib/aws/s3-client');

describe('GET /api/services/object-storage/check-bucket', () => {
  const baseUrl = 'http://localhost:3000/api/services/object-storage/check-bucket';

  function createRequest(params: Record<string, string> = {}) {
    const url = new URL(baseUrl);
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
    return new Request(url.toString(), { method: 'GET' });
  }

  let mockSend: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.clearAllMocks();

    mockSend = vi.fn();
    const { createS3ClientFromAccessKey } = await import('@/lib/aws/s3-client');
    vi.mocked(createS3ClientFromAccessKey).mockReturnValue({ send: mockSend } as any);
  });

  // ============================================
  // Validation
  // ============================================
  describe('Validation', () => {
    it('TC-OBJ-074: should return 400 when name is missing', async () => {
      const response = await GET(createRequest() as any);
      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toContain('required');
    });

    it('TC-OBJ-075: should return 400 when name is empty/whitespace', async () => {
      const response = await GET(createRequest({ name: '   ' }) as any);
      expect(response.status).toBe(400);
    });
  });

  // ============================================
  // Bucket Exists
  // ============================================
  describe('Bucket Exists', () => {
    it('TC-OBJ-076: should return exists: true when HeadBucket succeeds', async () => {
      mockSend.mockResolvedValue({});

      const response = await GET(createRequest({ name: 'my-bucket' }) as any);
      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.exists).toBe(true);
      expect(data.statusCode).toBe(200);
    });

    it('TC-OBJ-077: should use default region nyc3 when not specified', async () => {
      mockSend.mockResolvedValue({});

      const { createS3ClientFromAccessKey } = await import('@/lib/aws/s3-client');
      await GET(createRequest({ name: 'my-bucket' }) as any);
      expect(createS3ClientFromAccessKey).toHaveBeenCalledWith('nyc3');
    });

    it('TC-OBJ-078: should use provided region', async () => {
      mockSend.mockResolvedValue({});

      const { createS3ClientFromAccessKey } = await import('@/lib/aws/s3-client');
      await GET(createRequest({ name: 'my-bucket', region: 'sfo3' }) as any);
      expect(createS3ClientFromAccessKey).toHaveBeenCalledWith('sfo3');
    });
  });

  // ============================================
  // Bucket Not Found
  // ============================================
  describe('Bucket Not Found', () => {
    it('TC-OBJ-079: should return exists: false when S3 returns 404', async () => {
      const err = new Error('Not Found') as any;
      err.$metadata = { httpStatusCode: 404 };
      mockSend.mockRejectedValue(err);

      const response = await GET(createRequest({ name: 'nonexistent' }) as any);
      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.exists).toBe(false);
      expect(data.statusCode).toBe(404);
    });
  });

  // ============================================
  // Access Denied / Redirect
  // ============================================
  describe('Access Denied', () => {
    it('TC-OBJ-080: should return exists: true when S3 returns 403', async () => {
      const err = new Error('Forbidden') as any;
      err.$metadata = { httpStatusCode: 403 };
      mockSend.mockRejectedValue(err);

      const response = await GET(createRequest({ name: 'private-bucket' }) as any);
      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.exists).toBe(true);
      expect(data.statusCode).toBe(403);
    });

    it('TC-OBJ-081: should return exists: true when S3 returns 301', async () => {
      const err = new Error('Moved') as any;
      err.$metadata = { httpStatusCode: 301 };
      mockSend.mockRejectedValue(err);

      const response = await GET(createRequest({ name: 'redirected-bucket' }) as any);
      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.exists).toBe(true);
      expect(data.statusCode).toBe(301);
    });
  });

  // ============================================
  // Unknown S3 Error
  // ============================================
  describe('Unknown S3 Error', () => {
    it('TC-OBJ-082: should conservatively treat unknown errors as existing', async () => {
      const err = new Error('Timeout') as any;
      err.$metadata = { httpStatusCode: 500 };
      mockSend.mockRejectedValue(err);

      const response = await GET(createRequest({ name: 'some-bucket' }) as any);
      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.exists).toBe(true);
      expect(data.error).toContain('Timeout');
    });
  });

  // ============================================
  // Handler-Level Error
  // ============================================
  describe('Handler Error', () => {
    it('TC-OBJ-083: should return 500 when S3 client creation throws', async () => {
      const { createS3ClientFromAccessKey } = await import('@/lib/aws/s3-client');
      vi.mocked(createS3ClientFromAccessKey).mockImplementation(() => { throw new Error('Bad config'); });

      const response = await GET(createRequest({ name: 'my-bucket' }) as any);
      expect(response.status).toBe(500);
      const data = await response.json();
      expect(data.error).toContain('Internal server error');
    });
  });
});
