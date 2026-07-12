// POST /api/v1/compute/instances/{instanceId}/rebuild
//   { image, root_pass, ssh_key_ids? }
//
// Wipes all disks, redeploys the chosen image with a new root password
// (+ optional SSH keys), and boots. Linode-backed instances only.
import { withV1Auth, v1Error, v1Ok } from "@/lib/api/v1-middleware";
import { v1TransformValidationError } from "@/lib/api/v1-helpers";
import {
  v1ComputeFlowError,
  v1ExtractInstanceId,
  v1LoadOwnedInstance,
} from "@/lib/api/v1-compute-helpers";
import { resolveAuthEmail } from "@/lib/api-auth";
import { createWorkerClient } from "@/lib/supabase/server";
import { startLinodeRebuildFlow } from "@/lib/services/compute/providers/linode/flows";
import { rebuildComputeInstanceSchema } from "@/lib/validation/compute";

export const POST = withV1Auth("compute:rebuild", async (req, auth, context) => {
  const { id: instanceId, error: idError } = await v1ExtractInstanceId(context);
  if (idError) return idError;

  let parsedBody: unknown;
  try {
    parsedBody = await req.json();
  } catch {
    return v1Error("VALIDATION_ERROR", 400, "Invalid request body");
  }
  const body = parsedBody && typeof parsedBody === "object" ? parsedBody : {};

  const validation = rebuildComputeInstanceSchema.safeParse(body);
  if (!validation.success) {
    return v1TransformValidationError(validation.error);
  }

  const supabase = await createWorkerClient();
  const { server, error } = await v1LoadOwnedInstance(supabase, instanceId!, auth.userId, "modify");
  if (error) return error;

  const email = await resolveAuthEmail(auth);

  // Shared flow (same as the dashboard): validates provider/state/password,
  // resolves owner-scoped SSH keys, starts the upstream rebuild, and polls to
  // completion in the background with status updates on the row.
  const result = await startLinodeRebuildFlow({
    supabase,
    server: {
      id: instanceId!,
      name: (server!.name as string | null) ?? null,
      status: (server!.status as string | null) ?? null,
      provider: (server!.provider as string | null) ?? null,
      linode_id: (server!.linode_id as number | null) ?? null,
      location: (server!.location as string | null) ?? null,
      details: (server!.details as Record<string, unknown> | null) ?? null,
    },
    user: { id: auth.userId, email: email ?? null },
    imageId: validation.data.image,
    rootPass: validation.data.root_pass,
    sshKeyIds: validation.data.ssh_key_ids ?? [],
    userAgent: req.headers.get("user-agent"),
  });

  if (!result.ok) return v1ComputeFlowError(result);

  return v1Ok(
    {
      data: {
        id: instanceId,
        status: "rebuilding",
      },
    },
    202
  );
});
