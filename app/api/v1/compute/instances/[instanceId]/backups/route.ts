// GET  /api/v1/compute/instances/{instanceId}/backups — backup state + list
// POST /api/v1/compute/instances/{instanceId}/backups — { action, ... }
//   action: "enable" | "cancel" | "snapshot" | "restore"
//   snapshot: { label? }   restore: { backup_id }
//
// Enable/cancel re-freeze the billing meter (plan rate ± backups add-on) via
// the shared flow — identical semantics to the dashboard backups route.
import { withV1Auth, v1Error, v1Ok } from "@/lib/api/v1-middleware";
import { v1TransformValidationError } from "@/lib/api/v1-helpers";
import {
  v1ComputeFlowError,
  v1ExtractInstanceId,
  v1LoadOwnedInstance,
} from "@/lib/api/v1-compute-helpers";
import { resolveAuthEmail } from "@/lib/api-auth";
import { createWorkerClient } from "@/lib/supabase/server";
import {
  getLinodeBackupsOverview,
  mapLinodeFlowError,
  runLinodeBackupsAction,
  type LinodeBackupsFlowServer,
} from "@/lib/services/compute/providers/linode/flows";
import { computeBackupsActionSchema } from "@/lib/validation/compute";

function toFlowServer(instanceId: number, server: Record<string, unknown>): LinodeBackupsFlowServer {
  return {
    id: instanceId,
    name: (server.name as string | null) ?? null,
    linode_id: (server.linode_id as number | null) ?? null,
    location: (server.location as string | null) ?? null,
    plan_slug: (server.plan_slug as string | null) ?? null,
    details: (server.details as Record<string, unknown> | null) ?? null,
    billing_service_id: (server.billing_service_id as string | null) ?? null,
  };
}

function requireLinodeBackups(server: Record<string, unknown>) {
  if (server.provider !== "linode") {
    return v1Error("NOT_SUPPORTED", 400, "Backups are not supported for this server");
  }
  if (!server.linode_id) {
    return v1Error("INVALID_STATE", 422, "Instance is still provisioning");
  }
  return null;
}

export const GET = withV1Auth("compute:backups:list", async (_req, auth, context) => {
  const { id: instanceId, error: idError } = await v1ExtractInstanceId(context);
  if (idError) return idError;

  const supabase = await createWorkerClient();
  const { server, error } = await v1LoadOwnedInstance(supabase, instanceId!, auth.userId, "access");
  if (error) return error;

  const unsupported = requireLinodeBackups(server!);
  if (unsupported) return unsupported;

  try {
    const overview = await getLinodeBackupsOverview(supabase, toFlowServer(instanceId!, server!));
    return v1Ok({
      data: {
        enabled: overview.enabled,
        backups: overview.backups,
        pricing: {
          hourly: overview.pricing.hourlyUSD,
          monthly: overview.pricing.monthlyUSD,
        },
      },
    });
  } catch (e) {
    return v1ComputeFlowError(mapLinodeFlowError(e, "Failed to load backups"));
  }
});

export const POST = withV1Auth("compute:backups", async (req, auth, context) => {
  const { id: instanceId, error: idError } = await v1ExtractInstanceId(context);
  if (idError) return idError;

  let parsedBody: unknown;
  try {
    parsedBody = await req.json();
  } catch {
    return v1Error("VALIDATION_ERROR", 400, "Invalid request body");
  }
  const body = parsedBody && typeof parsedBody === "object" ? parsedBody : {};

  const validation = computeBackupsActionSchema.safeParse(body);
  if (!validation.success) {
    return v1TransformValidationError(validation.error);
  }

  const supabase = await createWorkerClient();
  const { server, error } = await v1LoadOwnedInstance(supabase, instanceId!, auth.userId, "modify");
  if (error) return error;

  const unsupported = requireLinodeBackups(server!);
  if (unsupported) return unsupported;

  const email = await resolveAuthEmail(auth);
  const result = await runLinodeBackupsAction({
    supabase,
    server: toFlowServer(instanceId!, server!),
    user: { id: auth.userId, email: email ?? null },
    action: validation.data.action,
    label: validation.data.label,
    backupId: validation.data.backup_id,
    userAgent: req.headers.get("user-agent"),
  });

  if (!result.ok) return v1ComputeFlowError(result);

  return v1Ok(
    {
      data: {
        id: instanceId,
        action: validation.data.action,
        ...result.data,
      },
    },
    result.status
  );
});
