'use client';

import { useCallback, useState } from 'react';
import { toast } from 'sonner';

interface UseProviderConnectionOptions {
  returnTo?: string;
  mode?: 'identity' | 'integration';
}

interface ConnectProviderOverrides {
  returnTo?: string;
  mode?: 'identity' | 'integration';
}

interface ProviderConnectionResponse {
  url?: string;
  message?: string;
  error?: string;
  success?: boolean;
}

/**
 * Centralized hook for provider OAuth connection flow
 * Handles both connect and disconnect with consistent error handling
 * 
 * Usage:
 * const { connectProvider, isLoading, error } = useProviderConnection({ 
 *   returnTo: '/dashboard/nav/account' 
 * });
 */
export function useProviderConnection(options?: UseProviderConnectionOptions) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const connectProvider = useCallback(
    async (
      provider: string,
      method: 'connect' | 'disconnect' = 'connect',
      overrides?: ConnectProviderOverrides
    ) => {
      setIsLoading(true);
      setError(null);

      try {
        // Use provided returnTo or default to current page
        const returnPath =
          overrides?.returnTo ||
          options?.returnTo ||
          (typeof window !== 'undefined' ? window.location.pathname : '/dashboard');

        const mode = overrides?.mode || options?.mode || 'integration';
        const isGitIntegrationProvider = provider === 'gitlab' || provider === 'bitbucket';
        const endpoint =
          mode === 'identity'
            ? '/api/auth/link'
            : isGitIntegrationProvider
              ? `/api/${provider}/app-auth`
              : '/api/auth/link';

        const response = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ 
            provider, 
            method, 
            returnTo: returnPath
          }),
        });

        const data: ProviderConnectionResponse = await response.json();

        if (!response.ok) {
          const errorMsg = data?.error || `Failed to ${method} ${provider}`;
          setError(errorMsg);
          toast.error(errorMsg);
          return { success: false, error: errorMsg };
        }

        // Handle OAuth redirect for connect
        if (data.url && method === 'connect') {
          window.location.href = data.url;
          return { success: true };
        }

        // Handle disconnect success
        if (method === 'disconnect') {
          toast.success('Provider disconnected successfully');
          return { success: true };
        }

        return { success: true, data };
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'An unexpected error occurred';
        setError(errorMsg);
        toast.error(errorMsg);
        console.error(`[Provider Connection] Error:`, err);
        return { success: false, error: errorMsg };
      } finally {
        setIsLoading(false);
      }
    },
    [options?.mode, options?.returnTo]
  );

  return { connectProvider, isLoading, error };
}
