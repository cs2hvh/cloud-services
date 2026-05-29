import type { PlatformAppSize } from "./types";

// ── Kubernetes ────────────────────────────────────────────────────────────────

export const APP_NAMESPACE = "default";
export const K8S_FIELD_MANAGER = "platform-app-controller";

// NGINX server-snippet inserted into the app's Ingress when bandwidth is exceeded.
// The markers let us append our block next to any operator-managed snippet and
// later remove only the platform-owned block.
export const RESTRICTION_BEGIN_MARKER = "# platform-app-bandwidth:begin";
export const RESTRICTION_END_MARKER = "# platform-app-bandwidth:end";

export const BANDWIDTH_RESTRICTION_SNIPPET = [
  RESTRICTION_BEGIN_MARKER,
  "default_type application/json;",
  'return 429 \'{"error":"bandwidth_quota_exceeded","message":"Monthly bandwidth limit reached. Upgrade your plan to restore access."}\';',
  RESTRICTION_END_MARKER,
].join("\n");

// Annotation written to / removed from the Ingress resource.
export const RESTRICTION_ANNOTATION_KEY = "nginx.ingress.kubernetes.io/server-snippet";

// Sentinel string embedded in the snippet. Used to detect our own annotation so
// we never remove an unrelated server-snippet written by an operator.
export const RESTRICTION_SENTINEL = RESTRICTION_BEGIN_MARKER;

// JSON Pointer path for the annotation (RFC 6902 — '/' in key escaped as '~1').
export const RESTRICTION_PATCH_PATH =
  `/metadata/annotations/${RESTRICTION_ANNOTATION_KEY.replace(/~/g, "~0").replace(/\//g, "~1")}`;

// ── Quota defaults (when no product config is found) ─────────────────────────

export const GB = 1024 ** 3;

export const DEFAULT_BANDWIDTH_GB: Record<PlatformAppSize, number> = {
  small: 100,
  medium: 250,
  large: 1_000,
  xlarge: 2_000,
  xxlarge: 5_000,
};

export const DEFAULT_MAX_REQUEST_BODY_MB: Record<PlatformAppSize, number> = {
  small: 25,
  medium: 50,
  large: 100,
  xlarge: 250,
  xxlarge: 500,
};

// After crossing 100%, allow this many extra percent before hard-restricting traffic.
// Prevents instant block on the first sync that tips over quota (e.g. 100.1%).
export const RESTRICTION_GRACE_PERCENT = 105;

// Default overage caps (applies only when overagePerGb is set on the plan).
// Prevents a single abusive app from running up an unbounded bill.
export const DEFAULT_OVERAGE_LIMIT_GB: Record<PlatformAppSize, number> = {
  small: 50,
  medium: 100,
  large: 500,
  xlarge: 1_000,
  xxlarge: 2_000,
};
