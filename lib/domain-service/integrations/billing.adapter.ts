import { Billing } from "@/lib/supabase/queries/billing";
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
        const balanceAfter = await Billing.deduct(params.userId, amount);
        // Record purchase in billing.transactions (non-blocking)
        Billing.save_transaction({
          userId: params.userId,
          amount,
          status: "completed",
          type: "purchase",
          balanceAfter,
          serviceType: "domain",
          description: `Domain purchase: ${params.domain}`,
          metadata: {
            domain: params.domain,
            purchase_request_id: params.purchaseRequestId,
            currency: params.currency,
          },
        }).catch((err: unknown) => {
          console.warn("[DomainBilling] Failed to record purchase transaction:", toErrorMessage(err));
        });
      } catch (error: unknown) {
        const message = toErrorMessage(error);
        if (/insufficient balance/i.test(message)) {
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
        const result = await Billing.topup(params.userId, amount);
        // Record refund in billing.transactions (non-blocking)
        Billing.save_transaction({
          userId: params.userId,
          amount,
          status: "completed",
          type: "refund",
          balanceAfter: result.credit_balance,
          serviceType: "domain",
          description: `Domain purchase refund: ${params.domain}`,
          metadata: {
            domain: params.domain,
            purchase_request_id: params.purchaseRequestId,
            reason: params.reason,
            currency: params.currency,
          },
        }).catch((err: unknown) => {
          console.warn("[DomainBilling] Failed to record refund transaction:", toErrorMessage(err));
        });
      } catch (error: unknown) {
        throw new DomainServiceError({
          code: DOMAIN_ERROR_CODES.BILLING_CHARGE_FAILED,
          message: `Domain billing refund failed: ${toErrorMessage(error)}`,
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
