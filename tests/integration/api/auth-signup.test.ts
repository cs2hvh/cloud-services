import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from '@/app/api/auth/signup/route';
import { NextRequest } from 'next/server';
import {
  createMockPostRequest,
  expectResponseStatus,
} from '../../utils/test-helpers';

// Mock Supabase server client
vi.mock('@/lib/supabase/server');

// Helper to set up mock Supabase client
function mockSupabaseSignUp(result: { data?: any; error?: any }) {
  return vi.fn().mockResolvedValue(result);
}

function setupSupabaseMock(signUpResult: { data?: any; error?: any }) {
  const signUp = mockSupabaseSignUp(signUpResult);
  const mockClient = {
    auth: { signUp },
  };
  return { mockClient, signUp };
}

describe('POST /api/auth/signup', () => {
  const testUrl = 'http://localhost:3000/api/auth/signup';

  beforeEach(async () => {
    vi.clearAllMocks();
  });

  // ============================================
  // Success Cases
  // ============================================
  describe('Success Cases', () => {
    it('TC-AUTH-001: should create account with valid email and password', async () => {
      const mockUser = { id: 'new-user-id', email: 'test@example.com' };
      const { mockClient } = setupSupabaseMock({
        data: { user: mockUser, session: { access_token: 'token' } },
        error: null,
      });

      const { createClient } = await import('@/lib/supabase/server');
      vi.mocked(createClient).mockResolvedValue(mockClient as any);

      const request = createMockPostRequest(testUrl, {
        email: 'test@example.com',
        password: 'securePassword123',
      });

      const response = await POST(request as NextRequest);
      const data = await expectResponseStatus(response, 200);

      expect(data.message).toContain('Account created successfully');
      expect(data.user.id).toBe('new-user-id');
      expect(data.user.email).toBe('test@example.com');
    });

    it('TC-AUTH-002: should pass username in signup options', async () => {
      const mockUser = { id: 'user-id', email: 'test@example.com' };
      const { mockClient, signUp } = setupSupabaseMock({
        data: { user: mockUser, session: null },
        error: null,
      });

      const { createClient } = await import('@/lib/supabase/server');
      vi.mocked(createClient).mockResolvedValue(mockClient as any);

      const request = createMockPostRequest(testUrl, {
        email: 'test@example.com',
        password: 'securePassword123',
        username: 'testuser',
      });

      const response = await POST(request as NextRequest);
      await expectResponseStatus(response, 200);

      expect(signUp).toHaveBeenCalledWith({
        email: 'test@example.com',
        password: 'securePassword123',
        options: {
          data: {
            username: 'testuser',
            display_name: 'testuser',
          },
        },
      });
    });

    it('TC-AUTH-003: should pass display_name when provided', async () => {
      const mockUser = { id: 'user-id', email: 'test@example.com' };
      const { mockClient, signUp } = setupSupabaseMock({
        data: { user: mockUser, session: null },
        error: null,
      });

      const { createClient } = await import('@/lib/supabase/server');
      vi.mocked(createClient).mockResolvedValue(mockClient as any);

      const request = createMockPostRequest(testUrl, {
        email: 'test@example.com',
        password: 'securePassword123',
        username: 'testuser',
        display_name: 'Test User Display',
      });

      const response = await POST(request as NextRequest);
      await expectResponseStatus(response, 200);

      expect(signUp).toHaveBeenCalledWith(
        expect.objectContaining({
          options: {
            data: {
              username: 'testuser',
              display_name: 'Test User Display',
            },
          },
        })
      );
    });

    it('TC-AUTH-004: should use username as display_name fallback', async () => {
      const mockUser = { id: 'user-id', email: 'test@example.com' };
      const { mockClient, signUp } = setupSupabaseMock({
        data: { user: mockUser, session: null },
        error: null,
      });

      const { createClient } = await import('@/lib/supabase/server');
      vi.mocked(createClient).mockResolvedValue(mockClient as any);

      const request = createMockPostRequest(testUrl, {
        email: 'test@example.com',
        password: 'securePassword123',
        username: 'myuser',
      });

      const response = await POST(request as NextRequest);
      await expectResponseStatus(response, 200);

      expect(signUp).toHaveBeenCalledWith(
        expect.objectContaining({
          options: {
            data: {
              username: 'myuser',
              display_name: 'myuser',
            },
          },
        })
      );
    });

    it('TC-AUTH-005: should not return password in response', async () => {
      const mockUser = { id: 'user-id', email: 'test@example.com' };
      const { mockClient } = setupSupabaseMock({
        data: { user: mockUser, session: null },
        error: null,
      });

      const { createClient } = await import('@/lib/supabase/server');
      vi.mocked(createClient).mockResolvedValue(mockClient as any);

      const request = createMockPostRequest(testUrl, {
        email: 'test@example.com',
        password: 'securePassword123',
      });

      const response = await POST(request as NextRequest);
      const data = await expectResponseStatus(response, 200);

      expect(data.user).not.toHaveProperty('password');
      expect(JSON.stringify(data)).not.toContain('securePassword123');
    });
  });

  // ============================================
  // Validation Tests
  // ============================================
  describe('Validation', () => {
    it('TC-AUTH-006: should reject missing email', async () => {
      const request = createMockPostRequest(testUrl, {
        password: 'securePassword123',
      });

      const response = await POST(request as NextRequest);
      const data = await expectResponseStatus(response, 400);

      expect(data.message).toBe('Email and password are required');
    });

    it('TC-AUTH-007: should reject missing password', async () => {
      const request = createMockPostRequest(testUrl, {
        email: 'test@example.com',
      });

      const response = await POST(request as NextRequest);
      const data = await expectResponseStatus(response, 400);

      expect(data.message).toBe('Email and password are required');
    });

    it('TC-AUTH-008: should reject empty body', async () => {
      const request = createMockPostRequest(testUrl, {});

      const response = await POST(request as NextRequest);
      const data = await expectResponseStatus(response, 400);

      expect(data.message).toBe('Email and password are required');
    });

    it('TC-AUTH-009: should reject empty string email', async () => {
      const request = createMockPostRequest(testUrl, {
        email: '',
        password: 'securePassword123',
      });

      const response = await POST(request as NextRequest);
      const data = await expectResponseStatus(response, 400);

      expect(data.message).toBe('Email and password are required');
    });

    it('TC-AUTH-010: should reject empty string password', async () => {
      const request = createMockPostRequest(testUrl, {
        email: 'test@example.com',
        password: '',
      });

      const response = await POST(request as NextRequest);
      const data = await expectResponseStatus(response, 400);

      expect(data.message).toBe('Email and password are required');
    });
  });

  // ============================================
  // Supabase Error Handling
  // ============================================
  describe('Supabase Error Handling', () => {
    it('TC-AUTH-011: should forward Supabase signUp error message', async () => {
      const { mockClient } = setupSupabaseMock({
        data: { user: null, session: null },
        error: { message: 'User already registered' },
      });

      const { createClient } = await import('@/lib/supabase/server');
      vi.mocked(createClient).mockResolvedValue(mockClient as any);

      const request = createMockPostRequest(testUrl, {
        email: 'existing@example.com',
        password: 'securePassword123',
      });

      const response = await POST(request as NextRequest);
      const data = await expectResponseStatus(response, 400);

      expect(data.message).toBe('User already registered');
    });

    it('TC-AUTH-012: should handle invalid email format from Supabase', async () => {
      const { mockClient } = setupSupabaseMock({
        data: { user: null, session: null },
        error: { message: 'Unable to validate email address: invalid format' },
      });

      const { createClient } = await import('@/lib/supabase/server');
      vi.mocked(createClient).mockResolvedValue(mockClient as any);

      const request = createMockPostRequest(testUrl, {
        email: 'not-an-email',
        password: 'securePassword123',
      });

      const response = await POST(request as NextRequest);
      const data = await expectResponseStatus(response, 400);

      expect(data.message).toContain('invalid format');
    });

    it('TC-AUTH-013: should handle password too short from Supabase', async () => {
      const { mockClient } = setupSupabaseMock({
        data: { user: null, session: null },
        error: { message: 'Password should be at least 6 characters' },
      });

      const { createClient } = await import('@/lib/supabase/server');
      vi.mocked(createClient).mockResolvedValue(mockClient as any);

      const request = createMockPostRequest(testUrl, {
        email: 'test@example.com',
        password: '123',
      });

      const response = await POST(request as NextRequest);
      const data = await expectResponseStatus(response, 400);

      expect(data.message).toContain('Password should be at least 6 characters');
    });

    it('TC-AUTH-014: should handle null user (failed account creation)', async () => {
      const { mockClient } = setupSupabaseMock({
        data: { user: null, session: null },
        error: null,
      });

      const { createClient } = await import('@/lib/supabase/server');
      vi.mocked(createClient).mockResolvedValue(mockClient as any);

      const request = createMockPostRequest(testUrl, {
        email: 'test@example.com',
        password: 'securePassword123',
      });

      const response = await POST(request as NextRequest);
      const data = await expectResponseStatus(response, 400);

      expect(data.message).toBe('Failed to create account');
    });

    it('TC-AUTH-015: should handle Supabase rate limiting error', async () => {
      const { mockClient } = setupSupabaseMock({
        data: { user: null, session: null },
        error: { message: 'For security purposes, you can only request this after 60 seconds.' },
      });

      const { createClient } = await import('@/lib/supabase/server');
      vi.mocked(createClient).mockResolvedValue(mockClient as any);

      const request = createMockPostRequest(testUrl, {
        email: 'test@example.com',
        password: 'securePassword123',
      });

      const response = await POST(request as NextRequest);
      const data = await expectResponseStatus(response, 400);

      expect(data.message).toContain('60 seconds');
    });
  });

  // ============================================
  // Security Tests
  // ============================================
  describe('Security', () => {
    it('TC-AUTH-016: should pass SQL injection attempt to Supabase safely', async () => {
      const { mockClient, signUp } = setupSupabaseMock({
        data: { user: null, session: null },
        error: { message: 'Unable to validate email address: invalid format' },
      });

      const { createClient } = await import('@/lib/supabase/server');
      vi.mocked(createClient).mockResolvedValue(mockClient as any);

      const request = createMockPostRequest(testUrl, {
        email: "admin'--@test.com",
        password: 'password123',
      });

      const response = await POST(request as NextRequest);
      // Should be rejected by Supabase validation
      await expectResponseStatus(response, 400);

      // Verify the SQL injection string was passed as-is (not interpreted)
      expect(signUp).toHaveBeenCalledWith(
        expect.objectContaining({
          email: "admin'--@test.com",
        })
      );
    });

    it('TC-AUTH-017: should handle XSS in email field safely', async () => {
      const { mockClient, signUp } = setupSupabaseMock({
        data: { user: null, session: null },
        error: { message: 'Unable to validate email address: invalid format' },
      });

      const { createClient } = await import('@/lib/supabase/server');
      vi.mocked(createClient).mockResolvedValue(mockClient as any);

      const request = createMockPostRequest(testUrl, {
        email: '<script>alert("xss")</script>@test.com',
        password: 'password123',
      });

      const response = await POST(request as NextRequest);
      await expectResponseStatus(response, 400);
    });

    it('TC-AUTH-018: should only return id and email in user response', async () => {
      const mockUser = {
        id: 'user-id',
        email: 'test@example.com',
        created_at: '2024-01-01',
        aud: 'authenticated',
        role: 'authenticated',
      };
      const { mockClient } = setupSupabaseMock({
        data: { user: mockUser, session: null },
        error: null,
      });

      const { createClient } = await import('@/lib/supabase/server');
      vi.mocked(createClient).mockResolvedValue(mockClient as any);

      const request = createMockPostRequest(testUrl, {
        email: 'test@example.com',
        password: 'securePassword123',
      });

      const response = await POST(request as NextRequest);
      const data = await expectResponseStatus(response, 200);

      // Response should only include id and email
      expect(Object.keys(data.user)).toEqual(['id', 'email']);
    });
  });
});
