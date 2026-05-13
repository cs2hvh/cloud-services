import { NextResponse } from "next/server";
import { AuditLogService } from "@/lib/audit";
import { createDomainActor } from "@/lib/domain-service/http/request-context";
import { createServiceClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/supabase/auth";
import type { ActorContext } from "@/lib/domain-service/core/types";

type AdminCheck = Awaited<ReturnType<typeof requireAdmin>>;

export async function requireDomainAdmin(): Promise<
  | { ok: true; admin: AdminCheck & { ok: true; userId: string; email: string } }
  | { ok: false; response: NextResponse }
> {
  const admin = await requireAdmin();
  if (!admin.ok || !admin.userId || !admin.email) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 403 }),
    };
  }

  return { ok: true, admin: { ...admin, ok: true, userId: admin.userId, email: admin.email } };
}

export function createAdminDomainActor(req: Request, ownerUserId: string, ownerEmail?: string): ActorContext {
  return createDomainActor({
    req,
    userId: ownerUserId,
    userEmail: ownerEmail,
    userRole: "admin",
  });
}

export async function resolveUserEmail(userId: string): Promise<string | undefined> {
  try {
    const supabase = await createServiceClient();
    const { data } = await supabase.auth.admin.getUserById(userId);
    return data?.user?.email || undefined;
  } catch {
    return undefined;
  }
}

export async function buildUserEmailMap(userIds: string[]): Promise<Map<string, string>> {
  const uniqueIds = [...new Set(userIds.filter(Boolean))];
  if (!uniqueIds.length) return new Map();

  const entries = await Promise.all(
    uniqueIds.map(async (userId) => [userId, await resolveUserEmail(userId)] as const)
  );

  const map = new Map<string, string>();
  entries.forEach(([userId, email]) => {
    if (email) map.set(userId, email);
  });
  return map;
}

export async function buildAppNameMap(appIds: string[]): Promise<Map<string, { name: string; slug: string }>> {
  const uniqueIds = [...new Set(appIds.filter(Boolean))];
  if (!uniqueIds.length) return new Map();

  try {
    const supabase = await createServiceClient();
    const { data } = await supabase
      .from("platform_apps")
      .select("id, name, slug")
      .in("id", uniqueIds);

    const map = new Map<string, { name: string; slug: string }>();
    (data ?? []).forEach((app: { id: string; name: string; slug: string }) => {
      map.set(app.id, { name: app.name, slug: app.slug });
    });
    return map;
  } catch {
    return new Map();
  }
}

export async function logAdminDomainAction(params: {
  admin: { userId: string; email: string };
  action: "create" | "update" | "delete";
  serviceId?: string;
  serviceName?: string;
  metadata?: Record<string, unknown>;
  req?: Request;
}) {
  const result = await AuditLogService.create({
    user_id: params.admin.userId,
    user_email: params.admin.email,
    user_role: "admin",
    action: params.action,
    service_type: "domain",
    service_id: params.serviceId,
    service_name: params.serviceName,
    metadata: params.metadata,
    user_agent: params.req?.headers.get("user-agent") || undefined,
  });

  if (!result.success) {
    const fallback = await AuditLogService.create({
      user_id: params.admin.userId,
      user_email: params.admin.email,
      user_role: "admin",
      action: params.action,
      service_type: "platform_apps",
      service_id: params.serviceId,
      service_name: params.serviceName,
      metadata: {
        ...(params.metadata || {}),
        domain_service_type: "domain",
      },
      user_agent: params.req?.headers.get("user-agent") || undefined,
    });

    if (!fallback.success) {
      console.warn("[admin/domains] audit log failed", fallback.error || result.error);
    }
  }
}
