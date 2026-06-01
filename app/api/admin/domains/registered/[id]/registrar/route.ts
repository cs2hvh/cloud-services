import { NextResponse } from "next/server";
import { z } from "zod";
import { getDomainService } from "@/lib/domain-service";
import { DEFAULT_MANAGED_NAMESERVERS, NAMECOM_MANAGED_NAMESERVER_RE } from "@/lib/domain-service/managed-nameservers";
import { NameComRegistrarAdapter } from "@/lib/domain-service/integrations/namecom-registrar.adapter";
import { createServiceClient } from "@/lib/supabase/server";
import { createAdminDomainActor, logAdminDomainAction, requireDomainAdmin, resolveUserEmail } from "../../../_lib/admin-domain-utils";

const PatchSchema = z.object({
  autorenew_enabled: z.boolean().optional(),
  locked: z.boolean().optional(),
  privacy_enabled: z.boolean().optional(),
  nameserver_mode: z.enum(["managed", "custom"]).optional(),
  nameservers: z.array(z.string()).optional(),
});

const MIN_NAMESERVERS = 2;
const MAX_NAMESERVERS = 13;
const NAMESERVER_RE = /^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}\.?$/i;

async function loadDomain(id: string) {
  const supabase = await createServiceClient();
  const { data, error } = await supabase
    .from("platform_app_domains")
    .select("id, domain, user_id")
    .eq("id", id)
    .maybeSingle();

  if (error || !data) return null;
  return data;
}

function normalizeNameserver(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase().replace(/\.$/, "");
  if (!normalized || !NAMESERVER_RE.test(normalized)) return null;
  return normalized;
}

function parseNameservers(value: unknown): { ok: true; nameservers: string[] } | { ok: false; message: string } {
  if (!Array.isArray(value)) {
    return { ok: false, message: "Provide nameservers as an array." };
  }

  const invalidInput = value.some((item) => {
    if (typeof item !== "string") return true;
    if (!item.trim()) return false;
    return normalizeNameserver(item) === null;
  });

  if (invalidInput) {
    return { ok: false, message: "Use valid nameserver hostnames, for example ns1.example.com." };
  }

  const nameservers = Array.from(new Set(value.map(normalizeNameserver).filter(Boolean) as string[]));
  if (nameservers.length < MIN_NAMESERVERS) return { ok: false, message: "Add at least two valid nameservers." };
  if (nameservers.length > MAX_NAMESERVERS) return { ok: false, message: `Use ${MAX_NAMESERVERS} or fewer nameservers.` };
  return { ok: true, nameservers };
}

function sameNameservers(a: string[], b: string[]): boolean {
  const left = a.map((value) => value.trim().toLowerCase().replace(/\.$/, "")).filter(Boolean).sort();
  const right = b.map((value) => value.trim().toLowerCase().replace(/\.$/, "")).filter(Boolean).sort();
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function nameserverMode(nameservers: string[]): "managed" | "custom" {
  const normalized = nameservers.map((value) => value.trim().toLowerCase().replace(/\.$/, "")).filter(Boolean);
  if (sameNameservers(normalized, DEFAULT_MANAGED_NAMESERVERS)) return "managed";
  if (normalized.length >= MIN_NAMESERVERS && normalized.every((value) => NAMECOM_MANAGED_NAMESERVER_RE.test(value))) {
    return "managed";
  }
  return "custom";
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const adminCheck = await requireDomainAdmin();
  if (!adminCheck.ok) return adminCheck.response;

  const { id } = await params;
  const domain = await loadDomain(id);
  if (!domain) return NextResponse.json({ error: "Domain not found" }, { status: 404 });

  try {
    const data = await getDomainService().getRegistrarSettings({
      actor: createAdminDomainActor(req, domain.user_id, await resolveUserEmail(domain.user_id)),
      domainId: id,
    });

    if (!data.managed) return NextResponse.json({ data });

    const adapter = new NameComRegistrarAdapter();
    const live = await adapter.getDomain(data.zone);
    const nameservers = Array.isArray(live.nameservers) ? live.nameservers : [];

    return NextResponse.json({
      data: {
        ...data,
        nameservers,
        nameserver_mode: nameserverMode(nameservers),
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to load registrar settings";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const adminCheck = await requireDomainAdmin();
  if (!adminCheck.ok) return adminCheck.response;
  const { admin } = adminCheck;

  const body = await req.json().catch(() => ({}));
  const parsed = PatchSchema.safeParse(body ?? {});
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request body", details: parsed.error.flatten() }, { status: 400 });
  }

  const updates = parsed.data;
  if (
    updates.autorenew_enabled === undefined &&
    updates.locked === undefined &&
    updates.privacy_enabled === undefined &&
    updates.nameserver_mode === undefined &&
    updates.nameservers === undefined
  ) {
    return NextResponse.json({ error: "At least one registrar setting is required" }, { status: 400 });
  }

  const { id } = await params;
  const domain = await loadDomain(id);
  if (!domain) return NextResponse.json({ error: "Domain not found" }, { status: 404 });

  try {
    const actor = createAdminDomainActor(req, domain.user_id, await resolveUserEmail(domain.user_id));
    const hasSettingsUpdate =
      updates.autorenew_enabled !== undefined ||
      updates.locked !== undefined ||
      updates.privacy_enabled !== undefined;
    const data = hasSettingsUpdate
      ? await getDomainService().updateRegistrarSettings({
          actor,
          domainId: id,
          updates: {
            autorenew_enabled: updates.autorenew_enabled,
            locked: updates.locked,
            privacy_enabled: updates.privacy_enabled,
          },
        })
      : await getDomainService().getRegistrarSettings({ actor, domainId: id });

    if (!data.managed) {
      return NextResponse.json({ error: "Domain is not managed by the platform registrar" }, { status: 400 });
    }

    let nameservers: string[] | undefined;
    if (updates.nameserver_mode || updates.nameservers) {
      nameservers = updates.nameserver_mode === "managed"
        ? DEFAULT_MANAGED_NAMESERVERS
        : undefined;

      if (!nameservers) {
        const parsedNameservers = parseNameservers(updates.nameservers);
        if (!parsedNameservers.ok) {
          return NextResponse.json({ error: parsedNameservers.message }, { status: 400 });
        }
        nameservers = parsedNameservers.nameservers;
      }

      const adapter = new NameComRegistrarAdapter();
      const live = await adapter.setNameservers(data.zone, nameservers);
      nameservers = Array.isArray(live.nameservers) ? live.nameservers : nameservers;
    }

    await logAdminDomainAction({
      admin,
      req,
      action: "update",
      serviceId: id,
      serviceName: domain.domain,
      metadata: {
        event: "domain_registrar_settings_updated_by_admin",
        target_user_id: domain.user_id,
        zone: data.zone,
        updates: {
          ...(updates.autorenew_enabled !== undefined && { autorenew_enabled: updates.autorenew_enabled }),
          ...(updates.locked !== undefined && { locked: updates.locked }),
          ...(updates.privacy_enabled !== undefined && { privacy_enabled: updates.privacy_enabled }),
          ...(nameservers && { nameservers, nameserver_mode: nameserverMode(nameservers) }),
        },
      },
    });

    return NextResponse.json({
      data: {
        ...data,
        ...(nameservers && {
          nameservers,
          nameserver_mode: nameserverMode(nameservers),
        }),
      },
      message: `Registrar settings updated for ${domain.domain}`,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to update registrar settings";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
