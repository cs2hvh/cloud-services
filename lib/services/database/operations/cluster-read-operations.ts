import axios from "axios";
import { GENERIC_SERVICE_ERROR } from "@/lib/api/error-sanitizer";

import { Encryption } from "@/config/functions";
import { resolveCached } from "@/lib/cache/cached-dns-resolver";
import { resolveHost } from "@/config/hosttoip";
import { NotificationService, createServiceNotification } from "@/lib/notifications";
import { Database_Clusters } from "@/lib/supabase/queries/database_clusters";
import { Projects } from "@/lib/supabase/queries/projects";
import type { Database_Connection, EncryptedData } from "@/lib/supabase/types";

import {
  decryptClusterData,
  decryptClusterDataWithoutUri,
  extractPasswordFromUri,
  getDigitalOceanHeaders,
  parseAxiosError,
  redactClusterSecrets,
} from "../helpers";
import type {
  GetDatabaseClusterRequest,
  GetDatabaseClusterResult,
  UpdateDatabaseStatusRequest,
} from "../types";
import { resolveOwnedCluster } from "./cluster-access";
import { applyPgvectorIfPending } from "./pgvector";

async function getClusterInternalImpl(
  request: GetDatabaseClusterRequest
): Promise<GetDatabaseClusterResult> {
  try {
    const access = await resolveOwnedCluster(request.clusterId, request.userId, "access");
    if (!access.success) {
      return {
        success: false,
        error: access.error,
        errorCode: access.errorCode,
      };
    }

    let status = false;
    let doStatus: string | null = null;

    if (request.checkStatus) {
      const database = await axios.get(
        `https://api.digitalocean.com/v2/databases/${request.clusterId}`,
        { headers: getDigitalOceanHeaders() }
      );

      if (database.status === 200) {
        doStatus = database.data.database.status;
        status = doStatus === "online";
      }
    }

    const supabaseRead = await Database_Clusters.read(request.clusterId);

    if (status && supabaseRead.success && supabaseRead.data.status !== doStatus) {
      if (doStatus === "online") {
        const fullClusterData = await axios.get(
          `https://api.digitalocean.com/v2/databases/${request.clusterId}`,
          { headers: getDigitalOceanHeaders() }
        );

        if (fullClusterData.status === 200) {
          const dbData = fullClusterData.data.database;
          const shouldResolveIP = dbData.engine === "mysql" || dbData.engine === "pg";
          const encryptionKey = process.env.ENCRYPTION_KEY!;

          let encryptedPublicPassword: string | EncryptedData | undefined = undefined;
          let encryptedPrivatePassword: string | EncryptedData | undefined = undefined;

          if (shouldResolveIP) {
            encryptedPublicPassword = Encryption.encrypt(dbData.connection.password, encryptionKey);
            encryptedPrivatePassword = Encryption.encrypt(
              dbData.private_connection.password,
              encryptionKey
            );
          }

          let publicHostIP = dbData.connection.host;
          let privateHostIP = dbData.private_connection.host;
          let encryptedPublicURI = dbData.connection.uri;

          if (shouldResolveIP) {
            try {
              const publicHostResult = await resolveHost(dbData.connection.host);
              if (!publicHostResult.error && publicHostResult.records.length > 0) {
                const aRecord = publicHostResult.records.find((r) => r.type === "A");
                if (aRecord && aRecord.records.length > 0) {
                  publicHostIP = aRecord.records[0] as string;
                  const uriMatch = dbData.connection.uri.match(/^(.+@)([^:\/]+)(.+)$/);
                  if (uriMatch) {
                    encryptedPublicURI = `${uriMatch[1]}${publicHostIP}${uriMatch[3]}`;
                  }
                }
              }

              const privateHostResult = await resolveHost(dbData.private_connection.host);
              if (!privateHostResult.error && privateHostResult.records.length > 0) {
                const aRecord = privateHostResult.records.find((r) => r.type === "A");
                if (aRecord && aRecord.records.length > 0) {
                  privateHostIP = aRecord.records[0] as string;
                }
              }
            } catch (error) {
              console.error("[getCluster] Failed to resolve host to IP:", error);
            }
          }

          const encryptedPublicHost = Encryption.encrypt(publicHostIP, encryptionKey);
          const encryptedPrivateHost = Encryption.encrypt(privateHostIP, encryptionKey);
          const encryptedPublicURIValue = Encryption.encrypt(encryptedPublicURI, encryptionKey);

          let caCertificate = "";
          if (shouldResolveIP) {
            try {
              const caResponse = await axios.get(
                `https://api.digitalocean.com/v2/databases/${request.clusterId}/ca`,
                { headers: getDigitalOceanHeaders() }
              );
              if (caResponse.status === 200) {
                caCertificate = caResponse.data.ca.certificate;
              }
            } catch (error) {
              console.error("[getCluster] Failed to fetch CA certificate:", error);
            }
          }

          const encryptedCaCert = caCertificate
            ? Encryption.encrypt(caCertificate, encryptionKey)
            : "";

          await Database_Clusters.update_status(
            request.clusterId,
            "online",
            encryptedCaCert,
            {
              ...dbData.connection,
              host: encryptedPublicHost,
              password: encryptedPublicPassword,
              uri: encryptedPublicURIValue,
            },
            {
              ...dbData.private_connection,
              host: encryptedPrivateHost,
              password: encryptedPrivatePassword,
            }
          );

          const updatedRead = await Database_Clusters.read(request.clusterId);
          if (updatedRead.success) {
            if (updatedRead.data.project_id) {
              await Projects.add_log({
                project_id: updatedRead.data.project_id,
                event: "Database",
                text: `Database cluster '${updatedRead.data.name}' is now online`,
              });
            }

            try {
              await NotificationService.create(
                createServiceNotification({
                  userId: updatedRead.data.owner_id,
                  type: "success",
                  action: "deployed",
                  serviceType: "database",
                  serviceName: updatedRead.data.name,
                  serviceId: request.clusterId,
                })
              );
            } catch (notifErr) {
              console.error("[getCluster] Failed to create notification:", notifErr);
            }

            const decryptedOnline = decryptClusterData(updatedRead.data, encryptionKey);
            // Cluster just came online — enable pgvector if the customer opted in.
            const onlineRaw = updatedRead.data as Record<string, unknown>;
            const onlineConn = (decryptedOnline as Record<string, unknown>).public_connection as
              | { uri?: string }
              | undefined;
            await applyPgvectorIfPending({
              clusterId: String(onlineRaw.id ?? request.clusterId),
              engine: onlineRaw.engine as string | null,
              enabled: !!onlineRaw.pgvector_enabled,
              alreadyApplied: !!onlineRaw.pgvector_applied_at,
              uri: onlineConn?.uri ?? null,
              caCertificate: (decryptedOnline as Record<string, unknown>).ca_certificate as
                | string
                | null,
            });
            return { success: true, data: decryptedOnline };
          }
        }
      }
    }

    const supabaseReadLatest = await Database_Clusters.read(request.clusterId);
    if (!supabaseReadLatest.success || !supabaseReadLatest.data) {
      return {
        success: false,
        error: "Database cluster not found",
        errorCode: "NOT_FOUND",
      };
    }

    const encryptionKey = process.env.ENCRYPTION_KEY!;
    const decryptedLatest = decryptClusterData(supabaseReadLatest.data, encryptionKey);
    // Retry pgvector enable on later status checks if a prior attempt failed
    // (no-op once applied, not opted in, or not a PG cluster).
    const latestRaw = supabaseReadLatest.data as Record<string, unknown>;
    const latestConn = (decryptedLatest as Record<string, unknown>).public_connection as
      | { uri?: string }
      | undefined;
    await applyPgvectorIfPending({
      clusterId: String(latestRaw.id ?? request.clusterId),
      engine: latestRaw.engine as string | null,
      enabled: !!latestRaw.pgvector_enabled,
      alreadyApplied: !!latestRaw.pgvector_applied_at,
      uri: latestConn?.uri ?? null,
      caCertificate: (decryptedLatest as Record<string, unknown>).ca_certificate as string | null,
    });
    return {
      success: true,
      data: decryptedLatest,
    };
  } catch (err: unknown) {
    console.error("[DB:clusterRead] failed:", err);
    return {
      success: false,
      error: GENERIC_SERVICE_ERROR,
      errorCode: "UNKNOWN_ERROR",
    };
  }
}

export const clusterReadOperations = {
  async getCluster(request: GetDatabaseClusterRequest): Promise<GetDatabaseClusterResult> {
    const result = await getClusterInternalImpl(request);
    if (!result.success || !result.data) {
      return result;
    }

    return {
      ...result,
      data: redactClusterSecrets(result.data as Record<string, unknown>),
    };
  },

  async getClusterInternal(request: GetDatabaseClusterRequest): Promise<GetDatabaseClusterResult> {
    return getClusterInternalImpl(request);
  },

  async readAllOwner(
    ownerId: string
  ): Promise<{ success: boolean; data?: Record<string, unknown>[]; error?: string }> {
    try {
      const result = await Database_Clusters.read_all_owner(ownerId);
      if (!result.success) {
        return { success: false, error: result.error || "Failed to fetch database clusters" };
      }

      const encryptionKey = process.env.ENCRYPTION_KEY!;
      const rows = Array.isArray(result.data) ? result.data : [];
      return {
        success: true,
        data: rows.map((cluster) =>
          redactClusterSecrets(
            decryptClusterDataWithoutUri(cluster as Record<string, unknown>, encryptionKey)
          )
        ),
      };
    } catch (err: unknown) {
      console.error("[DB:clusterRead] failed:", err);
      return {
        success: false,
        error: GENERIC_SERVICE_ERROR,
      };
    }
  },

  async readAllOwnerInternal(
    ownerId: string
  ): Promise<{ success: boolean; data?: Record<string, unknown>[]; error?: string }> {
    try {
      const result = await Database_Clusters.read_all_owner(ownerId);
      if (!result.success) {
        return { success: false, error: result.error || "Failed to fetch database clusters" };
      }

      const encryptionKey = process.env.ENCRYPTION_KEY!;
      const rows = Array.isArray(result.data) ? result.data : [];
      return {
        success: true,
        data: rows.map((cluster) =>
          decryptClusterDataWithoutUri(cluster as Record<string, unknown>, encryptionKey)
        ),
      };
    } catch (err: unknown) {
      console.error("[DB:clusterRead] failed:", err);
      return {
        success: false,
        error: GENERIC_SERVICE_ERROR,
      };
    }
  },

  async updateStatus(
    request: UpdateDatabaseStatusRequest
  ): Promise<{ success: boolean; data?: unknown; error?: string }> {
    try {
      const [resolvedPublic, resolvedPrivate] = await Promise.all([
        resolveCached(request.publicConnection.host as string),
        resolveCached(request.privateConnection.host as string),
      ]);
      const finalPublicHost = resolvedPublic || (request.publicConnection.host as string);
      const finalPrivateHost = resolvedPrivate || (request.privateConnection.host as string);

      const publicMatch = request.publicConnection.uri.match(/@([^:\/]+)/);
      const privateMatch = request.privateConnection.uri.match(/@([^:\/]+)/);

      const publicUriWithIp = publicMatch
        ? request.publicConnection.uri.replace(publicMatch[1], finalPublicHost)
        : request.publicConnection.uri;
      const privateUriWithIp = privateMatch
        ? request.privateConnection.uri.replace(privateMatch[1], finalPrivateHost)
        : request.privateConnection.uri;

      const encryptionKey = process.env.ENCRYPTION_KEY!;
      let publicPassword = request.publicConnection.password as string | undefined;
      let privatePassword = request.privateConnection.password as string | undefined;

      if (!publicPassword) {
        publicPassword = extractPasswordFromUri(request.publicConnection.uri) || undefined;
      }
      if (!privatePassword) {
        privatePassword = extractPasswordFromUri(request.privateConnection.uri) || undefined;
      }

      const encryptedPublicPassword = publicPassword
        ? Encryption.encrypt(publicPassword, encryptionKey)
        : null;
      const encryptedPrivatePassword = privatePassword
        ? Encryption.encrypt(privatePassword, encryptionKey)
        : null;

      const ca = await axios.get(
        `https://api.digitalocean.com/v2/databases/${request.clusterId}/ca`,
        { headers: getDigitalOceanHeaders() }
      );

      const caCertificate = ca.status === 200 && ca.data?.ca?.certificate ? ca.data.ca.certificate : "";
      const encryptedCaCert = caCertificate ? Encryption.encrypt(caCertificate, encryptionKey) : "";

      const publicConnectionPayload = {
        ...request.publicConnection,
        uri: Encryption.encrypt(publicUriWithIp, encryptionKey),
        host: Encryption.encrypt(finalPublicHost, encryptionKey),
        password: encryptedPublicPassword,
      } as unknown as Database_Connection;

      const privateConnectionPayload = {
        ...request.privateConnection,
        uri: Encryption.encrypt(privateUriWithIp, encryptionKey),
        host: Encryption.encrypt(finalPrivateHost, encryptionKey),
        password: encryptedPrivatePassword,
      } as unknown as Database_Connection;

      const update = await Database_Clusters.update_status(
        request.clusterId,
        "online",
        encryptedCaCert,
        publicConnectionPayload,
        privateConnectionPayload
      );

      if (!update.success) {
        return { success: false, error: update.error || "Failed to update database status" };
      }

      return { success: true, data: update.data };
    } catch (err: unknown) {
      const axiosError = parseAxiosError(err);
      return {
        success: false,
        error:
          axiosError?.response?.data?.message ||
          (err instanceof Error ? err.message : "Failed to update database status"),
      };
    }
  },
};
