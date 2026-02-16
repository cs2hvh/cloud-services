import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from '@/app/api/services/kubernetes/manageip/update/route';
import { createMockPostRequest, expectResponseStatus } from '../../utils/test-helpers';

vi.mock('@/lib/supabase/server');

describe('POST /api/services/kubernetes/manageip/update', () => {
  const testUrl = 'http://localhost:3000/api/services/kubernetes/manageip/update';

  let mockSupabase: any;
  let mockSelect: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.clearAllMocks();

    mockSelect = vi.fn().mockResolvedValue({
      data: [
        { id: 'vm-1', ip_address: '192.168.1.1', status: 'used', created_at: '2024-01-01' },
      ],
      error: null,
    });

    mockSupabase = {
      from: vi.fn().mockReturnValue({
        update: vi.fn().mockReturnValue({
          in: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              select: mockSelect,
            }),
          }),
        }),
      }),
    };

    const { createClient } = await import('@/lib/supabase/server');
    vi.mocked(createClient).mockResolvedValue(mockSupabase as any);
  });

  // ============================================
  // Success Cases
  // ============================================
  describe('Success Cases', () => {
    it('TC-K8S-130: should update IP status successfully', async () => {
      const request = createMockPostRequest(testUrl, {
        ipAddress: ['192.168.1.1'],
      });
      const response = await POST(request as any);
      const data = await expectResponseStatus(response, 200);

      expect(data.success).toBe(true);
      expect(data.message).toContain('updated successfully');
    });
  });

  // ============================================
  // Error Cases
  // ============================================
  describe('Error Cases', () => {
    it('TC-K8S-131: should return 400 on Supabase update error', async () => {
      mockSelect.mockResolvedValue({
        data: null,
        error: { message: 'Update constraint violation' },
      });

      // Re-create the chain with error
      mockSupabase.from.mockReturnValue({
        update: vi.fn().mockReturnValue({
          in: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              select: mockSelect,
            }),
          }),
        }),
      });

      const request = createMockPostRequest(testUrl, {
        ipAddress: ['192.168.1.1'],
      });
      const response = await POST(request as any);
      const data = await expectResponseStatus(response, 400);

      expect(data.error).toContain('constraint');
    });

    it('TC-K8S-132: should return 404 when no matching rows', async () => {
      mockSelect.mockResolvedValue({
        data: null,
        error: null,
      });

      mockSupabase.from.mockReturnValue({
        update: vi.fn().mockReturnValue({
          in: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              select: mockSelect,
            }),
          }),
        }),
      });

      const request = createMockPostRequest(testUrl, {
        ipAddress: ['10.0.0.99'],
      });
      const response = await POST(request as any);
      const data = await expectResponseStatus(response, 404);

      expect(data.error).toContain('Not found');
    });
  });
});
