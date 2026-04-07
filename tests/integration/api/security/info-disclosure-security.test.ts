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
    it('SEC-INFO-001: deployment-record returns generic error on failure', async () => {
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

  });

  describe('No Sensitive Data in Error Bodies', () => {
    it('SEC-INFO-020: deployment-record errors never contain stack traces or internal hosts', async () => {
      vi.stubEnv('JENKINS_DEPLOYMENT_RECORD_SECRET', 'test-secret');

      const { Platform_App_Deployments } = await import('@/lib/supabase/queries');
      vi.mocked(Platform_App_Deployments.complete_build).mockRejectedValue(
        new Error('ECONNREFUSED 10.0.0.1:5432')
      );

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
          body: JSON.stringify({
            app_id: 'app-1',
            status: 'success',
            trigger: 'webhook',
            build_number: 1,
            image_tag: 'test-app:1',
          }),
        }
      );

      const res = await POST(req);
      const json = await res.json();

      const body = JSON.stringify(json);
      expect(body).not.toContain('ECONNREFUSED');
      expect(body).not.toContain('10.0.0.1');
      expect(body).not.toContain('5432');
    });
  });
});
