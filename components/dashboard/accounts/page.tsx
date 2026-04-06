"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "motion/react";
import { twMerge } from "tailwind-merge";
import {
  Github,
  Loader2,
  Link2,
  Shield,
  Unplug,
} from "lucide-react";

import api from "@/lib/axios/axios";
import { useProviderConnection } from "@/lib/hooks/use-provider-connection";

type OAuthProvider = "github" | "google" | "gitlab" | "bitbucket" | "email";

type ProviderItem = {
  provider: string;
  status: boolean;
  identity_linked?: boolean;
  integration_connected?: boolean;
};

const PROVIDER_META: Record<Exclude<OAuthProvider, "email">, {
  label: string;
  description: string;
  accentClassName: string;
  icon: React.ReactNode;
}> = {
  github: {
    label: "GitHub",
    description: "Use GitHub for sign-in continuity and developer workflow access.",
    accentClassName: "text-white",
    icon: <Github className="h-5 w-5" />,
  },
  google: {
    label: "Google",
    description: "Link your Google identity for streamlined authentication.",
    accentClassName: "text-blue-300",
    icon: (
      <svg viewBox="0 0 48 48" aria-hidden="true" className="h-5 w-5">
        <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.6 31.9 29.2 35 24 35c-6.6 0-12-5.4-12-12S17.4 11 24 11c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.4 5.3 29.5 3 24 3 12.4 3 3 12.4 3 24s9.4 21 21 21c10.5 0 19.4-7.6 20.9-17.5.1-.8.1-1.6.1-2.4 0-1-.1-2-.4-2.6Z" />
        <path fill="#FF3D00" d="M6.3 14.7l6.6 4.9C14.3 15.8 18.8 13 24 13c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.4 5.3 29.5 3 24 3 16.1 3 9.2 7.4 6.3 14.7Z" />
        <path fill="#4CAF50" d="M24 45c5.2 0 9.9-2 13.5-5.2l-6.2-5.1C29.2 35 26.7 36 24 36c-5.1 0-9.5-3-11.6-7.3l-6.5 5C9 41 16 45 24 45Z" />
        <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-1.7 3.9-6.1 7-11.3 7-5.1 0-9.5-3-11.6-7.3l-6.5 5C9 41 16 45 24 45c10.5 0 19.4-7.6 20.9-17.5.1-.8.1-1.6.1-2.4 0-1-.1-2-.4-2.6Z" opacity=".1" />
      </svg>
    ),
  },
  gitlab: {
    label: "GitLab",
    description: "Keep GitLab-based delivery and identity flows connected.",
    accentClassName: "text-amber-300",
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5">
        <path fill="currentColor" d="M22.65 13.4 20.1 5.5a.86.86 0 0 0-1.63-.05l-1.9 5.83H7.44L5.56 5.45a.86.86 0 0 0-1.63.05L1.38 13.4a1.72 1.72 0 0 0 .62 1.86L12 22.5l9.99-7.24c.54-.39.78-1.08.66-1.86Z" />
      </svg>
    ),
  },
  bitbucket: {
    label: "Bitbucket",
    description: "Support Bitbucket-driven source and repository integrations.",
    accentClassName: "text-sky-300",
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5">
        <path fill="currentColor" d="M3.3 3h17.4c.5 0 .9.4.8.9l-2.3 14.3c-.1.5-.5.8-.9.8H5.7c-.4 0-.8-.3-.9-.8L2.5 3.9C2.5 3.4 2.8 3 3.3 3Zm11 5.1H9.7l.8 5.2h3.4l.4-2.6h-2.3l-.2-1.3h3.6l-.1-1.3Z" />
      </svg>
    ),
  },
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
  onConnect: (provider: OAuthProvider) => void;
  onDisconnect: (provider: OAuthProvider) => void;
  index: number;
}) {
  const meta = PROVIDER_META[item.provider as keyof typeof PROVIDER_META];

  if (!meta) {
    return null;
  }

  const isIdentityLinked = item.identity_linked ?? item.status;
  const isIntegrationConnected = item.integration_connected ?? item.status;
  const isGitProvider = item.provider === "gitlab" || item.provider === "bitbucket";
  const btnText = isIdentityLinked ? "Disconnect" : "Connect";
  const btnAction = isIdentityLinked ? onDisconnect : onConnect;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.06 }}
      className="border border-white/[0.08] bg-white/[0.03] p-4 transition-colors hover:border-white/[0.14] hover:bg-white/[0.05]"
    >
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="flex min-w-0 items-start gap-4">
          <div className={twMerge("flex h-11 w-11 items-center justify-center border border-white/[0.08] bg-white/[0.04]", meta.accentClassName)}>
            {meta.icon}
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
                <div className="text-sm font-semibold text-white">{meta.label}</div>
              <span
                className={twMerge(
                  "inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-medium",
                  isIdentityLinked
                    ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-300"
                    : "border-white/[0.08] bg-white/[0.04] text-white/55"
                )}
              >
                {isIdentityLinked ? "Identity linked" : "Identity not linked"}
              </span>
              {isGitProvider && (
                <span
                  className={twMerge(
                    "inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-medium",
                    isIntegrationConnected
                      ? "border-cyan-500/20 bg-cyan-500/10 text-cyan-300"
                      : "border-white/[0.08] bg-white/[0.04] text-white/55"
                  )}
                >
                  {isIntegrationConnected ? "Repo connected" : "Repo not connected"}
                </span>
              )}
            </div>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-white/45">{meta.description}</p>
          </div>
        </div>

        <button
          type="button"
          disabled={loading}
          onClick={() => btnAction(item.provider as OAuthProvider)}
          className={twMerge(
            "inline-flex items-center justify-center gap-2 border px-4 py-2 text-sm font-medium transition-colors",
            isIdentityLinked
              ? "border-white/[0.1] bg-white/[0.03] text-white/80 hover:bg-white/[0.08]"
              : "border-blue-400/25 bg-blue-500/90 text-white hover:bg-blue-500",
            loading && "cursor-not-allowed opacity-60"
          )}
        >
          {loading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Please wait...
            </>
          ) : isIdentityLinked ? (
            <>
              <Unplug className="h-4 w-4" />
              {btnText}
            </>
          ) : (
            <>
              <Link2 className="h-4 w-4" />
              {btnText}
            </>
          )}
        </button>
      </div>
    </motion.div>
  );
}

const Accounts = () => {
  const [loadingProvider, setLoadingProvider] = useState<string | null>(null);
  const [providers, setProviders] = useState<ProviderItem[]>([]);
  const autoRepoConnectStartedRef = useRef(false);

  const fetchProviders = async () => {
    try {
      const response = await api.get("/auth/providers");
      if (response.status === 200) {
        setProviders(response.data.providers);
      }
    } catch (error) {
      console.error("Failed to fetch providers:", error);
    }
  };

  const { connectProvider: performConnection } = useProviderConnection({
    returnTo: "/dashboard/settings",
    mode: "identity",
  });
  const { connectProvider: performIntegrationConnection } = useProviderConnection({
    returnTo: "/dashboard/settings",
    mode: "integration",
  });

  const handleConnect = async (provider: OAuthProvider) => {
    setLoadingProvider(provider);
    try {
      const providerState = providers.find((item) => item.provider === provider);
      const integrationConnected =
        providerState?.integration_connected ?? providerState?.status ?? false;
      const shouldChainRepoConnect =
        (provider === "gitlab" || provider === "bitbucket") && !integrationConnected;
      const returnTo = shouldChainRepoConnect
        ? `/dashboard/settings?auto_repo_connect=${provider}`
        : "/dashboard/settings";

      await performConnection(provider, "connect", {
        returnTo,
        mode: "identity",
      });
    } catch (error) {
      console.error("Connect failed:", error);
      setLoadingProvider(null);
    }
  };

  const handleDisconnect = async (provider: OAuthProvider) => {
    setLoadingProvider(provider);
    try {
      const result = await performConnection(provider, "disconnect");

      if (result.success) {
        setProviders((prev) =>
          prev.map((item) =>
            item.provider === provider ? { ...item, status: false } : item
          )
        );
        await fetchProviders();
      }
    } catch (error) {
      console.error("Disconnect failed:", error);
    } finally {
      setLoadingProvider(null);
    }
  };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const autoRepoConnect = params.get("auto_repo_connect");
    const shouldAutoConnectRepo =
      !autoRepoConnectStartedRef.current &&
      (autoRepoConnect === "gitlab" || autoRepoConnect === "bitbucket");

    fetchProviders();

    if (shouldAutoConnectRepo) {
      autoRepoConnectStartedRef.current = true;

      params.delete("auto_repo_connect");
      const nextQuery = params.toString();
      const nextUrl = nextQuery
        ? `${window.location.pathname}?${nextQuery}`
        : window.location.pathname;
      window.history.replaceState({}, "", nextUrl);

      const provider = autoRepoConnect;
      setLoadingProvider(provider);
      void (async () => {
        const result = await performIntegrationConnection(provider, "connect", {
          returnTo: "/dashboard/settings",
          mode: "integration",
        });

        if (!result.success) {
          setLoadingProvider(null);
        }
      })();
      return;
    }

    if (
      params.get("gitlab_connected") === "true" ||
      params.get("bitbucket_connected") === "true"
    ) {
      window.history.replaceState({}, "", window.location.pathname);
      setTimeout(() => {
        fetchProviders();
      }, 500);
    }
  }, [performIntegrationConnection]);

  const visibleProviders = useMemo(
    () => providers.filter((item) => item.provider !== "email"),
    [providers]
  );

  const linkedProviders = visibleProviders.filter(
    (item) => item.identity_linked ?? item.status
  ).length;
  const availableProviders = visibleProviders.length;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_260px] lg:items-start">
        <div className="rounded-lg border border-white/[0.08] bg-white/[0.03] px-4 py-4">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 items-center justify-center border border-blue-500/20 bg-blue-500/10 text-blue-300">
              <Shield className="h-4 w-4" />
            </div>
            <div>
              <div className="text-sm font-medium text-white">Connected Accounts</div>
              <p className="mt-2 text-sm leading-6 text-white/45">
                Link external identity providers for faster sign-in and cleaner account recovery.
                Connected providers can also support integrations across developer workflows.
              </p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-1">
          <div className="rounded-lg border border-white/[0.08] bg-white/[0.03] px-4 py-3">
            <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/35">
              Connected
            </div>
            <div className="mt-2 text-xl font-semibold text-white">{linkedProviders}</div>
          </div>
          <div className="rounded-lg border border-white/[0.08] bg-white/[0.03] px-4 py-3">
            <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/35">
              Providers
            </div>
            <div className="mt-2 text-xl font-semibold text-white">{availableProviders}</div>
          </div>
        </div>
      </div>

      {visibleProviders.length > 0 ? (
        <div className="space-y-3">
          {visibleProviders.map((item, index) => (
            <ProviderRow
              key={item.provider}
              index={index}
              item={item}
              loading={loadingProvider === item.provider}
              onConnect={handleConnect}
              onDisconnect={handleDisconnect}
            />
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center border border-dashed border-white/[0.12] bg-white/[0.02] px-6 py-12 text-center">
          <Shield className="h-10 w-10 text-white/22" />
          <h3 className="mt-4 text-lg font-semibold text-white">No identity providers found</h3>
          <p className="mt-2 max-w-md text-sm leading-6 text-white/45">
            Provider availability is currently empty. Once enabled, connected accounts will appear
            here for sign-in and access management.
          </p>
        </div>
      )}
    </div>
  );
};

export default Accounts;
