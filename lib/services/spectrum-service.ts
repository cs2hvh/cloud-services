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
import { AuditLogService } from "@/lib/audit";
import { NotificationService, createServiceNotification } from "@/lib/notifications";
import type {
  CreateSpectrumAppPayload,
  UpdateSpectrumAppPayload,
} from "@/lib/validation/spectrum";

type ServiceError = Error & {
  code?: string;
  details?: Record<string, unknown>;
};

export interface AuditContext {
  ip_address?: string;
  user_agent?: string;
  request_id?: string;
  user_email?: string;
  user_role?: 'user' | 'admin';
}

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
    audit_context?: AuditContext;
  }) {
    const { userId, payload, audit_context } = input;

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

    // Audit log
    if (audit_context) {
      try {
        await AuditLogService.create({
          user_id: userId,
          user_role: audit_context.user_role || 'user',
          user_email: audit_context.user_email,
          action: 'create',
          service_type: 'network_ddos',
          service_id: result.app?.spectrum_id || '',
          service_name: payload.protocol || 'spectrum-app',
          after_state: result.app as unknown as Record<string, unknown>,
          ip_address: audit_context.ip_address,
          user_agent: audit_context.user_agent,
          request_id: audit_context.request_id,
          metadata: { initial_cost: initialCost },
        });
      } catch (auditErr) {
        console.warn('[SpectrumService.createApp] Audit log failed:', auditErr);
      }
    }

    // Notification
    try {
      await NotificationService.create(
        createServiceNotification({
          userId,
          type: 'success',
          action: 'created',
          serviceType: 'spectrum',
          serviceName: payload.protocol || 'spectrum-app',
          serviceId: result.app?.spectrum_id || '',
        })
      );
    } catch (notifErr) {
      console.warn('[SpectrumService.createApp] Notification failed:', notifErr);
    }

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

  static async deleteApp(input: { appId: string; userId: string; audit_context?: AuditContext }) {
    const { appId, userId, audit_context } = input;

    const existing = await Spectrum_Apps.get(appId);
    if (!existing.success || !existing.data) {
      throw makeError("NOT_FOUND", "Spectrum app not found");
    }
    if (existing.data.owner_id !== userId) {
      throw makeError("FORBIDDEN", "Access denied");
    }

    // Audit log (before deletion, while we still have state)
    if (audit_context) {
      try {
        await AuditLogService.create({
          user_id: userId,
          user_role: audit_context.user_role || 'user',
          user_email: audit_context.user_email,
          action: 'delete',
          service_type: 'network_ddos',
          service_id: appId,
          service_name: existing.data.protocol || 'spectrum-app',
          before_state: existing.data as unknown as Record<string, unknown>,
          ip_address: audit_context.ip_address,
          user_agent: audit_context.user_agent,
          request_id: audit_context.request_id,
        });
      } catch (auditErr) {
        console.warn('[SpectrumService.deleteApp] Audit log failed:', auditErr);
      }
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

    const result = await deleteSpectrumApp(appId);

    // Notification
    try {
      await NotificationService.create(
        createServiceNotification({
          userId,
          type: 'success',
          action: 'deleted',
          serviceType: 'spectrum',
          serviceName: existing.data.protocol || 'spectrum-app',
          serviceId: appId,
        })
      );
    } catch (notifErr) {
      console.warn('[SpectrumService.deleteApp] Notification failed:', notifErr);
    }

    return result;
  }
}
