import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET } from '@/app/api/services/object-storage/check-bucket/route';

vi.mock('@aws-sdk/client-s3');
vi.mock('@/lib/aws/s3-client');
vi.mock('@/lib/auth/server-auth', () => ({
  authenticateUser: vi.fn(),
}));
vi.mock('@/lib/cooldown/userbased', () => ({
  limitByUser: vi.fn(),
}));

/**
 * Until 2026-09-06 this route had no guard at all (F4 of the live pentest):
 * anyone on the internet made the server sign HeadBucket requests with the
 * platform's Spaces credentials across seven regions for any name, unlimited,
 * and the `region` parameter went straight into the S3 endpoint host. The first
 * three groups below pin the guard, the limiter and the two validations; the
 * rest is the original probing behaviour, now behind them.
 */
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

    const { authenticateUser } = await import('@/lib/auth/server-auth');
    vi.mocked(authenticateUser).mockResolvedValue({
      authenticated: true,
      user: { id: 'user-1' },
    } as any);

    const { limitByUser } = await import('@/lib/cooldown/userbased');
    vi.mocked(limitByUser).mockResolvedValue({ allowed: true, remaining: 19 });
  });

  // ============================================
  // Authentication (F4)
  // ============================================
  describe('Authentication', () => {
    it('TC-OBJ-084: should return 401 and touch no S3 client without a session', async () => {
      const { authenticateUser } = await import('@/lib/auth/server-auth');
      vi.mocked(authenticateUser).mockResolvedValue({
        authenticated: false,
        user: null,
        response: new Response(JSON.stringify({ message: 'Unauthorized' }), { status: 401 }),
      } as any);

      const { createS3ClientFromAccessKey } = await import('@/lib/aws/s3-client');
      const response = await GET(createRequest({ name: 'my-bucket' }) as any);
      expect(response.status).toBe(401);
      expect(createS3ClientFromAccessKey).not.toHaveBeenCalled();
    });

    it('TC-OBJ-085: should return 429 when the per-user budget is spent', async () => {
      const { limitByUser } = await import('@/lib/cooldown/userbased');
      vi.mocked(limitByUser).mockResolvedValue({ allowed: false, retryAfterSec: 30, remaining: 0 });

      const { createS3ClientFromAccessKey } = await import('@/lib/aws/s3-client');
      const response = await GET(createRequest({ name: 'my-bucket' }) as any);
      expect(response.status).toBe(429);
      expect(createS3ClientFromAccessKey).not.toHaveBeenCalled();
    });
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

    it('TC-OBJ-086: should return 400 for a name that is not a bucket name', async () => {
      // A name is a hostname label in a virtual-hosted request; this is not one.
      const { createS3ClientFromAccessKey } = await import('@/lib/aws/s3-client');
      const response = await GET(createRequest({ name: 'Not A Bucket/../x' }) as any);
      expect(response.status).toBe(400);
      expect(createS3ClientFromAccessKey).not.toHaveBeenCalled();
    });

    it('TC-OBJ-087: should return 400 for a region that is not one of ours', async () => {
      // The region became the S3 endpoint host unvalidated; a crafted value
      // pointed the signed request at a host of the caller's choosing.
      const { createS3ClientFromAccessKey } = await import('@/lib/aws/s3-client');
      const response = await GET(
        createRequest({ name: 'my-bucket', region: 'attacker.example/?x=' }) as any
      );
      expect(response.status).toBe(400);
      expect(createS3ClientFromAccessKey).not.toHaveBeenCalled();
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
      expect(data.error).toContain('Failed to check');
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
