/**
 * useDomainRegistrarSettings hook — unit tests
 *
 * Covers: initial load, error handling, optimistic autorenew toggle,
 * nameserver save, switch-to-managed, stale-request cancellation.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { toast } from 'sonner';
import { useDomainRegistrarSettings } from '@/hooks/use-domain-registrar-settings';
import type { RegistrarSettings } from '@/components/dashboard/domains/domain-detail-types';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const MANAGED_SETTINGS: RegistrarSettings = {
  domain: 'example.com',
  managed: true,
  zone: 'example.com',
  host: null,
  autorenew_enabled: true,
  locked: false,
  privacy_enabled: false,
  expires_at: '2027-01-01T00:00:00Z',
  nameservers: ['ns1.name.com', 'ns2.name.com'],
  nameserver_mode: 'managed',
};

const CUSTOM_SETTINGS: RegistrarSettings = {
  ...MANAGED_SETTINGS,
  nameservers: ['rosemary.ns.cloudflare.com', 'braden.ns.cloudflare.com'],
  nameserver_mode: 'custom',
};

function mockFetch(data: unknown, status = 200) {
  global.fetch = vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(data),
  } as Response);
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('useDomainRegistrarSettings', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  // ── loadRegistrarSettings ──────────────────────────────────────────────────

  describe('loadRegistrarSettings', () => {
    it('sets registrarLoading=true while fetching, then false on success', async () => {
      let resolveJson!: (v: unknown) => void;
      const jsonPromise = new Promise((res) => { resolveJson = res; });
      global.fetch = vi.fn().mockResolvedValue({ ok: true, status: 200, json: () => jsonPromise } as unknown as Response);

      const { result } = renderHook(() => useDomainRegistrarSettings('example.com'));

      act(() => { void result.current.loadRegistrarSettings(); });
      expect(result.current.registrarLoading).toBe(true);

      await act(async () => { resolveJson({ data: MANAGED_SETTINGS }); });
      expect(result.current.registrarLoading).toBe(false);
    });

    it('populates registrarSettings on success', async () => {
      mockFetch({ data: MANAGED_SETTINGS });
      const { result } = renderHook(() => useDomainRegistrarSettings('example.com'));

      await act(() => result.current.loadRegistrarSettings());
      expect(result.current.registrarSettings).toEqual(MANAGED_SETTINGS);
      expect(result.current.registrarError).toBeNull();
    });

    it('calls onSyncDomainMeta with expires_at and autorenew_enabled', async () => {
      mockFetch({ data: MANAGED_SETTINGS });
      const onSync = vi.fn();
      const { result } = renderHook(() => useDomainRegistrarSettings('example.com', onSync));

      await act(() => result.current.loadRegistrarSettings());
      expect(onSync).toHaveBeenCalledWith('2027-01-01T00:00:00Z', true);
    });

    it('sets registrarError on non-ok response', async () => {
      mockFetch({ error: 'INTERNAL_ERROR', message: 'Failed to load registrar settings' }, 500);
      const { result } = renderHook(() => useDomainRegistrarSettings('example.com'));

      await act(() => result.current.loadRegistrarSettings());
      expect(result.current.registrarError).toBeTruthy();
      expect(result.current.registrarSettings).toBeNull();
    });

    it('sets null settings (no error) on 404 NOT_FOUND', async () => {
      mockFetch({ error: 'NOT_FOUND' }, 404);
      const { result } = renderHook(() => useDomainRegistrarSettings('example.com'));

      await act(() => result.current.loadRegistrarSettings());
      expect(result.current.registrarSettings).toBeNull();
      expect(result.current.registrarError).toBeNull();
    });

    it('sets registrarError on network failure', async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error('Network Error'));
      const { result } = renderHook(() => useDomainRegistrarSettings('example.com'));

      await act(() => result.current.loadRegistrarSettings());
      expect(result.current.registrarError).toContain('Network Error');
    });

    it('ignores a stale response when a newer request is in-flight', async () => {
      let resolveFirst!: (v: unknown) => void;
      let resolveSecond!: (v: unknown) => void;
      const firstJson = new Promise((res) => { resolveFirst = res; });
      const secondJson = new Promise((res) => { resolveSecond = res; });

      let callCount = 0;
      global.fetch = vi.fn().mockImplementation(() => {
        callCount++;
        const json = callCount === 1 ? firstJson : secondJson;
        return Promise.resolve({ ok: true, status: 200, json: () => json });
      }) as unknown as typeof fetch;

      const { result } = renderHook(() => useDomainRegistrarSettings('example.com'));

      // Fire two requests; the second should win
      act(() => { void result.current.loadRegistrarSettings(); });
      act(() => { void result.current.loadRegistrarSettings(); });

      // Resolve second first, then first
      await act(async () => { resolveSecond({ data: { ...MANAGED_SETTINGS, expires_at: '2028-01-01' } }); });
      await act(async () => { resolveFirst({ data: MANAGED_SETTINGS }); }); // stale — should be ignored

      expect(result.current.registrarSettings?.expires_at).toBe('2028-01-01');
    });
  });

  // ── onToggleAutorenew ──────────────────────────────────────────────────────

  describe('onToggleAutorenew', () => {
    it('calls PATCH with toggled autorenew_enabled', async () => {
      mockFetch({ data: MANAGED_SETTINGS }); // initial load
      const { result } = renderHook(() => useDomainRegistrarSettings('example.com'));
      await act(() => result.current.loadRegistrarSettings());

      mockFetch({ data: { ...MANAGED_SETTINGS, autorenew_enabled: false } });
      await act(() => result.current.onToggleAutorenew());

      expect(global.fetch).toHaveBeenLastCalledWith('/api/domains/registrar', expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ domain: 'example.com', autorenew_enabled: false }),
      }));
    });

    it('shows "turned off" toast when disabling auto-renew', async () => {
      mockFetch({ data: MANAGED_SETTINGS }); // autorenew_enabled: true
      const { result } = renderHook(() => useDomainRegistrarSettings('example.com'));
      await act(() => result.current.loadRegistrarSettings());

      mockFetch({ data: { ...MANAGED_SETTINGS, autorenew_enabled: false } });
      await act(() => result.current.onToggleAutorenew());

      expect(toast.success).toHaveBeenCalledWith(expect.stringContaining('turned off'));
    });

    it('shows "enabled" toast when enabling auto-renew', async () => {
      const disabledSettings = { ...MANAGED_SETTINGS, autorenew_enabled: false };
      mockFetch({ data: disabledSettings });
      const { result } = renderHook(() => useDomainRegistrarSettings('example.com'));
      await act(() => result.current.loadRegistrarSettings());

      mockFetch({ data: { ...disabledSettings, autorenew_enabled: true } });
      await act(() => result.current.onToggleAutorenew());

      expect(toast.success).toHaveBeenCalledWith(expect.stringContaining('enabled'));
    });

    it('shows error toast and does not update state on failure', async () => {
      mockFetch({ data: MANAGED_SETTINGS });
      const { result } = renderHook(() => useDomainRegistrarSettings('example.com'));
      await act(() => result.current.loadRegistrarSettings());

      mockFetch({ error: 'INTERNAL_ERROR', message: 'Failed' }, 500);
      await act(() => result.current.onToggleAutorenew());

      expect(toast.error).toHaveBeenCalled();
      // State should be unchanged
      expect(result.current.registrarSettings?.autorenew_enabled).toBe(true);
    });

    it('does nothing when settings are not loaded', async () => {
      global.fetch = vi.fn();
      const { result } = renderHook(() => useDomainRegistrarSettings('example.com'));
      await act(() => result.current.onToggleAutorenew());
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('sets savingAutorenew true during the request', async () => {
      mockFetch({ data: MANAGED_SETTINGS });
      const { result } = renderHook(() => useDomainRegistrarSettings('example.com'));
      await act(() => result.current.loadRegistrarSettings());

      let resolvePatch!: (v: unknown) => void;
      const patchJson = new Promise((res) => { resolvePatch = res; });
      global.fetch = vi.fn().mockResolvedValue({ ok: true, status: 200, json: () => patchJson } as unknown as Response);

      act(() => { void result.current.onToggleAutorenew(); });
      expect(result.current.savingAutorenew).toBe(true);

      await act(async () => { resolvePatch({ data: { ...MANAGED_SETTINGS, autorenew_enabled: false } }); });
      expect(result.current.savingAutorenew).toBe(false);
    });
  });

  // ── onSetNameservers ───────────────────────────────────────────────────────

  describe('onSetNameservers', () => {
    it('calls PATCH with the nameservers array', async () => {
      mockFetch({ data: MANAGED_SETTINGS });
      const { result } = renderHook(() => useDomainRegistrarSettings('example.com'));
      await act(() => result.current.loadRegistrarSettings());

      const newNs = ['ns1.cloudflare.com', 'ns2.cloudflare.com'];
      mockFetch({ data: { ...CUSTOM_SETTINGS, nameservers: newNs } });
      await act(() => result.current.onSetNameservers(newNs));

      expect(global.fetch).toHaveBeenLastCalledWith('/api/domains/registrar', expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ domain: 'example.com', nameservers: newNs }),
      }));
    });

    it('returns true and updates state on success', async () => {
      mockFetch({ data: MANAGED_SETTINGS });
      const { result } = renderHook(() => useDomainRegistrarSettings('example.com'));
      await act(() => result.current.loadRegistrarSettings());

      const newNs = ['ns1.test.com', 'ns2.test.com'];
      const updatedSettings = { ...CUSTOM_SETTINGS, nameservers: newNs };
      mockFetch({ data: updatedSettings });
      let ok: boolean;
      await act(async () => { ok = await result.current.onSetNameservers(newNs); });

      expect(ok!).toBe(true);
      expect(result.current.registrarSettings?.nameservers).toEqual(newNs);
    });

    it('returns false and shows error toast on failure', async () => {
      mockFetch({ data: MANAGED_SETTINGS });
      const { result } = renderHook(() => useDomainRegistrarSettings('example.com'));
      await act(() => result.current.loadRegistrarSettings());

      mockFetch({ error: 'INTERNAL_ERROR' }, 500);
      let ok: boolean;
      await act(async () => { ok = await result.current.onSetNameservers(['ns1.fail.com', 'ns2.fail.com']); });

      expect(ok!).toBe(false);
      expect(toast.error).toHaveBeenCalled();
    });

    it('shows success toast with propagation warning', async () => {
      mockFetch({ data: MANAGED_SETTINGS });
      const { result } = renderHook(() => useDomainRegistrarSettings('example.com'));
      await act(() => result.current.loadRegistrarSettings());

      mockFetch({ data: CUSTOM_SETTINGS });
      await act(() => result.current.onSetNameservers(['ns1.new.com', 'ns2.new.com']));

      expect(toast.success).toHaveBeenCalledWith(expect.stringContaining('48 hours'));
    });

    it('returns false and shows error toast when domain is not managed', async () => {
      // Load an external (unmanaged) domain first
      const external = { ...MANAGED_SETTINGS, managed: false };
      mockFetch({ data: external });
      const { result } = renderHook(() => useDomainRegistrarSettings('example.com'));
      await act(() => result.current.loadRegistrarSettings());

      // Now try to save nameservers — hook guards before any PATCH
      global.fetch = vi.fn(); // ensure no PATCH is sent
      let ok: boolean;
      await act(async () => { ok = await result.current.onSetNameservers(['ns1.x.com', 'ns2.x.com']); });

      expect(ok!).toBe(false);
      expect(global.fetch).not.toHaveBeenCalled();
      expect(toast.error).toHaveBeenCalledWith(
        expect.stringContaining('managed through your account')
      );
    });
  });

  // ── onUseManagedNameservers ────────────────────────────────────────────────

  describe('onUseManagedNameservers', () => {
    it('calls PATCH with nameserver_mode=managed', async () => {
      mockFetch({ data: CUSTOM_SETTINGS });
      const { result } = renderHook(() => useDomainRegistrarSettings('example.com'));
      await act(() => result.current.loadRegistrarSettings());

      mockFetch({ data: MANAGED_SETTINGS });
      await act(() => result.current.onUseManagedNameservers());

      expect(global.fetch).toHaveBeenLastCalledWith('/api/domains/registrar', expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ domain: 'example.com', nameserver_mode: 'managed' }),
      }));
    });

    it('returns true and syncs settings on success', async () => {
      mockFetch({ data: CUSTOM_SETTINGS });
      const { result } = renderHook(() => useDomainRegistrarSettings('example.com'));
      await act(() => result.current.loadRegistrarSettings());

      mockFetch({ data: MANAGED_SETTINGS });
      let ok: boolean;
      await act(async () => { ok = await result.current.onUseManagedNameservers(); });

      expect(ok!).toBe(true);
      expect(result.current.registrarSettings?.nameserver_mode).toBe('managed');
    });

    it('returns false and shows error toast on failure', async () => {
      mockFetch({ data: CUSTOM_SETTINGS });
      const { result } = renderHook(() => useDomainRegistrarSettings('example.com'));
      await act(() => result.current.loadRegistrarSettings());

      mockFetch({ error: 'INTERNAL_ERROR' }, 500);
      let ok: boolean;
      await act(async () => { ok = await result.current.onUseManagedNameservers(); });

      expect(ok!).toBe(false);
      expect(toast.error).toHaveBeenCalled();
    });

    it('shows success toast with Ahura branding and propagation notice', async () => {
      mockFetch({ data: CUSTOM_SETTINGS });
      const { result } = renderHook(() => useDomainRegistrarSettings('example.com'));
      await act(() => result.current.loadRegistrarSettings());

      mockFetch({ data: MANAGED_SETTINGS });
      await act(() => result.current.onUseManagedNameservers());

      expect(toast.success).toHaveBeenCalledWith(
        expect.stringMatching(/Ahura.*managed|managed.*Ahura/i)
      );
    });
  });
});
