// GET  /api/v1/compute/instances — list all compute instances owned by authenticated user
// POST /api/v1/compute/instances — create a new compute instance (Linode-backed)
import { NextResponse } from "next/server";

import { withV1Auth, v1Error, v1Ok } from "@/lib/api/v1-middleware";
import { v1TransformValidationError } from "@/lib/api/v1-helpers";
import {
  COMPUTE_INSTANCE_COLUMNS,
  serializeComputeInstance,
} from "@/lib/api/v1-compute-helpers";
import { resolveAuthEmail } from "@/lib/api-auth";
import { createWorkerClient } from "@/lib/supabase/server";
import { handleLinodeCreate } from "@/lib/services/compute/providers/linode/create";
import { createComputeInstanceSchema } from "@/lib/validation/compute";

export const GET = withV1Auth("compute:list", async (_req, auth) => {
  const supabase = await createWorkerClient();
  const { data, error } = await supabase
    .from("servers")
    .select(COMPUTE_INSTANCE_COLUMNS)
    .eq("owner_id", auth.userId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[v1/compute:list] query failed:", error.message);
    return v1Error("INTERNAL_ERROR", 500, "Failed to fetch compute instances");
  }

  const instances = (data ?? []).map((row) =>
    serializeComputeInstance(row as Record<string, unknown>)
  );

  return v1Ok({
    data: instances,
    meta: {
      total: instances.length,
    },
  });
});

export const POST = withV1Auth("compute:create", async (req, auth) => {
  let parsedBody: unknown;
  try {
    parsedBody = await req.json();
  } catch {
    return v1Error("VALIDATION_ERROR", 400, "Invalid request body");
  }
  const body = parsedBody && typeof parsedBody === "object" ? parsedBody : {};

  const validation = createComputeInstanceSchema.safeParse(body);
  if (!validation.success) {
    return v1TransformValidationError(validation.error);
  }

  const email = await resolveAuthEmail(auth);
  const supabase = await createWorkerClient();

  // Delegate to the shared Linode create pipeline (billing hold → provider
  // create → servers row → background poll + settle). Its response shape is
  // returned as-is so v1 and dashboard creates behave identically.
  const response = await handleLinodeCreate({
    user: { id: auth.userId, email: email ?? null },
    body: validation.data as Record<string, unknown>,
    supabase,
    idempComplete: null,
  });

  return response as NextResponse;
});
