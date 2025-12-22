import { createServiceClient } from "../server";
import { handleQueryError } from "@/lib/utils/error-handler";
import { Promocode, Coupon } from "../types";
import { Billing } from "./billing";

interface PromocodeRedemptionEntry {
  userId?: string;
  email?: string;
  redeemedAt?: string;
}

const isPromocodeRedemptionEntry = (
  value: unknown
): value is PromocodeRedemptionEntry => {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const record = value as Record<string, unknown>;
  const hasUserId = typeof record.userId === "string";
  const hasEmail = typeof record.email === "string";
  const redeemedAtValid =
    record.redeemedAt === undefined || typeof record.redeemedAt === "string";
  return redeemedAtValid && (hasUserId || hasEmail);
};

const getPromocodeRedemptions = (
  value: Promocode["redeem_by"]
): PromocodeRedemptionEntry[] => {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter(isPromocodeRedemptionEntry);
};

export const Promocodes = {
  // Admin: Create new promocode
  create: async (data: {
    code: string;
    amount: number;
    valid_till: string;
    coupon_type: string;
    max_redemptions?: number;
    created_by: string;
  }): Promise<{ success: boolean; data?: Promocode; error?: string }> => {
    try {
      const supabase = await createServiceClient();

      // Check if code already exists
      const { data: existing } = await supabase
        .schema("billing")
        .from("promocodes")
        .select("code")
        .eq("code", data.code)
        .maybeSingle();

      if (existing) {
        return { success: false, error: "Promo code already exists" };
      }

      const { data: newPromo, error } = await supabase
        .schema("billing")
        .from("promocodes")
        .insert({
          code: data.code,
          amount: data.amount,
          valid_till: data.valid_till,
          coupon_type: data.coupon_type,
          max_redemptions: data.max_redemptions || null,
          created_by: data.created_by,
          redeem_by: [],
          is_active: true,
        })
        .select()
        .single();

      if (error) {
        handleQueryError("Create promocode", error, "Promocodes");
        return { success: false, error: error.message };
      }

      return { success: true, data: newPromo };
    } catch (err) {
      handleQueryError("Create promocode", err, "Promocodes");
      return { success: false, error: "Failed to create promocode" };
    }
  },

  // Admin: Update promocode
  update: async (
    id: string,
    data: {
      amount?: number;
      valid_till?: string;
      coupon_type?: string;
      max_redemptions?: number;
      is_active?: boolean;
    }
  ): Promise<{ success: boolean; data?: Promocode; error?: string }> => {
    try {
      const supabase = await createServiceClient();

      const { data: updated, error } = await supabase
        .schema("billing")
        .from("promocodes")
        .update({
          ...data,
          updated_at: new Date().toISOString(),
        })
        .eq("id", id)
        .select()
        .single();

      if (error) {
        handleQueryError("Update promocode", error, "Promocodes");
        return { success: false, error: error.message };
      }

      return { success: true, data: updated };
    } catch (err) {
      handleQueryError("Update promocode", err, "Promocodes");
      return { success: false, error: "Failed to update promocode" };
    }
  },

  // Admin: Delete promocode (hard delete from database)
  delete: async (id: string): Promise<{ success: boolean; error?: string }> => {
    try {
      const supabase = await createServiceClient();

      const { error } = await supabase
        .schema("billing")
        .from("promocodes")
        .delete()
        .eq("id", id);

      if (error) {
        handleQueryError("Delete promocode", error, "Promocodes");
        return { success: false, error: error.message };
      }

      return { success: true };
    } catch (err) {
      handleQueryError("Delete promocode", err, "Promocodes");
      return { success: false, error: "Failed to delete promocode" };
    }
  },

  // Admin: Get all promocodes
  get_all: async (): Promise<Coupon[]> => {
    try {
      const supabase = await createServiceClient();

      const { data, error } = await supabase
        .schema("billing")
        .from("promocodes")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) {
        handleQueryError("Get all promocodes", error, "Promocodes");
        return [];
      }

      // Calculate redemption count for each coupon
      return (data || []).map((promo) => {
        const redeemBy = getPromocodeRedemptions(promo.redeem_by);
        return {
          ...promo,
          redemption_count: redeemBy.length,
        };
      });
    } catch (err) {
      handleQueryError("Get all promocodes", err, "Promocodes");
      return [];
    }
  },

  // Get promocode by ID
  get_by_id: async (id: string): Promise<Promocode | null> => {
    try {
      const supabase = await createServiceClient();

      const { data, error } = await supabase
        .schema("billing")
        .from("promocodes")
        .select("*")
        .eq("id", id)
        .single();

      if (error) {
        handleQueryError("Get promocode by ID", error, "Promocodes");
        return null;
      }

      return data;
    } catch (err) {
      handleQueryError("Get promocode by ID", err, "Promocodes");
      return null;
    }
  },

  // Get promocode by code
  get_by_code: async (code: string): Promise<Promocode | null> => {
    try {
      const supabase = await createServiceClient();

      const { data, error } = await supabase
        .schema("billing")
        .from("promocodes")
        .select("*")
        .eq("code", code)
        .eq("is_active", true)
        .single();

      if (error) {
        handleQueryError("Get promocode by code", error, "Promocodes");
        return null;
      }

      return data;
    } catch (err) {
      handleQueryError("Get promocode by code", err, "Promocodes");
      return null;
    }
  },

  // User: Get available promocodes (not yet redeemed by user)
  get_available_for_user: async (
    userId: string,
    email: string
  ): Promise<Promocode[]> => {
    try {
      const supabase = await createServiceClient();

      const { data, error } = await supabase
        .schema("billing")
        .from("promocodes")
        .select("*")
        .eq("is_active", true)
        .gte("valid_till", new Date().toISOString());

      if (error) {
        handleQueryError(
          "Get available promocodes for user",
          error,
          "Promocodes"
        );
        return [];
      }

      // Filter out coupons already redeemed by this user
      const available = (data || []).filter((promo) => {
        const redeemBy = getPromocodeRedemptions(promo.redeem_by);
        const hasRedeemed = redeemBy.some(
          (entry) => entry.userId === userId || entry.email === email
        );

        // Check max redemptions limit if set
        if (promo.max_redemptions && redeemBy.length >= promo.max_redemptions) {
          return false;
        }

        return !hasRedeemed;
      });

      return available;
    } catch (err) {
      handleQueryError("Get available promocodes for user", err, "Promocodes");
      return [];
    }
  },

  // Validate coupon code
  validate_code: async (
    code: string,
    userId: string,
    email: string
  ): Promise<{
    valid: boolean;
    error?: string;
    data?: Promocode;
  }> => {
    try {
      const supabase = await createServiceClient();

      const { data: promo, error } = await supabase
        .schema("billing")
        .from("promocodes")
        .select("*")
        .eq("code", code)
        .single();

      if (error || !promo) {
        return {
          valid: false,
          error: "You have entered an invalid promo code",
        };
      }
      if (promo.is_active === false) {
        return { valid: false, error: "This promo code is not active" };
      }

      // Check expiration
      if (new Date(promo.valid_till) < new Date()) {
        return { valid: false, error: "Promo code has expired" };
      }

      // Check if user already redeemed
      const redeemBy = getPromocodeRedemptions(promo.redeem_by);
      const alreadyRedeemed = redeemBy.some(
        (entry) => entry.userId === userId || entry.email === email
      );

      if (alreadyRedeemed) {
        return {
          valid: false,
          error: "You have already redeemed this promo code",
        };
      }

      // Check max redemptions
      if (promo.max_redemptions && redeemBy.length >= promo.max_redemptions) {
        return { valid: false, error: "Promo code redemption limit reached" };
      }

      return { valid: true, data: promo };
    } catch (err) {
      handleQueryError("Validate promocode", err, "Promocodes");
      return { valid: false, error: "Failed to validate promo code" };
    }
  },

  // User: Redeem promocode
  redeem: async (
    code: string,
    userId: string,
    email: string
  ): Promise<{
    success: boolean;
    balance?: number;
    amount?: number;
    error?: string;
  }> => {
    try {
      const supabase = await createServiceClient();

      // Validate the code first
      const validation = await Promocodes.validate_code(code, userId, email);
      if (!validation.valid) {
        return { success: false, error: validation.error };
      }

      const promo = validation.data;
      if (!promo) {
        return { success: false, error: "Promo code not found" };
      }

      // Update redeem_by array
      const redeemBy = [
        ...getPromocodeRedemptions(promo.redeem_by),
        { userId, email, redeemedAt: new Date().toISOString() },
      ];

      // Check if we need to deactivate the coupon (for limited type)
      const shouldDeactivate =
        promo.coupon_type === "limited" &&
        promo.max_redemptions &&
        redeemBy.length >= promo.max_redemptions;

      // Update promocode
      const { error: updateError } = await supabase
        .schema("billing")
        .from("promocodes")
        .update({
          redeem_by: redeemBy as Promocode["redeem_by"],
          updated_at: new Date().toISOString(),
          ...(shouldDeactivate && { is_active: false }),
        })
        .eq("id", promo.id);

      if (updateError) {
        handleQueryError(
          "Update promocode redeem_by",
          updateError,
          "Promocodes"
        );
        return { success: false, error: "Failed to redeem promo code" };
      }

      // Add amount to user balance
      const topupResult = await Billing.topup(userId, promo.amount);

      return {
        success: true,
        balance: topupResult.credit_balance,
        amount: promo.amount,
      };
    } catch (err) {
      handleQueryError("Redeem promocode", err, "Promocodes");
      return { success: false, error: "Failed to redeem promo code" };
    }
  },
};
