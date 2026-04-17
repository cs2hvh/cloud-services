"use client";

import React, { useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import { twMerge } from "tailwind-merge";
import {
  Github,
  Loader2,
  Link2,
  Unplug,
  GitBranch,
  RefreshCw,
} from "lucide-react";

import api from "@/lib/axios/axios";
import { useProviderConnection } from "@/lib/hooks/use-provider-connection";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type OAuthProvider = "github" | "gitlab" | "bitbucket";

type ProviderItem = {
  provider: string;
  status: boolean;
  identity_linked?: boolean;
  integration_connected?: boolean;
  integration_username?: string;
};

/* ------------------------------------------------------------------ */
/*  Provider metadata                                                  */
/* ------------------------------------------------------------------ */

const PROVIDER_META: Record<OAuthProvider, {
  label: string;
  repoDescription: string;
  accentClassName: string;
  icon: React.ReactNode;
}> = {
  github: {
    label: "GitHub",
    repoDescription: "Access your GitHub repositories for deployments.",
    accentClassName: "text-white",
    icon: <Github className="h-5 w-5" />,
  },
  gitlab: {
    label: "GitLab",
    repoDescription: "Connect a GitLab account to access repositories for deployments.",
    accentClassName: "text-amber-300",
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5">
        <path fill="currentColor" d="M22.65 13.4 20.1 5.5a.86.86 0 0 0-1.63-.05l-1.9 5.83H7.44L5.56 5.45a.86.86 0 0 0-1.63.05L1.38 13.4a1.72 1.72 0 0 0 .62 1.86L12 22.5l9.99-7.24c.54-.39.78-1.08.66-1.86Z" />
      </svg>
    ),
  },
  bitbucket: {
    label: "Bitbucket",
    repoDescription: "Connect a Bitbucket account to access repositories for deployments.",
    accentClassName: "text-sky-300",
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5">
        <path fill="currentColor" d="M3.3 3h17.4c.5 0 .9.4.8.9l-2.3 14.3c-.1.5-.5.8-.9.8H5.7c-.4 0-.8-.3-.9-.8L2.5 3.9C2.5 3.4 2.8 3 3.3 3Zm11 5.1H9.7l.8 5.2h3.4l.4-2.6h-2.3l-.2-1.3h3.6l-.1-1.3Z" />
      </svg>
    ),
  },
};

/* ------------------------------------------------------------------ */
/*  Repo Connection Row                                                */
/* ------------------------------------------------------------------ */

function RepoConnectionRow({
  item,
  loading,
  onConnect,
  onDisconnect,
  onReconnect,
  index,
}: {
  item: ProviderItem;
  loading: boolean;
  onConnect: (provider: OAuthProvider) => void;
  onDisconnect: (provider: OAuthProvider) => void;
  onReconnect: (provider: OAuthProvider) => void;
  index: number;
}) {
  const meta = PROVIDER_META[item.provider as OAuthProvider];
  if (!meta) return null;

  const connected = item.integration_connected ?? false;
  const username = item.integration_username;

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
                  connected
                    ? "border-cyan-500/20 bg-cyan-500/10 text-cyan-300"
                    : "border-white/[0.08] bg-white/[0.04] text-white/55"
                )}
              >
                {connected ? "Connected" : "Not connected"}
              </span>
              {connected && username && (
                <span className="text-[11px] text-white/40">@{username}</span>
              )}
            </div>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-white/45">{meta.repoDescription}</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {connected ? (
            <>
              <button
                type="button"
                disabled={loading}
                onClick={() => onReconnect(item.provider as OAuthProvider)}
                className={twMerge(
                  "inline-flex items-center justify-center gap-2 border px-4 py-2 text-sm font-medium transition-colors",
                  "border-white/[0.1] bg-white/[0.03] text-white/80 hover:bg-white/[0.08]",
                  loading && "cursor-not-allowed opacity-60"
                )}
              >
                {loading ? (
                  <><Loader2 className="h-4 w-4 animate-spin" /> Please wait...</>
                ) : (
                  <><RefreshCw className="h-4 w-4" /> Reconnect</>
                )}
              </button>
              <button
                type="button"
                disabled={loading}
                onClick={() => onDisconnect(item.provider as OAuthProvider)}
                className={twMerge(
                  "inline-flex items-center justify-center gap-2 border px-4 py-2 text-sm font-medium transition-colors",
                  "border-red-500/20 bg-red-500/10 text-red-300 hover:bg-red-500/20",
                  loading && "cursor-not-allowed opacity-60"
                )}
              >
                <Unplug className="h-4 w-4" /> Disconnect
              </button>
            </>
          ) : (
            <button
              type="button"
              disabled={loading}
              onClick={() => onConnect(item.provider as OAuthProvider)}
              className={twMerge(
                "inline-flex items-center justify-center gap-2 border px-4 py-2 text-sm font-medium transition-colors",
                "border-blue-400/25 bg-blue-500/90 text-white hover:bg-blue-500",
                loading && "cursor-not-allowed opacity-60"
              )}
            >
              {loading ? (
                <><Loader2 className="h-4 w-4 animate-spin" /> Please wait...</>
              ) : (
                <><Link2 className="h-4 w-4" /> Connect</>
              )}
            </button>
          )}
        </div>
      </div>
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main Component                                                     */
/* ------------------------------------------------------------------ */

const Accounts = () => {
  const [loadingProvider, setLoadingProvider] = useState<string | null>(null);
  const [loadingSection, setLoadingSection] = useState<"repo" | null>(null);
  const [providers, setProviders] = useState<ProviderItem[]>([]);
  const autoRepoConnectStartedRef = useRef(false);
  const connectInProgressRef = useRef(false);

  const fetchProviders = async () => {
    try {
      const response = await api.get("/auth/providers");
      if (response.status === 200) {
        setProviders(response?.data?.providers ?? []);
      }
    } catch (error) {
      console.error("Failed to fetch providers:", error);
    }
  };

  const { connectProvider: performIntegrationAction } = useProviderConnection({
    returnTo: "/dashboard/settings",
    mode: "integration",
  });

  const handleConnectRepo = async (provider: OAuthProvider) => {
    if (connectInProgressRef.current) return;
    connectInProgressRef.current = true;
    setLoadingProvider(provider);
    setLoadingSection("repo");
    try {
      await performIntegrationAction(provider, "connect", {
        returnTo: "/dashboard/settings",
      });
    } catch (error) {
      console.error("Connect repo failed:", error);
    } finally {
      setLoadingProvider(null);
      setLoadingSection(null);
      connectInProgressRef.current = false;
    }
  };

  const handleDisconnectRepo = async (provider: OAuthProvider) => {
    setLoadingProvider(provider);
    setLoadingSection("repo");
    try {
      const result = await performIntegrationAction(provider, "disconnect");
      if (result.success) await fetchProviders();
    } catch (error) {
      console.error("Disconnect repo failed:", error);
    } finally {
      setLoadingProvider(null);
      setLoadingSection(null);
    }
  };

  const handleReconnectRepo = async (provider: OAuthProvider) => {
    if (connectInProgressRef.current) return;
    connectInProgressRef.current = true;
    setLoadingProvider(provider);
    setLoadingSection("repo");
    try {
      await performIntegrationAction(provider, "connect", {
        returnTo: "/dashboard/settings",
      });
    } catch (error) {
      console.error("Reconnect repo failed:", error);
    } finally {
      setLoadingProvider(null);
      setLoadingSection(null);
      connectInProgressRef.current = false;
    }
  };

  /* ---------- Auto-connect on redirect ---------- */

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

      setLoadingProvider(autoRepoConnect);
      setLoadingSection("repo");
      void (async () => {
        const result = await performIntegrationAction(autoRepoConnect, "connect", {
          returnTo: "/dashboard/settings",
        });
        if (!result.success) {
          setLoadingProvider(null);
          setLoadingSection(null);
        }
      })();
      return;
    }

    if (
      params.get("gitlab_connected") === "true" ||
      params.get("bitbucket_connected") === "true"
    ) {
      window.history.replaceState({}, "", window.location.pathname);
      setTimeout(() => fetchProviders(), 500);
    }
  }, [performIntegrationAction]);

  /* ---------- Derived data ---------- */

  const gitProviders: OAuthProvider[] = ["github", "gitlab", "bitbucket"];

  const repoConnections = providers.filter((p) =>
    gitProviders.includes(p.provider as OAuthProvider)
  );

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3 rounded-lg border border-white/[0.08] bg-white/[0.03] px-4 py-4">
        <div className="flex h-10 w-10 items-center justify-center border border-emerald-500/20 bg-emerald-500/10 text-emerald-300">
          <GitBranch className="h-4 w-4" />
        </div>
        <div>
          <div className="text-sm font-medium text-white">Repository Connections</div>
          <p className="mt-1 text-sm leading-6 text-white/45">
            Connect a Git provider to access repositories for application deployments.
            These can be different accounts from your login method.
          </p>
        </div>
      </div>

      <div className="space-y-3">
        {repoConnections.map((item, index) => (
          <RepoConnectionRow
            key={item.provider}
            index={index}
            item={item}
            loading={loadingSection === "repo" && loadingProvider === item.provider}
            onConnect={handleConnectRepo}
            onDisconnect={handleDisconnectRepo}
            onReconnect={handleReconnectRepo}
          />
        ))}
      </div>
    </div>
  );
};

export default Accounts;
