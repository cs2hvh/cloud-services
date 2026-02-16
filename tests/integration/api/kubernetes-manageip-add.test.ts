import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from '@/app/api/services/kubernetes/manageip/add/route';
import { createMockPostRequest, expectResponseStatus } from '../../utils/test-helpers';

vi.mock('@/lib/supabase/server');
vi.mock('bcryptjs');

describe('POST /api/services/kubernetes/manageip/add', () => {
  const testUrl = 'http://localhost:3000/api/services/kubernetes/manageip/add';

  let mockSupabase: any;

  const validPayload = {
    ipAddress: '192.168.1.100',
    username: 'root',
    password: 'StrongPass123!',
    location: 'nyc1',
    ram: 4096,
    cpu: 2,
    storage: 50,
  };

  beforeEach(async () => {
    vi.clearAllMocks();

    const bcrypt = await import('bcryptjs');
    vi.mocked(bcrypt.default.hash).mockResolvedValue('hashed-password' as never);

    mockSupabase = {
      from: vi.fn().mockReturnValue({
        insert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: {
                id: 'vm-1',
                ip_address: '192.168.1.100',
                username: 'root',
                location: 'nyc1',
                status: 'free',
                ram: 4096,
                cpu: 2,
                storage: 50,
                created_at: '2024-01-01T00:00:00Z',
              },
              error: null,
            }),
          }),
        }),
      }),
    };

    const { createServiceClient } = await import('@/lib/supabase/server');
    vi.mocked(createServiceClient).mockResolvedValue(mockSupabase as any);
  });

  // ============================================
  // Success Cases
  // ============================================
  describe('Success Cases', () => {
    it('TC-K8S-120: should create VM record successfully', async () => {
      const request = createMockPostRequest(testUrl, validPayload);
      const response = await POST(request as any);
      const data = await expectResponseStatus(response, 201);

      expect(data.id).toBe('vm-1');
      expect(data.ipAddress).toBe('192.168.1.100');
      expect(data.username).toBe('root');
      expect(data.status).toBe('free');
    });

    it('TC-K8S-121: should hash password with bcrypt', async () => {
      const bcrypt = await import('bcryptjs');

      const request = createMockPostRequest(testUrl, validPayload);
      await POST(request as any);

      expect(bcrypt.default.hash).toHaveBeenCalledWith('StrongPass123!', 10);
    });
  });

  // ============================================
  // Validation Tests
  // ============================================
  describe('Validation', () => {
    it('TC-K8S-122: should return 400 for missing required fields', async () => {
      const request = createMockPostRequest(testUrl, { ipAddress: '192.168.1.1' });
      const response = await POST(request as any);
      await expectResponseStatus(response, 400);
    });

    it('TC-K8S-123: should return 400 for empty payload', async () => {
      const request = createMockPostRequest(testUrl, {});
      const response = await POST(request as any);
      await expectResponseStatus(response, 400);
    });
  });

  // ============================================
  // Error Cases
  // ============================================
  describe('Error Cases', () => {
    it('TC-K8S-124: should return 400 on Supabase insert error', async () => {
      mockSupabase.from.mockReturnValue({
        insert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: null,
              error: { message: 'Duplicate IP address' },
            }),
          }),
        }),
      });

      const request = createMockPostRequest(testUrl, validPayload);
      const response = await POST(request as any);
      const data = await expectResponseStatus(response, 400);

      expect(data.error).toContain('Duplicate');
    });

    it('TC-K8S-125: should return 400 on unexpected Error', async () => {
      const { createServiceClient } = await import('@/lib/supabase/server');
      vi.mocked(createServiceClient).mockRejectedValue(new Error('DB down'));

      const request = createMockPostRequest(testUrl, validPayload);
      const response = await POST(request as any);
      const data = await expectResponseStatus(response, 400);

      expect(data.error).toContain('DB down');
    });

    it('TC-K8S-126: should return 400 on non-Error throw', async () => {
      const { createServiceClient } = await import('@/lib/supabase/server');
      vi.mocked(createServiceClient).mockRejectedValue('unknown');

      const request = createMockPostRequest(testUrl, validPayload);
      const response = await POST(request as any);
      const data = await expectResponseStatus(response, 400);

      expect(data.error).toContain('Unknown error');
    });
  });
});
