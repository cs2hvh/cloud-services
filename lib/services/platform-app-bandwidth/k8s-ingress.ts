import { NetworkingV1Api } from "@kubernetes/client-node";
import kubeConfig from "@/lib/kubernetes";
import {
  APP_NAMESPACE,
  K8S_FIELD_MANAGER,
  BANDWIDTH_RESTRICTION_SNIPPET,
  RESTRICTION_END_MARKER,
  RESTRICTION_ANNOTATION_KEY,
  RESTRICTION_SENTINEL,
  RESTRICTION_PATCH_PATH,
} from "./constants";
import type { BandwidthLifecycleStatus } from "./types";

type JsonPatchOperation = {
  op: "add" | "replace" | "remove";
  path: string;
  value?: string;
};

// ── K8s error helpers ─────────────────────────────────────────────────────────

export function k8sErrorMessage(error: unknown): string {
  if (!error || typeof error !== "object") return String(error);
  const e = error as Record<string, unknown>;
  // @kubernetes/client-node v1.x attaches the parsed error body to .body
  if (e.body && typeof e.body === "object") {
    const body = e.body as Record<string, unknown>;
    if (body.message) return String(body.message);
    if (body.reason) return String(body.reason);
  }
  if (e.message) return String(e.message);
  return JSON.stringify(error);
}

export function k8sErrorCode(error: unknown): number | null {
  if (!error || typeof error !== "object") return null;
  const e = error as Record<string, unknown>;
  // v1.x uses .code, NOT .response.statusCode
  if (typeof e.code === "number") return e.code;
  if (e.body && typeof e.body === "object") {
    const b = e.body as Record<string, unknown>;
    if (typeof b.code === "number") return b.code;
  }
  return null;
}

// ── Ingress read helper ───────────────────────────────────────────────────────

async function readIngress(networking: NetworkingV1Api, ingressName: string) {
  return networking.readNamespacedIngress({
    name: ingressName,
    namespace: APP_NAMESPACE,
  }) as unknown as Record<string, unknown>;
}

async function patchIngress(
  networking: NetworkingV1Api,
  ingressName: string,
  body: JsonPatchOperation[]
): Promise<void> {
  await networking.patchNamespacedIngress({
    name: ingressName,
    namespace: APP_NAMESPACE,
    body,
    fieldManager: K8S_FIELD_MANAGER,
    // @ts-expect-error - headers option is valid but not in type definition
    headers: { "Content-Type": "application/json-patch+json" },
  });
}

function getIngressAnnotations(ingress: Record<string, unknown>): Record<string, string> {
  const metadata = ingress.metadata as Record<string, unknown> | undefined;
  return (metadata?.annotations as Record<string, string>) ?? {};
}

function withRestrictionSnippet(currentSnippet: string): string {
  if (!currentSnippet.trim()) return BANDWIDTH_RESTRICTION_SNIPPET;
  return `${currentSnippet.trimEnd()}\n\n${BANDWIDTH_RESTRICTION_SNIPPET}`;
}

function withoutRestrictionSnippet(currentSnippet: string): string {
  const start = currentSnippet.indexOf(RESTRICTION_SENTINEL);
  if (start === -1) return currentSnippet;

  const end = currentSnippet.indexOf(RESTRICTION_END_MARKER, start);
  if (end === -1) return currentSnippet;

  return [
    currentSnippet.slice(0, start).trimEnd(),
    currentSnippet.slice(end + RESTRICTION_END_MARKER.length).trimStart(),
  ]
    .filter(Boolean)
    .join("\n\n");
}

// ── Restriction enforcement ───────────────────────────────────────────────────

/**
 * Add the bandwidth quota exceeded annotation to the app's NGINX Ingress.
 *
 * Idempotent: reads the current annotation first and skips the PATCH if the
 * sentinel string is already present, so it's safe to call on every sync cycle.
 */
export async function applyBandwidthRestriction(
  appName: string
): Promise<{ applied: boolean; error?: string }> {
  const networking = kubeConfig.makeApiClient(NetworkingV1Api);
  const ingressName = `${appName}-ingress`;

  let existing: Record<string, unknown>;
  try {
    existing = await readIngress(networking, ingressName);
  } catch (err) {
    if (k8sErrorCode(err) === 404) {
      console.warn(`[k8s-ingress] Ingress ${ingressName} not found — cannot apply restriction`);
      return { applied: false, error: "ingress_not_found" };
    }
    throw err;
  }

  const annotations = getIngressAnnotations(existing);
  const currentSnippet = annotations[RESTRICTION_ANNOTATION_KEY] ?? "";

  if (currentSnippet.includes(RESTRICTION_SENTINEL)) {
    return { applied: true }; // already restricted
  }

  const patch: JsonPatchOperation[] = [
    {
      op: currentSnippet ? "replace" : "add",
      path: RESTRICTION_PATCH_PATH,
      value: withRestrictionSnippet(currentSnippet),
    },
  ];

  try {
    await patchIngress(networking, ingressName, patch);
    console.log(`[k8s-ingress] Restriction applied to ${ingressName}`);
    return { applied: true };
  } catch (error) {
    const msg = k8sErrorMessage(error);
    console.error(`[k8s-ingress] Failed to apply restriction for ${appName}:`, msg);
    return { applied: false, error: msg };
  }
}

/**
 * Remove the bandwidth quota annotation from the app's NGINX Ingress.
 *
 * Only removes the annotation when it contains the sentinel string, so this
 * never touches an unrelated server-snippet written by an operator.
 */
export async function removeBandwidthRestriction(
  appName: string
): Promise<{ removed: boolean; error?: string }> {
  const networking = kubeConfig.makeApiClient(NetworkingV1Api);
  const ingressName = `${appName}-ingress`;

  let existing: Record<string, unknown>;
  try {
    existing = await readIngress(networking, ingressName);
  } catch (err) {
    if (k8sErrorCode(err) === 404) {
      return { removed: false, error: "ingress_not_found" };
    }
    throw err;
  }

  const annotations = getIngressAnnotations(existing);
  const currentSnippet = annotations[RESTRICTION_ANNOTATION_KEY] ?? "";

  if (!currentSnippet.includes(RESTRICTION_SENTINEL)) {
    return { removed: true }; // nothing to remove
  }

  const remainingSnippet = withoutRestrictionSnippet(currentSnippet);
  const patch: JsonPatchOperation[] = remainingSnippet
    ? [{ op: "replace", path: RESTRICTION_PATCH_PATH, value: remainingSnippet }]
    : [{ op: "remove", path: RESTRICTION_PATCH_PATH }];

  try {
    await patchIngress(networking, ingressName, patch);
    console.log(`[k8s-ingress] Restriction removed from ${ingressName}`);
    return { removed: true };
  } catch (error) {
    const msg = k8sErrorMessage(error);
    console.error(`[k8s-ingress] Failed to remove restriction for ${appName}:`, msg);
    return { removed: false, error: msg };
  }
}

/**
 * Sync the K8s Ingress restriction state to match the current lifecycle status.
 * Called after every bandwidth sync so cluster state stays consistent with billing state.
 */
export async function syncRestrictionState(
  appName: string,
  lifecycleStatus: BandwidthLifecycleStatus
): Promise<void> {
  if (lifecycleStatus === "restricted") {
    await applyBandwidthRestriction(appName);
  } else {
    await removeBandwidthRestriction(appName);
  }
}

// ── Max request body enforcement ──────────────────────────────────────────────

const MAX_BODY_ANNOTATION_KEY = "nginx.ingress.kubernetes.io/proxy-body-size";
const MAX_BODY_PATCH_PATH =
  `/metadata/annotations/${MAX_BODY_ANNOTATION_KEY.replace(/~/g, "~0").replace(/\//g, "~1")}`;

/**
 * Apply the NGINX proxy-body-size annotation to the app's Ingress.
 *
 * Called when an app is deployed or resized so the request body limit is always
 * in sync with the plan quota. Pass `null` to remove the annotation (unlimited).
 */
export async function syncMaxRequestBodySize(
  appName: string,
  maxBytes: number | null
): Promise<{ synced: boolean; error?: string }> {
  const networking = kubeConfig.makeApiClient(NetworkingV1Api);
  const ingressName = `${appName}-ingress`;

  let existing: Record<string, unknown>;
  try {
    existing = await readIngress(networking, ingressName);
  } catch (err) {
    if (k8sErrorCode(err) === 404) {
      return { synced: false, error: "ingress_not_found" };
    }
    throw err;
  }

  const annotations = getIngressAnnotations(existing);
  const currentValue = annotations[MAX_BODY_ANNOTATION_KEY];

  if (maxBytes === null) {
    if (!currentValue) return { synced: true };
    const patch: JsonPatchOperation[] = [{ op: "remove", path: MAX_BODY_PATCH_PATH }];
    try {
      await patchIngress(networking, ingressName, patch);
    } catch (error) {
      return { synced: false, error: k8sErrorMessage(error) };
    }
    return { synced: true };
  }

  // NGINX uses "Xm" notation (megabytes). Minimum 1m.
  const mb = Math.max(1, Math.ceil(maxBytes / (1024 * 1024)));
  const value = `${mb}m`;

  if (currentValue === value) return { synced: true }; // already set correctly

  const patch: JsonPatchOperation[] = [
    { op: currentValue ? "replace" : "add", path: MAX_BODY_PATCH_PATH, value },
  ];
  try {
    await patchIngress(networking, ingressName, patch);
    console.log(`[k8s-ingress] Set proxy-body-size=${value} on ${ingressName}`);
    return { synced: true };
  } catch (error) {
    const msg = k8sErrorMessage(error);
    console.error(`[k8s-ingress] Failed to set proxy-body-size for ${appName}:`, msg);
    return { synced: false, error: msg };
  }
}
