import { NextRequest, NextResponse } from "next/server";
import { authenticateUser } from "@/lib/auth/server-auth";
import { limitByUser } from "@/lib/cooldown/userbased";
import { getDomainService } from "@/lib/domain-service";
import {
  AddDomainRequestSchema,
  DomainListQuerySchema,
} from "@/lib/domain-service/contracts/schemas";
import {
  createDomainActor,
  resolveIdempotencyKey,
} from "@/lib/domain-service/http/request-context";
import {
  dashboardValidationError,
  toDashboardDomainErrorResponse,
} from "@/lib/domain-service/http/dashboard-error-mapper";

export async function GET(req: NextRequest) {
  const auth = await authenticateUser();
  if (!auth.authenticated) return auth.response;

  try {
    const url = new URL(req.url);
    const rawAppId = url.searchParams.get("app_id");
    const query = {
      ...(rawAppId !== null ? { app_id: rawAppId } : {}),
    };

    const parsed = DomainListQuerySchema.safeParse(query);
    if (!parsed.success) {
      return dashboardValidationError(
        "Invalid query parameters",
        parsed.error.flatten()
      );
    }

    const service = getDomainService();
    const domains = await service.listDomains({
      actor: createDomainActor({
        req,
        userId: auth.user.id,
        userEmail: auth.user.email || undefined,
      }),
      appId: parsed.data.app_id,
    });

    return NextResponse.json({
      success: true,
      domains,
      meta: {
        total: domains.length,
      },
    });
  } catch (error: unknown) {
    return toDashboardDomainErrorResponse(error);
  }
}

export async function POST(req: NextRequest) {
  const auth = await authenticateUser();
  if (!auth.authenticated) return auth.response;

  try {
    const rl = await limitByUser(auth.user.id, {
      prefix: "rl:add-domain",
      limit: 10,
      windowMs: 60_000,
    });
    if (!rl.allowed) {
      return NextResponse.json(
        { error: "Too Many Requests", message: `Retry after ${rl.retryAfterSec}s` },
        { status: 429 }
      );
    }

    const body = await req.json();
    const parsed = AddDomainRequestSchema.safeParse(body);
    if (!parsed.success) {
      return dashboardValidationError("Invalid request body", parsed.error.flatten());
    }

    const actor = createDomainActor({
      req,
      userId: auth.user.id,
      userEmail: auth.user.email || undefined,
    });

    const service = getDomainService();
    const existing = await service.listDomains({
      actor,
      appId: parsed.data.app_id,
    });

    if (existing.length >= 5) {
      return NextResponse.json(
        {
          error: "Domain limit reached",
          message: "Maximum 5 custom domains per app. Remove an existing domain to add a new one.",
        },
        { status: 403 }
      );
    }

    const result = await service.addDomain({
      actor,
      appId: parsed.data.app_id,
      domain: parsed.data.domain,
      idempotencyKey: resolveIdempotencyKey(req),
    });

    return NextResponse.json(
      {
        success: true,
        domain: result.domain,
        verification_instructions: result.verification_instructions,
        verification_required: result.verification_required,
        managed_zone_detected: result.managed_zone_detected,
        ownership_source: result.ownership_source,
        message: result.verification_required
          ? "Domain added successfully. Add the DNS TXT record to verify ownership."
          : "Domain added successfully. Ownership verified automatically for this managed domain.",
      },
      { status: 201 }
    );
  } catch (error: unknown) {
    return toDashboardDomainErrorResponse(error);
  }
}
