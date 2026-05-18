import { withV1Auth, v1Error } from "@/lib/api/v1-middleware";
import { v1ExtractId } from "@/lib/api/v1-helpers";
import { v1Forbidden, v1NotFound } from "@/lib/api/v1-errors";
import { Clusters } from "@/lib/supabase/queries/clusters";
import { decryptKubeconfig } from "@/lib/services/kubernetes/helpers";
import type { EncryptedData } from "@/config/functions";
import { NextResponse } from "next/server";

function normalizeKubeconfig(raw: unknown): string | null {
  if (!raw) return null;

  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw) as unknown;
      return normalizeKubeconfig(parsed);
    } catch {
      return raw;
    }
  }

  if (typeof raw === "object") {
    const record = raw as Record<string, unknown>;

    if (
      typeof record.iv === "string" &&
      typeof record.content === "string"
    ) {
      try {
        return decryptKubeconfig(record as unknown as EncryptedData);
      } catch {
        return null;
      }
    }

    if (Array.isArray(record.data)) {
      const bytes = record.data.filter((x): x is number => typeof x === "number");
      return String.fromCharCode(...bytes);
    }
  }

  return String(raw);
}

export const GET = withV1Auth("kubernetes:kubeconfig:read", async (_req, auth, context) => {
  const { id: clusterId, error: idError } = await v1ExtractId(context);
  if (idError) return idError;

  const cluster = await Clusters.get_by_id(clusterId);
  if (!cluster || cluster.status === "deleted") {
    return v1NotFound("cluster");
  }

  if (cluster.owner_id !== auth.userId) {
    return v1Forbidden("cluster", "access");
  }

  const kubeconfig = normalizeKubeconfig((cluster as Record<string, unknown>).kubeconfig);
  if (!kubeconfig) {
    return v1Error("NOT_FOUND", 404, "Kubeconfig not found");
  }

  return new NextResponse(kubeconfig, {
    status: 200,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Content-Disposition": `inline; filename=\"${clusterId}-kubeconfig.yaml\"`,
    },
  });
});
