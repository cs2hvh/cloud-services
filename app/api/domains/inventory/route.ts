import { NextRequest, NextResponse } from 'next/server';

import { authenticateUser } from '@/lib/auth/server-auth';
import { limitByUser } from '@/lib/cooldown/userbased';
import { NameComRegistrarAdapter } from '@/lib/domain-service/integrations/namecom-registrar.adapter';
import { PlatformAppService } from '@/lib/services/platform-app-service';
import { createServiceClient } from '@/lib/supabase/server';

type AppListItem = {
  id: string;
  name: string;
  status: string;
};

type DomainConnection = {
  id: string;
  app_id: string;
  app_name: string;
  app_status: string;
  domain: string;
  status: 'pending' | 'verified' | 'active' | 'failed' | 'removed';
  ssl_status: 'pending' | 'issuing' | 'active' | 'failed';
  is_primary: boolean;
  last_error: string | null;
  created_at: string;
};

type DomainPurchase = {
  id: string;
  app_id: string | null;
  status: 'requested' | 'processing' | 'completed' | 'failed' | 'cancelled';
  created_at: string;
  last_error: string | null;
};

type DomainInventoryItem = {
  domain: string;
  purchase: DomainPurchase | null;
  connections: DomainConnection[];
  source: 'purchased' | 'external' | 'mixed';
  expires_at: string | null;
  auto_renew: boolean | null;
};

function normalizeDomain(value: string): string {
  return value.trim().toLowerCase();
}

async function loadNameComDomainMeta(): Promise<Map<string, { expires_at: string | null; auto_renew: boolean | null }>> {
  const meta = new Map<string, { expires_at: string | null; auto_renew: boolean | null }>();

  try {
    const adapter = new NameComRegistrarAdapter();
    let page = 1;
    let safety = 0;
    const deadline = Date.now() + 2500;

    while (safety < 20 && Date.now() < deadline) {
      safety += 1;
      const remainingMs = Math.max(200, deadline - Date.now());
      const result = await withTimeout(
        adapter.listDomains({ page, perPage: 100 }),
        remainingMs,
        'Name.com metadata timeout'
      );
      const domains = result.domains || [];

      domains.forEach((item) => {
        if (!item?.domainName) return;
        meta.set(normalizeDomain(item.domainName), {
          expires_at: item.expireDate || null,
          auto_renew: typeof item.autorenewEnabled === 'boolean' ? item.autorenewEnabled : null,
        });
      });

      if (!result.nextPage || result.nextPage === page || domains.length === 0) {
        break;
      }

      page = result.nextPage;
    }
  } catch {
    // Non-blocking: inventory still works without registrar metadata.
  }

  return meta;
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), timeoutMs);
    promise
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch((error) => {
        clearTimeout(timer);
        reject(error);
      });
  });
}

export async function GET(req: NextRequest) {
  const auth = await authenticateUser();
  if (!auth.authenticated) return auth.response;

  try {
    const rl = await limitByUser(auth.user.id, {
      prefix: 'rl:domains-inventory',
      limit: 30,
      windowMs: 60_000,
    });

    if (!rl.allowed) {
      return NextResponse.json(
        {
          error: 'TOO_MANY_REQUESTS',
          message: `Retry after ${rl.retryAfterSec}s`,
        },
        { status: 429 }
      );
    }

    const url = new URL(req.url);
    const domainFilter = url.searchParams.get('domain')?.trim().toLowerCase() || null;

    const [appsRaw, nameComMeta, supabase] = await Promise.all([
      PlatformAppService.listApps({ userId: auth.user.id, includeRollbackInfo: false }),
      loadNameComDomainMeta(),
      createServiceClient(),
    ]);

    const apps = (appsRaw || []).map((app) => {
      const name = "name" in app && typeof app.name === "string" ? app.name : app.id;
      const status = "status" in app && typeof app.status === "string" ? app.status : "unknown";

      return {
        id: app.id,
        name,
        status,
      };
    }) as AppListItem[];

    const appById = new Map(apps.map((app) => [app.id, app]));

    const [{ data: domainRows, error: domainError }, { data: purchaseRows, error: purchaseError }] = await Promise.all([
      supabase
        .from('platform_app_domains')
        .select('id, app_id, domain, status, ssl_status, is_primary, last_error, created_at')
        .eq('user_id', auth.user.id)
        .neq('status', 'removed')
        .order('created_at', { ascending: false }),
      supabase
        .from('domain_purchase_requests')
        .select('id, app_id, domain, status, created_at, last_error')
        .eq('user_id', auth.user.id)
        .order('created_at', { ascending: false })
        .limit(1000),
    ]);

    if (domainError) {
      return NextResponse.json(
        {
          error: 'INTERNAL_ERROR',
          message: `Failed to load domain connections: ${domainError.message}`,
        },
        { status: 500 }
      );
    }

    if (purchaseError) {
      return NextResponse.json(
        {
          error: 'INTERNAL_ERROR',
          message: `Failed to load domain purchases: ${purchaseError.message}`,
        },
        { status: 500 }
      );
    }

    const purchaseByDomain = new Map<string, DomainPurchase>();

    (purchaseRows || []).forEach((row) => {
      const domain = normalizeDomain(row.domain || '');
      if (!domain || purchaseByDomain.has(domain)) return;

      purchaseByDomain.set(domain, {
        id: row.id,
        app_id: row.app_id || null,
        status: row.status,
        created_at: row.created_at,
        last_error: row.last_error || null,
      });
    });

    const inventoryByDomain = new Map<string, DomainInventoryItem>();

    for (const [domain, purchase] of purchaseByDomain.entries()) {
      const providerMeta = nameComMeta.get(domain);
      inventoryByDomain.set(domain, {
        domain,
        purchase,
        connections: [],
        source: 'purchased',
        expires_at: providerMeta?.expires_at || null,
        auto_renew: providerMeta?.auto_renew ?? null,
      });
    }

    (domainRows || []).forEach((row) => {
      const domain = normalizeDomain(row.domain || '');
      if (!domain) return;

      const app = appById.get(row.app_id);
      if (!app) return;

      const connection: DomainConnection = {
        id: row.id,
        app_id: row.app_id,
        app_name: app.name,
        app_status: app.status,
        domain,
        status: row.status,
        ssl_status: row.ssl_status,
        is_primary: Boolean(row.is_primary),
        last_error: row.last_error || null,
        created_at: row.created_at,
      };

      const existing = inventoryByDomain.get(domain);
      if (!existing) {
        const providerMeta = nameComMeta.get(domain);
        inventoryByDomain.set(domain, {
          domain,
          purchase: null,
          connections: [connection],
          source: 'external',
          expires_at: providerMeta?.expires_at || null,
          auto_renew: providerMeta?.auto_renew ?? null,
        });
        return;
      }

      existing.connections.push(connection);
      existing.source = existing.source === 'purchased' ? 'mixed' : existing.source;
    });

    let domains = Array.from(inventoryByDomain.values()).sort((a, b) => a.domain.localeCompare(b.domain));

    if (domainFilter) {
      domains = domains.filter((item) => item.domain === domainFilter || item.domain.endsWith(`.${domainFilter}`));
    }

    return NextResponse.json({
      data: {
        apps,
        domains,
      },
      meta: {
        total_domains: domains.length,
        total_apps: apps.length,
      },
    });
  } catch (error: unknown) {
    return NextResponse.json(
      {
        error: 'INTERNAL_ERROR',
        message: error instanceof Error ? error.message : 'Failed to load domains inventory',
      },
      { status: 500 }
    );
  }
}
