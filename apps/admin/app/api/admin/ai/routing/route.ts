import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/supabase/auth";
import { createServiceClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * Where inference actually runs: upstream providers (openrouter, wokey…),
 * the per-model route table, and the RunPod GPU footprint — fine-tune jobs,
 * their serving pods, and always-on deployments.
 *
 * Two provider dimensions exist and they are not the same thing, so they
 * are reported separately rather than merged:
 *   - models.upstream_provider — where a model is CONFIGURED to run;
 *   - usage.provider — where a request ACTUALLY ran.
 * A configured route with no traffic and a provider serving traffic under
 * no configured route are both real states, and each is worth seeing.
 */

const PAGE_CAP = 1000;
const USAGE_PAGES = 20;

export async function GET(request: Request) {
  const admin = await requireAdmin();
  if (!admin.ok) {
    return NextResponse.json(
      { error: "Unauthorized - Admin access required" },
      { status: 403 },
    );
  }

  const { searchParams } = new URL(request.url);
  const days = Math.min(
    90,
    Math.max(1, parseInt(searchParams.get("days") || "30", 10) || 30),
  );
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  try {
    const supabase = await createServiceClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const inference = (supabase as any).schema("inference");

    const [modelsRes, routesRes, ftRes, depRes, orgsRes] = await Promise.all([
      inference
        .from("models")
        .select(
          "model_id, display_name, modality, serving_type, upstream_provider, preferred_provider, upstream_model_id, runpod_endpoint_id, serving_url, is_active, is_managed",
        ),
      inference
        .from("model_routes")
        .select(
          "id, model_id, provider, upstream_model_id, enabled, catalog_present, catalog_available, catalog_synced_at",
        ),
      inference
        .from("finetunes")
        .select(
          "id, org_id, name, base_model_id, status, gpu_sku, runpod_job_id, cost_cents, hourly_cost_cents, training_seconds, is_managed, serving_pod_id, serving_pod_state, serving_pod_gpu_sku, serving_pod_hourly_cents, serving_pod_started_at, serving_pod_stopped_at, serving_pod_auto_stop_at, serving_url, created_at, completed_at",
        )
        .order("created_at", { ascending: false })
        .limit(200),
      inference
        .from("deployments")
        .select(
          "id, org_id, name, gpu_sku, status, runpod_endpoint_id, autoscale, last_metered_at, deployed_at, created_at",
        )
        .neq("status", "deleted")
        .order("created_at", { ascending: false })
        .limit(100),
      inference.from("orgs").select("id, slug, name"),
    ]);

    if (modelsRes.error) {
      return NextResponse.json(
        { error: "Failed to load routing" },
        { status: 500 },
      );
    }

    // ---- actual traffic by provider, paged with declared budget ----
    type U = {
      provider: string | null;
      model_id: string | null;
      cost_cents: number | null;
      upstream_cost_cents: number | null;
      status: string;
      latency_ms: number | null;
    };
    const usage: U[] = [];
    let truncated = false;
    for (let p = 0; p < USAGE_PAGES; p++) {
      const { data, error } = await inference
        .from("usage")
        .select(
          "provider, model_id, cost_cents, upstream_cost_cents, status, latency_ms",
        )
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .range(p * PAGE_CAP, p * PAGE_CAP + PAGE_CAP - 1);
      if (error) break;
      const batch = (data ?? []) as U[];
      usage.push(...batch);
      if (batch.length < PAGE_CAP) break;
      if (p === USAGE_PAGES - 1) truncated = true;
    }

    type Roll = {
      requests: number;
      errors: number;
      revenueCents: number;
      upstreamCents: number;
      latencySum: number;
      latencyN: number;
    };
    const blank = (): Roll => ({
      requests: 0,
      errors: 0,
      revenueCents: 0,
      upstreamCents: 0,
      latencySum: 0,
      latencyN: 0,
    });
    const byProvider = new Map<string, Roll>();
    for (const u of usage) {
      const key = u.provider ?? "(unrecorded)";
      const r = byProvider.get(key) ?? blank();
      r.requests += 1;
      if (u.status !== "success") r.errors += 1;
      r.revenueCents += Number(u.cost_cents ?? 0);
      r.upstreamCents += Number(u.upstream_cost_cents ?? 0);
      if (u.latency_ms !== null) {
        r.latencySum += Number(u.latency_ms);
        r.latencyN += 1;
      }
      byProvider.set(key, r);
    }

    const orgOf = new Map<string, string>(
      (orgsRes.data ?? []).map(
        (o: { id: string; slug: string; name: string }) => [o.id, o.name || o.slug],
      ),
    );

    // ---- configured surface ----
    const models = (modelsRes.data ?? []) as Record<string, unknown>[];
    const configuredByProvider = new Map<string, { total: number; active: number }>();
    for (const m of models) {
      const p = (m.upstream_provider as string | null) ?? "(none)";
      const e = configuredByProvider.get(p) ?? { total: 0, active: 0 };
      e.total += 1;
      if (m.is_active) e.active += 1;
      configuredByProvider.set(p, e);
    }
    const servingTypes = new Map<string, number>();
    for (const m of models) {
      const t = (m.serving_type as string | null) ?? "(none)";
      servingTypes.set(t, (servingTypes.get(t) ?? 0) + 1);
    }

    const routes = (routesRes.data ?? []) as Record<string, unknown>[];
    const routeStats = new Map<
      string,
      { total: number; enabled: number; present: number; available: number }
    >();
    for (const r of routes) {
      const p = (r.provider as string | null) ?? "(none)";
      const e =
        routeStats.get(p) ?? { total: 0, enabled: 0, present: 0, available: 0 };
      e.total += 1;
      if (r.enabled) e.enabled += 1;
      if (r.catalog_present) e.present += 1;
      if (r.catalog_available) e.available += 1;
      routeStats.set(p, e);
    }

    const providerNames = [
      ...new Set([
        ...byProvider.keys(),
        ...configuredByProvider.keys(),
        ...routeStats.keys(),
      ]),
    ].filter((p) => p !== "(none)");

    const providers = providerNames
      .map((name) => {
        const roll = byProvider.get(name);
        const conf = configuredByProvider.get(name);
        const rt = routeStats.get(name);
        return {
          name,
          traffic: roll
            ? {
                requests: roll.requests,
                errors: roll.errors,
                errorRatePct:
                  roll.requests > 0 ? (roll.errors / roll.requests) * 100 : 0,
                revenueUsd: roll.revenueCents / 100,
                upstreamUsd: roll.upstreamCents / 100,
                marginUsd: (roll.revenueCents - roll.upstreamCents) / 100,
                avgLatencyMs:
                  roll.latencyN > 0 ? Math.round(roll.latencySum / roll.latencyN) : null,
              }
            : null,
          models: conf ? { total: conf.total, active: conf.active } : null,
          routes: rt ?? null,
        };
      })
      .sort((a, b) => (b.traffic?.requests ?? 0) - (a.traffic?.requests ?? 0));

    // ---- RunPod footprint ----
    const finetunes = (ftRes.data ?? []) as Record<string, unknown>[];
    const deployments = (depRes.data ?? []) as Record<string, unknown>[];
    const gpuSkus = new Map<string, number>();
    for (const f of finetunes) {
      const sku = (f.gpu_sku as string | null) ?? "(unspecified)";
      gpuSkus.set(sku, (gpuSkus.get(sku) ?? 0) + 1);
    }
    const livePods = finetunes.filter(
      (f) =>
        f.serving_pod_state !== null &&
        f.serving_pod_state !== "stopped" &&
        f.serving_pod_stopped_at === null,
    );

    return NextResponse.json({
      days,
      truncated,
      providers,
      servingTypes: [...servingTypes.entries()].map(([type, count]) => ({
        type,
        count,
      })),
      runpod: {
        // The RunPod surface is three things: training jobs, the pods that
        // serve finished fine-tunes, and always-on deployments.
        finetuneJobs: finetunes.length,
        finetuneJobsWithRunpodId: finetunes.filter((f) => f.runpod_job_id).length,
        trainingSpendUsd:
          finetunes.reduce((s, f) => s + Number(f.cost_cents ?? 0), 0) / 100,
        gpuSkus: [...gpuSkus.entries()]
          .map(([sku, count]) => ({ sku, count }))
          .sort((a, b) => b.count - a.count),
        livePods: livePods.length,
        deployments: deployments.length,
        activeDeployments: deployments.filter((d) => d.status === "active").length,
        pods: livePods.map((f) => ({
          id: f.id as string,
          name: (f.name as string | null) ?? "(unnamed)",
          org: f.org_id ? (orgOf.get(f.org_id as string) ?? "—") : "—",
          state: (f.serving_pod_state as string | null) ?? null,
          gpu: (f.serving_pod_gpu_sku as string | null) ?? null,
          hourlyUsd:
            f.serving_pod_hourly_cents === null
              ? null
              : Number(f.serving_pod_hourly_cents) / 100,
          startedAt: (f.serving_pod_started_at as string | null) ?? null,
          autoStopAt: (f.serving_pod_auto_stop_at as string | null) ?? null,
        })),
        recentJobs: finetunes.slice(0, 25).map((f) => ({
          id: f.id as string,
          name: (f.name as string | null) ?? "(unnamed)",
          org: f.org_id ? (orgOf.get(f.org_id as string) ?? "—") : "—",
          baseModel: (f.base_model_id as string | null) ?? null,
          status: f.status as string,
          gpu: (f.gpu_sku as string | null) ?? null,
          runpodJobId: (f.runpod_job_id as string | null) ?? null,
          costUsd: Number(f.cost_cents ?? 0) / 100,
          trainingSeconds: (f.training_seconds as number | null) ?? null,
          createdAt: f.created_at as string,
        })),
        deploymentRows: deployments.map((d) => ({
          id: d.id as string,
          name: (d.name as string | null) ?? "(unnamed)",
          org: d.org_id ? (orgOf.get(d.org_id as string) ?? "—") : "—",
          status: d.status as string,
          gpu: (d.gpu_sku as string | null) ?? null,
          endpointId: (d.runpod_endpoint_id as string | null) ?? null,
          lastMeteredAt: (d.last_metered_at as string | null) ?? null,
        })),
      },
    });
  } catch (err) {
    console.error("[Admin AI] routing unexpected error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
