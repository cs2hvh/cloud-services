import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from '@/app/api/webhooks/platform-apps/deployment-record/route';

const finalizeBuildOperationMock = vi.fn();

vi.mock('@/lib/supabase/queries');
vi.mock('@/lib/app-operations', () => {
  class MockAppOperationFinalizer {
    finalizeBuildOperation = finalizeBuildOperationMock;
  }

  return {
    AppOperationFinalizer: MockAppOperationFinalizer,
  };
});

describe('POST /api/webhooks/platform-apps/deployment-record', () => {
  const testUrl = 'http://localhost:3000/api/webhooks/platform-apps/deployment-record';
  const webhookSecret = 'test-deployment-record-secret';

  const validPayload = {
    app_id: 'app-1',
    status: 'success' as const,
    trigger: 'webhook' as const,
    image_tag: 'my-app:42',
    build_number: 42,
    commit_sha: 'abc123',
  };

  function createRequest(
    body: Record<string, unknown>,
    headers?: Record<string, string>
  ): NextRequest {
    return new NextRequest(testUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-deployment-record-secret': webhookSecret,
        ...headers,
      },
      body: JSON.stringify(body),
    });
  }

  beforeEach(async () => {
    vi.clearAllMocks();
    process.env.JENKINS_DEPLOYMENT_RECORD_SECRET = webhookSecret;

    const { Platform_Apps } = await import('@/lib/supabase/queries');
    vi.mocked(Platform_Apps.get).mockResolvedValue({
      success: true,
      data: {
        id: 'app-1',
        name: 'my-app',
      },
    } as any);

    finalizeBuildOperationMock.mockResolvedValue({
      record: {
        id: 'deploy-1',
        app_id: 'app-1',
        build_number: 42,
        status: 'success',
        trigger: 'webhook',
        image_tag: 'my-app:42',
        failure_reason: null,
        commit_sha: 'abc123',
      },
      legacyCreated: false,
    });
  });

  it('returns 401 when the shared secret is missing', async () => {
    const req = createRequest(validPayload, { 'x-deployment-record-secret': '' });
    const res = await POST(req);

    expect(res.status).toBe(401);
  });

  it('returns 400 when required fields are missing', async () => {
    const req = createRequest({ status: 'success', trigger: 'webhook', image_tag: 'tag' });
    const res = await POST(req);
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error).toContain('app_id');
  });

  it('returns 400 when build_number is missing', async () => {
    const req = createRequest({ ...validPayload, build_number: null });
    const res = await POST(req);
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error).toContain('build_number');
  });

  it('still requires image identity for successful completions', async () => {
    const req = createRequest({
      ...validPayload,
      image_tag: null,
      image_digest: null,
    });
    const res = await POST(req);
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error).toContain('image_tag or image_digest');
  });

  it('allows failed completions without an image identity', async () => {
    const req = createRequest({
      ...validPayload,
      status: 'failed',
      image_tag: null,
      image_digest: null,
      failure_reason: 'Build failed before image creation',
    });

    const res = await POST(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(finalizeBuildOperationMock).toHaveBeenCalledWith(
      expect.objectContaining({
        appId: 'app-1',
        buildNumber: 42,
        status: 'failed',
        imageTag: null,
        imageDigest: null,
        failureReason: 'Build failed before image creation',
        allowLegacyCreate: false,
      })
    );
  });

  it('finalizes a successful deployment through the shared finalizer', async () => {
    const req = createRequest(validPayload);
    const res = await POST(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(finalizeBuildOperationMock).toHaveBeenCalledWith(
      expect.objectContaining({
        appId: 'app-1',
        appName: 'my-app',
        buildNumber: 42,
        trigger: 'webhook',
        status: 'success',
        imageTag: 'my-app:42',
        commitSha: 'abc123',
        allowLegacyCreate: false,
      })
    );
  });

  it('returns 500 when finalization throws', async () => {
    finalizeBuildOperationMock.mockRejectedValueOnce(new Error('Database error'));

    const req = createRequest(validPayload);
    const res = await POST(req);
    const data = await res.json();

    expect(res.status).toBe(500);
    expect(data.error).toContain('Internal server error');
  });
});
