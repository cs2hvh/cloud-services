/**
 * Kubernetes Service Helpers
 */

import { EncryptedData, Encryption } from "@/config/functions";

/**
 * Get DigitalOcean API headers
 */
export function getDigitalOceanHeaders(): Record<string, string> {
  return {
    "Content-Type": "application/json",
    Authorization: `${process.env.DIGITAL_OCEAN_TOKEN}`,
  };
}

/**
 * Redact sensitive cluster information
 */
export function redactClusterSecrets(
  cluster: Record<string, unknown>
): Record<string, unknown> {
  const redacted = { ...cluster };
  
  // Redact kubeconfig
  if (redacted.kubeconfig && typeof redacted.kubeconfig === "string") {
    delete redacted.kubeconfig;
  }

  // Redact VM password
  delete redacted.vm_password;
  delete redacted.password;

  return redacted;
}

/**
 * Serialize a cluster for v1 API responses.
 * - Strips secrets (vm_password, password, kubeconfig)
 * - Strips internal fields (owner_id, row-level id)
 * - Uses cluster_id as the canonical `id` for /kubernetes/{id} routes
 */
export function serializeClusterForV1(
  cluster: Record<string, unknown>
): Record<string, unknown> {
  const redacted = redactClusterSecrets(cluster);

  // Use cluster_id as the API-facing id (matches /kubernetes/{id} route param)
  if (redacted.cluster_id) {
    redacted.id = redacted.cluster_id;
    delete redacted.cluster_id;
  }

  // Strip internal fields
  delete redacted.owner_id;

  return redacted;
}

/**
 * Parse axios error to readable message
 */
export function parseAxiosError(error: unknown): string {
  if (error && typeof error === "object" && "response" in error) {
    const axiosError = error as {
      response?: { data?: { message?: string }; status?: number };
      message?: string;
    };
    const message = axiosError.response?.data?.message || axiosError.message;
    return `API error: ${message}`;
  }
  return error instanceof Error ? error.message : String(error);
}

/**
 * Decrypt kubeconfig if needed
 */
export function decryptKubeconfig(encrypted: EncryptedData | null): string | null {
  if (!encrypted) return null;
  const encryptionKey = process.env.ENCRYPTION_KEY!;
  return Encryption.decrypt(encrypted, encryptionKey);
}
