import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

/**
 * Security Tests: Information Disclosure Prevention
 *
 * Verifies that error responses use generic messages and
 * do not leak stack traces, internal paths, or sensitive data.
 */

vi.mock('@/lib/auth/server-auth');
vi.mock('@/lib/supabase/queries');
vi.mock('@/lib/supabase/server');
vi.mock('@/lib/cooldown/userbased');
vi.mock('bcryptjs');

describe('Security: Information Disclosure Prevention', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();
    vi.unstubAllEnvs();
  });

  describe('Webhook Error Responses', () => {
    it('SEC-INFO-001: deployment-status returns generic error on failure', async () => {
      vi.stubEnv('WEBHOOK_DEPLOYMENT_SECRET', 'test-secret');

      const { POST } = await import(
        '@/app/api/webhooks/deployment-status/route'
      );

      // Create request that will cause a parsing error
      const req = new NextRequest(
        'http://localhost:3000/api/webhooks/deployment-status',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-webhook-secret': 'test-secret',
          },
          body: '{bad json',
        }
      );

      const res = await POST(req);
      const json = await res.json();

      // Must NOT contain error.message, stack trace, or internal path
      const body = JSON.stringify(json);
      expect(body).not.toContain('at ');
      expect(body).not.toContain('node_modules');
      expect(body).not.toContain('\\n');
      expect(json.error).toBe('Internal server error');
    });

    it('SEC-INFO-002: deployment-record returns generic error on failure', async () => {
      vi.stubEnv('JENKINS_DEPLOYMENT_RECORD_SECRET', 'test-secret');

      const { POST } = await import(
        '@/app/api/webhooks/platform-apps/deployment-record/route'
      );

      const req = new NextRequest(
        'http://localhost:3000/api/webhooks/platform-apps/deployment-record',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-deployment-record-secret': 'test-secret',
          },
          body: '{bad json',
        }
      );

      const res = await POST(req);
      const json = await res.json();

      const body = JSON.stringify(json);
      expect(body).not.toContain('at ');
      expect(body).not.toContain('node_modules');
      expect(json.error).toBe('Internal server error');
    });
  });

  describe('Kubernetes Route Error Responses', () => {
    it('SEC-INFO-010: cluster status returns generic error on DB failure', async () => {
      const { authenticateUser } = await import('@/lib/auth/server-auth');
      vi.mocked(authenticateUser).mockResolvedValue({
        authenticated: true,
        user: { id: 'user-1' },
        response: null,
      } as any);

      const { createSSRClient } = await import('@/lib/supabase/server');
      vi.mocked(createSSRClient).mockReturnValue({
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: null,
                error: { message: 'relation "clusters" does not exist', code: '42P01' },
              }),
            }),
          }),
        }),
      } as any);

      const { POST } = await import(
        '@/app/api/services/kubernetes/clusters/status/route'
      );

      const req = new NextRequest(
        'http://localhost:3000/api/services/kubernetes/clusters/status',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: 'user-1' }),
        }
      );

      const res = await POST(req);
      const json = await res.json();

      // Should NOT reveal the actual DB error
      expect(json.error).not.toContain('relation');
      expect(json.error).not.toContain('42P01');
      expect(json.error).toBe('Failed to fetch cluster status');
    });

    it('SEC-INFO-011: manageip/add returns generic error on failure', async () => {
      const { authenticateUser } = await import('@/lib/auth/server-auth');
      vi.mocked(authenticateUser).mockResolvedValue({
        authenticated: true,
        user: { id: 'user-1' },
        response: null,
      } as any);

      const { createServiceClient } = await import('@/lib/supabase/server');
      vi.mocked(createServiceClient).mockReturnValue({
        from: vi.fn().mockReturnValue({
          insert: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
              data: null,
              error: { message: 'unique_violation', code: '23505' },
            }),
          }),
        }),
      } as any);

      const { POST } = await import(
        '@/app/api/services/kubernetes/manageip/add/route'
      );

      const req = new NextRequest(
        'http://localhost:3000/api/services/kubernetes/manageip/add',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            vm_id: 'vm-1',
            vm_name: 'test',
            ipv4: '1.2.3.4',
            assigned_to: 'user-1',
            provider: 'do',
          }),
        }
      );

      const res = await POST(req);
      const json = await res.json();

      expect(json.error).not.toContain('unique_violation');
      expect(json.error).not.toContain('23505');
      expect(json.error).toBe('Failed to add VM record');
    });
  });

  describe('No Sensitive Data in Error Bodies', () => {
    it('SEC-INFO-020: error responses never contain stack traces', async () => {
      vi.stubEnv('WEBHOOK_DEPLOYMENT_SECRET', 'test-secret');

      const { Platform_Apps } = await import('@/lib/supabase/queries');
      // Force an unexpected error
      vi.mocked(Platform_Apps.list_by_owner).mockRejectedValue(
        new Error('ECONNREFUSED 10.0.0.1:5432')
      );

      const { POST } = await import(
        '@/app/api/webhooks/deployment-status/route'
      );

      const req = new NextRequest(
        'http://localhost:3000/api/webhooks/deployment-status',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-webhook-secret': 'test-secret',
          },
          body: JSON.stringify({ app_name: 'test', status: 'running' }),
        }
      );

      const res = await POST(req);
      const json = await res.json();

      // Must not expose internal IP or connection details
      const body = JSON.stringify(json);
      expect(body).not.toContain('ECONNREFUSED');
      expect(body).not.toContain('10.0.0.1');
      expect(body).not.toContain('5432');
    });
  });
});
