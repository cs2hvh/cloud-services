import { NextRequest, NextResponse } from "next/server";

import { authenticateUser } from "@/lib/auth/server-auth";
import { limitByUser } from "@/lib/cooldown/userbased";
import { logError } from "@/lib/api/error-sanitizer";
import { DomainServiceError, mapDomainErrorToHttp } from "@/lib/domain-service/core/errors";
import {
  NameComRegistrarAdapter,
  type NameComRecordType,
} from "@/lib/domain-service/integrations/namecom-registrar.adapter";
import {
  isValidDomain,
  normalizeDomain,
  resolveManagedZone,
  userOwnsDomain,
} from "@/lib/domain-service/http/domain-access";
import { createServiceClient } from "@/lib/supabase/server";
import { DEFAULT_MANAGED_NAMESERVERS, NAMECOM_MANAGED_NAMESERVER_RE } from "@/lib/domain-service/managed-nameservers";

type NameComDnsRecordView = {
  id: number | null;
  host: string;
  type: string;
  answer: string;
  ttl: number;
  priority: number | null;
  fqdn: string | null;
};

const SUPPORTED_DNS_TYPES: NameComRecordType[] = [
  "A",
  "AAAA",
  "ANAME",
  "CNAME",
  "MX",
  "NS",
  "SRV",
  "TXT",
];

const MIN_NAMESERVERS = 2;

function normalizeHost(host: string | null | undefined): string {
  if (!host || host === "") return "@";
  return host;
}

function toProviderHost(host: string): string {
  return host === "@" ? "" : host;
}

function mapRecord(record: {
  id?: number;
  host?: string | null;
  type?: string | null;
  answer?: string;
  ttl?: number;
  priority?: number;
  fqdn?: string;
}): NameComDnsRecordView {
  return {
    id: typeof record.id === "number" ? record.id : null,
    host: normalizeHost(record.host || null),
    type: record.type || "UNKNOWN",
    answer: record.answer || "",
    ttl: Number(record.ttl || 300),
    priority: typeof record.priority === "number" ? record.priority : null,
    fqdn: record.fqdn || null,
  };
}

function parseTtl(value: unknown): number {
  const ttl = typeof value === "number" ? value : Number(value ?? 300);
  if (!Number.isFinite(ttl)) return 300;
  return Math.min(86400, Math.max(60, Math.floor(ttl)));
}

function parsePriority(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const priority = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(priority) || priority < 0 || priority > 65535) return null;
  return priority;
}

function isSupportedDnsType(value: string): value is NameComRecordType {
  return SUPPORTED_DNS_TYPES.includes(value as NameComRecordType);
}

function sameNameservers(a: string[], b: string[]): boolean {
  const left = a.map((value) => value.trim().toLowerCase().replace(/\.$/, "")).filter(Boolean).sort();
  const right = b.map((value) => value.trim().toLowerCase().replace(/\.$/, "")).filter(Boolean).sort();
  if (left.length !== right.length) return false;
  return left.every((value, index) => value === right[index]);
}

async function hasManagedNameservers(adapter: NameComRegistrarAdapter, zone: string): Promise<boolean> {
  const domain = await adapter.getDomain(zone);
  const nameservers = Array.isArray(domain.nameservers) ? domain.nameservers : [];
  const normalized = nameservers.map((value) => value.trim().toLowerCase().replace(/\.$/, "")).filter(Boolean);
  return (
    sameNameservers(normalized, DEFAULT_MANAGED_NAMESERVERS) ||
    (normalized.length >= MIN_NAMESERVERS && normalized.every((value) => NAMECOM_MANAGED_NAMESERVER_RE.test(value)))
  );
}

async function ensureOwnedDomain(input: { userId: string; domain: string }): Promise<{
  ok: true;
} | {
  ok: false;
  response: NextResponse;
}> {
  try {
    const supabase = await createServiceClient();
    const ownership = await userOwnsDomain({
      supabase,
      userId: input.userId,
      domain: input.domain,
    });

    if (!ownership.owned) {
      return {
        ok: false,
        response: NextResponse.json(
          {
            error: "NOT_FOUND",
            message: "Domain not found",
          },
          { status: 404 }
        ),
      };
    }

    return { ok: true };
  } catch {
    return {
      ok: false,
      response: NextResponse.json(
        {
          error: "INTERNAL_ERROR",
          message: "Failed to load domain ownership",
        },
        { status: 500 }
      ),
    };
  }
}

function toDnsErrorResponse(error: unknown, fallbackMessage: string): NextResponse {
  if (error instanceof DomainServiceError) {
    if (error.message.toLowerCase().includes("contact verification hold")) {
      return NextResponse.json(
        {
          error: "CONTACT_VERIFICATION_HOLD",
          message:
            "DNS changes are temporarily on hold while the domain's registrant contact is verified. " +
            "This usually clears automatically within a few minutes — please retry shortly, or contact support if it persists.",
        },
        { status: 400 }
      );
    }
    const http = mapDomainErrorToHttp(error);
    return NextResponse.json({ error: http.code, message: http.message }, { status: http.status });
  }
  return NextResponse.json({ error: "INTERNAL_ERROR", message: fallbackMessage }, { status: 500 });
}

export async function GET(req: NextRequest) {
  const auth = await authenticateUser();
  if (!auth.authenticated) return auth.response;

  try {
    const rl = await limitByUser(auth.user.id, {
      prefix: "rl:domains-dns-records",
      limit: 40,
      windowMs: 60_000,
    });

    if (!rl.allowed) {
      return NextResponse.json(
        {
          error: "TOO_MANY_REQUESTS",
          message: `Retry after ${rl.retryAfterSec}s`,
        },
        { status: 429 }
      );
    }

    const url = new URL(req.url);
    const rawDomain = url.searchParams.get("domain");
    const domain = normalizeDomain(rawDomain || "");

    if (!domain || !isValidDomain(domain)) {
      return NextResponse.json(
        {
          error: "VALIDATION_ERROR",
          message: "Invalid domain query parameter",
        },
        { status: 400 }
      );
    }

    const ownership = await ensureOwnedDomain({ userId: auth.user.id, domain });
    if (!ownership.ok) {
      return ownership.response;
    }

    const adapter = new NameComRegistrarAdapter();
    const managed = await resolveManagedZone(adapter, domain);

    if (!managed) {
      return NextResponse.json({
        data: {
          managed: false,
          zone: null,
          host: null,
          records: [] as NameComDnsRecordView[],
          message: "No platform-managed DNS zone found for this domain.",
        },
      });
    }

    const nameserversManaged = await hasManagedNameservers(adapter, managed.zone);
    if (!nameserversManaged) {
      return NextResponse.json({
        data: {
          managed: false,
          zone: managed.zone,
          host: managed.host,
          records: [] as NameComDnsRecordView[],
          message: "This domain is using custom nameservers. Manage DNS records at the selected DNS provider.",
        },
      });
    }

    const records: NameComDnsRecordView[] = [];
    let page = 1;
    let safety = 0;

    while (safety < 10) {
      safety += 1;
      const response = await adapter.listRecords(managed.zone, { page, perPage: 100 });
      const pageRecords = response.records || [];

      pageRecords.forEach((record) => records.push(mapRecord(record)));

      if (!response.nextPage || response.nextPage === page || pageRecords.length === 0) {
        break;
      }

      page = response.nextPage;
    }

    return NextResponse.json({
      data: {
        managed: true,
        zone: managed.zone,
        host: managed.host,
        records,
      },
    });
  } catch (error: unknown) {
    logError("domains/dns/GET", error);
    return NextResponse.json(
      {
        error: "INTERNAL_ERROR",
        message: "Failed to load DNS records",
      },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const auth = await authenticateUser();
  if (!auth.authenticated) return auth.response;

  try {
    const rl = await limitByUser(auth.user.id, {
      prefix: "rl:domains-dns-records:create",
      limit: 20,
      windowMs: 60_000,
    });
    if (!rl.allowed) {
      return NextResponse.json(
        {
          error: "TOO_MANY_REQUESTS",
          message: `Retry after ${rl.retryAfterSec}s`,
        },
        { status: 429 }
      );
    }

    const body = await req.json();
    const domain = normalizeDomain(typeof body?.domain === "string" ? body.domain : "");
    const type = String(body?.type || "").toUpperCase();
    const host = normalizeHost(typeof body?.host === "string" ? body.host.trim().toLowerCase() : "@");
    const answer = typeof body?.answer === "string" ? body.answer.trim() : "";
    const ttl = parseTtl(body?.ttl);
    const priority = parsePriority(body?.priority);

    if (!domain || !isValidDomain(domain)) {
      return NextResponse.json({ error: "VALIDATION_ERROR", message: "Invalid domain" }, { status: 400 });
    }
    if (!isSupportedDnsType(type)) {
      return NextResponse.json({ error: "VALIDATION_ERROR", message: "Unsupported DNS record type" }, { status: 400 });
    }
    if (!answer) {
      return NextResponse.json({ error: "VALIDATION_ERROR", message: "Record answer is required" }, { status: 400 });
    }
    if (host === "@" && type === "CNAME") {
      return NextResponse.json(
        { error: "VALIDATION_ERROR", message: "Root domain cannot use CNAME. Use ANAME or A." },
        { status: 400 }
      );
    }
    if ((type === "MX" || type === "SRV") && priority === null) {
      return NextResponse.json(
        { error: "VALIDATION_ERROR", message: `${type} record requires priority` },
        { status: 400 }
      );
    }

    const ownership = await ensureOwnedDomain({ userId: auth.user.id, domain });
    if (!ownership.ok) return ownership.response;

    const adapter = new NameComRegistrarAdapter();
    const managed = await resolveManagedZone(adapter, domain);
    if (!managed) {
      return NextResponse.json(
        { error: "DOMAIN_NOT_MANAGED", message: "No platform-managed zone found for this domain." },
        { status: 400 }
      );
    }
    if (!(await hasManagedNameservers(adapter, managed.zone))) {
      return NextResponse.json(
        { error: "DOMAIN_NOT_MANAGED", message: "This domain is using custom nameservers. Manage DNS records at the selected DNS provider." },
        { status: 400 }
      );
    }

    const record = await adapter.createRecord(managed.zone, {
      host: toProviderHost(host),
      type,
      answer,
      ttl,
      priority: priority === null ? undefined : priority,
    });

    return NextResponse.json({
      success: true,
      data: {
        zone: managed.zone,
        record: mapRecord(record),
      },
    });
  } catch (error: unknown) {
    logError("domains/dns/POST", error);
    return toDnsErrorResponse(error, "Failed to create DNS record");
  }
}

export async function PATCH(req: NextRequest) {
  const auth = await authenticateUser();
  if (!auth.authenticated) return auth.response;

  try {
    const rl = await limitByUser(auth.user.id, {
      prefix: "rl:domains-dns-records:update",
      limit: 30,
      windowMs: 60_000,
    });
    if (!rl.allowed) {
      return NextResponse.json(
        {
          error: "TOO_MANY_REQUESTS",
          message: `Retry after ${rl.retryAfterSec}s`,
        },
        { status: 429 }
      );
    }

    const body = await req.json();
    const domain = normalizeDomain(typeof body?.domain === "string" ? body.domain : "");
    const recordId = Number(body?.record_id);
    const type = String(body?.type || "").toUpperCase();
    const host = normalizeHost(typeof body?.host === "string" ? body.host.trim().toLowerCase() : "@");
    const answer = typeof body?.answer === "string" ? body.answer.trim() : "";
    const ttl = parseTtl(body?.ttl);
    const priority = parsePriority(body?.priority);

    if (!domain || !isValidDomain(domain)) {
      return NextResponse.json({ error: "VALIDATION_ERROR", message: "Invalid domain" }, { status: 400 });
    }
    if (!Number.isInteger(recordId) || recordId <= 0) {
      return NextResponse.json({ error: "VALIDATION_ERROR", message: "record_id is required" }, { status: 400 });
    }
    if (!isSupportedDnsType(type)) {
      return NextResponse.json({ error: "VALIDATION_ERROR", message: "Unsupported DNS record type" }, { status: 400 });
    }
    if (!answer) {
      return NextResponse.json({ error: "VALIDATION_ERROR", message: "Record answer is required" }, { status: 400 });
    }
    if (host === "@" && type === "CNAME") {
      return NextResponse.json(
        { error: "VALIDATION_ERROR", message: "Root domain cannot use CNAME. Use ANAME or A." },
        { status: 400 }
      );
    }
    if ((type === "MX" || type === "SRV") && priority === null) {
      return NextResponse.json(
        { error: "VALIDATION_ERROR", message: `${type} record requires priority` },
        { status: 400 }
      );
    }

    const ownership = await ensureOwnedDomain({ userId: auth.user.id, domain });
    if (!ownership.ok) return ownership.response;

    const adapter = new NameComRegistrarAdapter();
    const managed = await resolveManagedZone(adapter, domain);
    if (!managed) {
      return NextResponse.json(
        { error: "DOMAIN_NOT_MANAGED", message: "No platform-managed zone found for this domain." },
        { status: 400 }
      );
    }
    if (!(await hasManagedNameservers(adapter, managed.zone))) {
      return NextResponse.json(
        { error: "DOMAIN_NOT_MANAGED", message: "This domain is using custom nameservers. Manage DNS records at the selected DNS provider." },
        { status: 400 }
      );
    }

    const record = await adapter.updateRecord(managed.zone, recordId, {
      host: toProviderHost(host),
      type,
      answer,
      ttl,
      priority: priority === null ? undefined : priority,
    });

    return NextResponse.json({
      success: true,
      data: {
        zone: managed.zone,
        record: mapRecord(record),
      },
    });
  } catch (error: unknown) {
    logError("domains/dns/PATCH", error);
    return toDnsErrorResponse(error, "Failed to update DNS record");
  }
}

export async function DELETE(req: NextRequest) {
  const auth = await authenticateUser();
  if (!auth.authenticated) return auth.response;

  try {
    const rl = await limitByUser(auth.user.id, {
      prefix: "rl:domains-dns-records:delete",
      limit: 30,
      windowMs: 60_000,
    });
    if (!rl.allowed) {
      return NextResponse.json(
        {
          error: "TOO_MANY_REQUESTS",
          message: `Retry after ${rl.retryAfterSec}s`,
        },
        { status: 429 }
      );
    }

    const body = await req.json().catch(() => null);
    const domain = normalizeDomain(typeof body?.domain === "string" ? body.domain : "");
    const recordId = Number(body?.record_id);

    if (!domain || !isValidDomain(domain)) {
      return NextResponse.json({ error: "VALIDATION_ERROR", message: "Invalid domain" }, { status: 400 });
    }
    if (!Number.isInteger(recordId) || recordId <= 0) {
      return NextResponse.json({ error: "VALIDATION_ERROR", message: "record_id is required" }, { status: 400 });
    }

    const ownership = await ensureOwnedDomain({ userId: auth.user.id, domain });
    if (!ownership.ok) return ownership.response;

    const adapter = new NameComRegistrarAdapter();
    const managed = await resolveManagedZone(adapter, domain);
    if (!managed) {
      return NextResponse.json(
        { error: "DOMAIN_NOT_MANAGED", message: "No platform-managed zone found for this domain." },
        { status: 400 }
      );
    }
    if (!(await hasManagedNameservers(adapter, managed.zone))) {
      return NextResponse.json(
        { error: "DOMAIN_NOT_MANAGED", message: "This domain is using custom nameservers. Manage DNS records at the selected DNS provider." },
        { status: 400 }
      );
    }

    await adapter.deleteRecord(managed.zone, recordId);

    return NextResponse.json({
      success: true,
      data: {
        zone: managed.zone,
        deleted: true,
        record_id: recordId,
      },
    });
  } catch (error: unknown) {
    logError("domains/dns/DELETE", error);
    return toDnsErrorResponse(error, "Failed to delete DNS record");
  }
}
