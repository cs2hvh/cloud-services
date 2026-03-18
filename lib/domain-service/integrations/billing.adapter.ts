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
        await Billing.deduct(params.userId, amount);
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
        await Billing.topup(params.userId, amount);
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
