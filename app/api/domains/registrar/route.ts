import { NextRequest, NextResponse } from "next/server";

import { authenticateUser } from "@/lib/auth/server-auth";
import { limitByUser } from "@/lib/cooldown/userbased";
import { NameComRegistrarAdapter } from "@/lib/domain-service/integrations/namecom-registrar.adapter";
import {
  isValidDomain,
  normalizeDomain,
  resolveManagedZone,
  userOwnsDomain,
} from "@/lib/domain-service/http/domain-access";
import { createServiceClient } from "@/lib/supabase/server";

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
      return NextResponse.json(
        {
          error: "INTERNAL_ERROR",
          message: error instanceof Error ? error.message : "Failed to load domain ownership",
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
        },
      });
    }

    const domainInfo = await adapter.getDomain(managed.zone);

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
      },
    });
  } catch (error: unknown) {
    return NextResponse.json(
      {
        error: "INTERNAL_ERROR",
        message: error instanceof Error ? error.message : "Failed to load registrar settings",
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

    if (!domain || !isValidDomain(domain)) {
      return NextResponse.json(
        {
          error: "VALIDATION_ERROR",
          message: "Invalid domain in request body",
        },
        { status: 400 }
      );
    }

    if (typeof autorenewEnabled !== "boolean") {
      return NextResponse.json(
        {
          error: "VALIDATION_ERROR",
          message: "Provide autorenew_enabled (boolean) to update.",
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
      return NextResponse.json(
        {
          error: "INTERNAL_ERROR",
          message: error instanceof Error ? error.message : "Failed to load domain ownership",
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

    await adapter.updateDomain(managed.zone, { autorenewEnabled });

    const updated = await adapter.getDomain(managed.zone);

    return NextResponse.json({
      success: true,
      data: {
        domain,
        managed: true,
        zone: managed.zone,
        autorenew_enabled:
          typeof updated.autorenewEnabled === "boolean" ? updated.autorenewEnabled : null,
        locked: typeof updated.locked === "boolean" ? updated.locked : null,
        privacy_enabled: typeof updated.privacyEnabled === "boolean" ? updated.privacyEnabled : null,
        expires_at: updated.expireDate || null,
      },
    });
  } catch (error: unknown) {
    return NextResponse.json(
      {
        error: "INTERNAL_ERROR",
        message: error instanceof Error ? error.message : "Failed to update registrar settings",
      },
      { status: 500 }
    );
  }
}
