/**
 * Per-job lifecycle for deploy actions.
 *
 * Three actions, all enqueued as separate BullMQ jobs:
 *   create  — build the RunPod Serverless endpoint, poll until READY,
 *             register the resulting model in inference.models, flip the
 *             deployments row to status='active'.
 *   scale   — apply the row's autoscale jsonb to the live endpoint.
 *   delete  — terminate the endpoint, set models.is_active=false,
 *             flip the row to status='deleted'.
 *
 * Idempotency: every DB write is gated on the row being in the expected
 * state. A duplicate replay is a no-op.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Job } from "bullmq";
import type { RunnerEnv } from "./env.js";
import type { Logger } from "./logger.js";
import type { RunPod } from "./runpod.js";

export type DeployAction = "create" | "scale" | "delete";

export interface DeployJobPayload {
  deploymentId: string;
  action: DeployAction;
}

interface DeploymentRow {
  id: string;
  org_id: string;
  name: string;
  source: string;
  source_ref: string;
  source_revision: string | null;
  gpu_sku: string;
  autoscale: { min_workers: number; max_workers: number; idle_timeout_s: number };
  status: string;
  runpod_endpoint_id: string | null;
  image_uri: string | null;
  model_id: string | null;
}

export interface LifecycleDeps {
  env: RunnerEnv;
  supabase: SupabaseClient;
  runpod: RunPod;
  logger: Logger;
}

export async function processJob(deps: LifecycleDeps, bullJob: Job<DeployJobPayload>): Promise<void> {
  const { logger } = deps;
  const { deploymentId, action } = bullJob.data;
  const log = logger.child({ deploymentId, action, bullJobId: bullJob.id });
  log.info("processing");

  switch (action) {
    case "create":
      await handleCreate(deps, deploymentId, log);
      return;
    case "scale":
      await handleScale(deps, deploymentId, log);
      return;
    case "delete":
      await handleDelete(deps, deploymentId, log);
      return;
    default:
      log.warn({ unknownAction: action }, "unknown action — dropping");
      return;
  }
}

// ── CREATE ─────────────────────────────────────────────────────────

async function handleCreate(deps: LifecycleDeps, id: string, log: Logger): Promise<void> {
  const { env, supabase, runpod } = deps;

  // 1. Claim — only one runner moves building → deploying
  const { data: claimed, error: claimErr } = await supabase
    .schema("inference")
    .from("deployments")
    .update({ status: "deploying" })
    .eq("id", id)
    .eq("status", "building")
    .select(
      "id, org_id, name, source, source_ref, source_revision, gpu_sku, autoscale, status, runpod_endpoint_id, image_uri, model_id"
    )
    .maybeSingle<DeploymentRow>();

  if (claimErr) {
    log.error({ err: claimErr.message }, "claim failed");
    throw new Error(`Claim failed: ${claimErr.message}`);
  }

  if (!claimed) {
    log.info("deployment not in 'building' state — likely already claimed or deleted");
    return;
  }

  // 2. Resolve image URI per source type
  const imageUri = resolveImageUri(claimed);
  if (!imageUri) {
    await markFailed(
      supabase,
      id,
      `Unsupported source "${claimed.source}" — only Docker images are deployable in v1. ` +
        `HF and Truss sources need a build step (Phase 7).`
    );
    return;
  }

  // 3. Provision RunPod endpoint
  let endpointId: string;
  try {
    const endpoint = await runpod.createEndpoint({
      name: `ahura-byo-${id.slice(0, 8)}`,
      imageUri,
      gpuSku: claimed.gpu_sku,
      autoscale: claimed.autoscale,
      env: {
        DEPLOYMENT_ID: id,
        ORG_ID: claimed.org_id,
      },
    });
    endpointId = endpoint.id;
    log.info({ endpointId, workersMin: endpoint.workersMin, workersMax: endpoint.workersMax }, "endpoint created");
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log.error({ err: msg }, "endpoint create failed");
    await markFailed(supabase, id, `RunPod endpoint create failed: ${msg.slice(0, 400)}`);
    return;
  }

  // Persist endpoint id so a runner restart can pick up from here
  await supabase
    .schema("inference")
    .from("deployments")
    .update({ runpod_endpoint_id: endpointId })
    .eq("id", id);

  // 4. Poll until READY (with budget)
  const ready = await waitUntilReady(deps, id, endpointId, log);
  if (!ready) {
    // Timed out — leave the endpoint up so the operator can inspect, but
    // mark the deployment failed so the user knows.
    await markFailed(
      supabase,
      id,
      `Endpoint ${endpointId} didn't reach READY within ${Math.round(env.readyTimeoutMs / 60000)} min. ` +
        `Check the RunPod console for build logs.`
    );
    return;
  }

  // 5. Register output model in catalog
  const modelExternalId = `ahura/${claimed.name}:byo-${id.slice(0, 8)}`;
  const { data: insertedModel, error: modelErr } = await supabase
    .schema("inference")
    .from("models")
    .insert({
      model_id: modelExternalId,
      display_name: `${claimed.name} (BYO ${claimed.source})`,
      description: `Private BYO deployment from ${claimed.source}: ${claimed.source_ref}${
        claimed.source_revision ? `:${claimed.source_revision}` : ""
      }`,
      modality: "chat",
      serving_type: "runpod_byo",
      org_id: claimed.org_id,
      upstream_provider: "runpod",
      upstream_model_id: modelExternalId,
      runpod_endpoint_id: endpointId,
      capabilities: {
        streaming: true,
        tools: false,
        json_mode: false,
        context_window: 8192,
      },
      pricing: { input_cents_per_mtok: 0, output_cents_per_mtok: 0 },
      is_active: true,
    })
    .select("id")
    .single<{ id: string }>();

  if (modelErr || !insertedModel) {
    log.error({ err: modelErr?.message }, "model registration failed");
    // Endpoint is live, but catalog wasn't updated. Mark active with a
    // warning — operator can re-register from the dashboard.
    await supabase
      .schema("inference")
      .from("deployments")
      .update({
        status: "active",
        deployed_at: new Date().toISOString(),
        error_message: `WARN: endpoint live but model registration failed: ${
          modelErr?.message ?? "unknown"
        }`,
      })
      .eq("id", id);
    return;
  }

  await supabase
    .schema("inference")
    .from("deployments")
    .update({
      status: "active",
      deployed_at: new Date().toISOString(),
      model_id: insertedModel.id,
      error_message: null,
    })
    .eq("id", id);

  log.info({ modelId: insertedModel.id, modelExternalId }, "deployment active + registered");
}

async function waitUntilReady(
  deps: LifecycleDeps,
  id: string,
  endpointId: string,
  log: Logger
): Promise<boolean> {
  const { env, supabase, runpod } = deps;
  const deadline = Date.now() + env.readyTimeoutMs;

  while (Date.now() < deadline) {
    await sleep(env.readyPollIntervalMs);

    // Was the deployment cancelled while we waited?
    const { data: cur } = await supabase
      .schema("inference")
      .from("deployments")
      .select("status")
      .eq("id", id)
      .maybeSingle<{ status: string }>();

    if (!cur || cur.status === "deleted" || cur.status === "paused") {
      log.info({ status: cur?.status }, "deployment cancelled while waiting — tearing down");
      await runpod.deleteEndpoint(endpointId).catch((err) => {
        log.warn({ err: errStr(err) }, "teardown after cancel failed");
      });
      return false;
    }

    const status = await runpod.getEndpoint(endpointId).catch((err) => {
      log.warn({ err: errStr(err) }, "endpoint status poll failed — retrying");
      return null;
    });
    if (!status) continue;

    if (status.status === "READY") {
      log.info({ endpointId }, "endpoint READY");
      return true;
    }
    if (status.status === "DEGRADED") {
      log.error({ endpointId }, "endpoint DEGRADED — bailing");
      return false;
    }
    // PENDING / UNKNOWN — keep polling
  }
  return false;
}

// ── SCALE ──────────────────────────────────────────────────────────

async function handleScale(deps: LifecycleDeps, id: string, log: Logger): Promise<void> {
  const { supabase, runpod } = deps;
  const { data: row } = await supabase
    .schema("inference")
    .from("deployments")
    .select("id, runpod_endpoint_id, autoscale, status")
    .eq("id", id)
    .maybeSingle<{
      id: string;
      runpod_endpoint_id: string | null;
      autoscale: { min_workers: number; max_workers: number; idle_timeout_s: number };
      status: string;
    }>();

  if (!row) {
    log.warn("deployment row missing — skipping scale");
    return;
  }
  if (!row.runpod_endpoint_id) {
    log.info("no live endpoint yet — scale will be applied at next create");
    return;
  }
  if (row.status === "deleted") {
    log.info("deployment deleted — skipping scale");
    return;
  }

  try {
    await runpod.scaleEndpoint(row.runpod_endpoint_id, row.autoscale);
    log.info({ endpointId: row.runpod_endpoint_id, autoscale: row.autoscale }, "scaled");
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log.error({ err: msg }, "scale failed");
    // Don't mark the deployment as failed — scaling errors are recoverable.
    // Log + leave the row in its current state; the user will see the error
    // in the next status poll.
    await supabase
      .schema("inference")
      .from("deployments")
      .update({ error_message: `Scale failed: ${msg.slice(0, 400)}` })
      .eq("id", id);
  }
}

// ── DELETE ─────────────────────────────────────────────────────────

async function handleDelete(deps: LifecycleDeps, id: string, log: Logger): Promise<void> {
  const { supabase, runpod } = deps;
  const { data: row } = await supabase
    .schema("inference")
    .from("deployments")
    .select("id, runpod_endpoint_id, model_id, status")
    .eq("id", id)
    .maybeSingle<{
      id: string;
      runpod_endpoint_id: string | null;
      model_id: string | null;
      status: string;
    }>();

  if (!row) {
    log.warn("deployment row missing — nothing to delete");
    return;
  }
  if (row.status === "deleted") {
    log.info("already deleted");
    return;
  }

  // Tear down the endpoint
  if (row.runpod_endpoint_id) {
    try {
      await runpod.deleteEndpoint(row.runpod_endpoint_id);
      log.info({ endpointId: row.runpod_endpoint_id }, "endpoint deleted");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log.error({ err: msg }, "endpoint delete failed — proceeding with DB cleanup anyway");
    }
  }

  // Deactivate model in catalog
  if (row.model_id) {
    await supabase
      .schema("inference")
      .from("models")
      .update({ is_active: false })
      .eq("id", row.model_id);
  }

  // Final state
  await supabase
    .schema("inference")
    .from("deployments")
    .update({
      status: "deleted",
      error_message: null,
    })
    .eq("id", id);

  log.info("deployment marked deleted");
}

// ── helpers ────────────────────────────────────────────────────────

function resolveImageUri(row: DeploymentRow): string | null {
  if (row.source === "docker") {
    if (row.image_uri) return row.image_uri;
    const tag = row.source_revision || "";
    return tag ? `${row.source_ref}:${tag}` : row.source_ref;
  }
  // HF + Truss need a build step that turns the model/repo into an OCI image.
  // That ships in Phase 7 (separate builder worker). For now, reject in this
  // runner — the API already accepts these sources so users can queue them.
  return null;
}

async function markFailed(supabase: SupabaseClient, id: string, reason: string): Promise<void> {
  await supabase
    .schema("inference")
    .from("deployments")
    .update({
      status: "failed",
      error_message: reason.slice(0, 500),
    })
    .eq("id", id)
    .in("status", ["building", "deploying"]);
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function errStr(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
