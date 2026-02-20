import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import * as crypto from 'crypto';

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
  // Deployment-Status Webhook
  // ==================================================================
  describe('Deployment-Status Webhook Auth', () => {
    it('SEC-WH-001: should reject requests without x-webhook-secret header', async () => {
      vi.stubEnv('WEBHOOK_DEPLOYMENT_SECRET', 'test-secret-value');

      const { POST } = await import(
        '@/app/api/webhooks/deployment-status/route'
      );

      const req = new NextRequest(
        'http://localhost:3000/api/webhooks/deployment-status',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ app_name: 'test-app', status: 'running' }),
        }
      );

      const res = await POST(req);
      expect(res.status).toBe(401);
    });

    it('SEC-WH-002: should reject requests with wrong secret', async () => {
      vi.stubEnv('WEBHOOK_DEPLOYMENT_SECRET', 'correct-secret');

      const { POST } = await import(
        '@/app/api/webhooks/deployment-status/route'
      );

      const req = new NextRequest(
        'http://localhost:3000/api/webhooks/deployment-status',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-webhook-secret': 'wrong-secret!',
          },
          body: JSON.stringify({ app_name: 'test-app', status: 'running' }),
        }
      );

      const res = await POST(req);
      expect(res.status).toBe(401);
    });

    it('SEC-WH-003: should accept requests with correct secret', async () => {
      vi.stubEnv('WEBHOOK_DEPLOYMENT_SECRET', 'correct-secret');

      const { Platform_Apps } = await import('@/lib/supabase/queries');
      vi.mocked(Platform_Apps.list_by_owner).mockResolvedValue([
        { id: 'app-1', name: 'test-app', status: 'building' },
      ] as any);
      vi.mocked(Platform_Apps.update).mockResolvedValue({ success: true } as any);

      const { POST } = await import(
        '@/app/api/webhooks/deployment-status/route'
      );

      const req = new NextRequest(
        'http://localhost:3000/api/webhooks/deployment-status',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-webhook-secret': 'correct-secret',
          },
          body: JSON.stringify({ app_name: 'test-app', status: 'building' }),
        }
      );

      const res = await POST(req);
      // Should not be 401 — either 200 or 404 (app not found)
      expect(res.status).not.toBe(401);
    });

    it('SEC-WH-004: should return 503 when secret is not configured', async () => {
      vi.stubEnv('WEBHOOK_DEPLOYMENT_SECRET', '');

      const { POST } = await import(
        '@/app/api/webhooks/deployment-status/route'
      );

      const req = new NextRequest(
        'http://localhost:3000/api/webhooks/deployment-status',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-webhook-secret': 'anything',
          },
          body: JSON.stringify({ app_name: 'test-app', status: 'running' }),
        }
      );

      const res = await POST(req);
      expect(res.status).toBe(503);
    });

    it('SEC-WH-005: should not leak error.message in 500 responses', async () => {
      vi.stubEnv('WEBHOOK_DEPLOYMENT_SECRET', 'test-secret');

      const { Platform_Apps } = await import('@/lib/supabase/queries');
      vi.mocked(Platform_Apps.list_by_owner).mockRejectedValue(
        new Error('connection refused: postgresql://internal-db:5432/prod')
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
          body: JSON.stringify({ app_name: 'test-app', status: 'running' }),
        }
      );

      const res = await POST(req);
      const data = await res.json();

      // After fix: error response should be generic, not leak connection strings
      expect(data.error).toBe('Internal server error');
      expect(data.error).not.toContain('postgresql://');
    });
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
      vi.mocked(Platform_App_Deployments.create).mockRejectedValue(
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
