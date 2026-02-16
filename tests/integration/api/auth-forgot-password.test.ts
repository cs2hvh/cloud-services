//@ts-nocheck
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from '@/app/api/auth/forgot-password/route';
import { NextRequest } from 'next/server';
import { createMockPostRequest, expectResponseStatus } from '../../utils/test-helpers';

vi.mock('@/lib/supabase/server');
vi.mock('@/lib/supabase/queries/users');
vi.mock('@/lib/supabase/queries/otps');
vi.mock('@/lib/resend/send_forgot');
vi.mock('@/lib/resend', () => ({
  resend: { emails: { send: vi.fn() } },
}));
vi.mock('@/lib/cooldown/emailbased');
vi.mock('@/lib/utils');

describe('POST /api/auth/forgot-password', () => {
  const testUrl = 'http://localhost:3000/api/auth/forgot-password';

  beforeEach(async () => {
    vi.clearAllMocks();

    // Default: rate limit allows
    const { limitByEmail } = await import('@/lib/cooldown/emailbased');
    vi.mocked(limitByEmail).mockResolvedValue({ allowed: true, retryAfterSec: 0 });

    // Default: generate OTP
    const { generateSixDigitOtp } = await import('@/lib/utils');
    vi.mocked(generateSixDigitOtp).mockReturnValue('123456');
  });

  // ============================================
  // Success Cases
  // ============================================
  describe('Success Cases', () => {
    it('TC-AUTH-080: should send OTP for valid email', async () => {
      const { Users } = await import('@/lib/supabase/queries/users');
      vi.mocked(Users.get_by_email).mockResolvedValue({ id: 'user-1', email: 'test@example.com', username: 'testuser' } as any);

      const { createServiceClient } = await import('@/lib/supabase/server');
      vi.mocked(createServiceClient).mockResolvedValue({
        auth: {
          admin: {
            listUsers: vi.fn().mockResolvedValue({
              data: { users: [{ email: 'test@example.com', email_confirmed_at: '2024-01-01' }] },
            }),
          },
        },
      } as any);

      const { OTPs } = await import('@/lib/supabase/queries/otps');
      vi.mocked(OTPs.create).mockResolvedValue('otp-id-123');

      const { send_forgot_password_email } = await import('@/lib/resend/send_forgot');
      vi.mocked(send_forgot_password_email).mockResolvedValue({ success: true } as any);

      const request = createMockPostRequest(testUrl, { email: 'test@example.com' });
      const response = await POST(request as NextRequest);
      const data = await expectResponseStatus(response, 200);

      expect(data.message).toContain('If an account exists');
      expect(data.otpId).toBe('otp-id-123');
      expect(data.expiresAt).toBeDefined();
    });

    it('TC-AUTH-081: should return 200 for non-existent user (prevents enumeration)', async () => {
      const { Users } = await import('@/lib/supabase/queries/users');
      vi.mocked(Users.get_by_email).mockResolvedValue(null as any);

      const request = createMockPostRequest(testUrl, { email: 'nonexistent@example.com' });
      const response = await POST(request as NextRequest);
      const data = await expectResponseStatus(response, 200);

      expect(data.message).toContain('If an account exists');
      // Should NOT include otpId (no user found)
      expect(data.otpId).toBeUndefined();
    });
  });

  // ============================================
  // Validation Tests
  // ============================================
  describe('Validation', () => {
    it('TC-AUTH-082: should reject invalid email format', async () => {
      const request = createMockPostRequest(testUrl, { email: 'invalid' });
      const response = await POST(request as NextRequest);
      const data = await expectResponseStatus(response, 400);

      expect(data.message).toContain('Invalid email');
    });

    it('TC-AUTH-083: should reject missing email', async () => {
      const request = createMockPostRequest(testUrl, {});
      const response = await POST(request as NextRequest);
      await expectResponseStatus(response, 400);
    });
  });

  // ============================================
  // Rate Limiting
  // ============================================
  describe('Rate Limiting', () => {
    it('TC-AUTH-084: should return 429 when rate limited', async () => {
      const { limitByEmail } = await import('@/lib/cooldown/emailbased');
      vi.mocked(limitByEmail).mockResolvedValue({ allowed: false, retryAfterSec: 120 });

      const request = createMockPostRequest(testUrl, { email: 'test@example.com' });
      const response = await POST(request as NextRequest);
      const data = await expectResponseStatus(response, 429);

      expect(data.message).toContain('Too many');
    });
  });

  // ============================================
  // Unconfirmed Email
  // ============================================
  describe('Unconfirmed Email', () => {
    it('TC-AUTH-085: should return 403 for unconfirmed email', async () => {
      const { Users } = await import('@/lib/supabase/queries/users');
      vi.mocked(Users.get_by_email).mockResolvedValue({ id: 'user-1', email: 'test@example.com' } as any);

      const { createServiceClient } = await import('@/lib/supabase/server');
      vi.mocked(createServiceClient).mockResolvedValue({
        auth: {
          admin: {
            listUsers: vi.fn().mockResolvedValue({
              data: { users: [{ email: 'test@example.com', email_confirmed_at: null }] },
            }),
          },
        },
      } as any);

      const request = createMockPostRequest(testUrl, { email: 'test@example.com' });
      const response = await POST(request as NextRequest);
      const data = await expectResponseStatus(response, 403);

      expect(data.message).toContain('verify your email');
    });
  });

  // ============================================
  // Error Handling
  // ============================================
  describe('Error Handling', () => {
    it('TC-AUTH-086: should return 500 when OTP creation fails', async () => {
      const { Users } = await import('@/lib/supabase/queries/users');
      vi.mocked(Users.get_by_email).mockResolvedValue({ id: 'user-1', email: 'test@example.com' } as any);

      const { createServiceClient } = await import('@/lib/supabase/server');
      vi.mocked(createServiceClient).mockResolvedValue({
        auth: {
          admin: {
            listUsers: vi.fn().mockResolvedValue({
              data: { users: [{ email: 'test@example.com', email_confirmed_at: '2024-01-01' }] },
            }),
          },
        },
      } as any);

      const { OTPs } = await import('@/lib/supabase/queries/otps');
      vi.mocked(OTPs.create).mockResolvedValue(null as any);

      const request = createMockPostRequest(testUrl, { email: 'test@example.com' });
      const response = await POST(request as NextRequest);
      const data = await expectResponseStatus(response, 500);

      expect(data.message).toContain('Failed to process');
    });

    it('TC-AUTH-087: should return 500 when email send fails', async () => {
      const { Users } = await import('@/lib/supabase/queries/users');
      vi.mocked(Users.get_by_email).mockResolvedValue({ id: 'user-1', email: 'test@example.com' } as any);

      const { createServiceClient } = await import('@/lib/supabase/server');
      vi.mocked(createServiceClient).mockResolvedValue({
        auth: {
          admin: {
            listUsers: vi.fn().mockResolvedValue({
              data: { users: [{ email: 'test@example.com', email_confirmed_at: '2024-01-01' }] },
            }),
          },
        },
      } as any);

      const { OTPs } = await import('@/lib/supabase/queries/otps');
      vi.mocked(OTPs.create).mockResolvedValue('otp-id');

      const { send_forgot_password_email } = await import('@/lib/resend/send_forgot');
      vi.mocked(send_forgot_password_email).mockResolvedValue({ success: false } as any);

      const request = createMockPostRequest(testUrl, { email: 'test@example.com' });
      const response = await POST(request as NextRequest);
      const data = await expectResponseStatus(response, 500);

      expect(data.message).toContain('Failed to send');
    });

    it('TC-AUTH-088: should handle unexpected errors', async () => {
      const { Users } = await import('@/lib/supabase/queries/users');
      vi.mocked(Users.get_by_email).mockRejectedValue(new Error('DB down'));

      // Need a valid email to pass Zod
      const request = createMockPostRequest(testUrl, { email: 'test@example.com' });
      const response = await POST(request as NextRequest);
      const data = await expectResponseStatus(response, 500);

      expect(data.message).toContain('unexpected error');
    });
  });
});
