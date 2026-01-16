// app/components/accounts/Accounts.tsx
"use client";

import React, { useEffect, useState } from "react";
import { motion } from "motion/react";
import { twMerge } from "tailwind-merge";
import EnableTotp from "../2fa/page";
import api from "@/lib/axios/axios";
import { useProviderConnection } from "@/lib/hooks/use-provider-connection";

type OAuthProvider = "github" | "google" | "gitlab" | "bitbucket" | "email";

type ProviderItem = {
  provider: string;
  status: boolean; // true = linked, false = not linked
};

const PROVIDER_LABEL: Record<Exclude<OAuthProvider, "email">, string> = {
  github: "GitHub",
  google: "Google",
  gitlab: "GitLab",
  bitbucket: "Bitbucket",
};

const PROVIDER_ICON: Record<
  Exclude<OAuthProvider, "email">,
  React.ReactNode
> = {
  github: (
    <svg viewBox="0 0 16 16" aria-hidden="true" className="h-5 w-5">
      <path
        fill="currentColor"
        d="M8 0C3.58 0 0 3.67 0 8.2c0 3.62 2.29 6.69 5.47 7.77.4.08.55-.18.55-.39
           0-.19-.01-.82-.01-1.49-2.01.38-2.53-.5-2.69-.96-.09-.24-.48-.96-.82-1.16-.28-.15-.68-.52-.01-.53.63-.01
           1.08.59 1.23.83.72 1.22 1.87.88 2.33.67.07-.53.28-.88.51-1.08-1.78-.2-3.64-.91-3.64-4.04
           0-.89.31-1.62.82-2.19-.08-.2-.36-1.02.08-2.12 0 0 .67-.22 2.2.84a7.33 7.33 0 0 1 2-.28c.68 0 1.36.09 2 .28
           1.53-1.06 2.2-.84 2.2-.84.44 1.1.16 1.92.08 2.12.51.57.82 1.3.82 2.19 0 3.14-1.87 3.84-3.65 4.04.29.25.54.74.54 1.49
           0 1.08-.01 1.95-.01 2.22 0 .21.15.47.55.39A8.02 8.02 0 0 0 16 8.2C16 3.67 12.42 0 8 0Z"
      />
    </svg>
  ),
  google: (
    <svg viewBox="0 0 48 48" aria-hidden="true" className="h-5 w-5">
      <path
        fill="#FFC107"
        d="M43.6 20.5H42V20H24v8h11.3C33.6 31.9 29.2 35 24 35c-6.6 0-12-5.4-12-12S17.4 11 24 11c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.4 5.3 29.5 3 24 3 12.4 3 3 12.4 3 24s9.4 21 21 21c10.5 0 19.4-7.6 20.9-17.5.1-.8.1-1.6.1-2.4 0-1-.1-2-.4-2.6Z"
      />
      <path
        fill="#FF3D00"
        d="M6.3 14.7l6.6 4.9C14.3 15.8 18.8 13 24 13c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.4 5.3 29.5 3 24 3 16.1 3 9.2 7.4 6.3 14.7Z"
      />
      <path
        fill="#4CAF50"
        d="M24 45c5.2 0 9.9-2 13.5-5.2l-6.2-5.1C29.2 35 26.7 36 24 36c-5.1 0-9.5-3-11.6-7.3l-6.5 5C9 41 16 45 24 45Z"
      />
      <path
        fill="#1976D2"
        d="M43.6 20.5H42V20H24v8h11.3c-1.7 3.9-6.1 7-11.3 7-5.1 0-9.5-3-11.6-7.3l-6.5 5C9 41 16 45 24 45c10.5 0 19.4-7.6 20.9-17.5.1-.8.1-1.6.1-2.4 0-1-.1-2-.4-2.6Z"
        opacity=".1"
      />
    </svg>
  ),
  gitlab: (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5">
      <path
        fill="currentColor"
        d="M22.65 13.4 20.1 5.5a.86.86 0 0 0-1.63-.05l-1.9 5.83H7.44L5.56 5.45a.86.86 0 0 0-1.63.05L1.38 13.4a1.72 1.72 0 0 0 .62 1.86L12 22.5l9.99-7.24c.54-.39.78-1.08.66-1.86Z"
      />
    </svg>
  ),
  bitbucket: (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5">
      <path
        fill="currentColor"
        d="M3.3 3h17.4c.5 0 .9.4.8.9l-2.3 14.3c-.1.5-.5.8-.9.8H5.7c-.4 0-.8-.3-.9-.8L2.5 3.9C2.5 3.4 2.8 3 3.3 3Zm11 5.1H9.7l.8 5.2h3.4l.4-2.6h-2.3l-.2-1.3h3.6l-.1-1.3Z"
      />
    </svg>
  ),
};

function ProviderRow({
  item,
  loading,
  onConnect,
  onDisconnect,
  index,
}: {
  item: ProviderItem;
  loading: boolean;
  onConnect: (p: OAuthProvider) => void;
  onDisconnect: (p: OAuthProvider) => void;
  index: number;
}) {
  //if (item.provider === "email") return null; // not shown in the 4 requested

  const label = PROVIDER_LABEL[item.provider as keyof typeof PROVIDER_LABEL];
  const icon = PROVIDER_ICON[item.provider as keyof typeof PROVIDER_ICON];

  const isLinked = item.status;
  const btnText = isLinked ? "Disconnect" : "Connect";
  const btnAction = isLinked ? onDisconnect : onConnect;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.1 }}
      className={twMerge(
        "flex items-center justify-between rounded-2xl border p-4",
        "bg-black shadow-sm hover:shadow transition",
      )}
    >
      <div className="flex items-center gap-3">
        <div className="grid place-items-center rounded-lg border p-2">
          {icon}
        </div>
        <div>
          <div className="font-medium">{label}</div>
          <div
            className={twMerge(
              "text-xs",
              isLinked ? "text-green-600" : "text-neutral-500",
            )}
          >
            {isLinked ? "Connected" : "Not connected"}
          </div>
        </div>
      </div>

      <button
        type="button"
        disabled={loading}
        onClick={() => {
          console.log('[ProviderRow] Button clicked:', { provider: item.provider, isLinked, btnText });
          btnAction(item.provider as OAuthProvider);
        }}
        className={twMerge(
          "px-3 py-2 rounded-lg text-sm font-medium border",
          "focus:outline-none focus:ring-2 focus:ring-offset-2",
          isLinked
            ? "bg-white text-red-600 border-red-200 hover:bg-red-50 focus:ring-red-400"
            : "bg-black text-white border-black hover:opacity-90 focus:ring-black/50",
          loading && "opacity-60 cursor-not-allowed",
        )}
      >
        {loading ? "Please wait..." : btnText}
      </button>
    </motion.div>
  );
}

const Accounts = () => {
  // Per-provider loading state for better UX
  const [loadingProvider, setLoadingProvider] = useState<string | null>(null);
  const [providers, setProviders] = useState<ProviderItem[]>([]);

  const fetchProviders = async () => {
    try {
      console.log('[Accounts] Fetching providers from API...');
      const response = await api.get("/auth/providers");
      console.log('[Accounts] API Response status:', response.status);
      if (response.status === 200) {
        console.log('[Accounts] Providers received:', response.data.providers);
        setProviders(response.data.providers);
        
        // Log each provider status
        response.data.providers.forEach((p: ProviderItem) => {
          console.log(`[Accounts] Provider ${p.provider}: ${p.status ? 'CONNECTED' : 'NOT CONNECTED'}`);
        });
      }
    } catch (error) {
      console.error('[Accounts] Failed to fetch providers:', error);
    }
  };

  const { connectProvider: performConnection } = useProviderConnection();

  const handleConnect = async (provider: OAuthProvider) => {
    console.log('[Accounts] handleConnect called:', { provider, method: 'connect' });
    setLoadingProvider(provider);
    try {
      const result = await performConnection(provider, 'connect');
      console.log('[Accounts] performConnection result:', result);
      // Connect will redirect, so no need to refetch
    } catch (error) {
      console.error('[Accounts] Connect failed:', error);
      setLoadingProvider(null);
    }
  };

  const handleDisconnect = async (provider: OAuthProvider) => {
    console.log('[Accounts] handleDisconnect called:', { provider, method: 'disconnect' });
    setLoadingProvider(provider);
    try {
      const result = await performConnection(provider, 'disconnect');
      console.log('[Accounts] performConnection result:', result);
      
      if (result.success) {
        console.log('[Accounts] Disconnect successful, updating UI for:', provider);
        // Optimistically update UI
        setProviders(prev => prev.map(p => 
          p.provider === provider ? { ...p, status: false } : p
        ));
        console.log('[Accounts] Optimistic update complete');
        
        // Refetch to confirm
        console.log('[Accounts] Refetching providers from API...');
        await fetchProviders();
      }
    } catch (error) {
      console.error('[Accounts] Disconnect failed:', error);
    } finally {
      setLoadingProvider(null);
    }
  };

  useEffect(() => {
    console.log('[Accounts] Component mounted, checking URL params...');
    const params = new URLSearchParams(window.location.search);
    console.log('[Accounts] URL params:', window.location.search);
    
    fetchProviders();
    
    // Check if we just returned from OAuth and refetch
    if (params.get('gitlab_connected') === 'true' || params.get('bitbucket_connected') === 'true') {
      console.log('[Accounts] ✅ OAuth success detected! Refetching providers in 500ms...');
      // Remove the query parameter from URL
      window.history.replaceState({}, '', window.location.pathname);
      // Force a refetch after a brief delay to ensure token is stored
      setTimeout(() => {
        console.log('[Accounts] Now refetching after OAuth success...');
        fetchProviders();
      }, 500);
    } else {
      console.log('[Accounts] No OAuth success param found');
    }
  }, []);

  return (
    // Updated class to remove max-width constraint to match dashboard spacing
    <div className={twMerge("space-y-4")}>
      <motion.h2 
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-xl font-semibold"
      >
        Connected Accounts
      </motion.h2>
      
      <motion.p 
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="text-sm text-neutral-600"
      >
        Link your accounts to sign in quickly and securely.
      </motion.p>

      <motion.div 
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="grid gap-3"
      >
        {providers?.map((item, index) => (
          <ProviderRow
            key={item.provider}
            index={index}
            item={item}
            loading={loadingProvider === item.provider}
            onConnect={handleConnect}
            onDisconnect={handleDisconnect}
          />
        ))}
      </motion.div>
      
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
      >
        <EnableTotp />
      </motion.div>
    </div>
  );
};

export default Accounts;