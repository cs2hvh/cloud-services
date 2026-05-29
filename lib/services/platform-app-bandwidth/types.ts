// ── Database row types ────────────────────────────────────────────────────────

export type PlatformAppSize = "small" | "medium" | "large" | "xlarge" | "xxlarge";

export type BandwidthLifecycleStatus =
  | "ok"
  | "warning"
  | "critical"
  | "overage"
  | "restricted";

export type BandwidthEventType =
  | "warning_80"
  | "critical_90"
  | "limit_reached"
  | "overage_started"
  | "traffic_restricted"
  | "traffic_restored";

export type BandwidthPolicyAction =
  | "allow"
  | "notify"
  | "charge_overage"
  | "restrict";

export type BandwidthStatus =
  | "ok"
  | "warning"
  | "critical"
  | "exceeded"
  | "unlimited";

// ── DB row shapes ─────────────────────────────────────────────────────────────

export type BandwidthUsageRow = {
  id: string;
  app_id: string;
  user_id: string;
  period_start: string;
  period_end: string;
  ingress_bytes: number;
  egress_bytes: number;
  total_bytes: number;
  purchased_bytes: number;
  lifecycle_status: BandwidthLifecycleStatus;
  source: string;
  last_sampled_at: string | null;
  restricted_at: string | null;
  restored_at: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type PodCounterRow = {
  pod_name: string;
  receive_counter: number;
  transmit_counter: number;
  sampled_at: string;
};

// ── Public API types ──────────────────────────────────────────────────────────

export interface BandwidthQuota {
  ingressBytes: number | null;
  egressBytes: number | null;
  totalBytes: number | null;
  maxRequestBodyBytes: number | null;
  overagePerGb: number | null;
  /** Hard ceiling on billable overage bytes. null means no cap (only valid when overagePerGb is also null). */
  overageLimitBytes: number | null;
  source: "product" | "default";
}

export interface BandwidthUsageSummary {
  appId: string;
  userId: string;
  periodStart: string;
  periodEnd: string;
  ingressBytes: number;
  egressBytes: number;
  totalBytes: number;
  /** Extra bytes added via bandwidth pack purchases this period. */
  purchasedBytes: number;
  quota: BandwidthQuota;
  percentUsed: number | null;
  status: BandwidthStatus;
  remainingBytes: number | null;
  shouldBlockNewTraffic: boolean;
  lifecycleStatus: BandwidthLifecycleStatus;
  policyAction: BandwidthPolicyAction;
  lastSampledAt: string | null;
  restrictionEnforced: boolean;
}

export type RefreshUsageArgs = {
  appId: string;
  appName: string;
  userId: string;
  size?: string | null;
};
