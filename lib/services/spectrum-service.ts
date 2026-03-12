import { ensureBalance } from "@/config/billing-flow";
import {
  createSpectrumApp,
  deleteSpectrumApp,
  getSpectrumApp,
  listSpectrumApps,
  updateSpectrumApp,
} from "@/config/spectrum-functions";
import { getRatesForSpectrum } from "@/config/pricing";
import { Billing } from "@/lib/supabase/queries/billing";
import { Spectrum_Apps } from "@/lib/supabase/queries/spectrum_apps";
import type {
  CreateSpectrumAppPayload,
  UpdateSpectrumAppPayload,
} from "@/lib/validation/spectrum";

type ServiceError = Error & {
  code?: string;
  details?: Record<string, unknown>;
};

function makeError(
  code: string,
  message: string,
  details?: Record<string, unknown>
): ServiceError {
  const err = new Error(message) as ServiceError;
  err.code = code;
  if (details) {
    err.details = details;
  }
  return err;
}

export class SpectrumService {
  static async listApps(userId: string) {
    const result = await listSpectrumApps(userId);
    return result.local;
  }

  static async createApp(input: {
    userId: string;
    payload: CreateSpectrumAppPayload;
  }) {
    const { userId, payload } = input;

    const { initialCost } = await getRatesForSpectrum();
    const balanceCheck = await ensureBalance(userId, initialCost);
    if (!balanceCheck.ok) {
      throw makeError("INSUFFICIENT_CREDITS", "Insufficient credits", {
        balance: balanceCheck.balance,
        required: initialCost,
      });
    }

    const result = await createSpectrumApp(
      {
        ...payload,
        owner_id: userId,
      },
      "user"
    );

    return result.app;
  }

  static async getApp(input: { appId: string; userId: string }) {
    const { appId, userId } = input;
    const result = await getSpectrumApp(appId);

    if (!result.local) {
      throw makeError("NOT_FOUND", "Spectrum app not found");
    }
    if (result.local.owner_id !== userId) {
      throw makeError("FORBIDDEN", "Access denied");
    }

    return result;
  }

  static async updateApp(input: {
    appId: string;
    userId: string;
    payload: UpdateSpectrumAppPayload;
  }) {
    const { appId, userId, payload } = input;

    const existing = await Spectrum_Apps.get(appId);
    if (!existing.success || !existing.data) {
      throw makeError("NOT_FOUND", "Spectrum app not found");
    }
    if (existing.data.owner_id !== userId) {
      throw makeError("FORBIDDEN", "Access denied");
    }

    return updateSpectrumApp({
      ...payload,
      app_id: appId,
    });
  }

  static async deleteApp(input: { appId: string; userId: string }) {
    const { appId, userId } = input;

    const existing = await Spectrum_Apps.get(appId);
    if (!existing.success || !existing.data) {
      throw makeError("NOT_FOUND", "Spectrum app not found");
    }
    if (existing.data.owner_id !== userId) {
      throw makeError("FORBIDDEN", "Access denied");
    }

    try {
      await Billing.close_active_service("spectrum", {
        userId,
        serviceId: appId,
        failOnInsufficient: false,
      });
    } catch (billErr) {
      console.warn("[SpectrumService.deleteApp] Billing close failed:", billErr);
    }

    return deleteSpectrumApp(appId);
  }
}
