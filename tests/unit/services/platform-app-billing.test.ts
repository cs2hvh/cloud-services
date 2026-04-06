import { beforeEach, describe, expect, it, vi } from 'vitest';

import { PlatformAppBillingService } from '@/lib/services/platform-app-billing';

vi.mock('@/config/pricing');
vi.mock('@/lib/supabase/queries');
vi.mock('@/lib/supabase/queries/platform_apps');
vi.mock('@/lib/supabase/queries/billing');

describe('PlatformAppBillingService.activateInitialBillingIfNeeded', () => {
  beforeEach(async () => {
    vi.clearAllMocks();

    const { getRatesForPlatformApp } = await import('@/config/pricing');
    const { Platform_Apps } = await import('@/lib/supabase/queries/platform_apps');
    const { Platform_App_Deployments } = await import('@/lib/supabase/queries');
    const { Billing } = await import('@/lib/supabase/queries/billing');

    vi.mocked(getRatesForPlatformApp).mockResolvedValue({
      initialCost: 5,
      hourlyRate: 0.01,
    } as any);

    vi.mocked(Platform_Apps.get).mockResolvedValue({
      success: true,
      data: {
        id: 'app-1',
        user_id: 'user-1',
        size: 'small',
        active_deployment_id: 'deploy-current',
      },
    } as any);

    vi.mocked(Platform_App_Deployments.get_previous_successful).mockResolvedValue({
      success: true,
      data: null,
    } as any);

    vi.mocked(Billing.get_active_platform_app).mockResolvedValue({
      success: true,
      data: null,
    } as any);

    vi.mocked(Billing.activate_platform_app).mockResolvedValue({
      activated: true,
      alreadyActive: false,
      newBalance: 95,
    } as any);
  });

  it('activates first-success billing even when the app already points at the current deployment', async () => {
    const { Billing } = await import('@/lib/supabase/queries/billing');
    const { Platform_App_Deployments } = await import('@/lib/supabase/queries');

    const result = await PlatformAppBillingService.activateInitialBillingIfNeeded(
      'app-1',
      'deploy-current'
    );

    expect(result.success).toBe(true);
    expect(result.activated).toBe(true);
    expect(Platform_App_Deployments.get_previous_successful).toHaveBeenCalledWith(
      'app-1',
      'deploy-current'
    );
    expect(Billing.activate_platform_app).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        serviceId: 'app-1',
        initialCost: 5,
        hourlyRate: 0.01,
      })
    );
  });

  it('skips when billing is already active', async () => {
    const { Billing } = await import('@/lib/supabase/queries/billing');
    vi.mocked(Billing.get_active_platform_app).mockResolvedValue({
      success: true,
      data: {
        id: 'active-1',
        service_id: 'app-1',
        user_id: 'user-1',
        hourly_rate: 0.01,
        status: 'active',
      },
    } as any);

    const result = await PlatformAppBillingService.activateInitialBillingIfNeeded(
      'app-1',
      'deploy-current'
    );

    expect(result.success).toBe(true);
    expect(result.alreadyActive).toBe(true);
    expect(result.skipped).toBe(true);
  });

  it('skips when there was already a previous successful deployment', async () => {
    const { Platform_App_Deployments } = await import('@/lib/supabase/queries');
    const { Billing } = await import('@/lib/supabase/queries/billing');
    vi.mocked(Platform_App_Deployments.get_previous_successful).mockResolvedValue({
      success: true,
      data: {
        id: 'deploy-old',
        status: 'success',
      },
    } as any);

    const result = await PlatformAppBillingService.activateInitialBillingIfNeeded(
      'app-1',
      'deploy-current'
    );

    expect(result.success).toBe(true);
    expect(result.skipped).toBe(true);
    expect(Billing.activate_platform_app).not.toHaveBeenCalled();
  });

  it('returns an error when the app cannot be loaded', async () => {
    const { Platform_Apps } = await import('@/lib/supabase/queries/platform_apps');
    vi.mocked(Platform_Apps.get).mockResolvedValue({
      success: false,
      error: 'App lookup failed',
      data: null,
    } as any);

    const result = await PlatformAppBillingService.activateInitialBillingIfNeeded('app-1');

    expect(result.success).toBe(false);
    expect(result.error).toContain('App lookup failed');
  });

  it('returns an error when active billing lookup fails', async () => {
    const { Billing } = await import('@/lib/supabase/queries/billing');
    vi.mocked(Billing.get_active_platform_app).mockResolvedValue({
      success: false,
      error: 'Billing lookup failed',
    } as any);

    const result = await PlatformAppBillingService.activateInitialBillingIfNeeded('app-1');

    expect(result.success).toBe(false);
    expect(result.error).toContain('Billing lookup failed');
  });

  it('returns an error when deployment history lookup fails', async () => {
    const { Platform_App_Deployments } = await import('@/lib/supabase/queries');
    vi.mocked(Platform_App_Deployments.get_previous_successful).mockResolvedValue({
      success: false,
      error: 'History lookup failed',
      data: null,
    } as any);

    const result = await PlatformAppBillingService.activateInitialBillingIfNeeded(
      'app-1',
      'deploy-current'
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('History lookup failed');
  });

  it('returns an error when billing activation throws', async () => {
    const { Billing } = await import('@/lib/supabase/queries/billing');
    vi.mocked(Billing.activate_platform_app).mockRejectedValue(
      new Error('Activation failed')
    );

    const result = await PlatformAppBillingService.activateInitialBillingIfNeeded(
      'app-1',
      'deploy-current'
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('Activation failed');
  });
});
