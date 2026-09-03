import { Billing } from "@/lib/supabase/queries/billing";
import { createServiceClient } from "@/lib/supabase/server";
import { DOMAIN_ERROR_CODES, DomainServiceError } from "@/lib/domain-service/core/errors";
import type { DomainBillingPort } from "@/lib/domain-service/core/ports";

export function createDomainBillingAdapter(): DomainBillingPort {
  return {
    async chargeDomainPurchase(params) {
      const amount = Number(params.amount || 0);
      if (!Number.isFinite(amount) || amount < 0) {
        throw new DomainServiceError({
          code: DOMAIN_ERROR_CODES.BILLING_CHARGE_FAILED,
          message: "Invalid billing amount for domain purchase",
          details: { amount: params.amount },
        });
      }

      if (amount === 0) {
        return;
      }

      const balance = await Billing.get_balance(params.userId);
      if (balance < amount) {
        throw new DomainServiceError({
          code: DOMAIN_ERROR_CODES.INSUFFICIENT_CREDITS,
          message: `Insufficient credits. Required $${amount.toFixed(2)}, available $${balance.toFixed(2)}`,
          details: {
            required: amount,
            available: balance,
          },
        });
      }

      try {
        // The charge and its ledger row commit together. This used to deduct
        // and then fire the record off with .catch(console.warn) — so a failed
        // write left the customer charged for a domain with nothing in their
        // history saying so.
        await Billing.move_credit({
          userId: params.userId,
          amount,
          direction: "debit",
          type: "purchase",
          serviceType: "domain",
          description: `Domain purchase: ${params.domain}`,
          metadata: {
            domain: params.domain,
            purchase_request_id: params.purchaseRequestId,
            currency: params.currency,
          },
        });
      } catch (error: unknown) {
        const message = toErrorMessage(error);
        if (/insufficient (credit )?balance/i.test(message)) {
          throw new DomainServiceError({
            code: DOMAIN_ERROR_CODES.INSUFFICIENT_CREDITS,
            message: `Insufficient credits. Required $${amount.toFixed(2)}`,
          });
        }

        throw new DomainServiceError({
          code: DOMAIN_ERROR_CODES.BILLING_CHARGE_FAILED,
          message: `Domain billing charge failed: ${message}`,
        });
      }
    },

    async refundDomainPurchase(params) {
      const amount = Number(params.amount || 0);
      if (!Number.isFinite(amount) || amount <= 0) {
        return;
      }

      try {
        // A refund with no ledger row is worse than a charge with none: the
        // customer's balance rises and neither they nor support can say why.
        await Billing.move_credit({
          userId: params.userId,
          amount,
          direction: "credit",
          type: "refund",
          serviceType: "domain",
          description: `Domain purchase refund: ${params.domain}`,
          metadata: {
            domain: params.domain,
            purchase_request_id: params.purchaseRequestId,
            reason: params.reason,
            currency: params.currency,
          },
        });
      } catch (error: unknown) {
        throw new DomainServiceError({
          code: DOMAIN_ERROR_CODES.BILLING_CHARGE_FAILED,
          message: `Domain billing refund failed: ${toErrorMessage(error)}`,
        });
      }
    },

    async findDomainPurchaseSettlement(params) {
      const supabase = await createServiceClient();
      const { data, error } = await supabase
        .schema("billing")
        .from("transactions")
        .select("type, status")
        .eq("user_id", params.userId)
        .eq("service_type", "domain")
        .contains("metadata", { purchase_request_id: params.purchaseRequestId });

      if (error) {
        throw new DomainServiceError({
          code: DOMAIN_ERROR_CODES.INTERNAL_ERROR,
          message: `Failed to look up domain purchase settlement: ${error.message}`,
        });
      }

      const rows = data ?? [];
      return {
        charged: rows.some((row) => row.type === "purchase" && row.status === "completed"),
        refunded: rows.some((row) => row.type === "refund" && row.status === "completed"),
      };
    },

    async chargeRenewal(params) {
      const amount = Number(params.amount || 0);
      if (!Number.isFinite(amount) || amount <= 0) {
        throw new DomainServiceError({
          code: DOMAIN_ERROR_CODES.BILLING_CHARGE_FAILED,
          message: `Invalid renewal amount: ${params.amount}`,
        });
      }

      const balance = await Billing.get_balance(params.userId);
      if (balance < amount) {
        throw new DomainServiceError({
          code: DOMAIN_ERROR_CODES.INSUFFICIENT_CREDITS,
          message: `Insufficient credits for renewal. Required $${amount.toFixed(2)}, available $${balance.toFixed(2)}`,
          details: { required: amount, available: balance },
        });
      }

      try {
        // Renewals recur unattended, so an unrecorded one is the least likely
        // of the three to ever be noticed — and the most likely to be disputed
        // a year later.
        await Billing.move_credit({
          userId: params.userId,
          amount,
          direction: "debit",
          type: "purchase",
          serviceType: "domain",
          description: `Domain renewal: ${params.domain}`,
          metadata: { domain: params.domain, purchase_request_id: params.purchaseRequestId, currency: params.currency, renewal: true },
        });
      } catch (error: unknown) {
        const message = toErrorMessage(error);
        throw new DomainServiceError({
          code: /insufficient (credit )?balance/i.test(message) ? DOMAIN_ERROR_CODES.INSUFFICIENT_CREDITS : DOMAIN_ERROR_CODES.BILLING_CHARGE_FAILED,
          message: `Domain renewal billing failed: ${message}`,
        });
      }
    },
  };
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  if (typeof error === "string" && error.trim().length > 0) {
    return error;
  }

  if (error && typeof error === "object") {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message.trim().length > 0) {
      return message;
    }
  }

  return "Unknown billing error";
}
