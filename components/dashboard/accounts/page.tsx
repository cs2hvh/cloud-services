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
import { toast } from "sonner";

/* ------------------------------------------------------------------ */
/*  Design tokens                                                      */
/*                                                                     */
/*  The same set used by the settings shell that renders this, and by  */
/*  billing and the service pages. This tab previously used none of    */
/*  them: translucent white/[0.03] cards instead of the solid #111216  */
/*  surface, square corners where everything else is rounded-[6px], a  */
/*  raw bg-blue-500 button instead of the accent gradient, and no mono */
/*  face on labels. It read as a different product.                    */
/* ------------------------------------------------------------------ */

const MONO = "font-[var(--font-geist-mono),ui-monospace,monospace]";
const ACCENT = "#0095FF";
const CARD = "border border-white/[0.06] bg-[#111216] rounded-[6px]";

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
      className={twMerge(CARD, "p-5 transition-colors hover:border-white/[0.12]")}
    >
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="flex min-w-0 items-start gap-4">
          <div
            className={twMerge(
              "flex h-11 w-11 shrink-0 items-center justify-center rounded-[6px] border border-white/[0.08] bg-[#0d0e11]",
              meta.accentClassName
            )}
          >
            {meta.icon}
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2.5">
              <span className="text-[14px] font-semibold tracking-[-0.01em] text-white">
                {meta.label}
              </span>
              {/* Dot + label, the status treatment used across the dashboard —
                  green reads as healthy at a glance without a coloured chip
                  competing with the provider name. */}
              <span
                className={twMerge(
                  `${MONO} inline-flex items-center gap-1.5 text-[10px] uppercase tracking-[0.12em]`,
                  connected ? "text-emerald-300/90" : "text-white/40"
                )}
              >
                <span
                  className={twMerge(
                    "h-1.5 w-1.5 rounded-full shrink-0",
                    connected ? "bg-emerald-400" : "bg-white/25"
                  )}
                  style={connected ? { boxShadow: "0 0 6px #34d399" } : undefined}
                />
                {connected ? "Connected" : "Not connected"}
              </span>
              {connected && username && (
                <span className={`${MONO} text-[10.5px] text-white/40`}>
                  @{username}
                </span>
              )}
            </div>
            <p className={`${MONO} mt-2 max-w-[560px] text-[11px] leading-relaxed text-white/45`}>
              {meta.repoDescription}
            </p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {connected ? (
            <>
              <button
                type="button"
                disabled={loading}
                onClick={() => onReconnect(item.provider as OAuthProvider)}
                className={twMerge(
                  `${MONO} inline-flex h-9 items-center justify-center gap-2 rounded-[5px] border px-3.5 text-[10.5px] font-semibold uppercase tracking-[0.12em] transition-colors`,
                  "border-white/[0.1] bg-[#16181d] text-white/80 hover:bg-white/[0.06] hover:text-white",
                  loading && "cursor-not-allowed opacity-50"
                )}
              >
                {loading ? (
                  <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Please wait</>
                ) : (
                  <><RefreshCw className="h-3.5 w-3.5" /> Reconnect</>
                )}
              </button>
              <button
                type="button"
                disabled={loading}
                onClick={() => onDisconnect(item.provider as OAuthProvider)}
                className={twMerge(
                  `${MONO} inline-flex h-9 items-center justify-center gap-2 rounded-[5px] border px-3.5 text-[10.5px] font-semibold uppercase tracking-[0.12em] transition-colors`,
                  "border-red-500/25 bg-red-500/[0.06] text-red-300 hover:bg-red-500/[0.14] hover:text-red-200",
                  loading && "cursor-not-allowed opacity-50"
                )}
              >
                <Unplug className="h-3.5 w-3.5" /> Disconnect
              </button>
            </>
          ) : (
            <button
              type="button"
              disabled={loading}
              onClick={() => onConnect(item.provider as OAuthProvider)}
              className={twMerge(
                `${MONO} inline-flex h-9 items-center justify-center gap-2 rounded-[5px] px-4 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-white transition-all`,
                loading && "cursor-not-allowed opacity-50"
              )}
              style={{
                background: `linear-gradient(135deg, ${ACCENT}, #0066B3)`,
                boxShadow:
                  "0 8px 20px rgba(0,149,255,0.18), inset 0 1px 0 rgba(255,255,255,0.15)",
              }}
            >
              {loading ? (
                <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Please wait</>
              ) : (
                <><Link2 className="h-3.5 w-3.5" /> Connect</>
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

// One-shot params (OAuth results, reconnect hints) are consumed then stripped —
// but only those. Anything else stays, notably ?tab= which drives the visible
// settings tab.
function consumeUrlParams(params: URLSearchParams, keys: string[]) {
  keys.forEach((key) => params.delete(key));
  const query = params.toString();
  window.history.replaceState(
    {},
    "",
    query ? `${window.location.pathname}?${query}` : window.location.pathname
  );
}

// Error codes the git provider callbacks redirect back with.
const OAUTH_ERROR_MESSAGES: Record<string, string> = {
  missing_code: "The provider did not return an authorization code.",
  invalid_state: "That connection request expired. Please try again.",
  invalid_user: "We could not verify your account. Please sign in again.",
  config_error: "This provider integration is not configured.",
  token_exchange_failed: "The provider rejected the connection. Please try again.",
  no_token: "The provider did not return an access token.",
  user_info_failed: "We could not read your provider profile.",
  token_storage_failed: "We could not save the connection. Please try again.",
  unknown: "Something went wrong while connecting. Please try again.",
};

const Accounts = () => {
  const [loadingProvider, setLoadingProvider] = useState<string | null>(null);
  const [loadingSection, setLoadingSection] = useState<"repo" | null>(null);
  const [providers, setProviders] = useState<ProviderItem[]>([]);
  const autoRepoConnectStartedRef = useRef(false);
  const connectInProgressRef = useRef(false);
  // Stores the page the user should return to after reconnecting a git provider
  const returnToRef = useRef<string | null>(null);

  const fetchProviders = async () => {
    try {
      const response = await api.get("/auth/providers");
      if (response.status === 200) {
        setProviders(response?.data?.providers ?? []);
      }
    } catch (error) {
      console.error("Failed to fetch providers:", error);
      toast.error("Failed to load provider status. Please refresh the page.");
    }
  };

  const { connectProvider: performIntegrationAction } = useProviderConnection({
    returnTo: "/dashboard/settings?tab=account",
    mode: "integration",
  });

  const handleConnectRepo = async (provider: OAuthProvider) => {
    if (connectInProgressRef.current) return;
    connectInProgressRef.current = true;
    setLoadingProvider(provider);
    setLoadingSection("repo");
    try {
      await performIntegrationAction(provider, "connect", {
        returnTo: returnToRef.current ?? "/dashboard/settings?tab=account",
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
        returnTo: returnToRef.current ?? "/dashboard/settings?tab=account",
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

    // Redirected here because a git token expired before a redeploy
    const reconnectProvider = params.get("reconnect");
    if (reconnectProvider && ["github", "gitlab", "bitbucket"].includes(reconnectProvider)) {
      const rawReturnTo = params.get("returnTo") ?? "";
      // Only allow internal dashboard paths to prevent open-redirect abuse
      if (rawReturnTo.startsWith("/dashboard/")) {
        returnToRef.current = rawReturnTo;
      }
      consumeUrlParams(params, ["reconnect", "returnTo"]);
      const label = reconnectProvider.charAt(0).toUpperCase() + reconnectProvider.slice(1);
      toast.warning(`Your ${label} token has expired. Please reconnect your account below, then return to redeploy.`);
    }

    const autoRepoConnect = params.get("auto_repo_connect");
    const shouldAutoConnectRepo =
      !autoRepoConnectStartedRef.current &&
      (autoRepoConnect === "gitlab" || autoRepoConnect === "bitbucket");

    fetchProviders();

    if (shouldAutoConnectRepo) {
      autoRepoConnectStartedRef.current = true;
      consumeUrlParams(params, ["auto_repo_connect"]);

      setLoadingProvider(autoRepoConnect);
      setLoadingSection("repo");
      void (async () => {
        const result = await performIntegrationAction(autoRepoConnect, "connect", {
          returnTo: "/dashboard/settings?tab=account",
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
      params.get("bitbucket_connected") === "true" ||
      params.get("github_connected") === "true"
    ) {
      const connectedProvider =
        params.get("github_connected") === "true"
          ? "GitHub"
          : params.get("gitlab_connected") === "true"
          ? "GitLab"
          : "Bitbucket";
      consumeUrlParams(params, [
        "github_connected",
        "gitlab_connected",
        "bitbucket_connected",
      ]);
      toast.success(`${connectedProvider} connected successfully`);
      setTimeout(() => fetchProviders(), 500);
      return;
    }

    const oauthError = params.get("error");
    if (oauthError) {
      consumeUrlParams(params, ["error"]);
      toast.error(OAUTH_ERROR_MESSAGES[oauthError] ?? "Could not connect that provider.");
    }
  }, [performIntegrationAction]);

  /* ---------- Derived data ---------- */

  const gitProviders: OAuthProvider[] = ["github", "gitlab", "bitbucket"];

  const repoConnections = providers.filter((p) =>
    gitProviders.includes(p.provider as OAuthProvider)
  );

  return (
    // Capped rather than full-bleed: these are single-column rows, and a
    // provider name with two buttons stretched across an ultrawide monitor
    // puts the action a screen's width away from the thing it acts on. The
    // PAGE runs edge to edge; this block chooses its own measure.
    <div className="max-w-[900px] space-y-3">
      <div className={twMerge(CARD, "flex items-start gap-3.5 px-5 py-4")}>
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[6px] border border-emerald-500/20 bg-emerald-500/[0.08] text-emerald-300">
          <GitBranch className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <p className="text-[13px] font-semibold tracking-[-0.01em] text-white">
            Repository connections
          </p>
          <p className={`${MONO} mt-1.5 text-[11px] leading-relaxed text-white/45`}>
            Connect a Git provider to access repositories for application
            deployments. These can be different accounts from the one you sign
            in with.
          </p>
        </div>
      </div>

      {/* An empty list here means the provider fetch failed — fetchProviders
          toasts on error and leaves the array empty. Saying "none available"
          would read as a settled fact rather than a failed request. */}
      {repoConnections.length === 0 ? (
        <div className={twMerge(CARD, "px-5 py-10 text-center")}>
          <p className={`${MONO} text-[11px] text-white/45`}>
            Loading providers — if this persists, refresh the page.
          </p>
        </div>
      ) : (
        repoConnections.map((item, index) => (
          <RepoConnectionRow
            key={item.provider}
            index={index}
            item={item}
            loading={loadingSection === "repo" && loadingProvider === item.provider}
            onConnect={handleConnectRepo}
            onDisconnect={handleDisconnectRepo}
            onReconnect={handleReconnectRepo}
          />
        ))
      )}
    </div>
  );
};

export default Accounts;
