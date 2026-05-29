import { Products } from "@/lib/supabase/queries/products";
import { DEFAULT_BANDWIDTH_GB, DEFAULT_MAX_REQUEST_BODY_MB, DEFAULT_OVERAGE_LIMIT_GB, GB } from "./constants";
import { gbToBytes, mbToBytes, getResourceValue, normalizeSize, toFiniteNumber } from "./utils";
import type { BandwidthQuota } from "./types";

/**
 * Resolve the bandwidth quota for an app.
 *
 * Priority: product resource config → size-based defaults.
 * Product config keys (all optional, any combination valid):
 *   bandwidth_gb, ingress_gb, egress_gb, max_request_body_mb, overage_per_gb
 */
export async function resolveQuota(size?: string | null): Promise<BandwidthQuota> {
  const normalizedSize = normalizeSize(size);
  const product = await Products.get_by_type_and_subtype("platform-apps", normalizedSize);
  const resources = product[0]?.resources;

  const configuredTotal = gbToBytes(
    getResourceValue(resources, ["bandwidth_gb", "bandwidthGB", "bandwidth"])
  );
  const configuredIngress = gbToBytes(
    getResourceValue(resources, ["ingress_gb", "ingressGB", "upload_gb", "uploadGB"])
  );
  const configuredEgress = gbToBytes(
    getResourceValue(resources, ["egress_gb", "egressGB", "download_gb", "downloadGB"])
  );
  const configuredMaxBody = mbToBytes(
    getResourceValue(resources, ["max_request_body_mb", "maxRequestBodyMb", "max_upload_mb"])
  );
  const overagePerGb = toFiniteNumber(
    getResourceValue(resources, ["overage_per_gb", "overagePerGb"])
  );
  const configuredOverageLimit = gbToBytes(
    getResourceValue(resources, ["overage_limit_gb", "overageLimitGb"])
  );

  const hasProductConfig =
    configuredTotal !== null ||
    configuredIngress !== null ||
    configuredEgress !== null ||
    configuredMaxBody !== null;

  return {
    ingressBytes: configuredIngress,
    egressBytes: configuredEgress,
    totalBytes: configuredTotal ?? DEFAULT_BANDWIDTH_GB[normalizedSize] * GB,
    maxRequestBodyBytes:
      configuredMaxBody ?? DEFAULT_MAX_REQUEST_BODY_MB[normalizedSize] * 1024 * 1024,
    overagePerGb,
    // Overage cap only applies when overage billing is enabled.
    overageLimitBytes:
      overagePerGb !== null
        ? (configuredOverageLimit ?? DEFAULT_OVERAGE_LIMIT_GB[normalizedSize] * GB)
        : null,
    source: hasProductConfig ? "product" : "default",
  };
}
