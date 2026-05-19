import { NextRequest, NextResponse } from "next/server";

import { authenticateUser } from "@/lib/auth/server-auth";
import { limitByUser } from "@/lib/cooldown/userbased";
import { logError } from "@/lib/api/error-sanitizer";
import { NameComRegistrarAdapter } from "@/lib/domain-service/integrations/namecom-registrar.adapter";
import {
  isValidDomain,
  normalizeDomain,
  resolveManagedZone,
  userOwnsDomain,
} from "@/lib/domain-service/http/domain-access";
import { createServiceClient } from "@/lib/supabase/server";

import { DEFAULT_MANAGED_NAMESERVERS, NAMECOM_MANAGED_NAMESERVER_RE } from "@/lib/domain-service/managed-nameservers";

const MIN_NAMESERVERS = 2;
const MAX_NAMESERVERS = 13;
const NAMESERVER_RE = /^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}\.?$/i;

function normalizeNameserver(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase().replace(/\.$/, "");
  if (!normalized || !NAMESERVER_RE.test(normalized)) return null;
  return normalized;
}

function parseNameservers(value: unknown): { ok: true; nameservers: string[] } | { ok: false; message: string } {
  if (!Array.isArray(value)) {
    return { ok: false, message: "Provide nameservers as an array." };
  }

  const invalidInput = value.some((item) => {
    if (typeof item !== "string") return true;
    if (!item.trim()) return false;
    return normalizeNameserver(item) === null;
  });

  if (invalidInput) {
    return { ok: false, message: "Use valid nameserver hostnames, for example ns1.example.com." };
  }

  const nameservers = Array.from(new Set(value.map(normalizeNameserver).filter(Boolean) as string[]));

  if (nameservers.length < MIN_NAMESERVERS) {
    return { ok: false, message: "Add at least two valid nameservers." };
  }

  if (nameservers.length > MAX_NAMESERVERS) {
    return { ok: false, message: `Use ${MAX_NAMESERVERS} or fewer nameservers.` };
  }

  return { ok: true, nameservers };
}

function sameNameservers(a: string[], b: string[]): boolean {
  const left = a.map((value) => value.trim().toLowerCase().replace(/\.$/, "")).filter(Boolean).sort();
  const right = b.map((value) => value.trim().toLowerCase().replace(/\.$/, "")).filter(Boolean).sort();
  if (left.length !== right.length) return false;
  return left.every((value, index) => value === right[index]);
}

function nameserverMode(nameservers: string[]): "managed" | "custom" {
  const normalized = nameservers.map((value) => value.trim().toLowerCase().replace(/\.$/, "")).filter(Boolean);
  if (sameNameservers(normalized, DEFAULT_MANAGED_NAMESERVERS)) return "managed";
  if (normalized.length >= MIN_NAMESERVERS && normalized.every((value) => NAMECOM_MANAGED_NAMESERVER_RE.test(value))) {
    return "managed";
  }
  return "custom";
}

export async function GET(req: NextRequest) {
  const auth = await authenticateUser();
  if (!auth.authenticated) return auth.response;

  try {
    const rl = await limitByUser(auth.user.id, {
      prefix: "rl:domains-registrar-get",
      limit: 30,
      windowMs: 60_000,
    });

    if (!rl.allowed) {
      return NextResponse.json(
        {
          error: "TOO_MANY_REQUESTS",
          message: `Retry after ${rl.retryAfterSec}s`,
        },
        { status: 429 }
      );
    }

    const url = new URL(req.url);
    const domain = normalizeDomain(url.searchParams.get("domain") || "");

    if (!domain || !isValidDomain(domain)) {
      return NextResponse.json(
        {
          error: "VALIDATION_ERROR",
          message: "Invalid domain query parameter",
        },
        { status: 400 }
      );
    }

    const supabase = await createServiceClient();
    let ownership: Awaited<ReturnType<typeof userOwnsDomain>>;
    try {
      ownership = await userOwnsDomain({
        supabase,
        userId: auth.user.id,
        domain,
      });
    } catch (error: unknown) {
      logError("domains/registrar/ownership", error);
      return NextResponse.json(
        {
          error: "INTERNAL_ERROR",
          message: "Failed to load domain ownership",
        },
        { status: 500 }
      );
    }

    if (!ownership.owned) {
      return NextResponse.json(
        {
          error: "NOT_FOUND",
          message: "Domain not found",
        },
        { status: 404 }
      );
    }

    const adapter = new NameComRegistrarAdapter();
    const managed = await resolveManagedZone(adapter, domain);

    if (!managed) {
      return NextResponse.json({
        data: {
          domain,
          managed: false,
          zone: null,
          autorenew_enabled: null,
          locked: null,
          privacy_enabled: null,
          expires_at: null,
          nameservers: [],
          nameserver_mode: "custom",
        },
      });
    }

    const domainInfo = await adapter.getDomain(managed.zone);
    const nameservers = Array.isArray(domainInfo.nameservers) ? domainInfo.nameservers : [];

    return NextResponse.json({
      data: {
        domain,
        managed: true,
        zone: managed.zone,
        host: managed.host,
        autorenew_enabled:
          typeof domainInfo.autorenewEnabled === "boolean" ? domainInfo.autorenewEnabled : null,
        locked: typeof domainInfo.locked === "boolean" ? domainInfo.locked : null,
        privacy_enabled: typeof domainInfo.privacyEnabled === "boolean" ? domainInfo.privacyEnabled : null,
        expires_at: domainInfo.expireDate || null,
        nameservers,
        nameserver_mode: nameserverMode(nameservers),
      },
    });
  } catch (error: unknown) {
    logError("domains/registrar/GET", error);
    return NextResponse.json(
      {
        error: "INTERNAL_ERROR",
        message: "Failed to load registrar settings",
      },
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest) {
  const auth = await authenticateUser();
  if (!auth.authenticated) return auth.response;

  try {
    const rl = await limitByUser(auth.user.id, {
      prefix: "rl:domains-registrar-update",
      limit: 20,
      windowMs: 60_000,
    });

    if (!rl.allowed) {
      return NextResponse.json(
        {
          error: "TOO_MANY_REQUESTS",
          message: `Retry after ${rl.retryAfterSec}s`,
        },
        { status: 429 }
      );
    }

    const body = await req.json();
    const domain = normalizeDomain(typeof body?.domain === "string" ? body.domain : "");
    const autorenewEnabled = body?.autorenew_enabled;
    const wantsNameserverUpdate = Array.isArray(body?.nameservers);
    const requestedNameserverMode = body?.nameserver_mode === "managed" ? "managed" : null;

    if (!domain || !isValidDomain(domain)) {
      return NextResponse.json(
        {
          error: "VALIDATION_ERROR",
          message: "Invalid domain in request body",
        },
        { status: 400 }
      );
    }

    if (typeof autorenewEnabled !== "boolean" && !wantsNameserverUpdate && requestedNameserverMode !== "managed") {
      return NextResponse.json(
        {
          error: "VALIDATION_ERROR",
          message: "Provide autorenew_enabled (boolean), nameservers (array), or nameserver_mode.",
        },
        { status: 400 }
      );
    }

    const parsedNameservers = wantsNameserverUpdate ? parseNameservers(body.nameservers) : null;
    if (parsedNameservers && !parsedNameservers.ok) {
      return NextResponse.json(
        {
          error: "VALIDATION_ERROR",
          message: parsedNameservers.message,
        },
        { status: 400 }
      );
    }

    const supabase = await createServiceClient();
    let ownership: Awaited<ReturnType<typeof userOwnsDomain>>;
    try {
      ownership = await userOwnsDomain({
        supabase,
        userId: auth.user.id,
        domain,
      });
    } catch (error: unknown) {
      logError("domains/registrar/ownership", error);
      return NextResponse.json(
        {
          error: "INTERNAL_ERROR",
          message: "Failed to load domain ownership",
        },
        { status: 500 }
      );
    }

    if (!ownership.owned) {
      return NextResponse.json(
        {
          error: "NOT_FOUND",
          message: "Domain not found",
        },
        { status: 404 }
      );
    }

    const adapter = new NameComRegistrarAdapter();
    const managed = await resolveManagedZone(adapter, domain);

    if (!managed) {
      return NextResponse.json(
        {
          error: "DOMAIN_NOT_MANAGED",
          message: "No platform-managed zone found for this domain.",
        },
        { status: 400 }
      );
    }

    const nextNameservers = requestedNameserverMode === "managed"
      ? DEFAULT_MANAGED_NAMESERVERS
      : parsedNameservers?.ok
        ? parsedNameservers.nameservers
        : null;

    if (nextNameservers) {
      const updated = await adapter.setNameservers(managed.zone, nextNameservers);
      const updatedNameservers = Array.isArray(updated.nameservers) ? updated.nameservers : nextNameservers;

      return NextResponse.json({
        success: true,
        data: {
          domain,
          managed: true,
          zone: managed.zone,
          host: managed.host,
          autorenew_enabled:
            typeof updated.autorenewEnabled === "boolean" ? updated.autorenewEnabled : null,
          locked: typeof updated.locked === "boolean" ? updated.locked : null,
          privacy_enabled: typeof updated.privacyEnabled === "boolean" ? updated.privacyEnabled : null,
          expires_at: updated.expireDate || null,
          nameservers: updatedNameservers,
          nameserver_mode: nameserverMode(updatedNameservers),
        },
      });
    }

    // Persist autorenew preference to DB BEFORE calling Name.com.
    // If the DB write fails we return 500 and the registrar is never touched —
    // the user can retry. If we called Name.com first and the DB write failed
    // silently, the renewal cron would still charge the user (stale metadata).
    const { data: purchaseReq } = await supabase
      .from("domain_purchase_requests")
      .select("id, metadata")
      .eq("user_id", auth.user.id)
      .eq("domain", domain)
      .eq("status", "completed")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (purchaseReq) {
      const { error: metaErr } = await supabase
        .from("domain_purchase_requests")
        .update({
          metadata: { ...(purchaseReq.metadata as Record<string, unknown> ?? {}), autorenew_enabled: autorenewEnabled },
          updated_at: new Date().toISOString(),
        })
        .eq("id", purchaseReq.id);

      if (metaErr) {
        return NextResponse.json(
          { error: "INTERNAL_ERROR", message: "Failed to save auto-renew preference" },
          { status: 500 }
        );
      }
    }

    const updated = await adapter.updateDomain(managed.zone, { autorenewEnabled });
    const updatedNameservers = Array.isArray(updated.nameservers) ? updated.nameservers : [];

    // Determine nameserver_mode from the update response. Only call getDomain if
    // updateDomain returned empty nameservers — avoids an extra API call in the
    // common case while still preserving the correct mode when the registrar omits them.
    let resolvedNameservers = updatedNameservers;
    let resolvedNameserverMode: "managed" | "custom";
    if (updatedNameservers.length > 0) {
      resolvedNameserverMode = nameserverMode(updatedNameservers);
    } else {
      const currentInfo = await adapter.getDomain(managed.zone);
      resolvedNameservers = Array.isArray(currentInfo.nameservers) ? currentInfo.nameservers : [];
      resolvedNameserverMode = nameserverMode(resolvedNameservers);
    }

    return NextResponse.json({
      success: true,
      data: {
        domain,
        managed: true,
        zone: managed.zone,
        host: managed.host,
        autorenew_enabled:
          typeof updated.autorenewEnabled === "boolean" ? updated.autorenewEnabled : null,
        locked: typeof updated.locked === "boolean" ? updated.locked : null,
        privacy_enabled: typeof updated.privacyEnabled === "boolean" ? updated.privacyEnabled : null,
        expires_at: updated.expireDate || null,
        nameservers: resolvedNameservers,
        nameserver_mode: resolvedNameserverMode,
      },
    });
  } catch (error: unknown) {
    logError("domains/registrar/PATCH", error);
    return NextResponse.json(
      {
        error: "INTERNAL_ERROR",
        message: "Failed to update registrar settings",
      },
      { status: 500 }
    );
  }
}
