import { ensureBalance, postProvisionBilling } from "@/config/billing-flow";
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
    role?: string;
    audit_context?: AuditContext;
  }) {
    const { userId, payload, role = 'user', audit_context } = input;

    const { initialCost, hourlyRate } = await getRatesForSpectrum();
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
      role
    );

    const serviceId = result.app?.id ?? result.cloudflare?.id;
    if (!serviceId) {
      throw makeError(
        "BILLING_REGISTRATION_FAILED",
        "Spectrum app created but missing service id for billing registration"
      );
    }

    try {
      await postProvisionBilling({
        userId,
        initialCost,
        hourlyRate,
        serviceId,
        serviceType: "spectrum",
        addActive: Billing.add_active_spectrum,
      });
    } catch {
      // Billing registration failed — roll back the Cloudflare app so it doesn't run for free
      const cleanupErrors: string[] = [];
      
      try {
        const cfId = result.cloudflare?.id;
        if (cfId) {
          await deleteSpectrumApp(cfId);
          console.warn('[SpectrumService.createApp] Rolled back Cloudflare app after billing failure');
        } else {
          console.error('[SpectrumService.createApp] Cannot roll back CF app: cloudflare.id missing');
        }
      } catch (cleanupErr) {
        const cfErrorMsg = cleanupErr instanceof Error ? cleanupErr.message : String(cleanupErr);
        cleanupErrors.push(`Cloudflare rollback failed: ${cfErrorMsg}`);
        console.error('[SpectrumService.createApp] Billing failed AND Cloudflare rollback failed:', cleanupErr);
      }
      
      // Roll back the Supabase row to avoid an orphaned record
      try {
        if (result.app?.id) {
          await Spectrum_Apps.delete(result.app.id);
          console.warn('[SpectrumService.createApp] Rolled back Supabase spectrum app row after billing failure');
        }
      } catch (dbCleanupErr) {
        const dbErrorMsg = dbCleanupErr instanceof Error ? dbCleanupErr.message : String(dbCleanupErr);
        cleanupErrors.push(`Supabase rollback failed: ${dbErrorMsg}`);
        console.error('[SpectrumService.createApp] Billing failed AND Supabase rollback failed:', dbCleanupErr);
      }
      
      // Log rollback issues server-side but do NOT expose internal resource IDs / error details to the client
      if (cleanupErrors.length > 0) {
        console.error('[SpectrumService.createApp] Rollback issues:', cleanupErrors.join(' | '));
      }

      throw makeError(
        "BILLING_REGISTRATION_FAILED",
        "Billing registration failed after provisioning. The app has been rolled back."
      );
    }

    // Audit log
    if (audit_context) {
      try {
        await AuditLogService.create({
          user_id: userId,
          user_role: audit_context.user_role || 'user',
          user_email: audit_context.user_email,
          action: 'create',
          service_type: 'network_ddos',
          service_id: serviceId,
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
          serviceId,
        })
      );
    } catch (notifErr) {
      console.warn('[SpectrumService.createApp] Notification failed:', notifErr);
    }

    return result; // { app: Supabase row, cloudflare: Cloudflare response }
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

  static async deleteApp(input: { appId: string; userId: string; isAdmin?: boolean; audit_context?: AuditContext }) {
    const { appId, userId, isAdmin = false, audit_context } = input;

    const existing = await Spectrum_Apps.get(appId);
    if (!existing.success || !existing.data) {
      throw makeError("NOT_FOUND", "Spectrum app not found");
    }
    // Admins can delete any user's app; regular users can only delete their own
    if (!isAdmin && existing.data.owner_id !== userId) {
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
      // Use the local Supabase UUID (existing.data.id), NOT appId (Cloudflare spectrum_id)
      // billing.active_spectrum.service_id is the Supabase row UUID set at create time
      // Always use the owner's userId for billing lookup (admin delete must still close the owner's billing)
      const billingUserId = String(existing.data.owner_id);
      const billingServiceId = (existing.data as { id?: string }).id ?? appId;
      await Billing.close_active_service("spectrum", {
        userId: billingUserId,
        serviceId: billingServiceId,
        failOnInsufficient: false,
      });
    } catch (billErr) {
      console.warn("[SpectrumService.deleteApp] Billing close failed:", billErr);
    }

    const result = await deleteSpectrumApp(appId);

    // Notification — always notify the app owner, not the requester (admin may differ)
    try {
      const notifyUserId = String(existing.data.owner_id);
      await NotificationService.create(
        createServiceNotification({
          userId: notifyUserId,
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
