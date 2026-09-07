import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/supabase/auth";
import { createServiceClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * Who is on the gateway and what they spend: orgs, their members (people),
 * and every API key with its own usage rollup.
 *
 * Attribution note that shapes this whole surface: inference.usage.user_id
 * is null on every row today — the gateway attributes a call to an ORG and
 * an API KEY, never to a person. So spend is reported per org and per key,
 * and people appear as org members (with the key's creator named on the
 * key) rather than as spenders. Inventing per-user spend from key ownership
 * would be a guess wearing a number's clothes.
 */

const PAGE_CAP = 1000;
const USAGE_PAGES = 20;

type UsageRow = {
  org_id: string | null;
  api_key_id: string | null;
  cost_cents: number | null;
  upstream_cost_cents: number | null;
  input_tokens: number | null;
  output_tokens: number | null;
  status: string;
  created_at: string;
};

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

    const [orgsRes, keysRes, membersRes] = await Promise.all([
      inference
        .from("orgs")
        .select(
          "id, slug, name, owner_user_id, billing_user_id, monthly_budget_cents, hard_cap_cents, zdr_default, region_pin, created_at, deleted_at",
        )
        .is("deleted_at", null),
      inference
        .from("api_keys")
        .select(
          "id, org_id, created_by_user_id, name, key_prefix, key_last_four, monthly_budget_cents, hard_cap_cents, rate_limit_rpm, key_tier, is_internal_service, zdr_enabled, semantic_cache_enabled, allowed_models, expires_at, last_used_at, revoked_at, created_at",
        )
        .order("created_at", { ascending: false }),
      inference
        .from("org_members")
        .select("id, org_id, user_id, role, status, joined_at, created_at"),
    ]);

    if (orgsRes.error || keysRes.error) {
      console.error(
        "[Admin AI] accounts query failed:",
        orgsRes.error?.message || keysRes.error?.message,
      );
      return NextResponse.json(
        { error: "Failed to load accounts" },
        { status: 500 },
      );
    }

    // ---- usage rollups, paged with a declared budget ----
    const usage: UsageRow[] = [];
    let truncated = false;
    for (let p = 0; p < USAGE_PAGES; p++) {
      const { data, error } = await inference
        .from("usage")
        .select(
          "org_id, api_key_id, cost_cents, upstream_cost_cents, input_tokens, output_tokens, status, created_at",
        )
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .range(p * PAGE_CAP, p * PAGE_CAP + PAGE_CAP - 1);
      if (error) break;
      const batch = (data ?? []) as UsageRow[];
      usage.push(...batch);
      if (batch.length < PAGE_CAP) break;
      if (p === USAGE_PAGES - 1) truncated = true;
    }

    type Roll = {
      requests: number;
      errors: number;
      tokens: number;
      revenueCents: number;
      upstreamCents: number;
      last: string | null;
    };
    const blank = (): Roll => ({
      requests: 0,
      errors: 0,
      tokens: 0,
      revenueCents: 0,
      upstreamCents: 0,
      last: null,
    });
    const byOrg = new Map<string, Roll>();
    const byKey = new Map<string, Roll>();
    const bump = (m: Map<string, Roll>, id: string, r: UsageRow) => {
      const roll = m.get(id) ?? blank();
      roll.requests += 1;
      if (r.status !== "success") roll.errors += 1;
      roll.tokens += Number(r.input_tokens ?? 0) + Number(r.output_tokens ?? 0);
      roll.revenueCents += Number(r.cost_cents ?? 0);
      roll.upstreamCents += Number(r.upstream_cost_cents ?? 0);
      if (!roll.last || r.created_at > roll.last) roll.last = r.created_at;
      m.set(id, roll);
    };
    for (const r of usage) {
      if (r.org_id) bump(byOrg, r.org_id, r);
      if (r.api_key_id) bump(byKey, r.api_key_id, r);
    }

    // ---- resolve people: org members + key creators ----
    const userIds = new Set<string>();
    for (const m of membersRes.data ?? []) {
      if (m.user_id) userIds.add(m.user_id as string);
    }
    for (const o of orgsRes.data ?? []) {
      if (o.owner_user_id) userIds.add(o.owner_user_id as string);
    }
    for (const k of keysRes.data ?? []) {
      if (k.created_by_user_id) userIds.add(k.created_by_user_id as string);
    }
    const profiles =
      userIds.size > 0
        ? await supabase
            .from("user_profiles")
            .select("id, username, display_name")
            .in("id", [...userIds])
        : { data: [], error: null };
    const nameOf = new Map<string, string>(
      (profiles.data ?? []).map((p) => [
        p.id as string,
        ((p.display_name as string | null) ??
          (p.username as string | null) ??
          "") as string,
      ]),
    );
    const person = (id: string | null) =>
      id ? { id, label: nameOf.get(id) || `${id.slice(0, 8)}…` } : null;

    const membersByOrg = new Map<
      string,
      { userId: string; label: string; role: string; status: string }[]
    >();
    for (const m of membersRes.data ?? []) {
      const list = membersByOrg.get(m.org_id as string) ?? [];
      list.push({
        userId: m.user_id as string,
        label: nameOf.get(m.user_id as string) || `${(m.user_id as string).slice(0, 8)}…`,
        role: m.role as string,
        status: m.status as string,
      });
      membersByOrg.set(m.org_id as string, list);
    }

    const cents = (n: number) => n / 100;
    type KeyOut = {
      id: string;
      orgId: string | null;
      label: string;
      masked: string;
      tier: string | null;
      internal: boolean;
      zdr: boolean;
      semanticCache: boolean;
      rateLimitRpm: number | null;
      modelAllowlist: number;
      monthlyBudgetUsd: number | null;
      hardCapUsd: number | null;
      createdBy: { id: string; label: string } | null;
      createdAt: string;
      expiresAt: string | null;
      lastUsedAt: string | null;
      revokedAt: string | null;
      usage: {
        requests: number;
        errors: number;
        tokens: number;
        revenueUsd: number;
        upstreamUsd: number;
      };
    };
    const keyRows: KeyOut[] = (keysRes.data ?? []).map(
      (k: Record<string, unknown>) => {
        const roll = byKey.get(k.id as string) ?? blank();
        return {
          id: k.id as string,
          orgId: k.org_id as string | null,
          label:
            (k.name as string | null) ||
            `${(k.key_prefix as string | null) ?? "key"}…${(k.key_last_four as string | null) ?? ""}`,
          masked: `${(k.key_prefix as string | null) ?? "sk"}…${(k.key_last_four as string | null) ?? "????"}`,
          tier: (k.key_tier as string | null) ?? null,
          internal: Boolean(k.is_internal_service),
          zdr: Boolean(k.zdr_enabled),
          semanticCache: Boolean(k.semantic_cache_enabled),
          rateLimitRpm: (k.rate_limit_rpm as number | null) ?? null,
          modelAllowlist: (k.allowed_models as string[] | null)?.length ?? 0,
          monthlyBudgetUsd:
            k.monthly_budget_cents === null
              ? null
              : cents(Number(k.monthly_budget_cents)),
          hardCapUsd:
            k.hard_cap_cents === null ? null : cents(Number(k.hard_cap_cents)),
          createdBy: person((k.created_by_user_id as string | null) ?? null),
          createdAt: k.created_at as string,
          expiresAt: (k.expires_at as string | null) ?? null,
          lastUsedAt: (k.last_used_at as string | null) ?? null,
          revokedAt: (k.revoked_at as string | null) ?? null,
          usage: {
            requests: roll.requests,
            errors: roll.errors,
            tokens: roll.tokens,
            revenueUsd: cents(roll.revenueCents),
            upstreamUsd: cents(roll.upstreamCents),
          },
        };
      },
    );

    const orgRows = (orgsRes.data ?? []).map((o: Record<string, unknown>) => {
      const roll = byOrg.get(o.id as string) ?? blank();
      const keys = keyRows.filter((k: KeyOut) => k.orgId === (o.id as string));
      return {
        id: o.id as string,
        label: (o.name as string) || (o.slug as string),
        slug: o.slug as string,
        owner: person((o.owner_user_id as string | null) ?? null),
        members: membersByOrg.get(o.id as string) ?? [],
        monthlyBudgetUsd:
          o.monthly_budget_cents === null
            ? null
            : cents(Number(o.monthly_budget_cents)),
        hardCapUsd:
          o.hard_cap_cents === null ? null : cents(Number(o.hard_cap_cents)),
        zdrDefault: Boolean(o.zdr_default),
        regionPin: (o.region_pin as string | null) ?? null,
        createdAt: o.created_at as string,
        keyCount: keys.length,
        liveKeyCount: keys.filter((k: KeyOut) => k.revokedAt === null).length,
        usage: {
          requests: roll.requests,
          errors: roll.errors,
          tokens: roll.tokens,
          revenueUsd: cents(roll.revenueCents),
          upstreamUsd: cents(roll.upstreamCents),
          marginUsd: cents(roll.revenueCents - roll.upstreamCents),
          lastRequestAt: roll.last,
        },
      };
    });

    orgRows.sort(
      (a: { usage: { revenueUsd: number } }, b: { usage: { revenueUsd: number } }) =>
        b.usage.revenueUsd - a.usage.revenueUsd,
    );

    return NextResponse.json({
      days,
      truncated,
      // usage.user_id is null platform-wide; state it so the UI never
      // implies per-person spend it cannot compute.
      perUserSpendAvailable: usage.some(
        (u) => (u as UsageRow & { user_id?: string | null }).user_id != null,
      ),
      totals: {
        orgs: orgRows.length,
        activeOrgs: orgRows.filter(
          (o: { usage: { requests: number } }) => o.usage.requests > 0,
        ).length,
        people: userIds.size,
        keys: keyRows.length,
        liveKeys: keyRows.filter((k: KeyOut) => k.revokedAt === null).length,
        keysUsed: keyRows.filter((k: KeyOut) => k.usage.requests > 0).length,
      },
      orgs: orgRows,
      keys: keyRows,
    });
  } catch (err) {
    console.error("[Admin AI] accounts unexpected error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
