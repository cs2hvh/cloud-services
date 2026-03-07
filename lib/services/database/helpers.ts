import { Encryption } from "@/config/functions";
import type { DatabaseUser, EncryptedData } from "@/lib/supabase/types";

export type AxiosErrorLike = {
  response?: {
    data?: { message?: string };
    status?: number;
  };
  message?: string;
};

export function getDigitalOceanHeaders(): Record<string, string | undefined> {
  return {
    Authorization: process.env.DIGITAL_OCEAN_TOKEN,
    "Content-Type": "application/json",
  };
}

export function isEncrypted(value: unknown): value is EncryptedData {
  if (!value || typeof value !== "object") {
    return false;
  }
  return "encrypted" in value && "iv" in value && "tag" in value && "salt" in value;
}

export function extractPasswordFromUri(uri: string): string | null {
  if (!uri) {
    return null;
  }
  const uriMatch = uri.match(/:\/\/[^:]+:([^@]+)@/);
  if (uriMatch) {
    return decodeURIComponent(uriMatch[1]);
  }
  return null;
}

export function decryptClusterData(
  cluster: Record<string, unknown>,
  encryptionKey: string
): Record<string, unknown> {
  const publicConnection = (cluster.public_connection || undefined) as
    | Record<string, unknown>
    | undefined;
  const privateConnection = (cluster.private_connection || undefined) as
    | Record<string, unknown>
    | undefined;
  const users = Array.isArray(cluster.users) ? (cluster.users as DatabaseUser[]) : [];

  return {
    ...cluster,
    password: isEncrypted(cluster.password)
      ? Encryption.decrypt(cluster.password, encryptionKey)
      : cluster.password,
    ca_certificate:
      cluster.ca_certificate && isEncrypted(cluster.ca_certificate)
        ? Encryption.decrypt(cluster.ca_certificate, encryptionKey)
        : cluster.ca_certificate,
    public_connection: publicConnection
      ? {
          ...publicConnection,
          host: isEncrypted(publicConnection.host)
            ? Encryption.decrypt(publicConnection.host, encryptionKey)
            : publicConnection.host,
          password: isEncrypted(publicConnection.password)
            ? Encryption.decrypt(publicConnection.password, encryptionKey)
            : publicConnection.password,
          uri: isEncrypted(publicConnection.uri)
            ? Encryption.decrypt(publicConnection.uri, encryptionKey)
            : publicConnection.uri,
        }
      : undefined,
    private_connection: privateConnection
      ? {
          ...privateConnection,
          host: isEncrypted(privateConnection.host)
            ? Encryption.decrypt(privateConnection.host, encryptionKey)
            : privateConnection.host,
          password: isEncrypted(privateConnection.password)
            ? Encryption.decrypt(privateConnection.password, encryptionKey)
            : privateConnection.password,
        }
      : undefined,
    users: users.map((user: DatabaseUser) => ({
      ...user,
      password:
        user.password && isEncrypted(user.password)
          ? Encryption.decrypt(user.password, encryptionKey)
          : user.password,
    })),
  };
}

export function decryptClusterDataWithoutUri(
  cluster: Record<string, unknown>,
  encryptionKey: string
): Record<string, unknown> {
  const decrypted = decryptClusterData(cluster, encryptionKey);
  const publicConnection = (decrypted.public_connection || undefined) as
    | Record<string, unknown>
    | undefined;

  return {
    ...decrypted,
    public_connection: publicConnection
      ? {
          ...publicConnection,
          uri: cluster.public_connection
            ? (cluster.public_connection as Record<string, unknown>).uri
            : publicConnection.uri,
        }
      : undefined,
  };
}

export async function resolveAuditUserRole(): Promise<"admin" | "user"> {
  try {
    const { requireAdmin } = await import("@/lib/supabase/auth");
    const adminCheck = await requireAdmin();
    return adminCheck.ok ? "admin" : "user";
  } catch {
    return "user";
  }
}

export function parseAxiosError(err: unknown): AxiosErrorLike | null {
  if (typeof err === "object" && err !== null && "response" in err) {
    return err as AxiosErrorLike;
  }
  return null;
}
