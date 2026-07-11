// Game server provisioning — PREPAID MONTHLY billing.
//
// Flow: validate → place (host + allocations, Redis-locked) → charge the plan's
// monthly price (atomic CAS deduct — the concurrency gate) → insert DB row →
// panel user → panel server create → background finalize (install poll, EULA,
// start) → 'active' + email. Any failure after the charge refunds it BLOCKING
// and records the outcome durably on the row (domain-service lesson: never
// fire-and-forget a refund).

import { after } from "next/server";

import { createServiceClient } from "@/lib/supabase/server";
import { Billing } from "@/lib/supabase/queries/billing";
import { Encryption } from "@/config/functions";
import { pterodactyl, PterodactylError } from "@/lib/pterodactyl/client";
import { findGameCatalogEntry, findGamePlanBySlug, getGameCatalog } from "@/lib/pricing/game-plan-catalog";
import type { GameCatalogEntry } from "@/lib/pricing/game-plans";
import { placeServer } from "@/lib/services/game/host-selection";
import { ensurePanelUser } from "@/lib/services/game/panel-users";
import { sendServiceEventEmail } from "@/lib/services/shared/service-event-email";

const MONTH_MS = 30 * 24 * 60 * 60 * 1000;
const INSTALL_POLL_INTERVAL_MS = 5_000;

// Install duration varies wildly by game (CS2 downloads ~60 GB via SteamCMD).
// The in-request poll gives up after this budget but NEVER fails the server —
// reconcileInstallingGameServers() (cron + detail-page views) finishes the job.
const INSTALL_POLL_BUDGET_MS: Record<string, number> = {
  minecraft: 10 * 60_000,
  rust: 20 * 60_000,
  cs2: 12 * 60_000, // stop tying up the request; reconciler carries the rest
  fivem: 15 * 60_000,
};
const DEFAULT_INSTALL_BUDGET_MS = 12 * 60_000;

// Env vars we generate (not customer-supplied) per game — RCON passwords.
const AUTO_GENERATED_SECRETS: Record<string, string[]> = {
  rust: ["RCON_PASS"],
  cs2: ["RCON_PASSWORD"],
};

export type CreateGameServerError =
  | { code: "INVALID"; message: string }
  | { code: "GAME_UNAVAILABLE"; message: string }
  | { code: "NO_CAPACITY"; message: string }
  | { code: "INSUFFICIENT_FUNDS"; message: string; required: number }
  | { code: "PANEL_ERROR"; message: string }
  | { code: "INTERNAL"; message: string };

export type CreateGameServerResult =
  | { ok: true; serverId: number; status: string }
  | { ok: false; error: CreateGameServerError };

interface CreateInput {
  userId: string;
  userEmail: string;
  userName?: string | null;
  name: string;
  gameType: string;
  planSlug: string;
  region: string;
  projectId?: string | null;
  environment: Record<string, string>;
  eulaAccepted?: boolean;
}

function randomToken(len = 24): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const buf = new Uint32Array(len);
  globalThis.crypto.getRandomValues(buf);
  let out = "";
  for (let i = 0; i < len; i++) out += chars[buf[i] % chars.length];
  return out;
}

async function logEvent(serverId: number, eventType: string, message: string, metadata: Record<string, unknown> = {}) {
  try {
    const supabase = await createServiceClient();
    await supabase.from("game_server_events").insert({ server_id: serverId, event_type: eventType, message, metadata });
  } catch {
    /* events are best-effort */
  }
}

async function updateServer(serverId: number, patch: Record<string, unknown>) {
  const supabase = await createServiceClient();
  const { error } = await supabase.from("game_servers").update(patch).eq("id", serverId);
  if (error) console.error(`[game-provision] failed to update server ${serverId}:`, error.message);
}

async function setStage(serverId: number, existingDetails: Record<string, unknown>, stage: string, progress: number, message: string) {
  await updateServer(serverId, {
    details: { ...existingDetails, provisioning: { stage, progress, message, updated_at: new Date().toISOString() } },
  });
}

/** Merge env: catalog defaults → schema defaults → customer values (editable keys only) → port wiring → generated secrets. */
function assembleEnvironment(
  catalog: GameCatalogEntry,
  customer: Record<string, string>,
  extraPorts: Array<{ name: string; env?: string; port: number }>,
): { environment: Record<string, string>; generatedSecrets: Record<string, string> } {
  const environment: Record<string, string> = { ...catalog.defaultEnvironment };
  for (const field of catalog.envSchema) {
    if (!(field.key in environment)) environment[field.key] = field.default ?? "";
  }
  for (const field of catalog.envSchema) {
    if (!field.customer_editable) continue;
    const value = customer[field.key];
    if (value !== undefined && value !== "") environment[field.key] = String(value).slice(0, 191);
  }
  for (const p of extraPorts) {
    if (p.env) environment[p.env] = String(p.port);
  }

  // Per-game secrets we generate server-side (RCON passwords etc.) — never
  // exposed to the customer, stored encrypted in env_blob.
  const generatedSecrets: Record<string, string> = {};
  for (const key of AUTO_GENERATED_SECRETS[catalog.id] ?? []) {
    const value = randomToken(20);
    generatedSecrets[key] = value;
    environment[key] = value;
  }
  return { environment, generatedSecrets };
}

export async function createGameServer(input: CreateInput): Promise<CreateGameServerResult> {
  const supabase = await createServiceClient();

  // ── validate ────────────────────────────────────────────────────────────
  const name = input.name.trim();
  if (!/^[\w\d .-]{3,48}$/.test(name)) {
    return { ok: false, error: { code: "INVALID", message: "Name must be 3-48 chars (letters, numbers, spaces, . _ -)" } };
  }
  const catalog = await findGameCatalogEntry(supabase, input.gameType);
  if (!catalog || !catalog.isActive || !catalog.eggId) {
    return { ok: false, error: { code: "GAME_UNAVAILABLE", message: "This game is not available yet" } };
  }
  const plan = await findGamePlanBySlug(supabase, input.planSlug);
  if (!plan || !plan.isActive || plan.gameType !== catalog.id) {
    return { ok: false, error: { code: "INVALID", message: "Unknown or inactive plan for this game" } };
  }
  if (plan.allowedRegions && plan.allowedRegions.length > 0 && !plan.allowedRegions.includes(input.region)) {
    return { ok: false, error: { code: "INVALID", message: "Plan is not offered in this region" } };
  }
  if (catalog.requiresEula && !input.eulaAccepted) {
    return { ok: false, error: { code: "INVALID", message: "You must accept the game's EULA" } };
  }
  for (const field of catalog.envSchema) {
    if (field.required && field.customer_editable) {
      const v = input.environment[field.key] ?? field.default;
      if (!v) return { ok: false, error: { code: "INVALID", message: `${field.label} is required` } };
    }
  }

  // ── place (before charging — never charge without capacity) ─────────────
  const placement = await placeServer({ region: input.region, gameType: catalog.id, plan });
  if (!placement) {
    return { ok: false, error: { code: "NO_CAPACITY", message: "No capacity in this region right now — try another region or plan" } };
  }

  const monthlyPrice = plan.monthlyPrice;
  let serverId: number | null = null;
  let charged = false;
  let pteroServerId: number | null = null;

  try {
    // ── charge (atomic deduct IS the concurrency gate) ─────────────────────
    try {
      await Billing.deduct(input.userId, monthlyPrice);
      charged = true;
    } catch {
      const balance = await Billing.get_balance(input.userId).catch(() => 0);
      return {
        ok: false,
        error: {
          code: "INSUFFICIENT_FUNDS",
          message: `Insufficient balance. This plan costs $${monthlyPrice.toFixed(2)}/month — your balance is $${balance.toFixed(2)}.`,
          required: monthlyPrice,
        },
      };
    }

    // ── DB row (provisioning) ──────────────────────────────────────────────
    const endsAt = new Date(Date.now() + MONTH_MS).toISOString();
    const extraPorts = placement.extraAllocations.map((a, i) => ({
      name: catalog.portPlan[i]?.name ?? `extra${i}`,
      env: (catalog.portPlan[i] as { env?: string } | undefined)?.env,
      port: a.port,
    }));
    const { environment, generatedSecrets } = assembleEnvironment(catalog, input.environment, extraPorts);

    const secretEnv: Record<string, string> = { ...generatedSecrets };
    for (const field of catalog.envSchema) {
      if (field.secret && environment[field.key]) secretEnv[field.key] = environment[field.key];
    }
    const encryptionKey = process.env.ENCRYPTION_KEY;
    const envBlob =
      Object.keys(secretEnv).length > 0 && encryptionKey
        ? JSON.stringify(Encryption.encrypt(JSON.stringify(secretEnv), encryptionKey))
        : null;

    const details = {
      limits: { memory: plan.memoryMB, disk: plan.diskGB * 1024, cpu: plan.cpuPct },
      ports: {
        game: { ip: placement.allocation.ip, port: placement.allocation.port },
        ...Object.fromEntries(extraPorts.map((p) => [p.name, { ip: placement.allocation.ip, port: p.port }])),
      },
      provisioning: { stage: "allocating", progress: 10, message: "Reserving resources", updated_at: new Date().toISOString() },
    };

    const { data: row, error: insertError } = await supabase
      .from("game_servers")
      .insert({
        name,
        game_type: catalog.id,
        status: "provisioning",
        user_id: input.userId,
        project_id: input.projectId ?? null,
        plan_slug: plan.slug,
        region: input.region,
        host_id: placement.host.id,
        monthly_price: monthlyPrice,
        auto_renew: true,
        ends_at: endsAt,
        ip: placement.allocation.ip,
        port: placement.allocation.port,
        node: placement.host.ptero_node_id,
        allocation: placement.allocation.id,
        env_blob: envBlob,
        details,
        resources: { ram: plan.memoryMB, storage: plan.diskGB, cpu: plan.cpuPct },
      })
      .select("id, billing_service_id")
      .single();
    if (insertError || !row) throw new Error(`DB insert failed: ${insertError?.message}`);
    serverId = row.id;

    // Purchase ledger row (best-effort; balance already moved).
    Billing.save_transaction({
      userId: input.userId,
      amount: monthlyPrice,
      status: "completed",
      type: "purchase",
      serviceId: row.billing_service_id,
      serviceType: "game_server",
      description: `Game server: ${catalog.displayName} — ${plan.name} (1 month)`,
      metadata: { server_id: row.id, plan_slug: plan.slug, region: input.region },
    }).catch((e) => console.warn("[game-provision] purchase transaction failed:", e?.message ?? e));

    await logEvent(row.id, "created", `Order placed: ${plan.name} in ${placement.host.display_region}`, {
      plan: plan.slug,
      host: placement.host.id,
      monthly_price: monthlyPrice,
    });

    // ── panel user ─────────────────────────────────────────────────────────
    await setStage(row.id, details, "panel-user", 25, "Preparing your panel account");
    const panelUser = await ensurePanelUser({ userId: input.userId, email: input.userEmail, fullName: input.userName });

    // ── panel server ───────────────────────────────────────────────────────
    await setStage(row.id, details, "creating", 40, "Creating your game server");
    const created = await pterodactyl.createServer({
      name,
      user: panelUser.pteroUserId,
      egg: catalog.eggId,
      docker_image: catalog.dockerImage,
      startup: catalog.startup ?? "",
      environment,
      limits: { memory: plan.memoryMB, swap: plan.swapMB, disk: plan.diskGB * 1024, io: 500, cpu: plan.cpuPct },
      feature_limits: { databases: plan.databases, allocations: 1 + placement.extraAllocations.length, backups: plan.backups },
      allocation: { default: placement.allocation.id, additional: placement.extraAllocations.map((a) => a.id) },
      start_on_completion: !catalog.requiresEula, // EULA games boot after we write eula.txt
      external_id: `ahura-${row.billing_service_id}`,
    });
    pteroServerId = created.id;

    await updateServer(row.id, {
      ptero_server_id: created.id,
      ptero_uuid: created.uuid,
      ptero_user_id: panelUser.pteroUserId,
      identifier: created.identifier,
      status: "installing",
    });
    await setStage(row.id, { ...details }, "installing", 60, "Installing game files");
    await logEvent(row.id, "panel_created", `Panel server ${created.identifier} created on ${placement.host.id}`);

    // ── background finalize ────────────────────────────────────────────────
    const finalizeArgs = {
      serverId: row.id,
      identifier: created.identifier,
      appServerId: created.id,
      gameType: catalog.id,
      requiresEula: catalog.requiresEula,
      userEmail: input.userEmail,
      serverName: name,
      gameLabel: catalog.displayName,
      planLabel: plan.name,
      regionLabel: placement.host.display_region,
      connect: `${placement.allocation.ip}:${placement.allocation.port}`,
      endsAt,
      details,
    };
    after(async () => {
      await finalizeInstall(finalizeArgs);
      await placement.releaseLock();
    });

    return { ok: true, serverId: row.id, status: "installing" };
  } catch (err) {
    // ── failure: teardown + BLOCKING refund with durable record ────────────
    const message = err instanceof PterodactylError ? `${err.message}${err.detail ? ` — ${err.detail}` : ""}` : err instanceof Error ? err.message : String(err);
    console.error("[game-provision] create failed:", message);

    await placement.releaseLock().catch(() => {});
    if (pteroServerId !== null) {
      await pterodactyl.deleteServer(pteroServerId, true).catch((e) => console.error("[game-provision] orphan panel server cleanup failed:", e?.message ?? e));
    }

    let refundNote = "";
    if (charged) {
      try {
        await Billing.topup(input.userId, monthlyPrice);
        Billing.save_transaction({
          userId: input.userId,
          amount: monthlyPrice,
          status: "completed",
          type: "refund",
          serviceType: "game_server",
          description: "Game server refund: provisioning failed",
          metadata: { server_id: serverId },
        }).catch(() => {});
        refundNote = "Charge refunded.";
      } catch (refundError) {
        refundNote = "REFUND FAILED — flagged for manual review.";
        console.error("[game-provision] CRITICAL refund failure", {
          userId: input.userId,
          amount: monthlyPrice,
          serverId,
          error: refundError instanceof Error ? refundError.message : String(refundError),
        });
      }
    }

    if (serverId !== null) {
      await updateServer(serverId, {
        status: "failed",
        last_error: `${message}${refundNote ? ` | ${refundNote}` : ""}`,
        details: {
          provisioning: { stage: "failed", progress: 100, message, updated_at: new Date().toISOString() },
          ...(charged ? { refund_status: refundNote.startsWith("REFUND FAILED") ? "failed" : "completed", refund_amount: monthlyPrice } : {}),
        },
      });
      await logEvent(serverId, "failed", message, { refund: refundNote || "no charge taken" });
    }

    return { ok: false, error: { code: "PANEL_ERROR", message: `Provisioning failed: ${message}. ${refundNote}`.trim() } };
  }
}

/**
 * Idempotent completion: flip provisioning/installing → active exactly once
 * (conditional update guards against the poll and the reconciler racing),
 * write the EULA + boot when needed, then send the "ready" email.
 */
async function completeInstall(args: {
  serverId: number;
  identifier: string;
  requiresEula: boolean;
  userEmail: string | null;
  serverName: string;
  gameLabel: string;
  planLabel: string;
  regionLabel: string;
  connect: string;
  endsAt: string | null;
}): Promise<boolean> {
  if (args.requiresEula) {
    try {
      await pterodactyl.writeFile(args.identifier, "/eula.txt", "eula=true\n");
      await pterodactyl.power(args.identifier, "start");
    } catch (e) {
      console.warn("[game-provision] eula/start step failed (server manageable via panel):", e instanceof Error ? e.message : e);
    }
  }

  const supabase = await createServiceClient();
  const { data: flipped } = await supabase
    .from("game_servers")
    .update({
      status: "active",
      last_error: null,
      details: {
        provisioning: { stage: "complete", progress: 100, message: "Server is ready", updated_at: new Date().toISOString() },
      },
    })
    .eq("id", args.serverId)
    .in("status", ["provisioning", "installing", "failed"])
    .select("id");
  if (!flipped || flipped.length === 0) return false; // someone else completed it

  await logEvent(args.serverId, "ready", "Server installed and started");
  await sendServiceEventEmail({
    userEmail: args.userEmail,
    serviceType: "Game Server",
    serviceName: args.serverName,
    event: "ready",
    items: [
      { label: "Game", value: args.gameLabel },
      { label: "Plan", value: args.planLabel },
      { label: "Region", value: args.regionLabel },
      { label: "Connect", value: args.connect },
      ...(args.endsAt ? [{ label: "Paid until", value: new Date(args.endsAt).toUTCString() }] : []),
    ],
    actionPath: `/dashboard/services/game/${args.serverId}`,
    actionLabel: "Manage server",
  });
  return true;
}

/** Poll install within the per-game budget; hand off to the reconciler if slow. */
async function finalizeInstall(args: {
  serverId: number;
  identifier: string;
  appServerId: number;
  gameType: string;
  requiresEula: boolean;
  userEmail: string;
  serverName: string;
  gameLabel: string;
  planLabel: string;
  regionLabel: string;
  connect: string;
  endsAt: string;
  details: Record<string, unknown>;
}): Promise<void> {
  const budget = INSTALL_POLL_BUDGET_MS[args.gameType] ?? DEFAULT_INSTALL_BUDGET_MS;
  const deadline = Date.now() + budget;

  while (Date.now() < deadline) {
    try {
      const server = await pterodactyl.getServer(args.appServerId);
      if (server.status === null || server.status === "") {
        await completeInstall(args);
        return;
      }
      if (server.status === "install_failed") {
        await updateServer(args.serverId, { status: "failed", last_error: "Game installation failed on the node" });
        await logEvent(args.serverId, "install_failed", "Installer exited with an error");
        return;
      }
    } catch (e) {
      console.warn("[game-provision] install poll error:", e instanceof Error ? e.message : e);
    }
    await new Promise((r) => setTimeout(r, INSTALL_POLL_INTERVAL_MS));
  }

  // Slow install (large game download) — NOT a failure. The reconciler
  // (cron sweep + detail-page views) completes it whenever the node finishes.
  await updateServer(args.serverId, {
    status: "installing",
    details: {
      ...args.details,
      provisioning: {
        stage: "installing",
        progress: 75,
        message: "Still installing — large game download. This finishes automatically.",
        updated_at: new Date().toISOString(),
      },
    },
  });
  await logEvent(args.serverId, "install_slow", "Install still running after the poll budget; reconciler will finish it");
}

/**
 * Reconcile in-flight installs against the panel: complete finished ones,
 * fail genuinely broken ones. Called by the renewal cron and opportunistically
 * when a customer views an installing server. Safe to run concurrently.
 */
export async function reconcileInstallingGameServers(onlyServerId?: number): Promise<{ checked: number; completed: number; failed: number }> {
  const supabase = await createServiceClient();
  let query = supabase
    .from("game_servers")
    .select("id, name, game_type, status, user_id, identifier, ptero_server_id, ip, port, plan_slug, region, ends_at")
    .in("status", ["provisioning", "installing"])
    .not("ptero_server_id", "is", null);
  if (onlyServerId) query = query.eq("id", onlyServerId);
  const { data, error } = await query;
  if (error) throw new Error(`install reconcile query failed: ${error.message}`);

  const summary = { checked: 0, completed: 0, failed: 0 };
  const catalog = await getGameCatalog(supabase).catch(() => []);

  for (const row of data ?? []) {
    summary.checked++;
    try {
      const server = await pterodactyl.getServer(row.ptero_server_id!);
      if (server.status === "install_failed") {
        await updateServer(row.id, { status: "failed", last_error: "Game installation failed on the node" });
        await logEvent(row.id, "install_failed", "Installer exited with an error");
        summary.failed++;
        continue;
      }
      if (server.status !== null && server.status !== "") continue; // still installing

      const entry = catalog.find((g) => g.id === row.game_type);
      const { resolveUserEmail } = await import("@/lib/services/shared/service-alert-email");
      const email = (row.user_id ? await resolveUserEmail(row.user_id) : null) ?? null;
      const done = await completeInstall({
        serverId: row.id,
        identifier: row.identifier ?? server.identifier,
        requiresEula: entry?.requiresEula ?? false,
        userEmail: email,
        serverName: row.name,
        gameLabel: entry?.displayName ?? row.game_type,
        planLabel: row.plan_slug ?? "—",
        regionLabel: row.region ?? "—",
        connect: row.ip && row.port ? `${row.ip}:${row.port}` : "see dashboard",
        endsAt: row.ends_at,
      });
      if (done) summary.completed++;
    } catch (e) {
      const notFound = e instanceof PterodactylError && e.code === "not_found";
      if (notFound) {
        await updateServer(row.id, { status: "failed", last_error: "Panel server disappeared during install" });
        summary.failed++;
      } else {
        console.warn(`[game-reconcile] server ${row.id}:`, e instanceof Error ? e.message : e);
      }
    }
  }
  return summary;
}
