import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

/**
 * Security Tests: Webhook Authentication
 *
 * After security fix: webhooks validate shared secrets via
 * timing-safe comparison. These tests verify that unauthenticated
 * or wrong-secret requests are rejected with 401.
 */

vi.mock('@/lib/supabase/queries');
vi.mock('@/lib/supabase/server');

describe('Security: Webhook Authentication', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
  });

  // ==================================================================
  // Deployment-Record Webhook
  // ==================================================================
  describe('Deployment-Record Webhook Auth', () => {
    it('SEC-WH-010: should reject requests without x-deployment-record-secret', async () => {
      vi.stubEnv('JENKINS_DEPLOYMENT_RECORD_SECRET', 'record-secret');

      const { POST } = await import(
        '@/app/api/webhooks/platform-apps/deployment-record/route'
      );

      const req = new NextRequest(
        'http://localhost:3000/api/webhooks/platform-apps/deployment-record',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            app_id: 'app-1',
            status: 'success',
            trigger: 'webhook',
            build_number: 1,
            image_tag: 'v1.0',
          }),
        }
      );

      const res = await POST(req);
      expect(res.status).toBe(401);
    });

    it('SEC-WH-011: should reject requests with wrong secret', async () => {
      vi.stubEnv('JENKINS_DEPLOYMENT_RECORD_SECRET', 'correct-secret');

      const { POST } = await import(
        '@/app/api/webhooks/platform-apps/deployment-record/route'
      );

      const req = new NextRequest(
        'http://localhost:3000/api/webhooks/platform-apps/deployment-record',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-deployment-record-secret': 'wrong-secret',
          },
          body: JSON.stringify({
            app_id: 'app-1',
            status: 'success',
            trigger: 'webhook',
            build_number: 1,
            image_tag: 'v1.0',
          }),
        }
      );

      const res = await POST(req);
      expect(res.status).toBe(401);
    });

    it('SEC-WH-012: should accept requests with correct secret', async () => {
      vi.stubEnv('JENKINS_DEPLOYMENT_RECORD_SECRET', 'correct-secret');

      const { Platform_App_Deployments } = await import('@/lib/supabase/queries');
      vi.mocked(Platform_App_Deployments.create).mockResolvedValue({
        success: true,
        data: { id: 'deploy-1' },
      } as any);

      const { POST } = await import(
        '@/app/api/webhooks/platform-apps/deployment-record/route'
      );

      const req = new NextRequest(
        'http://localhost:3000/api/webhooks/platform-apps/deployment-record',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-deployment-record-secret': 'correct-secret',
          },
          body: JSON.stringify({
            app_id: 'app-1',
            status: 'success',
            trigger: 'webhook',
            image_tag: 'v1.0',
          }),
        }
      );

      const res = await POST(req);
      expect(res.status).not.toBe(401);
    });

    it('SEC-WH-013: should not leak error.message in 500 responses', async () => {
      vi.stubEnv('JENKINS_DEPLOYMENT_RECORD_SECRET', 'test-secret');

      const { Platform_App_Deployments } = await import('@/lib/supabase/queries');
      vi.mocked(Platform_App_Deployments.complete_build).mockRejectedValue(
        new Error('relation "platform_app_deployments" does not exist')
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
            image_tag: 'v1.0',
          }),
        }
      );

      const res = await POST(req);
      const data = await res.json();

      expect(data.error).toBe('Internal server error');
      expect(data.error).not.toContain('relation');
    });
  });
});
