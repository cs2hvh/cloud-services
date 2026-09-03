/**
 * Billing v2 hourly sweep.
 *
 * Charges one hour of usage for every open meter in billing.service_meters by
 * calling billing.charge_service_hour, which is idempotent per
 * (service_type, service_id, hour).
 *
 * WHY THIS LIVES IN THE REPO
 *
 * Its predecessor did not. `credit-system-cron/cron-worker.js` was deleted from
 * `dev` in ef946da1, the deploy pulls `dev`, and on 2026-08-24 a restart wiped
 * it off the production host. systemd then restarted it every 10 seconds for
 * six days — exiting in 33ms each time with MODULE_NOT_FOUND — and every
 * service on the platform went unbilled while the unit reported "activating".
 * A biller that can delete itself during a routine deploy is not a biller.
 *
 * THREE RULES THIS SCRIPT FOLLOWS, each bought with a real defect
 *
 * 1. DRY RUN IS THE DEFAULT. Charging requires --apply. The old worker, if
 *    restarted on 2026-08-30, would have billed ~$5,853 within one tick, of
 *    which ~$5,760 came from three meters carrying rates that were monthly
 *    figures written into an hourly column. Money moves only when someone says
 *    so, out loud, on the command line.
 *
 * 2. THE PERIOD IS ADDRESSABLE. --period <iso> bills a named hour, so a missed
 *    window can be replayed. The paas-v2 sweep derives its period from now()
 *    with no override; the 00:00 hour on 2026-08-30 is missing from
 *    paas.project_charges and can never be recovered. Idempotency gives you
 *    safety on a duplicate run. Only a nameable period gives you recovery on a
 *    missed one.
 *
 * 3. A METER WITHOUT A LIVE RESOURCE IS A PROBLEM, NOT A SKIP. At audit time
 *    two of three live objectspace meters were billing DELETED buckets, one
 *    belonging to a paying customer who was charged $4,629.91 for an empty,
 *    already-removed bucket. This script refuses to charge a meter whose
 *    resource is gone AND reports it loudly, because silently skipping it
 *    would hide the same defect rather than fix it.
 *
 * Run:
 *   node --experimental-strip-types --env-file=.env scripts/billing/sweep.ts
 *   node --experimental-strip-types --env-file=.env scripts/billing/sweep.ts --apply
 *   node --experimental-strip-types --env-file=.env scripts/billing/sweep.ts --period 2026-08-30T14:00:00Z --apply
 *
 * Exit codes: 0 clean, 1 problems found (unbilled meters, dead resources,
 * missing prices). Non-zero is what an external monitor watches for — see the
 * note on dead-man alerting at the bottom.
 *
 * EVERY RUN IS RECORDED in billing.sweep_runs — period, mode, outcome tally and
 * the exact problem lines. Until 2026-09-03 the only record of a problem was
 * this script's stdout in the systemd journal on the host. An eleven-hour hole
 * on a compute meter was reported there every hour and nobody read it, while
 * the dead-man saw a fresh max(period_start) from the other meters and stayed
 * green. The dead-man now reads sweep_runs and billing.meter_coverage().
 */

import os from "node:os";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// ── Service registry ─────────────────────────────────────────────────────

/**
 * What backs each service, and what "still running" means for it.
 *
 * `billableStatuses` is an allowlist rather than a denylist on purpose. A
 * status nobody anticipated should stop the charge and get reported, not fall
 * through into "bill it anyway" — the old system's failure mode was always
 * charging for something it should not have.
 */
interface ServiceSpec {
  /** Postgres schema of the resource table. */
  schema: string;
  /** Resource table proving the thing exists. */
  table: string;
  /**
   * Column matching billing.service_meters.service_id.
   *
   * The billing spine is uuid-keyed throughout, but `servers`, `gpu_pods` and
   * `gpu_network_volumes` are bigint-keyed and carry a separate
   * `billing_service_id` uuid for exactly this purpose. Joining those on `id`
   * would match nothing and report every live resource as an orphaned meter —
   * a false alarm indistinguishable from the real defect this check exists to
   * catch. Defaults to 'id'.
   */
  idColumn?: string;
  /** Statuses that mean "this is running and billable". */
  billableStatuses: string[];
  /**
   * Statuses that mean "exists but must not be billed" — e.g. a stopped pod
   * whose GPU has been released upstream. Distinguished from an unknown status
   * so the report can tell "deliberately not billed" from "we do not know".
   */
  nonBillableStatuses?: string[];
  /**
   * Column that carries the lifecycle status. Defaults to "status". Set to
   * null for a table that has no such column — then merely existing is the
   * billable state, and `billableStatuses` must contain "exists".
   *
   * inference.vector_collections has no status column. The registry used to
   * select one anyway, PostgREST refused the query, and every vector meter
   * would have been PROBLEM-error forever. No meter had been opened yet, which
   * is the only reason it never fired.
   */
  statusColumn?: string | null;
  /** Column holding stored bytes, for per_gb_hour pricing. */
  bytesColumn?: string;
  /** Columns for markup pricing: cost per unit per hour, and the unit count. */
  upstreamCostColumn?: string;
  unitsColumn?: string;
}

const SERVICES: Record<string, ServiceSpec> = {
  compute: {
    schema: "public", table: "servers",
    idColumn: "billing_service_id",
    billableStatuses: ["running", "active", "provisioning", "stopped"],
    nonBillableStatuses: ["deleted", "destroyed", "terminated", "failed", "error"],
    // The price frozen onto the server when it was created (markup x provider
    // list, at that moment). Resold VMs bill this back through the compute '*'
    // passthrough row, which is what makes the quote and the charge the same
    // number rather than two numbers that are supposed to agree.
    //
    // Self-hosted plans (s-*, d-*) have fixed_hourly rows of their own and
    // never read this — see the rate-model check at the guard below.
    upstreamCostColumn: "hourly_cost",
  },
  gpu_pod: {
    schema: "public", table: "gpu_pods",
    idColumn: "billing_service_id",
    // A stopped pod releases the GPU upstream but keeps its disk; it is
    // re-rated to storage-only rather than billed at the full rate, so it is
    // NOT billable under the pod's own plan here.
    billableStatuses: ["running"],
    nonBillableStatuses: ["stopped", "terminated", "failed", "error", "exited"],
    upstreamCostColumn: "runpod_cost_per_hr",
    unitsColumn: "gpu_count",
  },
  /**
   * A pod's local disk, billed separately from its GPU and on a different
   * rule: the GPU is released upstream when a pod stops, but the disk is not,
   * and RunPod keeps charging us for it. So this meter stays billable while
   * the pod is merely STOPPED and closes only when the pod is terminated.
   *
   * Splitting it from `gpu_pod` is also what lets an invoice show GPU and
   * storage as separate lines, and it is why charge_service_hour does not need
   * to support a markup and a per-GB rate at the same time.
   */
  gpu_pod_storage: {
    schema: "public", table: "gpu_pods",
    idColumn: "billing_service_id",
    billableStatuses: ["running", "stopped"],
    nonBillableStatuses: ["terminated", "failed", "error", "exited"],
    // quantity = container_disk_gb + volume_gb, summed below.
  },
  gpu_volume: {
    schema: "public", table: "gpu_network_volumes",
    idColumn: "billing_service_id",
    // RunPod reports volumes as "available", not "active".
    billableStatuses: ["available", "active"],
    nonBillableStatuses: ["deleted", "removed"],
    // size_gb is already GB, handled specially below.
  },
  objectspace: {
    schema: "public", table: "object_spaces",
    billableStatuses: ["active"],
    nonBillableStatuses: ["deleted", "removed"],
    bytesColumn: "size_bytes",
  },
  spectrum: {
    schema: "public", table: "spectrum_apps",
    billableStatuses: ["active", "running"],
    nonBillableStatuses: ["deleted", "removed", "disabled"],
  },
  database: {
    schema: "public", table: "database_cluster",
    billableStatuses: ["active", "running", "provisioning"],
    nonBillableStatuses: ["deleted", "removed", "failed"],
  },
  kubernetes: {
    schema: "public", table: "clusters",
    billableStatuses: ["active", "running", "provisioning"],
    nonBillableStatuses: ["deleted", "removed", "failed"],
  },
  /**
   * The v1 (Jenkins) apps table. The v2 PaaS in the `paas` schema bills on its
   * own spine (paas.charge_project_hour, hourly at :04 from a Kubernetes
   * CronJob) and never opens a meter here. Statuses match the table's CHECK
   * constraint: pending, building, running, failed, stopped, deleting. The
   * previous list named "active" and "deployed", which the column cannot hold,
   * and omitted "pending" and "building", so every mid-build app was reported
   * as an unknown status.
   */
  platform_apps: {
    schema: "public", table: "platform_apps",
    billableStatuses: ["running"],
    nonBillableStatuses: ["pending", "building", "failed", "stopped", "deleting", "deleted", "removed"],
  },
  custom_image: {
    schema: "public", table: "custom_images",
    idColumn: "billing_service_id",
    billableStatuses: ["active", "ready", "available"],
    nonBillableStatuses: ["deleted", "removed", "failed", "deleting"],
  },
  inference_vector: {
    schema: "inference", table: "vector_collections",
    // No status column: a collection that exists is billable, and one that has
    // been deleted is a missing row (PROBLEM-no-resource, which is correct).
    statusColumn: null,
    billableStatuses: ["exists"],
    nonBillableStatuses: [],
  },
};

// ── CLI ──────────────────────────────────────────────────────────────────

interface Args {
  apply: boolean;
  period: Date;
  serviceFilter: string | null;
  verbose: boolean;
}

function parseArgs(argv: string[]): Args {
  const apply = argv.includes("--apply");
  const verbose = argv.includes("--verbose");

  const pIdx = argv.indexOf("--period");
  let period: Date;
  if (pIdx !== -1) {
    const raw = argv[pIdx + 1];
    if (!raw) throw new Error("--period requires an ISO timestamp");
    period = new Date(raw);
    if (Number.isNaN(period.getTime())) {
      throw new Error(`--period: could not parse "${raw}" as a date`);
    }
  } else {
    // Default: the hour that has just COMPLETED, not the one in progress.
    // Billing a partial hour at the full rate overcharges by up to an hour on
    // every sweep, and the difference is invisible in a per-hour ledger.
    period = new Date(Date.now() - 60 * 60 * 1000);
  }
  period.setUTCMinutes(0, 0, 0);

  const sIdx = argv.indexOf("--service");
  const serviceFilter = sIdx !== -1 ? (argv[sIdx + 1] ?? null) : null;
  if (serviceFilter && !SERVICES[serviceFilter]) {
    throw new Error(
      `--service ${serviceFilter} is not a known service. Known: ${Object.keys(SERVICES).join(", ")}`
    );
  }

  return { apply, period, serviceFilter, verbose };
}

// ── Meter loading ────────────────────────────────────────────────────────

interface Meter {
  id: string;
  service_type: string;
  service_id: string;
  user_id: string;
  plan_key: string;
  units: number;
  status: string;
  started_at: string;
}

/**
 * PostgREST on this project caps every response at 1000 rows regardless of
 * the limit asked for (verified: asked 3000, got 1000). An unpaginated read
 * here would bill the first thousand meters every hour and silently never
 * look at the rest, while reporting "charged 1000 of 1000". Page until a
 * short page.
 */
const PAGE = 1000;

async function loadOpenMeters(db: SupabaseClient, filter: string | null): Promise<Meter[]> {
  const all: Meter[] = [];
  for (let from = 0; ; from += PAGE) {
    let q = db.schema("billing").from("service_meters")
      .select("id, service_type, service_id, user_id, plan_key, units, status, started_at")
      .is("ended_at", null)
      .eq("status", "active")
      .order("id", { ascending: true })
      .range(from, from + PAGE - 1);
    if (filter) q = q.eq("service_type", filter);

    const { data, error } = await q;
    if (error) throw new Error(`could not load meters: ${error.message}`);
    const page = (data ?? []) as Meter[];
    all.push(...page);
    if (page.length < PAGE) break;
  }
  return all;
}

/** The status column to read for a service, or null when existence is the status. */
function statusColumnOf(spec: ServiceSpec): string | null {
  return spec.statusColumn === null ? null : (spec.statusColumn ?? "status");
}

/**
 * Fetch the backing resource rows for a set of meters.
 *
 * Returns a map keyed by resource id. A meter whose id is ABSENT from the map
 * has no resource — that is the deleted-bucket case and the caller treats it
 * as a problem.
 */
async function loadResources(
  db: SupabaseClient,
  spec: ServiceSpec,
  ids: string[]
): Promise<Map<string, Record<string, unknown>>> {
  const idCol = spec.idColumn ?? "id";
  const cols = [idCol];
  const statusCol = statusColumnOf(spec);
  if (statusCol) cols.push(statusCol);
  if (spec.bytesColumn) cols.push(spec.bytesColumn);
  if (spec.upstreamCostColumn) cols.push(spec.upstreamCostColumn);
  if (spec.unitsColumn) cols.push(spec.unitsColumn);
  if (spec.table === "gpu_network_volumes") cols.push("size_gb");
  if (spec.table === "gpu_pods") cols.push("container_disk_gb", "volume_gb");

  const { data, error } = await db
    .schema(spec.schema)
    .from(spec.table)
    .select([...new Set(cols)].join(", "))
    .in(idCol, ids);

  if (error) {
    // A failed read is NOT "no resources". Throwing here stops the sweep for
    // this service rather than reporting every meter as orphaned and, worse,
    // letting an operator act on that.
    throw new Error(`could not read ${spec.schema}.${spec.table}: ${error.message}`);
  }

  const map = new Map<string, Record<string, unknown>>();
  // Cast through unknown: supabase-js types a dynamic .select() string as a
  // possible GenericStringError, which cannot overlap Record<string, unknown>.
  // The error case is already handled above, so anything reaching here is a row.
  for (const row of (data ?? []) as unknown as Record<string, unknown>[]) {
    map.set(String(row[idCol]), row);
  }
  return map;
}

// ── Outcome accounting ───────────────────────────────────────────────────

type Outcome =
  | "charged" | "charged-free" | "already-charged" | "insufficient" | "zero-cost"
  | "no-price" | "invalid-amount"
  | "would-charge"          // dry run
  | "skipped-not-billable"  // known non-billable status
  | "PROBLEM-no-resource"   // meter outlived its resource
  | "PROBLEM-unknown-status"
  | "PROBLEM-error";

interface Line {
  meter: Meter;
  outcome: Outcome;
  detail?: string;
}

// 'zero-cost' is a problem too: a live resource whose price resolved to
// nothing is a price that was never written, not a free resource. It was
// counted as benign until 2026-09-03; billing.resolve_hourly_rate now refuses
// a zero upstream cost for the same reason.
const PROBLEM = (o: Outcome) =>
  o.startsWith("PROBLEM") || o === "insufficient" || o === "no-price" || o === "zero-cost";

// ── Main ─────────────────────────────────────────────────────────────────

/**
 * Index key for the price book.
 *
 * Both sides MUST build the key through this function. They previously inlined
 * the same template literal, one copy lost its separator during an edit, and
 * every meter silently reported "no-price" — a total billing stop that looked
 * like a data problem. One function means the two cannot drift.
 */
function priceKey(serviceType: string, planKey: string): string {
  return `${serviceType}::${planKey}`;
}

async function main(): Promise<number> {
  const args = parseArgs(process.argv.slice(2));

  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("[sweep] SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
    return 1;
  }

  const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const periodIso = args.period.toISOString();
  const startedAt = new Date();

  console.log(`[sweep] period=${periodIso} mode=${args.apply ? "APPLY" : "dry-run"}`);
  if (!args.apply) {
    console.log("[sweep] dry run — no money will move. Pass --apply to charge.");
  }

  const meters = await loadOpenMeters(db, args.serviceFilter);
  if (meters.length === 0) {
    console.log("[sweep] no open meters");
    // Recorded too: "the sweep ran and found nothing" and "the sweep did not
    // run" must not look the same from outside.
    await recordRun(db, args, [], startedAt);
    return 0;
  }

  // Live price book, for the dry-run price check above. The real run resolves
  // the price inside charge_service_hour (as of the hour being billed, which
  // matters for backfill); this index answers "does a price exist at all" and,
  // when one does, which rate model will be used to apply it.
  // Filtered to the hour BEING BILLED, not merely to "currently live". A price
  // created at 15:00 is not in force for the 14:00 hour: billing.current_price
  // applies effective_from <= p_at, and prices are deliberately not retroactive
  // (20260830000003_billing_v2_prices_change_on_hour_boundaries).
  //
  // Without this filter the dry run reported "would-charge" for an hour the real
  // run then refused with 'no-price'. A dry run that answers a different
  // question than the real run is precisely the false confidence it exists to
  // prevent — it was caught by running both against the same meter minutes
  // apart, which is the only reason it is not still here.
  const { data: priceRows, error: priceErr } = await db
    .schema("billing").from("service_pricing")
    .select("service_type, plan_key, rate_model, effective_from")
    .lte("effective_from", periodIso)
    .or(`effective_to.is.null,effective_to.gt.${periodIso}`)
    .order("effective_from", { ascending: true });
  if (priceErr) throw new Error(`could not load price book: ${priceErr.message}`);

  // Ascending, so a later row overwrites an earlier one for the same key and
  // the newest in force survives — the row current_price picks with its
  // `order by effective_from desc limit 1`.
  const priceIndex = new Map<string, string>();
  for (const p of (priceRows ?? []) as Array<{
    service_type: string; plan_key: string; rate_model: string;
  }>) {
    priceIndex.set(priceKey(p.service_type, p.plan_key), p.rate_model);
  }

  /**
   * The rate model that will price this meter, or null if nothing will.
   *
   * Mirrors billing.current_price: an exact plan_key wins, and a key with no
   * row of its own falls back to the service's '*' row. The dry run has to
   * resolve the way the charge does — otherwise it confidently answers a
   * different question than the one it was asked, which is the failure mode
   * the dry run exists to prevent.
   */
  const resolveRateModel = (serviceType: string, planKey: string): string | null =>
    priceIndex.get(priceKey(serviceType, planKey))
    ?? priceIndex.get(priceKey(serviceType, "*"))
    ?? null;

  const byService = new Map<string, Meter[]>();
  for (const m of meters) {
    if (!byService.has(m.service_type)) byService.set(m.service_type, []);
    byService.get(m.service_type)!.push(m);
  }

  const lines: Line[] = [];

  for (const [serviceType, group] of byService) {
    const spec = SERVICES[serviceType];
    if (!spec) {
      // An unregistered service type is a problem: something opened a meter
      // this script does not know how to verify, and billing it blind is how
      // you charge for a resource that no longer exists.
      for (const m of group) {
        lines.push({ meter: m, outcome: "PROBLEM-error", detail: `no registry entry for '${serviceType}'` });
      }
      continue;
    }

    let resources: Map<string, Record<string, unknown>>;
    try {
      resources = await loadResources(db, spec, group.map((m) => m.service_id));
    } catch (e) {
      for (const m of group) {
        lines.push({ meter: m, outcome: "PROBLEM-error", detail: e instanceof Error ? e.message : String(e) });
      }
      continue;
    }

    for (const meter of group) {
      const res = resources.get(meter.service_id);

      if (!res) {
        lines.push({
          meter,
          outcome: "PROBLEM-no-resource",
          detail: `${spec.schema}.${spec.table} has no row ${meter.service_id} — meter outlived its resource`,
        });
        continue;
      }

      const statusCol = statusColumnOf(spec);
      const status = statusCol === null ? "exists" : String(res[statusCol] ?? "");
      if (!spec.billableStatuses.includes(status)) {
        if (spec.nonBillableStatuses?.includes(status)) {
          lines.push({ meter, outcome: "skipped-not-billable", detail: `status=${status}` });
        } else {
          lines.push({
            meter,
            outcome: "PROBLEM-unknown-status",
            detail: `status=${status} is in neither billable nor non-billable list`,
          });
        }
        continue;
      }

      // Quantity for per-GB pricing. Measured, never assumed: an empty bucket
      // is a real 0 and must be passed as 0 rather than omitted, because
      // charge_service_hour refuses a null quantity instead of reading it as
      // free.
      let quantity: number | null = null;
      if (spec.bytesColumn) {
        const bytes = Number(res[spec.bytesColumn] ?? 0);
        quantity = bytes / (1024 ** 3);
      } else if (spec.table === "gpu_network_volumes") {
        quantity = Number(res.size_gb ?? 0);
      } else if (serviceType === "gpu_pod_storage") {
        // Container disk plus pod volume. A network volume attached to the pod
        // is NOT counted here — it has its own meter and its own price, and
        // counting it twice is the kind of error that only shows up in a
        // customer's invoice.
        quantity = Number(res.container_disk_gb ?? 0) + Number(res.volume_gb ?? 0);
      }

      // Upstream cost for markup pricing (GPU: RunPod's per-GPU hourly price;
      // resold compute: the rate frozen onto the server row at create time).
      //
      // Required ONLY when the resolved row is actually a markup. Compute holds
      // both models at once — self-hosted plans are fixed_hourly and ignore
      // upstream cost entirely — so refusing to bill a fixed-rate plan over a
      // number it never reads would stop billing on plans that price perfectly
      // well. The demand for an upstream cost has to follow the rate model, not
      // the service.
      let upstreamCost: number | null = null;
      if (spec.upstreamCostColumn) {
        const raw = res[spec.upstreamCostColumn];
        if (raw === null || raw === undefined) {
          if (resolveRateModel(meter.service_type, meter.plan_key) === "markup") {
            lines.push({
              meter,
              outcome: "PROBLEM-error",
              detail: `${spec.upstreamCostColumn} is null — cannot price a markup without an upstream cost`,
            });
            continue;
          }
        } else {
          upstreamCost = Number(raw);
        }
      }

      // Units: prefer the live resource (a resized cluster changes node count)
      // and fall back to what the meter recorded.
      const units = spec.unitsColumn
        ? Number(res[spec.unitsColumn] ?? meter.units)
        : Number(meter.units);

      if (!args.apply) {
        // A dry run that reports "would-charge" for a meter with no price is
        // worse than no dry run: it is the false confidence that makes the
        // pre-cutover comparison meaningless. Resolve the price here so the
        // dry run answers the same question the real run would.
        //
        // This caught `ubuntu-8c-85g`, whose plan_slug is NULL — its meter
        // falls back to plan_key '*', for which no compute price existed.
        // Compute now HAS a '*' row (the resold passthrough), so that shape
        // prices instead of stalling — as does every Linode type key.
        if (!resolveRateModel(meter.service_type, meter.plan_key)) {
          lines.push({
            meter,
            outcome: "no-price",
            detail: `no live price for ${meter.service_type}/${meter.plan_key}`,
          });
          continue;
        }
        lines.push({ meter, outcome: "would-charge", detail: describeInputs(quantity, upstreamCost, units) });
        continue;
      }

      const { data, error } = await db.schema("billing").rpc("charge_service_hour", {
        p_service_type: meter.service_type,
        p_service_id: meter.service_id,
        p_user_id: meter.user_id,
        p_period_start: periodIso,
        p_plan_key: meter.plan_key,
        p_upstream_cost: upstreamCost,
        p_quantity: quantity,
        p_units: units,
      });

      if (error) {
        lines.push({ meter, outcome: "PROBLEM-error", detail: error.message });
      } else {
        lines.push({ meter, outcome: String(data) as Outcome, detail: describeInputs(quantity, upstreamCost, units) });
      }
    }
  }

  const code = report(lines, args);
  await recordRun(db, args, lines, startedAt);
  return code;
}

/**
 * Write this run to billing.sweep_runs so it can be read from outside the host.
 *
 * A failure to record is logged and does not change the exit code: the money
 * has already moved (or not) by now, and the dead-man will treat a missing run
 * row as "the sweep did not run", which is the correct alarm for a sweep that
 * ran and could not say so.
 */
async function recordRun(db: SupabaseClient, args: Args, lines: Line[], startedAt: Date): Promise<void> {
  const tally: Record<string, number> = {};
  for (const l of lines) tally[l.outcome] = (tally[l.outcome] ?? 0) + 1;

  const problems = lines
    .filter((l) => PROBLEM(l.outcome))
    .map((l) => ({
      service_type: l.meter.service_type,
      service_id: l.meter.service_id,
      user_id: l.meter.user_id,
      plan_key: l.meter.plan_key,
      outcome: l.outcome,
      detail: l.detail ?? null,
    }));

  const { error } = await db.schema("billing").from("sweep_runs").insert({
    period_start: args.period.toISOString(),
    started_at: startedAt.toISOString(),
    finished_at: new Date().toISOString(),
    mode: args.apply ? "apply" : "dry-run",
    meters: lines.length,
    charged: (tally["charged"] ?? 0) + (tally["charged-free"] ?? 0),
    problems: problems.length,
    outcomes: tally,
    problem_lines: problems,
    host: os.hostname(),
    git_sha: process.env.GIT_SHA ?? null,
  });

  if (error) {
    console.error(
      `[sweep] could not record this run in billing.sweep_runs: ${error.message} — ` +
      `the dead-man will report the sweep as not having run`
    );
  }
}

function describeInputs(q: number | null, u: number | null, units: number): string {
  const parts: string[] = [];
  if (q !== null) parts.push(`gb=${q.toFixed(3)}`);
  if (u !== null) parts.push(`upstream=$${u}`);
  if (units !== 1) parts.push(`units=${units}`);
  return parts.join(" ");
}

function report(lines: Line[], args: Args): number {
  const tally = new Map<Outcome, number>();
  for (const l of lines) tally.set(l.outcome, (tally.get(l.outcome) ?? 0) + 1);

  console.log("\n[sweep] outcomes");
  for (const [outcome, n] of [...tally].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(n).padStart(4)}  ${outcome}`);
  }

  const problems = lines.filter((l) => PROBLEM(l.outcome));
  if (problems.length > 0) {
    console.log("\n[sweep] PROBLEMS — these were NOT billed and need attention");
    for (const p of problems) {
      console.log(`  ${p.meter.service_type}/${p.meter.service_id}  ${p.outcome}  ${p.detail ?? ""}`);
    }
  }

  if (args.verbose) {
    console.log("\n[sweep] all meters");
    for (const l of lines) {
      console.log(`  ${l.meter.service_type}/${l.meter.service_id}  ${l.outcome}  ${l.detail ?? ""}`);
    }
  }

  // Deliberately loud: a sweep that found nothing to bill on a platform with
  // open meters is indistinguishable from a broken sweep, and telling those
  // apart six days late is what this whole rebuild is about.
  // 'charged-free' is a billed hour that a free-hours allowance covered. It
  // counts as billed — the hour was claimed and recorded — even though no money
  // moved. Leaving it out of this line would make a fleet on a free tier look
  // like a sweep that had stopped working.
  const charged = (tally.get("charged") ?? 0) + (tally.get("charged-free") ?? 0);
  const free = tally.get("charged-free") ?? 0;
  const wouldCharge = tally.get("would-charge") ?? 0;
  console.log(
    `\n[sweep] ${args.apply ? `charged ${charged}` : `would charge ${wouldCharge}`} of ${lines.length} meters` +
    `${free ? ` (${free} covered by free hours)` : ""}` +
    `${problems.length ? `, ${problems.length} PROBLEM(S)` : ""}`
  );

  return problems.length > 0 ? 1 : 0;
}

// Set exitCode and let the process end on its own rather than calling
// process.exit(). Forcing exit while the Supabase client still holds open
// handles aborts libuv on Windows ("Assertion failed: !(handle->flags &
// UV_HANDLE_CLOSING)"), which replaces our carefully chosen exit code with a
// crash — and the exit code is the one thing the dead-man monitor reads.
main()
  .then((code) => { process.exitCode = code; })
  .catch((e) => {
    console.error("[sweep] fatal:", e instanceof Error ? e.message : e);
    process.exitCode = 1;
  });

/**
 * DEAD-MAN ALERTING — the part that is not in this file, on purpose.
 *
 * A non-zero exit only helps if something is watching. What actually cost six
 * days of revenue was not that the worker crashed; it was that NOTHING OUTSIDE
 * THE WORKER NOTICED IT HAD STOPPED. systemd faithfully reported "activating"
 * forever and no one was looking at systemd.
 *
 * The paas-v2 lane has the same blind spot from the other direction: their
 * sweep-health check runs inside the same cluster it observes, so a cluster
 * outage silences the observer and the alarm at once. lib/paas/k8s/sweeps.ts
 * says so in its own header.
 *
 * So the monitor must live OUTSIDE this script's failure domain and assert on
 * the DATA, not on the process:
 *
 *     select max(period_start) from billing.service_charges;
 *
 * If that is more than ~2 hours behind now() while open meters exist, billing
 * has stopped, regardless of what any process claims about itself. That query
 * is cheap, needs no access to the host, and would have fired on
 * 2026-08-24 11:50 instead of being discovered on 2026-08-30.
 */
