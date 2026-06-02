'use client';

import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { motion } from 'motion/react';
import {
  ArrowLeft,
  Globe,
  ExternalLink,
  Loader2,
  CheckCircle2,
  XCircle,
  GitBranch,
  Terminal,
  Activity,
  Settings,
  Trash2,
  Box,
  Cpu,
  HardDrive,
  Network,
  Layers,
  RefreshCw,
  Copy,
  Check,
  Link2,
  Play,
  X,
  Save,
  ArrowUpCircle,
  Zap,
  Server,
  AlertTriangle,
  RotateCcw,
  FolderOpen,
  Edit2,
  Upload,
  type LucideIcon,
} from 'lucide-react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { DeleteAppModal } from '@/components/dashboard/apps/delete-app-modal';
import { RollbackAppModal } from '@/components/dashboard/apps/rollback-app-modal';
import { mergeDeploymentPresentation } from '@/components/dashboard/apps/types';
import { CustomDomainsManager } from '@/components/dashboard/apps/custom-domains/manager';
import { RuntimeLogs } from '@/components/dashboard/apps/runtime-logs';
import { AppIssues } from '@/components/dashboard/apps/app-issues';
import { BuildLogsPanel } from '@/components/dashboard/apps/build-logs';
import { OperationLogsPanel } from '@/components/dashboard/apps/operation-logs';
import { AppIntegrationsSection, StorageIntegrationsSection } from '@/components/dashboard/integrations';
import { BuildInfo } from '@/components/dashboard/apps/types';
import { useAppDetails, useAppMetrics } from '@/hooks/use-app-metrics';
import { useRealtimeDeployments } from '@/hooks/use-realtime-deployments';
import { useRealtimeApp } from '@/hooks/use-realtime-app';
import api from '@/lib/axios/axios';
import { copyToClipboard as safeCopyToClipboard } from '@/lib/utils/safe-clipboard';
import { getAppOperationLabel } from '@/lib/app-operations/core/presentation';
import { applyLiveBuildStatus } from '@/lib/app-operations/core/live-build-status';
import { toast } from 'sonner';
import { useProjects } from '@/app/dashboard/provider';
import { EnvVarsEditor, EnvVar } from '@/components/dashboard/apps/env-vars-editor';
import { DeploymentHistory } from '@/components/dashboard/apps/deployment-history';
import { AppStatusBadge } from '@/components/dashboard/apps/app-status-badge';
import { generateIdempotencyKey } from '@/lib/idempotency';
import { getPlatformAppRetentionPolicy } from '@/lib/platform-apps/retention';
import { AppProjectSection } from '@/components/dashboard/apps/app-project-section';
import {
  AppResizeSection,
  PLATFORM_APP_SIZE_ORDER,
  PLATFORM_APP_SIZE_SPECS,
  type PlatformAppRates,
  type SizeKey,
} from '@/components/dashboard/apps/app-resize-section';
import { AppBodyLimitSection } from '@/components/dashboard/apps/app-body-limit-section';
import { AppOverviewTab } from '@/components/dashboard/apps/app-overview-tab';



// Extended App type for detail page (includes all fields from API)
interface AppDetail {
  id: string;
  name: string;
  slug: string;
  repository_url: string;
  port: number;
  status: string;
  deployment_url?: string;
  created_at: string;
  project_id?: string | null;
  // Extended fields
  framework?: string;
  branch?: string;
  git_provider?: string;
  auto_deploy?: boolean;
  deploy_branch?: string;
  build_command?: string;
  output_directory?: string;
  env_vars?: Array<{ key: string; value: string }>;
  size?: string;
  can_rollback?: boolean;
  serving_build_number?: number | null;
  last_operation_build_number?: number | null;
  last_operation_trigger?: string | null;
  rollback_target_build_number?: number | null;
  rollback_target_commit_sha?: string | null;
  // Failure tracking
  last_failure_reason?: string | null;
  healthcheck_path?: string | null;
  custom_request_body_mb?: number | null;
}

const SECTION_META: Array<{
  value: string;
  label: string;
  description: string;
  eyebrow: string;
  icon: LucideIcon;
  helper: string;
}> = [
  {
    value: 'overview',
    label: 'Overview',
    description: 'Inspect status, health, traffic, and runtime capacity.',
    eyebrow: 'Operations',
    icon: Activity,
    helper: 'Start here to verify runtime health, network readiness, and workload capacity before making changes.',
  },
  {
    value: 'integrations',
    label: 'Integrations',
    description: 'Review connected services and storage integrations.',
    eyebrow: 'Connectivity',
    icon: Zap,
    helper: 'Confirm downstream services and storage targets before promoting traffic or changing runtime settings.',
  },
  {
    value: 'domains',
    label: 'Domains',
    description: 'Manage custom domains, DNS, and certificate routing.',
    eyebrow: 'Routing',
    icon: Link2,
    helper: 'Keep routing clean and verify domain coverage before switching production traffic.',
  },
  {
    value: 'build-logs',
    label: 'Build & Ops',
    description: 'Trace build output, pipeline execution, and operational rollout logs.',
    eyebrow: 'Build',
    icon: Terminal,
    helper: 'Use these logs to validate release builds, resize runs, and rollout execution details.',
  },
  {
    value: 'runtime-logs',
    label: 'Runtime Logs',
    description: 'Inspect instance output and live application runtime logs.',
    eyebrow: 'Runtime',
    icon: Server,
    helper: 'Check runtime output after deploys to catch boot, network, or dependency regressions early.',
  },
  {
    value: 'issues',
    label: 'Issues',
    description: 'Review surfaced application issues and failure signals.',
    eyebrow: 'Health',
    icon: AlertTriangle,
    helper: 'Triage issues here before scaling, resizing, or changing rollout settings.',
  },
  {
    value: 'deployments',
    label: 'Deployments',
    description: 'Track historical deployments and live rollout updates.',
    eyebrow: 'History',
    icon: Layers,
    helper: 'Deployment history shows release timing, failure reasons, and active rollout state in one place.',
  },
  {
    value: 'settings',
    label: 'Settings',
    description: 'Manage sizing, redeploys, env vars, and project assignment.',
    eyebrow: 'Configuration',
    icon: Settings,
    helper: 'Use settings for controlled changes to capacity, environment configuration, and ownership.',
  },
];

const PLATFORM_APP_RETENTION_POLICY = getPlatformAppRetentionPolicy();

// ─── Design tokens ────────────────────────────────────────────────
const APP_SERIF_STYLE: React.CSSProperties = {
  fontFamily: "var(--font-nunito), system-ui, sans-serif",
};
const APP_MONO = "font-[var(--font-geist-mono),ui-monospace,monospace]";
const APP_ACCENT = "#0095FF";
const APP_ACCENT_BRIGHT = "#33adff";

function AppCanvas({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative min-h-full bg-[#08090b] text-white">
      <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
        <div
          className="absolute -top-[300px] -right-[200px] h-[800px] w-[800px] blur-[60px]"
          style={{
            background:
              "radial-gradient(circle, rgba(0,149,255,0.07), transparent 60%)",
          }}
        />
        <div
          className="absolute -bottom-[400px] -left-[200px] h-[700px] w-[700px] blur-[70px]"
          style={{
            background:
              "radial-gradient(circle, rgba(0,149,255,0.04), transparent 60%)",
          }}
        />
        <div
          className="absolute inset-0"
          style={{
            backgroundImage:
              "radial-gradient(circle at 1px 1px, rgba(255,255,255,0.018) 1px, transparent 0)",
            backgroundSize: "28px 28px",
          }}
        />
      </div>
      <div className="relative z-10 px-6 py-8 sm:px-8 xl:px-10">{children}</div>
    </div>
  );
}

export default function AppDetailPage() {
  const params = useParams();
  const router = useRouter();
  const appId = params.id as string;
  const { projects } = useProjects();

  const [app, setApp] = useState<AppDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [buildInfo, setBuildInfo] = useState<BuildInfo | null>(null);
  const [buildLogs, setBuildLogs] = useState<string>('');
  // true only for the very first fetch of a build (shows skeleton, hides old logs)
  const [initialLogLoading, setInitialLogLoading] = useState(false);
  // tracks the byte/char offset for incremental raw log fetches during active builds
  const logOffsetRef = useRef(0);
  const prevBuildingRef = useRef<boolean | undefined>(undefined);
  const prevBuildNumberRef = useRef<number | null>(null);
  // Tracks the last-seen resize operation id so we only call fetchApp() when a NEW resize completes
  const prevResizeOpIdRef = useRef<string | null>(null);
  const resizeSectionRef = useRef<HTMLDivElement | null>(null);
  // Which build's logs the user is viewing — null means "show the active/latest build".
  // Separate from buildInfo so polling doesn't hijack the user's selection.
  const [viewingBuildNumber, setViewingBuildNumber] = useState<number | null>(null);
  // Tracks consecutive polls where Jenkins says "done" but the DB row is still
  // BUILDING � used to detect potentially orphaned builds and ask the backend
  // to run the canonical recovery path.
  const stalePollingCountRef = useRef(0);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('overview');

  // Environment variables editing state
  const [editedEnvVars, setEditedEnvVars] = useState<EnvVar[]>([]);
  const [envVarsModified, setEnvVarsModified] = useState(false);
  const [savingEnvVars, setSavingEnvVars] = useState(false);
  const [envVarsLoading, setEnvVarsLoading] = useState(false);
  const [envVarsLoaded, setEnvVarsLoaded] = useState(false);
  const [revealingKey, setRevealingKey] = useState<string | null>(null);
  // Tracks per-key auto-expiry timers so revealed values don't linger indefinitely
  const revealTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  // Timer for the token-expired redirect — cleared on unmount to prevent ghost navigation
  const redirectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [redeploying, setRedeploying] = useState(false);
  const [rollbackModalOpen, setRollbackModalOpen] = useState(false);
  const [envVarError, setEnvVarError] = useState<string | null>(null);
  const [envVarSuccess, setEnvVarSuccess] = useState<string | null>(null);

  // Health path check state
  const [healthPathStatus, setHealthPathStatus] = useState<'checking' | 'reachable' | 'unreachable' | 'not_configured' | null>(null);

  // Resize state
  const [selectedSize, setSelectedSize] = useState<SizeKey | null>(null);
  const [pendingResizeSize, setPendingResizeSize] = useState<SizeKey | null>(null);
  const [resizing, setResizing] = useState(false);
  const [resizeError, setResizeError] = useState<string | null>(null);
  const [resizeSuccess, setResizeSuccess] = useState<string | null>(null);
  const [selectedOperationId, setSelectedOperationId] = useState<string | null>(null);
  const [operationLogs, setOperationLogs] = useState('');
  const [operationLogsLoading, setOperationLogsLoading] = useState(false);
  const [platformPricing, setPlatformPricing] = useState<Partial<Record<SizeKey, PlatformAppRates>>>({});

  // (project assignment and body limit state moved into extracted components)

  // Fetch detailed K8s info
  const { details, loading: detailsLoading, refetch: refetchDetails } = useAppDetails({
    appId,
    enabled: app?.status === 'running',
  });

  // Fetch metrics
  const { metrics, health, loading: metricsLoading } = useAppMetrics({
    appId,
    enabled: app?.status === 'running',
    refreshInterval: 30000,
  });

  // Real-time deployments
  const { 
    deployments, 
    loading: deploymentsLoading, 
    connectionStatus,
    refetch: refetchDeployments,
  } = useRealtimeDeployments({ 
    appId,
    limit: PLATFORM_APP_RETENTION_POLICY.deploymentHistory.maxLoadable,
    enabled: !!app 
  });

  const buildDeployments = useMemo(
    () =>
      deployments.filter(
        (deployment): deployment is typeof deployment & { build_number: number } =>
          typeof deployment.build_number === 'number' &&
          deployment.build_number > 0
      ),
    [deployments]
  );

  const operationDeployments = useMemo(
    () => deployments.filter((deployment) => deployment.history_type === 'operation'),
    [deployments]
  );
  const latestOperationDeployment = operationDeployments[0] ?? deployments[0] ?? null;
  const latestBuildDeployment = buildDeployments[0] ?? null;
  const releaseDeployments = useMemo(
    () => buildDeployments.filter((deployment) => deployment.history_type === 'release'),
    [buildDeployments]
  );
  const deploymentsForHistory = useMemo(
    () => deployments.map((deployment) => applyLiveBuildStatus(deployment, buildInfo)),
    [deployments, buildInfo]
  );
  const latestReleaseDeployment = releaseDeployments[0] ?? null;
  const activeBuildTrigger = latestBuildDeployment?.status === 'BUILDING'
    ? latestBuildDeployment.trigger
    : buildInfo?.building
      ? latestBuildDeployment?.trigger ?? null
      : null;
  const activeBuildNumber = useMemo(() => {
    if (buildInfo?.building && buildInfo.number) return buildInfo.number;
    if (latestBuildDeployment?.status === 'BUILDING') return latestBuildDeployment.build_number;
    return null;
  }, [buildInfo?.building, buildInfo?.number, latestBuildDeployment]);
  const isBuilding = activeBuildNumber !== null;
  const resizeInProgress = useMemo(() => {
    if (pendingResizeSize) return true;
    return latestBuildDeployment?.status === 'BUILDING' && latestBuildDeployment.trigger === 'resize';
  }, [latestBuildDeployment, pendingResizeSize]);
  const displayBuildInfo = useMemo<BuildInfo | null>(() => {

    // User explicitly selected a historical build to view
    if (viewingBuildNumber !== null) {
      // If the viewing build happens to be the active build, show live Jenkins info
      if (activeBuildNumber !== null && viewingBuildNumber === activeBuildNumber && buildInfo?.number === activeBuildNumber) {
        return { ...buildInfo, building: true };
      }
      // Historical build — show a static stub (not building)
      return {
        number: viewingBuildNumber,
        building: false,
        result: null,
        duration: 0,
        timestamp: 0,
        url: '',
      };
    }

    // No explicit selection — show the active build if one is running
    if (activeBuildNumber !== null) {
      if (buildInfo?.number === activeBuildNumber) {
        return { ...buildInfo, building: true };
      }

      return {
        number: activeBuildNumber,
        building: true,
        result: null,
        duration: 0,
        timestamp: Date.now(),
        url: '',
      };
    }

    return buildInfo;
  }, [activeBuildNumber, buildInfo, viewingBuildNumber]);
  const deploymentMutationBlocked = isBuilding || app?.status === 'building' || app?.status === 'deleting';

  // Real-time app metadata updates
  const { 
    app: realtimeApp, 
    connectionStatus: appConnectionStatus 
  } = useRealtimeApp({ 
    appId,
    enabled: !!app 
  });

  const fetchApp = useCallback(async () => {
    try {
      const res = await api.post('/services/platform-apps/get', { app_id: appId });
      
      if (!res?.data) {
        setError('Failed to load app');
        return;
      }

      setApp(res?.data);
    } catch (err) {
      console.error('Error fetching app:', err);
      setError('Failed to load app');
    } finally {
      setLoading(false);
    }
  }, [appId]);

  const fetchBuildInfo = useCallback(async (appName: string): Promise<BuildInfo | null> => {
    try {
       const res = await api.get(`/jenkins/build-info?app=${appName}`, {
         validateStatus: (status) => status < 500,
       });
      if (res.status === 200 && res?.data && !res?.data?.error) {
        setBuildInfo((prev) => {
          // Guard: after triggering a redeploy, Jenkins takes ~5s to register
          // the new build. During that window it returns the PREVIOUS build's
          // info (older number, building=false). Don't let that overwrite our
          // optimistic state for the new build. Once Jenkins knows about the
          // new build number, accept all updates (including completion).
          if (prev?.building && res?.data?.number < prev.number) {
            return prev;
          }
          return res?.data;
        });
        return res?.data as BuildInfo;
      }
    } catch (error) {
      console.error('Error fetching build info:', error);
    }
    return null;
  }, []);

  const fetchBuildLogs = useCallback(async (
    appName: string,
    buildNumber: number,
    raw = false,
    append = false,
  ): Promise<boolean /* more */> => {
    if (!append) {
      // Full replacement (initial fetch or build switch) � show skeleton
      setInitialLogLoading(true);
      logOffsetRef.current = 0;
    }
    try {
      const start = append ? logOffsetRef.current : 0;
      const url = raw
        ? `/jenkins/build-logs?app=${appName}&build=${buildNumber}&start=${start}`
        : `/jenkins/build-logs?app=${appName}&build=${buildNumber}&start=0&deployment=true`;
      const res = await api.get(url);
      if (res?.data) {
        const newChunk: string = res?.data?.logs || '';
        if (append && newChunk) {
          setBuildLogs((prev) => prev + newChunk);
        } else if (!append) {
          setBuildLogs(newChunk || 'No logs available');
        }
        // Use the byte offset returned by Jenkins (X-Text-Size header), not character count
        if (res?.data?.next_start != null) {
          logOffsetRef.current = res?.data?.next_start;
        }
        return !!res?.data?.more;
      }
    } catch (error) {
      console.error('Error fetching build logs:', error);
    } finally {
      if (!append) setInitialLogLoading(false);
    }
    return false;
  }, []);

  const fetchOperationLogs = useCallback(async (operationId: string) => {
    if (!app) return;

    setOperationLogsLoading(true);
    try {
      const res = await api.get(
        `/services/platform-apps/operation-logs?app_id=${app.id}&operation_id=${operationId}`
      );
      setOperationLogs(res?.data?.logs || 'No operation logs available.');
      setSelectedOperationId(operationId);
    } catch (error) {
      console.error('Error fetching operation logs:', error);
      setOperationLogs('Failed to load operation logs.');
    } finally {
      setOperationLogsLoading(false);
    }
  }, [app]);

  useEffect(() => {
    return () => {
      if (redirectTimerRef.current) clearTimeout(redirectTimerRef.current);
    };
  }, []);

  // When the OAuth callback redirects back here after a successful git provider reconnect,
  // show a success toast and strip the ?*_connected=true param from the URL.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const connectedParam =
      params.get('github_connected') === 'true' ? 'GitHub' :
      params.get('gitlab_connected') === 'true' ? 'GitLab' :
      params.get('bitbucket_connected') === 'true' ? 'Bitbucket' : null;
    if (connectedParam) {
      window.history.replaceState({}, '', window.location.pathname);
      toast.success(`${connectedParam} reconnected successfully. You can now redeploy.`, { duration: 6000 });
    }
  }, []);

  useEffect(() => {
    fetchApp();
  }, [fetchApp]);

  useEffect(() => {
    let cancelled = false;

    const fetchPlatformPricing = async () => {
      try {
        const res = await fetch('/api/services/platform-apps/prices');
        if (!res.ok) {
          throw new Error('Failed to load platform pricing');
        }

        const data = await res.json();
        if (!cancelled && data?.rates) {
          const ratesWithQuota = Object.fromEntries(
            Object.entries(data.rates).map(([size, rate]) => [
              size,
              {
                ...(rate as PlatformAppRates),
                quota: data.quotas?.[size],
              },
            ])
          ) as Partial<Record<SizeKey, PlatformAppRates>>;
          setPlatformPricing(ratesWithQuota);
        }
      } catch (error) {
        console.error('Error fetching platform pricing:', error);
      }
    };

    fetchPlatformPricing();

    return () => {
      cancelled = true;
    };
  }, []);

  // Sync real-time app updates to local state.
  // Preserve computed fields (e.g. can_rollback) that come from the API but are
  // absent in the Supabase realtime payload � spread realtimeApp AFTER prev so
  // undefined fields in realtimeApp don't overwrite known values.
  useEffect(() => {
    if (realtimeApp) {
      setApp((prev) => {
        if (!prev) return { ...realtimeApp } as AppDetail;
        // Merge realtime fields but preserve deployment metadata from the API
        const merged = mergeDeploymentPresentation(
          { ...prev, ...realtimeApp } as AppDetail,
          prev,
        );
        if (JSON.stringify(prev) !== JSON.stringify(merged)) {
          return merged;
        }
        return prev;
      });
    }
  }, [realtimeApp]);

  useEffect(() => {
    if (app?.name) {
      fetchBuildInfo(app.name);
    }
  }, [app?.name, fetchBuildInfo]);

  // When a new build starts, auto-switch to it (clear any historical selection)
  useEffect(() => {
    if (activeBuildNumber !== null) {
      setViewingBuildNumber(null);
    }
  }, [activeBuildNumber]);

  // Fetch logs for the build the user is currently viewing.
  // - If viewing the active build (or no explicit selection): raw streaming logs while building,
  //   deployment-filtered summary once complete.
  // - If viewing a historical build: deployment-filtered summary (non-raw).
  useEffect(() => {
    const isViewingActiveBuild = viewingBuildNumber === null || viewingBuildNumber === activeBuildNumber;
    const targetBuildNumber = viewingBuildNumber ?? activeBuildNumber ?? displayBuildInfo?.number ?? null;
    if (app?.name && targetBuildNumber && activeBuildTrigger !== 'resize') {
      const useRaw = isViewingActiveBuild && isBuilding;
      fetchBuildLogs(app.name, targetBuildNumber, useRaw);
    }
  }, [app?.name, viewingBuildNumber, activeBuildNumber, activeBuildTrigger, displayBuildInfo?.number, isBuilding, fetchBuildLogs]);

  // Poll Jenkins build status (and stream logs) while a build is actively running.
  // Only appends log output if the user is currently viewing the active build.
  useEffect(() => {
    if (!app?.name || !isBuilding || !activeBuildNumber || activeBuildTrigger === 'resize') return;

    const appName = app.name;
    const buildNum = activeBuildNumber;
    // Are we viewing the active build? If user switched to a historical build,
    // we still poll Jenkins for status but don't overwrite the displayed logs.
    const isViewingActive = viewingBuildNumber === null || viewingBuildNumber === activeBuildNumber;
    let catchupId: ReturnType<typeof setTimeout> | null = null;

    const interval = setInterval(async () => {
      if (catchupId) { clearTimeout(catchupId); catchupId = null; }

      const promises: [Promise<BuildInfo | null>, Promise<boolean | void>] = [
        fetchBuildInfo(appName),
        isViewingActive
          ? fetchBuildLogs(appName, buildNum, true, true)
          : Promise.resolve(false),
      ];
      const [latestBuildInfo, more] = await Promise.all(promises);

      if (latestBuildInfo && !latestBuildInfo.building) {
        stalePollingCountRef.current += 1;
        if (stalePollingCountRef.current >= 3) {
          stalePollingCountRef.current = 0;
          api
            .post('/services/platform-apps/recover-build', { app_id: appId })
            .catch(() => {});
        }
      } else {
        stalePollingCountRef.current = 0;
      }

      if (more && isViewingActive) {
        catchupId = setTimeout(async () => {
          catchupId = null;
          await fetchBuildLogs(appName, buildNum, true, true);
        }, 400);
      }
    }, 2000);

    return () => {
      clearInterval(interval);
      if (catchupId) clearTimeout(catchupId);
      stalePollingCountRef.current = 0;
    };
  }, [app?.name, appId, isBuilding, activeBuildNumber, activeBuildTrigger, viewingBuildNumber, fetchBuildInfo, fetchBuildLogs]);

  // After a build completes, poll K8s details until servingBuildNumber reflects
  // the new pod's image tag. K8s rolling updates can take 10-30s after the build
  // finishes — a single delayed fetch is unreliable.
  useEffect(() => {
    const wasBuilding = prevBuildingRef.current;
    prevBuildingRef.current = isBuilding;

    if (wasBuilding === true && !isBuilding) {
      refetchDeployments();
      // Re-fetch full app state: last_failure_reason, can_rollback, rollback_target_build_number
      // and other server-computed fields are not carried by the Supabase realtime payload.
      fetchApp();

      // Poll details every 5s for up to 60s until the K8s pod image updates
      let attempts = 0;
      const maxAttempts = 12;
      const pollId = setInterval(() => {
        attempts++;
        refetchDetails();
        if (attempts >= maxAttempts) {
          clearInterval(pollId);
        }
      }, 5000);
      return () => clearInterval(pollId);
    }
  }, [isBuilding, refetchDetails, refetchDeployments, fetchApp]);

  // Idle poll: when no build is running, check Jenkins every 15 s so webhook-triggered
  // builds (started entirely on the backend) are detected promptly. Once Jenkins
  // reports building=true the fast 2 s polling loop above takes over.
  useEffect(() => {
    if (!app?.name || isBuilding) return;
    const id = setInterval(() => fetchBuildInfo(app.name), 15_000);
    return () => clearInterval(id);
  }, [app?.name, isBuilding, fetchBuildInfo]);

  useEffect(() => {
    if (!isBuilding) {
      stalePollingCountRef.current = 0;
    }
  }, [isBuilding]);

  // When the latest resize operation transitions to SUCCESS/FAILURE, refresh app data
  // so the header reflects the updated size. This is needed because resize runs on a
  // separate Jenkins job (build_number = null) and never sets isBuilding, so the
  // normal build-completion effect never fires for resize.
  useEffect(() => {
    const latestResize = operationDeployments.find((d) => d.trigger === 'resize');
    if (!latestResize) return;

    // Seed the ref on first render so we don't react to already-completed operations
    if (prevResizeOpIdRef.current === null) {
      prevResizeOpIdRef.current = latestResize.id;
      return;
    }

    // A new resize operation appeared and it's no longer building
    if (latestResize.id !== prevResizeOpIdRef.current && latestResize.status !== 'BUILDING') {
      prevResizeOpIdRef.current = latestResize.id;
      setPendingResizeSize(null);
      // Refresh on both success and failure: failure reason and status are updated server-side
      fetchApp();
    }
  }, [operationDeployments, fetchApp]);

  useEffect(() => {
    if (operationDeployments.length === 0) {
      setSelectedOperationId(null);
      setOperationLogs('');
      return;
    }

    const nextSelected =
      selectedOperationId && operationDeployments.some((deployment) => deployment.id === selectedOperationId)
        ? selectedOperationId
        : operationDeployments[0].id;

    if (nextSelected !== selectedOperationId) {
      fetchOperationLogs(nextSelected);
    }
  }, [fetchOperationLogs, operationDeployments, selectedOperationId]);

  // Notify when a new active build number appears.
  // This follows the merged active build state (optimistic local start or DB row),
  // so it still works during the realtime gap after manual resize/redeploy.
  useEffect(() => {
    if (!activeBuildNumber) return;
    const prev = prevBuildNumberRef.current;
    prevBuildNumberRef.current = activeBuildNumber;
    // prev === null means this is the first fetch � don't toast for an already-running build.
    if (prev === null) return;
    if (activeBuildNumber > prev) {
      toast.info(`Build #${activeBuildNumber} started`, { duration: 5000 });
    }
  }, [activeBuildNumber]);

  // Reset env vars state when navigating to a different app
  useEffect(() => {
    setEnvVarsLoaded(false);
    setEnvVarsLoading(false);
    setEditedEnvVars([]);
    setEnvVarsModified(false);
  }, [app?.id]);

  // Clear decrypted env var values from memory when the user leaves the Settings tab.
  // Secrets should not persist in React state any longer than necessary.
  useEffect(() => {
    if (activeTab !== 'settings') {
      // Cancel all pending reveal-expiry timers and wipe state when leaving the tab
      revealTimersRef.current.forEach(t => clearTimeout(t));
      revealTimersRef.current.clear();
      setEditedEnvVars([]);
      setEnvVarsLoaded(false);
      setEnvVarsModified(false);
    }
  }, [activeTab]);

  // Check healthcheck_path reachability when Settings tab opens.
  useEffect(() => {
    if (activeTab !== 'settings' || !app?.id) return;
    if (!app.healthcheck_path) { setHealthPathStatus('not_configured'); return; }
    setHealthPathStatus('checking');
    fetch(`/api/services/platform-apps/check-health-path?app_id=${app.id}`)
      .then(r => r.json())
      .then(d => setHealthPathStatus(d.reachable ? 'reachable' : 'unreachable'))
      .catch(() => setHealthPathStatus('unreachable'));
  }, [activeTab, app?.id, app?.healthcheck_path]);

  // Lazy-load env var values only when the Settings tab is first opened.
  // Values are intentionally excluded from the main page-load GET response
  // to avoid sending decrypted secrets over the wire unnecessarily.
  useEffect(() => {
    if (activeTab !== 'settings' || !app?.id || envVarsLoaded || envVarsLoading) return;

    setEnvVarsLoading(true);
    setEnvVarError(null);

    fetch('/api/services/platform-apps/env-vars/list', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ app_id: app.id }),
    })
      .then(res => res.ok ? res.json() : res.json().then(d => Promise.reject(d.error || 'Failed to load')))
      .then((data: { env_vars: Array<{ key: string; hasValue: boolean }>; truncated?: boolean }) => {
        setEditedEnvVars(
          data.env_vars.map(ev => ({ key: ev.key, value: '', hasValue: ev.hasValue, revealed: false, visible: false }))
        );
        setEnvVarsLoaded(true);
      })
      .catch((msg: string) => setEnvVarError(typeof msg === 'string' ? msg : 'Failed to load environment variables'))
      .finally(() => setEnvVarsLoading(false));
  }, [activeTab, app?.id, envVarsLoaded, envVarsLoading]);

  // Reveal the value for a single masked env var by fetching it on demand.
  const handleRevealVar = useCallback(async (key: string) => {
    if (!app?.id || revealingKey === key) return;
    setRevealingKey(key);
    try {
      const res = await fetch('/api/services/platform-apps/env-vars/reveal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ app_id: app.id, key }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to reveal');
      setEditedEnvVars(prev =>
        prev.map(ev =>
          ev.key === key ? { ...ev, value: data.value, revealed: true, visible: true } : ev
        )
      );

      // Auto-clear the revealed value after 5 minutes — secrets shouldn't sit in
      // React state any longer than necessary if the user walks away.
      const existing = revealTimersRef.current.get(key);
      if (existing) clearTimeout(existing);
      const timer = setTimeout(() => {
        setEditedEnvVars(prev =>
          prev.map(ev =>
            ev.key === key && ev.revealed
              ? { ...ev, value: '', revealed: false, visible: false }
              : ev
          )
        );
        revealTimersRef.current.delete(key);
      }, 5 * 60_000);
      revealTimersRef.current.set(key, timer);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to reveal variable';
      setEnvVarError(msg);
    } finally {
      setRevealingKey(null);
    }
  }, [app?.id, revealingKey]);

  // Handle env var changes - now handled by EnvVarsEditor
  const handleEnvVarsChange = (vars: EnvVar[]) => {
    setEditedEnvVars(vars);
    setEnvVarsModified(true);
    setEnvVarError(null);
    setEnvVarSuccess(null);
  };

  const handleSaveEnvVars = async () => {
    if (!app) return;
    
    // Separate vars the user actually has values for from vars that were
    // never revealed (existing server-side vars the user didn't touch).
    const allValid = editedEnvVars
      .map((env) => ({
        key: (env.key ?? '').trim(),
        value: env.value ?? '',
        visible: env.visible ?? false,
        revealed: env.revealed ?? false,
        hasValue: env.hasValue ?? false,
      }))
      .filter((env) => env.key !== '');

    // Vars to upsert: new vars (hasValue=false) + revealed existing vars
    const validEnvVars = allValid.filter(env => !env.hasValue || env.revealed);
    // Vars to preserve server-side without overwriting their stored value
    const keptKeys = allValid
      .filter(env => env.hasValue && !env.revealed)
      .map(env => env.key);
    
    // Check for duplicate keys
    const keys = validEnvVars.map(e => e.key.trim());
    const uniqueKeys = new Set(keys);
    if (keys.length !== uniqueKeys.size) {
      setEnvVarError('Duplicate environment variable keys are not allowed');
      return;
    }

    setSavingEnvVars(true);
    setEnvVarError(null);
    setEnvVarSuccess(null);

    try {
      const res = await fetch('/api/services/platform-apps/env-vars/update', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': generateIdempotencyKey('env-update'),
        },
        body: JSON.stringify({
          app_id: app.id,
          env_vars: validEnvVars.map(env => ({
            key: env.key.trim(),
            value: env.value,
          })),
          kept_keys: keptKeys,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to save environment variables');
      }

      // Handle different response types
      if (data.requiresRedeploy && data.appliedLive) {
        // Mixed scenario: runtime vars applied NOW, build-time vars need rebuild
        setEnvVarSuccess(`${data.message}\n${data.hint || ''}`);
        toast.success('Environment changes saved', {
          description:
            'Runtime environment variables have been applied and are live. Client-side build-time variables (NEXT_PUBLIC_*, NUXT_PUBLIC_*, PUBLIC_*, VITE_*) require a rebuild to take effect — click Redeploy to trigger a rebuild.',
          duration: 7000,
        });
      } else if (data.requiresRedeploy) {
        // Only build-time vars or app not running
        setEnvVarSuccess(`${data.message}\n${data.hint || ''}`);
        toast.warning(data.reason || 'Redeploy required', {
          description: 'Click the Redeploy button to apply changes',
          duration: 5000,
        });
      } else if (data.appliedLive) {
        // Pure runtime scenario: all vars applied
        setEnvVarSuccess(data.message);
        toast.success('All changes applied immediately.', {
          description: data.hint || 'Environment variables updated without rebuild',
          duration: 4000,
        });
      } else {
        // Fallback (shouldn't happen)
        setEnvVarSuccess(data.message || 'Environment variables saved successfully');
      }
      
      setEnvVarsModified(false);
      
      // Update local app state
      setApp(prev => prev ? { ...prev, env_vars: validEnvVars } : null);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to save environment variables';
      setEnvVarError(message);
    } finally {
      setSavingEnvVars(false);
    }
  };

  // Navigate to build logs for a specific historical build
  const handleSelectBuild = (buildNumber: number) => {
    if (!app?.name) return;
    setSelectedOperationId(null);
    // If selecting the active build, clear the override so we follow live state
    if (activeBuildNumber !== null && buildNumber === activeBuildNumber) {
      setViewingBuildNumber(null);
    } else {
      setViewingBuildNumber(buildNumber);
    }
    setActiveTab('build-logs');
  };

  const handleRedeploy = async () => {
    if (!app) return;

    setRedeploying(true);
    setEnvVarError(null);
    setEnvVarSuccess(null);
    // Clear stale failure reason optimistically so it doesn't flash while the build starts
    setApp(prev => prev ? { ...prev, last_failure_reason: null } : null);

    try {
      const res = await fetch('/api/services/platform-apps/redeploy', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': generateIdempotencyKey('redeploy'),
        },
        body: JSON.stringify({ app_id: app.id }),
      });

      if (!res.ok) {
        const data = await res.json();
        if (data.code === 'GIT_TOKEN_MISSING') {
          const validProviders = ['github', 'gitlab', 'bitbucket'];
          const provider: string = validProviders.includes(data.provider) ? (data.provider as string) : 'github';
          setEnvVarError(`Your ${provider} account is not connected or the token has expired. Redirecting to Account Settings to reconnect…`);
          redirectTimerRef.current = setTimeout(() => {
            router.push(`/dashboard/nav/account?reconnect=${provider}&returnTo=/dashboard/services/apps/${app.id}`);
          }, 1500);
          return;
        }
        throw new Error(data.error || 'Failed to trigger redeploy');
      }

      const data = await res.json();
      setSelectedOperationId(null);

      if (res.status === 202 || typeof data.build_number !== 'number') {
        setEnvVarSuccess(data.message || 'Redeploy is already in progress.');
        setActiveTab('build-logs');
        refetchDeployments();
        return;
      }

      setEnvVarSuccess(`Redeploy triggered (Build #${data.build_number})`);

      // Clear stale logs immediately and reflect the new in-progress build
      setBuildLogs('');
      logOffsetRef.current = 0;
      setBuildInfo({ number: data.build_number, building: true, result: null, duration: 0, timestamp: Date.now(), url: '' });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to trigger redeploy';
      setEnvVarError(message);
    } finally {
      setRedeploying(false);
    }
  };

  const handleResize = async () => {
    if (!app || !selectedSize) return;

    setResizing(true);
    setResizeError(null);
    setResizeSuccess(null);
    // Clear stale failure reason optimistically so it doesn't flash while the build starts
    setApp(prev => prev ? { ...prev, last_failure_reason: null } : null);

    try {
      const res = await fetch('/api/services/platform-apps/resize', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': generateIdempotencyKey('resize'),
        },
        body: JSON.stringify({ app_id: app.id, new_size: selectedSize }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || data.message || 'Failed to resize app');
      }

      setPendingResizeSize(selectedSize);
      setResizeSuccess(data.message || `Resize operation started to ${selectedSize}`);
      setSelectedSize(null);
      if (data.operation_id) {
        setActiveTab('build-logs');
        fetchOperationLogs(data.operation_id);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to resize app';
      setResizeError(message);
    } finally {
      setResizing(false);
    }
  };

  const handleRollbackSuccess = useCallback(async () => {
    setEnvVarError(null);
    setEnvVarSuccess('Rollback completed successfully');
    await Promise.all([refetchDeployments(), refetchDetails()]);
    await fetchApp();
  }, [fetchApp, refetchDeployments, refetchDetails]);

  const copyToClipboard = (text: string, field: string) => {
    void safeCopyToClipboard(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const handleDeleteSuccess = () => {
    router.push('/dashboard/services/apps');
  };

  const activeSection = useMemo(
    () => SECTION_META.find((section) => section.value === activeTab) ?? SECTION_META[0],
    [activeTab]
  );

  // -- Transparency: derive which build is actually serving traffic --
  const servingBuildNumber = useMemo(() => {
    // The running container's imageTag is the Jenkins BUILD_NUMBER (e.g. "14")
    const tag = details?.container?.imageTag;
    if (!tag) return null;
    const num = parseInt(tag, 10);
    return Number.isNaN(num) ? null : num;
  }, [details?.container?.imageTag]);
  const lastOperationBuildNumber = useMemo(() => {
    if (
      typeof latestOperationDeployment?.build_number === 'number' &&
      latestOperationDeployment.build_number > 0
    ) {
      return latestOperationDeployment.build_number;
    }

    if (
      typeof latestOperationDeployment?.rollback_target_build_number === 'number' &&
      latestOperationDeployment.rollback_target_build_number > 0
    ) {
      return latestOperationDeployment.rollback_target_build_number;
    }

    return typeof app?.last_operation_build_number === 'number'
      ? app.last_operation_build_number
      : null;
  }, [app?.last_operation_build_number, latestOperationDeployment]);
  const lastOperationTrigger = useMemo(() => {
    if (typeof latestOperationDeployment?.trigger === 'string') {
      return latestOperationDeployment.trigger;
    }

    return typeof app?.last_operation_trigger === 'string'
      ? app.last_operation_trigger
      : null;
  }, [app?.last_operation_trigger, latestOperationDeployment]);
  const lastOperationLabel = useMemo(() => {
    if (!lastOperationTrigger && lastOperationBuildNumber === null) return null;
    return getAppOperationLabel({
      buildNumber: lastOperationBuildNumber,
      trigger: lastOperationTrigger,
      rollbackTargetBuildNumber: latestOperationDeployment?.rollback_target_build_number ?? null,
      operationDetails: latestOperationDeployment?.operation_details ?? null,
    });
  }, [lastOperationBuildNumber, lastOperationTrigger, latestOperationDeployment]);
  const canRollback = useMemo(
    () => !!app?.can_rollback,
    [app?.can_rollback]
  );

  // Detect "degraded" state: app status is running (old pod healthy) but the
  // latest deployment failed � meaning the new code never took over.
  const isDegraded = useMemo(() => {
    if (app?.status !== 'running') return false;
    if (!latestReleaseDeployment) return false;
    // While a deploy is in progress the new pod hasn't started yet � not degraded.
    if (latestReleaseDeployment.status === 'BUILDING') return false;
    // While actively building � not degraded.
    if (isBuilding) return false;
    // No image tag info yet � can't determine serving version.
    if (servingBuildNumber === null) return false;
    // Details still loading � don't flash a false degraded banner.
    if (detailsLoading) return false;
    // Sole ground truth: is a completed deployment (any recorded status) sitting at
    // a higher build number than what the pod is actually running?
    // We intentionally ignore latestDeployment.status here because the deployment
    // record is written by a webhook that can silently fail (e.g. WEBHOOK_BASE_URL
    // misconfigured). The running container's image tag is always reliable � if the
    // build number matches what's serving, the deploy succeeded regardless of what
    // the database says.
    if (latestReleaseDeployment.build_number <= servingBuildNumber) return false;
    // Not degraded if the user intentionally rolled back from the latest release build —
    // a successful rollback operation after that build's creation time means it was
    // deliberately replaced, not stuck.
    const latestReleasedAt = new Date(latestReleaseDeployment.created_at).getTime();
    const wasRolledBackFrom = operationDeployments.some(
      (d) =>
        d.trigger === 'rollback' &&
        d.status === 'SUCCESS' &&
        new Date(d.created_at).getTime() > latestReleasedAt
    );
    return !wasRolledBackFrom;
  }, [app?.status, latestReleaseDeployment, servingBuildNumber, isBuilding, detailsLoading, operationDeployments]);

  // High restart count warning (CrashLoopBackOff signature)
  const restartCount = details?.container?.restartCount ?? health?.restart_count ?? 0;
  const hasHighRestarts = restartCount >= 5;

  if (loading) {
    return (
      <AppCanvas>
        <div className="mx-auto max-w-[1600px] flex items-center justify-center py-32">
          <Loader2 className="w-8 h-8 animate-spin text-white/40" />
        </div>
      </AppCanvas>
    );
  }

  if (error || !app) {
    return (
      <AppCanvas>
        <div className="mx-auto max-w-[900px]">
          <div className="border border-white/[0.06] bg-[#111216] rounded-[6px] px-6 py-16 text-center">
            <XCircle className="h-10 w-10 text-rose-300/70 mx-auto mb-4" />
            <p className="text-[15px] font-semibold text-white">{error || 'App not found'}</p>
            <Link
              href="/dashboard/services/apps"
              className={`${APP_MONO} mt-6 inline-flex items-center gap-1.5 h-10 px-3.5 border border-white/[0.08] bg-[#0d0e11] text-[11px] uppercase tracking-[0.14em] text-white/65 hover:text-white hover:bg-white/[0.04] rounded-[5px] transition-colors`}
            >
              <ArrowLeft className="h-3 w-3" />
              Back to Apps
            </Link>
          </div>
        </div>
      </AppCanvas>
    );
  }

  const domain = app.deployment_url
    ? new URL(app.deployment_url).hostname
    : `${app.slug}.galaxyhvh.com`;
  const ActiveSectionIcon = activeSection.icon;
  const currentSize = (PLATFORM_APP_SIZE_ORDER.includes((app.size ?? '') as SizeKey) ? app.size : 'small') as SizeKey;
  // During an in-flight resize, show the target size in the header; otherwise show the running size.
  const displaySize = (resizeInProgress && pendingResizeSize) ? pendingResizeSize : currentSize;
  const currentSizeSpec = PLATFORM_APP_SIZE_SPECS[displaySize];
  const currentSizePrice = platformPricing[displaySize]?.price ?? 0;

  return (
    <AppCanvas>
    <div className="mx-auto max-w-[1600px] text-white">
      {/* ── Hero ─────────────────────────────────────────── */}
      <header className="mb-10">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl min-w-0">
            <Link
              href="/dashboard/services/apps"
              className={`${APP_MONO} inline-flex items-center gap-1.5 text-[11px] uppercase tracking-[0.14em] text-white/45 hover:text-white transition-colors mb-5`}
            >
              <ArrowLeft className="h-3 w-3" />
              Back to apps
            </Link>

            <div className={`${APP_MONO} flex items-center gap-2 text-[10.5px] uppercase tracking-[0.14em] text-white/40 mb-3`}>
              <span>Apps</span>
              <span className="text-white/20">/</span>
              <span className="text-white/65 truncate">{app.name}</span>
            </div>

            <div className="flex flex-wrap items-center gap-2 mb-3">
                {<AppStatusBadge status={app.status} building={isBuilding} />}
              {appConnectionStatus === 'connected' && app.status === 'running' && !isBuilding && (
                  isDegraded ? (
                    <span
                      className={`${APP_MONO} inline-flex items-center gap-1.5 px-2.5 py-1 border border-orange-400/25 bg-orange-500/[0.08] text-[10px] uppercase tracking-[0.12em] text-orange-300 rounded-[20px]`}
                    >
                      <AlertTriangle className="h-2.5 w-2.5" />
                      Degraded
                    </span>
                  ) : (
                    <span
                      className={`${APP_MONO} inline-flex items-center gap-1.5 px-2.5 py-1 border border-emerald-400/25 bg-emerald-500/[0.08] text-[10px] uppercase tracking-[0.12em] text-emerald-300 rounded-[20px]`}
                    >
                      <span
                        className="h-1.5 w-1.5 rounded-full bg-emerald-300 animate-pulse"
                        style={{ boxShadow: "0 0 6px #4ade80" }}
                      />
                      Live
                    </span>
                  )
                )}
                {servingBuildNumber !== null && app.status === 'running' && !isBuilding && (
                  <span className={`${APP_MONO} inline-flex items-center px-2.5 py-1 border border-white/[0.08] bg-[#111216] text-[10px] uppercase tracking-[0.06em] text-white/55 rounded-[20px]`}>
                    Serving Build #{servingBuildNumber}
                  </span>
                )}
                {lastOperationLabel && !isBuilding && (
                  <span className={`${APP_MONO} inline-flex items-center px-2.5 py-1 border border-white/[0.08] bg-[#111216] text-[10px] uppercase tracking-[0.06em] text-white/55 rounded-[20px]`}>
                    Last op · {lastOperationLabel}
                  </span>
                )}
              </div>

              <div className="flex items-center gap-3">
                <h1 className={`${APP_MONO} text-[28px] sm:text-[36px] leading-[1.05] tracking-[-0.015em] text-white font-semibold truncate`}>
                  {app.name}
                </h1>
                <button
                  onClick={() => copyToClipboard(app.name, 'app-name')}
                  className="shrink-0 text-white/30 hover:text-[#0095FF] transition-colors"
                  title="Copy app name"
                >
                  {copiedField === 'app-name' ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />}
                </button>
              </div>

              {app.last_failure_reason && !isBuilding && !isDegraded &&
                (app.status === 'failed' || app.status === 'running') && (
                <div className={`${APP_MONO} mt-4 flex items-center gap-2 border rounded-[5px] px-3 py-2 text-[12px] ${
                  app.status === 'failed'
                    ? 'border-rose-500/25 bg-rose-500/[0.06] text-rose-300'
                    : 'border-orange-400/25 bg-orange-500/[0.06] text-orange-300'
                }`}>
                  <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0" />
                  <span>{app.last_failure_reason}</span>
                </div>
              )}
              {isDegraded && latestReleaseDeployment && servingBuildNumber !== null && (
                <div className={`${APP_MONO} mt-4 flex items-center gap-2 border border-orange-400/25 bg-orange-500/[0.06] rounded-[5px] px-3 py-2 text-[12px] text-orange-300`}>
                  <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0" />
                  <span>
                    {`Build #${latestReleaseDeployment.build_number} did not take over — still serving Build #${servingBuildNumber}.`}
                    {app.last_failure_reason ? ` Failure: ${app.last_failure_reason}` : ''}
                  </span>
                </div>
              )}
              {hasHighRestarts && app.status === 'running' && !isBuilding && (
                <div className={`${APP_MONO} mt-4 flex items-center gap-2 border border-yellow-400/25 bg-yellow-500/[0.06] rounded-[5px] px-3 py-2 text-[12px] text-yellow-300`}>
                  <RefreshCw className="h-3.5 w-3.5 flex-shrink-0" />
                  <span>
                    Your app has restarted {restartCount} times. It may be repeatedly crashing — check Runtime Logs.
                  </span>
                </div>
              )}

              <div className="mt-4 flex flex-wrap items-center gap-1.5">
                <a
                  href={`https://${domain}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`${APP_MONO} inline-flex items-center gap-1.5 text-[11.5px] text-white/55 hover:text-[#0095FF] transition-colors`}
                >
                  <Globe className="h-3.5 w-3.5" />
                  {domain}
                  <ExternalLink className="h-3 w-3" />
                </a>
                <button
                  onClick={() => copyToClipboard(`https://${domain}`, 'domain')}
                  className="text-white/30 hover:text-[#0095FF] transition-colors"
                  title="Copy URL"
                >
                  {copiedField === 'domain' ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                </button>
              </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setRollbackModalOpen(true)}
              disabled={deploymentMutationBlocked || !canRollback}
              className={`${APP_MONO} h-10 inline-flex items-center gap-1.5 px-3.5 border border-white/[0.08] bg-[#111216] text-[11px] uppercase tracking-[0.14em] text-white/65 hover:text-white hover:bg-white/[0.04] rounded-[5px] transition-colors disabled:opacity-40 disabled:cursor-not-allowed`}
              title={
                canRollback
                  ? app?.rollback_target_build_number
                    ? `Rollback release to Build #${app.rollback_target_build_number}; current size stays unchanged`
                    : 'Rollback to the previous successful release'
                  : 'No previous release available. Resize-only operations do not create rollback targets.'
              }
            >
              <RotateCcw className="h-3 w-3" />
              Rollback
            </button>
            <button
              type="button"
              onClick={() => {
                if (app.name) fetchBuildInfo(app.name);
                refetchDetails();
              }}
              className={`${APP_MONO} h-10 inline-flex items-center gap-1.5 px-3.5 border border-white/[0.08] bg-[#111216] text-[11px] uppercase tracking-[0.14em] text-white/65 hover:text-white hover:bg-white/[0.04] rounded-[5px] transition-colors`}
            >
              <RefreshCw className="h-3 w-3" />
              Refresh
            </button>
            <button
              type="button"
              onClick={() => setDeleteModalOpen(true)}
              disabled={deploymentMutationBlocked}
              className={`${APP_MONO} h-10 inline-flex items-center gap-1.5 px-3.5 border border-rose-500/25 bg-rose-500/[0.06] text-[11px] uppercase tracking-[0.14em] text-rose-300 hover:bg-rose-500/[0.10] rounded-[5px] transition-colors disabled:opacity-40 disabled:cursor-not-allowed`}
            >
              <Trash2 className="h-3 w-3" />
              Delete
            </button>
          </div>
        </div>
      </header>

      {/* ── Stats strip ───────────────────────────────────── */}
      <section className="mb-12 border-y border-white/[0.06] grid grid-cols-2 lg:grid-cols-5 divide-x divide-white/[0.06]">
        <div className="px-5 py-5 flex flex-col gap-2 min-w-0">
          <span className={`${APP_MONO} text-[10px] uppercase tracking-[0.14em] text-white/45`}>App ID</span>
          <div className="flex items-center gap-2 min-w-0">
            <span className={`${APP_MONO} text-[12px] text-white truncate tabular-nums`}>{app.id}</span>
            <button
              onClick={() => copyToClipboard(app.id, 'app-id')}
              className="shrink-0 text-white/25 hover:text-[#0095FF] transition-colors"
              title="Copy app ID"
            >
              {copiedField === 'app-id' ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
            </button>
          </div>
        </div>

        <div className="px-5 py-5 flex flex-col gap-2">
          <span className={`${APP_MONO} text-[10px] uppercase tracking-[0.14em] text-white/45`}>Framework</span>
          <span style={APP_SERIF_STYLE} className="text-[22px] leading-none font-bold tracking-[-0.025em] text-white">
            {app.framework || '—'}
          </span>
        </div>

        <div className="px-5 py-5 flex flex-col gap-2">
          <span className={`${APP_MONO} text-[10px] uppercase tracking-[0.14em] text-white/45 inline-flex items-center gap-1.5`}>
            <span
              className="h-1.5 w-1.5 rounded-full"
              style={{ background: APP_ACCENT, boxShadow: `0 0 6px ${APP_ACCENT}` }}
            />
            Branch
          </span>
          <span className={`${APP_MONO} text-[14px] text-white font-medium truncate`}>
            {app.branch || '—'}
          </span>
        </div>

        <div className="px-5 py-5 flex flex-col gap-2">
          <span className={`${APP_MONO} text-[10px] uppercase tracking-[0.14em] text-white/45`}>
            {resizeInProgress ? 'Upgrading to' : 'Runtime Size'}
          </span>
          <div className="flex items-baseline gap-1.5">
            <span style={APP_SERIF_STYLE} className="text-[22px] leading-none font-bold tracking-[-0.025em] text-white capitalize">
              {displaySize}
            </span>
            <span className={`${APP_MONO} text-[10.5px] text-white/45`}>
              {currentSizePrice > 0 ? `$${currentSizePrice.toFixed(2)}/mo` : 'Free'}
            </span>
          </div>
          <p className={`${APP_MONO} text-[10.5px] text-white/40`}>
            {currentSizeSpec.cpu} · {currentSizeSpec.memory}
          </p>
          {resizeInProgress && (
            <p className={`${APP_MONO} text-[10px] text-amber-300/80`}>Resize in progress</p>
          )}
        </div>

        <div className="px-5 py-5 flex flex-col gap-2">
          <span className={`${APP_MONO} text-[10px] uppercase tracking-[0.14em] text-white/45`}>Created</span>
          <span style={APP_SERIF_STYLE} className="text-[22px] leading-none font-bold tabular-nums tracking-[-0.025em] text-white">
            {new Date(app.created_at).toLocaleDateString()}
          </span>
        </div>
      </section>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        {/* ── Pill tab nav ─────────────────────────────── */}
        <div className="mb-6 border-b border-white/[0.06] overflow-x-auto">
          <div className="flex items-center gap-1 -mb-px min-w-max">
            {SECTION_META.map((section) => {
              const SectionIcon = section.icon;
              const isActive = activeTab === section.value;
              return (
                <button
                  key={section.value}
                  type="button"
                  onClick={() => setActiveTab(section.value)}
                  className={`${APP_MONO} relative inline-flex items-center gap-1.5 px-4 py-3 text-[11px] uppercase tracking-[0.14em] transition-colors ${
                    isActive ? "text-white" : "text-white/45 hover:text-white/75"
                  }`}
                >
                  <SectionIcon className="h-3 w-3" />
                  {section.label}
                  {isActive && (
                    <span
                      className="absolute left-2 right-2 -bottom-px h-[2px]"
                      style={{
                        background: APP_ACCENT,
                        boxShadow: `0 0 8px ${APP_ACCENT}`,
                      }}
                    />
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* ── Section header ───────────────────────────── */}
        <div className="mb-6 flex items-baseline gap-3">
          <span className={`${APP_MONO} text-[10.5px] tabular-nums text-white/35`}>
            {String(SECTION_META.findIndex(s => s.value === activeTab) + 1).padStart(2, '0')}
          </span>
          <div>
            <h2 className="text-[20px] font-semibold tracking-[-0.02em] text-white">
              {activeSection.label.split(" ")[0]}{" "}
              <span style={APP_SERIF_STYLE} className="text-white/55 font-normal">
                {activeSection.label.split(" ").slice(1).join(" ") || activeSection.eyebrow.toLowerCase()}
              </span>
              <span className="text-white/55 font-normal">.</span>
            </h2>
            <p className={`${APP_MONO} mt-1 text-[11px] text-white/45`}>
              {activeSection.description}
            </p>
          </div>
        </div>

        <div className="space-y-4">

          {/* Overview Tab */}
          <TabsContent value="overview" className="space-y-4">
            <AppOverviewTab
              app={app}
              details={details}
              metrics={metrics}
              health={health}
              detailsLoading={detailsLoading}
              metricsLoading={metricsLoading}
              copiedField={copiedField}
              onCopy={copyToClipboard}
              onManageBandwidth={() => setActiveTab('settings')}
              servingBuildNumber={servingBuildNumber}
              lastOperationLabel={lastOperationLabel}
            />
          </TabsContent>
          {/* Integrations Tab */}
          <TabsContent value="integrations" className="space-y-4">
            <AppIntegrationsSection 
              appId={app.id} 
              appName={app.name} 
              projectId={app.project_id || ''} 
            />
            <StorageIntegrationsSection
              appId={app.id}
              appName={app.name}
              projectId={app.project_id || ''}
            />
          </TabsContent>

          {/* Domains Tab */}
          <TabsContent value="domains">
            <CustomDomainsManager
              appId={app.id}
              appStatus={app.status}
              platformDomain={domain}
            />
          </TabsContent>

          {/* Build Logs Tab */}
          <TabsContent value="build-logs">
            <div className="space-y-4">
              <BuildLogsPanel 
                buildInfo={displayBuildInfo} 
                buildLogs={buildLogs}
                initialLoading={initialLogLoading}
                appName={app.name}
                fetchBuildLogs={fetchBuildLogs}
                deployments={releaseDeployments}
                onSelectBuild={handleSelectBuild}
              />
              <OperationLogsPanel
                operations={operationDeployments}
                selectedOperationId={selectedOperationId}
                logs={operationLogs}
                loading={operationLogsLoading}
                onSelectOperation={fetchOperationLogs}
                onRefresh={() => {
                  if (selectedOperationId) {
                    fetchOperationLogs(selectedOperationId);
                  }
                }}
              />
            </div>
          </TabsContent>

          {/* Runtime Logs Tab */}
          <TabsContent value="runtime-logs">
            <RuntimeLogs
              appId={app.id}
              appName={app.name}
              appStatus={app.status}
            />
          </TabsContent>

          {/* Issues Tab */}
          <TabsContent value="issues">
            <AppIssues
              appId={app.id}
              appName={app.name}
              appStatus={app.status}
            />
          </TabsContent>

          {/* Deployments Tab */}
          <TabsContent value="deployments">
            <DeploymentHistory
              deployments={deploymentsForHistory}
              deploymentsLoading={deploymentsLoading}
              connectionStatus={connectionStatus}
              servingBuildNumber={servingBuildNumber}
              onSelectBuild={handleSelectBuild}
              onViewOperationLogs={(deploymentId) => {
                setActiveTab('build-logs');
                fetchOperationLogs(deploymentId);
              }}
            />
          </TabsContent>

          {/* Settings Tab */}
          <TabsContent value="settings">
            <Card className="border border-white/[0.06] bg-[#111216] rounded-[6px] shadow-none">
              <CardHeader className="border-b border-white/[0.06]">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Settings className="w-5 h-5" />
                    App Settings
                  </CardTitle>
                  <div className="flex items-center gap-2">
                    <Button
                      onClick={() => setRollbackModalOpen(true)}
                      disabled={deploymentMutationBlocked || !canRollback}
                      variant="outline"
                      className="rounded-none border-white/15 bg-transparent text-white hover:bg-white/10"
                      title={
                        canRollback
                          ? app?.rollback_target_build_number
                            ? `Rollback release to Build #${app.rollback_target_build_number}; current size stays unchanged`
                            : 'Rollback to the previous successful release'
                          : 'No previous release available. Resize-only operations do not create rollback targets.'
                      }
                    >
                      <RotateCcw className="w-4 h-4 mr-2" />
                      Rollback Release
                    </Button>
                    <Button
                      onClick={handleRedeploy}
                      disabled={redeploying || deploymentMutationBlocked}
                      className="rounded-none bg-blue-600 hover:bg-blue-700 text-white"
                    >
                      {redeploying ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Redeploying...
                        </>
                      ) : (
                        <>
                          <Play className="w-4 h-4 mr-2" />
                          Redeploy
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-5 pt-5">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="border border-white/[0.08] bg-white/[0.03] px-4 py-4">
                    <p className="text-xs text-white/40 mb-1">Build Command</p>
                    <p className="border border-white/[0.08] bg-black/20 px-3 py-3 text-sm font-mono text-white">
                      {app.build_command || 'Default'}
                    </p>
                  </div>
                  <div className="border border-white/[0.08] bg-white/[0.03] px-4 py-4">
                    <p className="text-xs text-white/40 mb-1">Output Directory</p>
                    <p className="border border-white/[0.08] bg-black/20 px-3 py-3 text-sm font-mono text-white">
                      {app.output_directory || 'Default'}
                    </p>
                  </div>
                  <div className="border border-white/[0.08] bg-white/[0.03] px-4 py-4">
                    <p className="text-xs text-white/40 mb-1">Health Check Path</p>
                    <div className="flex items-center gap-2">
                      <p className="flex-1 border border-white/[0.08] bg-black/20 px-3 py-3 text-sm font-mono text-white">
                        {app.healthcheck_path || <span className="text-white/30">Not set · TCP socket probe</span>}
                      </p>
                      {app.healthcheck_path && (
                        <span className={`shrink-0 text-xs font-medium px-2 py-1 rounded ${
                          healthPathStatus === 'checking'     ? 'bg-white/[0.06] text-white/40' :
                          healthPathStatus === 'reachable'    ? 'bg-green-500/10 text-green-400' :
                          healthPathStatus === 'unreachable'  ? 'bg-orange-500/10 text-orange-400' :
                          'bg-white/[0.06] text-white/40'
                        }`}>
                          {healthPathStatus === 'checking'    ? 'Checking…' :
                           healthPathStatus === 'reachable'   ? '✓ Reachable' :
                           healthPathStatus === 'unreachable' ? '⚠ Not reachable' :
                           ''}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <AppProjectSection
                  appId={app.id}
                  initialProjectId={app.project_id ?? null}
                  onSaved={(newId) => setApp(prev => prev ? { ...prev, project_id: newId } : null)}
                />

                <div ref={resizeSectionRef}>
                  <AppResizeSection
                    appSize={app.size ?? null}
                    platformPricing={platformPricing}
                    resizeInProgress={resizeInProgress}
                    pendingResizeSize={pendingResizeSize}
                    deploymentMutationBlocked={deploymentMutationBlocked}
                    selectedSize={selectedSize}
                    setSelectedSize={setSelectedSize}
                    resizing={resizing}
                    resizeError={resizeError}
                    resizeSuccess={resizeSuccess}
                    handleResize={handleResize}
                  />
                </div>

                <AppBodyLimitSection
                  app={app}
                  onUpdate={(patch) => setApp(prev => prev ? { ...prev, ...patch } : null)}
                  planMaxMb={platformPricing[currentSize]?.quota?.maxRequestBodyBytes != null ? Math.floor(platformPricing[currentSize]!.quota!.maxRequestBodyBytes! / (1024 * 1024)) : null}
                  onUpgradePlan={() => {
                    const nextSize = PLATFORM_APP_SIZE_ORDER[PLATFORM_APP_SIZE_ORDER.indexOf(currentSize) + 1] ?? null;
                    if (nextSize) setSelectedSize(nextSize);
                    resizeSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                  }}
                />

                {/* Environment Variables - Using EnvVarsEditor */}
                <div className="border-t border-white/10 pt-4">
                  {/* Success/Error Messages */}
                  {envVarError && (
                    <div className="mb-3 border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
                      {envVarError}
                    </div>
                  )}
                  {envVarSuccess && (
                    <div className="mb-3 flex items-center gap-2 border border-green-500/30 bg-green-500/10 px-3 py-2 text-sm text-green-300">
                      <CheckCircle2 className="w-4 h-4" />
                      {envVarSuccess}
                    </div>
                  )}

                  {/* Advanced Environment Variables Editor */}
                  {envVarsLoading ? (
                    <div className="flex items-center gap-2 py-6 text-white/50 text-sm">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Loading environment variables…
                    </div>
                  ) : (
                    <EnvVarsEditor value={editedEnvVars} onChange={handleEnvVarsChange} appId={app?.id} onReveal={handleRevealVar} revealingKey={revealingKey} />
                  )}

                  {/* Save Button */}
                  {envVarsModified && (
                    <div className="mt-4 flex items-center gap-3">
                      <Button
                        onClick={handleSaveEnvVars}
                        disabled={savingEnvVars || deploymentMutationBlocked}
                        className="rounded-none bg-green-600 hover:bg-green-700 text-white"
                      >
                        {savingEnvVars ? (
                          <>
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            Saving...
                          </>
                        ) : (
                          <>
                            <Save className="w-4 h-4 mr-2" />
                            Save Changes
                          </>
                        )}
                      </Button>
                      <span className="text-xs text-white/50">
                        {envVarSuccess && envVarSuccess.toLowerCase().includes('applied') && envVarSuccess.toLowerCase().includes('immediately') ? (
                          <span className="text-yellow-400">
                            Runtime variables apply immediately. Build-time variables require a redeploy.
                          </span>
                        ) : envVarSuccess && (envVarSuccess.includes('applied instantly') || envVarSuccess.includes('All changes applied')) ? (
                          <span className="text-green-400">
                            All changes applied immediately. No rebuild required.
                          </span>
                        ) : envVarSuccess && envVarSuccess.toLowerCase().includes('redeploy') ? (
                          <span className="text-yellow-400">
                            Changes require clicking &quot;Redeploy&quot; to take effect.
                          </span>
                        ) : (
                          'Auto-detects if hot update or rebuild is needed'
                        )}
                      </span>
                    </div>
                  )}
                </div>

                {/* Danger Zone */}
                <div className="border-t border-white/10 pt-4 mt-4">
                  <h4 className="text-sm font-semibold text-red-400 mb-2">Danger Zone</h4>
                  <Button
                    variant="destructive"
                    onClick={() => setDeleteModalOpen(true)}
                    disabled={deploymentMutationBlocked}
                    className="w-full rounded-none md:w-auto"
                  >
                    <Trash2 className="w-4 h-4 mr-2" />
                    Delete Application
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </div>
      </Tabs>

      {/* Delete Modal */}
      <DeleteAppModal
        open={deleteModalOpen}
        onOpenChange={setDeleteModalOpen}
        appId={app?.id || null}
        appName={app?.name || null}
        onDeleteStart={() => setApp(prev => prev ? { ...prev, status: 'deleting' } : null)}
        onDeleteSuccess={handleDeleteSuccess}
        onDeleteError={() => setApp(prev => prev ? { ...prev, status: 'failed' } : null)}
      />
      <RollbackAppModal
        open={rollbackModalOpen}
        onOpenChange={setRollbackModalOpen}
        appId={app?.id || null}
        appName={app?.name || null}
        currentBuildNumber={servingBuildNumber}
        targetBuildNumber={app?.rollback_target_build_number ?? null}
        targetCommitSha={app?.rollback_target_commit_sha ?? null}
        currentSizeLabel={app?.size ?? null}
        onRollbackSuccess={handleRollbackSuccess}
      />
    </div>
    </AppCanvas>
  );
}
