import { withV1Auth, v1Ok, v1Error } from "@/lib/api/v1-middleware";
import { Billing } from "@/lib/supabase/queries/billing";

/**
 * GET /api/v1/billing/transactions
 *
 * Returns paginated billing transaction history for the authenticated user.
 * Supports both session auth (browser) and PAT (API tokens).
 *
 * Query parameters:
 *   limit        number   Max records per page. Default 20, max 100.
 *   page         number   1-based page number. Default 1.
 *   type         string   Filter by: topup | refund | coupon | recurring | setup | usage | purchase
 *   service_type string   Filter by: database | kubernetes | objectspace | spectrum | platform_apps | domain | gpu_pod | compute | custom_image | inference_vector | inference_finetune | inference_serving | inference_deployment
 *   status       string   Filter by: pending | completed | failed
 *   from         string   ISO 8601 date — return transactions created after this time
 *   to           string   ISO 8601 date — return transactions created before this time
 *
 * Response:
 *   { data: Transaction[], meta: { page, limit, total, total_pages } }
 */
export const GET = withV1Auth("billing:transactions:list", async (req, auth) => {
  const url = new URL(req.url);

  const rawLimit = Number(url.searchParams.get("limit") || "20");
  const rawPage = Number(url.searchParams.get("page") || "1");
  const limit = Math.min(Number.isFinite(rawLimit) && rawLimit > 0 ? rawLimit : 20, 100);
  const page = Number.isFinite(rawPage) && rawPage > 0 ? Math.floor(rawPage) : 1;
  const offset = (page - 1) * limit;

  const type = url.searchParams.get("type") ?? undefined;
  const serviceType = url.searchParams.get("service_type") ?? undefined;
  const status = url.searchParams.get("status") ?? undefined;
  const from = url.searchParams.get("from") ?? undefined;
  const to = url.searchParams.get("to") ?? undefined;

  // Validate enum params — ignore unknown values rather than 400 so clients
  // don't break on future type additions.
  const validTypes = ["topup", "refund", "coupon", "recurring", "setup", "usage", "purchase"];
  const validServiceTypes = [
    "database", "kubernetes", "objectspace", "spectrum", "platform_apps", "domain",
    "gpu_pod", "compute", "custom_image",
    "inference_vector", "inference_finetune", "inference_serving", "inference_deployment",
  ];
  const validStatuses = ["pending", "completed", "failed"];

  try {
    const { transactions, total } = await Billing.get_transactions(auth.userId, {
      limit,
      offset,
      type: type && validTypes.includes(type) ? type : undefined,
      serviceType: serviceType && validServiceTypes.includes(serviceType) ? serviceType : undefined,
      status: status && validStatuses.includes(status) ? status : undefined,
      from,
      to,
    });

    return v1Ok(
      {
        data: transactions,
        meta: {
          page,
          limit,
          total,
          total_pages: Math.ceil(total / limit),
        },
      }
    );
  } catch (err) {
    console.error("[v1/billing/transactions]", err);
    return v1Error("INTERNAL_ERROR", 500, "Failed to fetch billing transactions");
  }
});
