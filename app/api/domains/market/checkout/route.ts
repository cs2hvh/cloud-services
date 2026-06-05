import { NextResponse } from "next/server";
import { authenticateUser } from "@/lib/auth/server-auth";
import { limitByUser } from "@/lib/cooldown/userbased";
import { getDomainMarketplaceService } from "@/lib/domain-service/marketplace";
import { DomainMarketplacePurchaseRequestSchema } from "@/lib/domain-service/contracts/schemas";
import { createDomainActor, resolveIdempotencyKey } from "@/lib/domain-service/http/request-context";
import { toDashboardDomainErrorResponse } from "@/lib/domain-service/http/dashboard-error-mapper";
import { validateRequest } from "@/lib/middleware/validate-request";
import { sendServiceEventEmail } from "@/lib/services/shared/service-event-email";

export async function POST(req: Request) {
  const auth = await authenticateUser();
  if (!auth.authenticated) return auth.response;

  try {
    const rl = await limitByUser(auth.user.id, {
      prefix: "rl:domain-market:checkout",
      limit: 60,
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
    const parsed = validateRequest(DomainMarketplacePurchaseRequestSchema, body);
    if (!parsed.success) return parsed.response;

    const service = getDomainMarketplaceService();
    const idempotencyKey = resolveIdempotencyKey(req, parsed.data.idempotency_key);
    const meta = (auth.user.user_metadata ?? {}) as Record<string, string>;
    const userName = (
      meta.full_name || meta.name || meta.display_name || meta.username || ""
    ).trim() || auth.user.email?.split("@")[0].replace(/[._-]+/g, " ") || undefined;
    const request = await service.createPurchaseRequest({
      actor: createDomainActor({
        req,
        userId: auth.user.id,
        userEmail: auth.user.email || undefined,
        userName,
      }),
      appId: parsed.data.app_id,
      domain: parsed.data.domain,
      idempotencyKey,
      metadata: {
        source: "domain-marketplace-checkout",
      },
    });

    // Notification-only: confirm the purchase to the owner once it's completed
    // (createPurchaseRequest charges + registers synchronously and throws on
    // failure, so a "completed" status here means the domain was bought).
    if (request.status === "completed") {
      await sendServiceEventEmail({
        userId: auth.user.id,
        userEmail: auth.user.email || null,
        serviceType: "Domain",
        serviceName: request.domain,
        event: "purchased",
        items: [
          { label: "Registration term", value: "1 year" },
          ...(request.purchase_price != null
            ? [{ label: "Price", value: `${request.purchase_price} ${request.currency}` }]
            : []),
          { label: "Auto-renew", value: "Enabled" },
        ],
        actionPath: "/dashboard/domains",
      });
    }

    return NextResponse.json(
      {
        data: request,
      },
      { status: 201 }
    );
  } catch (error: unknown) {
    return toDashboardDomainErrorResponse(error);
  }
}
