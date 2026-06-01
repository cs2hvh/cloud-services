import { DOMAIN_ERROR_CODES, DomainServiceError } from "@/lib/domain-service/core/errors";
import type { DomainRegistrarPort, DomainTransferRegistrarPort, RegistrarSettings } from "@/lib/domain-service/core/ports";

export type NameComRecordType = "A" | "AAAA" | "ANAME" | "CNAME" | "MX" | "NS" | "SRV" | "TXT";

export interface NameComHelloResponse {
  motd: string;
  serverName: string;
  serverTime: string;
  username: string;
}

export interface NameComDomainResponse {
  domainName: string;
  createDate?: string;
  expireDate?: string;
  locked?: boolean;
  privacyEnabled?: boolean;
  autorenewEnabled?: boolean;
  nameservers?: string[];
  // Returned by GET /domains/{name}, PATCH /domains/{name}, and POST /domains
  renewalPrice?: number;
  // Present in live API responses but not consumed by our code
  locks?: unknown[];
  contacts?: Record<string, unknown>;
}

export interface NameComListDomainsResponse {
  domains: NameComDomainResponse[];
  nextPage?: number;
  lastPage?: number;
  totalCount?: number;
  from?: number;
  to?: number;
}

export interface NameComBalanceResponse {
  balance: number;
}

export interface NameComSearchResult {
  domainName: string;
  sld?: string;
  tld?: string;
  purchasable: boolean;
  premium?: boolean;
  purchasePrice?: number;
  renewalPrice?: number;
  purchaseType?: string;
  reason?: string;
}

export interface NameComSearchResponse {
  results: NameComSearchResult[];
}

export interface NameComCreateDomainInput {
  domainName: string;
  purchasePrice?: number;
  purchaseType?: string;
}

export interface NameComCreateDomainResponse {
  domain?: NameComDomainResponse;
  order?: number;
  totalPaid?: number;
}

export interface NameComRecord {
  id?: number;
  domainName?: string;
  fqdn?: string;
  host?: string | null;
  type?: NameComRecordType | null;
  answer: string;
  ttl?: number;
  priority?: number;
}

export interface NameComListRecordsResponse {
  records: NameComRecord[];
  nextPage?: number;
  lastPage?: number;
  totalCount?: number;
  from?: number;
  to?: number;
}

export interface NameComCreateRecordInput {
  host: string;
  type: NameComRecordType;
  answer: string;
  ttl?: number;
  priority?: number;
}

export interface NameComUpdateRecordInput {
  host?: string;
  type: NameComRecordType;
  answer: string;
  ttl?: number;
  priority?: number;
}

export interface NameComUpdateDomainInput {
  autorenewEnabled?: boolean;
  locked?: boolean;
  privacyEnabled?: boolean;
}

export interface NameComContactInput {
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  companyName?: string;
  address1?: string;
  city?: string;
  state?: string;
  zip?: string;
  country?: string;
}

export interface NameComSetContactsInput {
  registrant?: NameComContactInput;
}

type NameComAdapterOptions = {
  baseUrl?: string;
  username?: string;
  token?: string;
  basicAuthHeader?: string;
};

type NameComErrorPayload = {
  message?: string;
  details?: string | null;
};

export interface NameComTransferInput {
  domainName: string;
  authCode: string;
  purchasePrice?: number;
  privacyEnabled?: boolean;
  promoCode?: string;
}

export interface NameComTransferRecord {
  domainName: string;
  email?: string;
  status: string;
}

export interface NameComCreateTransferResponse {
  transfer: NameComTransferRecord;
  order?: number;
  totalPaid?: number;
}

export interface NameComListTransfersResponse {
  transfers: NameComTransferRecord[];
  nextPage?: number;
  lastPage?: number;
}

export class NameComRegistrarAdapter implements DomainRegistrarPort, DomainTransferRegistrarPort {
  private readonly baseUrl: string;
  private readonly username: string;
  private readonly token: string;
  private readonly basicAuthHeader: string;

  constructor(options: NameComAdapterOptions = {}) {
    this.baseUrl = normalizeBaseUrl(
      options.baseUrl || process.env.NAMECOM_API_BASE_URL || defaultNameComBaseUrl()
    );

    this.username = (options.username || process.env.NAMECOM_USERNAME || "").trim();
    this.token = (options.token || process.env.NAMECOM_API_TOKEN || "").trim();
    this.basicAuthHeader = (options.basicAuthHeader || process.env.NAMECOM_BASIC_AUTH || "").trim();
  }

  async hello(): Promise<NameComHelloResponse> {
    return this.request<NameComHelloResponse>("/hello");
  }

  async getDomainSummary(domainName: string): Promise<{ domainName: string; expiresAt?: string; createdAt?: string } | null> {
    const encodedDomain = encodeURIComponent(domainName);
    const data = await this.request<NameComDomainResponse>(`/domains/${encodedDomain}`);
    if (!data?.domainName) return null;
    return { domainName: data.domainName, createdAt: data.createDate, expiresAt: data.expireDate };
  }

  async resolveZone(fqdn: string): Promise<{ zone: string; host: string } | null> {
    const parts = fqdn.trim().toLowerCase().replace(/\.$/, "").split(".").filter(Boolean);
    if (parts.length < 2) return null;
    for (let i = 0; i <= parts.length - 2; i++) {
      const zone = parts.slice(i).join(".");
      try {
        const s = await this.getDomainSummary(zone);
        if (s?.domainName.toLowerCase() === zone) {
          return { zone, host: i === 0 ? "@" : parts.slice(0, i).join(".") };
        }
      } catch { /* keep iterating */ }
    }
    return null;
  }

  async getRegistrarSettings(zone: string): Promise<RegistrarSettings> {
    const d = await this.getDomain(zone);
    return { autorenewEnabled: d.autorenewEnabled ?? null, locked: d.locked ?? null, privacyEnabled: d.privacyEnabled ?? null, expireDate: d.expireDate ?? null };
  }

  async updateRegistrarSettings(zone: string, updates: { autorenewEnabled?: boolean; locked?: boolean; privacyEnabled?: boolean }): Promise<RegistrarSettings> {
    const d = await this.updateDomain(zone, updates);
    return { autorenewEnabled: d.autorenewEnabled ?? null, locked: d.locked ?? null, privacyEnabled: d.privacyEnabled ?? null, expireDate: d.expireDate ?? null };
  }

  async getDomain(domainName: string): Promise<NameComDomainResponse & { expiresAt?: string | null }> {
    const encodedDomain = encodeURIComponent(domainName);
    const data = await this.request<NameComDomainResponse>(`/domains/${encodedDomain}`);
    return { ...data, expiresAt: data.expireDate ?? null };
  }

  async updateDomain(domainName: string, input: NameComUpdateDomainInput): Promise<NameComDomainResponse> {
    const encodedDomain = encodeURIComponent(domainName);
    const body: Record<string, unknown> = {};

    if (typeof input.autorenewEnabled === "boolean") {
      body.autorenewEnabled = input.autorenewEnabled;
    }
    if (typeof input.locked === "boolean") {
      body.locked = input.locked;
    }
    if (typeof input.privacyEnabled === "boolean") {
      body.privacyEnabled = input.privacyEnabled;
    }

    // Name.com requires at least one of autorenewEnabled/locked/privacyEnabled.
    // Sending an empty body returns a 400 error. Guard here so callers with
    // no-op updates fail fast with a clear message instead of a cryptic 400.
    if (Object.keys(body).length === 0) {
      throw new DomainServiceError({
        code: DOMAIN_ERROR_CODES.DOMAIN_INVALID,
        message: "updateDomain requires at least one field: autorenewEnabled, locked, or privacyEnabled",
      });
    }

    return this.request<NameComDomainResponse>(`/domains/${encodedDomain}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    });
  }

  async setNameservers(domainName: string, nameservers: string[]): Promise<NameComDomainResponse> {
    const encodedDomain = encodeURIComponent(domainName);

    return this.request<NameComDomainResponse>(`/domains/${encodedDomain}:setNameservers`, {
      method: "POST",
      body: JSON.stringify({ nameservers }),
    });
  }

  async setContacts(domainName: string, input: NameComSetContactsInput): Promise<NameComDomainResponse> {
    const encodedDomain = encodeURIComponent(domainName);

    return this.request<NameComDomainResponse>(`/domains/${encodedDomain}:setContacts`, {
      method: "POST",
      body: JSON.stringify({ contacts: input }),
    });
  }

  /**
   * Set the registrant contact for a domain, merging user-supplied fields with
   * platform defaults from PLATFORM_CONTACT_* env vars.
   * User-supplied values take precedence; platform env vars fill any gaps.
   * Name.com requires a complete contact object — partial objects fail validation.
   */
  async setRegistrantContact(
    domainName: string,
    contact: {
      email: string;
      firstName?: string;
      lastName?: string;
      phone?: string;
      companyName?: string;
      address1?: string;
      city?: string;
      state?: string;
      zip?: string;
      country?: string;
    }
  ): Promise<void> {
    const phone = contact.phone || process.env.PLATFORM_CONTACT_PHONE;
    const address1 = contact.address1 || process.env.PLATFORM_CONTACT_ADDRESS;
    const city = contact.city || process.env.PLATFORM_CONTACT_CITY;
    const state = contact.state || process.env.PLATFORM_CONTACT_STATE;
    const zip = contact.zip || process.env.PLATFORM_CONTACT_ZIP;
    const country = contact.country || process.env.PLATFORM_CONTACT_COUNTRY;

    if (!phone || !address1 || !city || !state || !zip || !country) {
      throw new Error(
        "setRegistrantContact: address fields not fully provided and PLATFORM_CONTACT_* env vars are incomplete. " +
        "Either supply address in the contact object or set PLATFORM_CONTACT_PHONE/ADDRESS/CITY/STATE/ZIP/COUNTRY."
      );
    }

    await this.setContacts(domainName, {
      registrant: {
        email: contact.email,
        ...(contact.firstName ? { firstName: contact.firstName } : {}),
        ...(contact.lastName ? { lastName: contact.lastName } : {}),
        ...(contact.companyName ? { companyName: contact.companyName } : {}),
        phone,
        address1,
        city,
        state,
        zip,
        country,
      },
    });
  }

  async listDomains(params?: { page?: number; perPage?: number }): Promise<NameComListDomainsResponse> {
    const search = new URLSearchParams();

    if (params?.page !== undefined) {
      search.set("page", String(params.page));
    }
    if (params?.perPage !== undefined) {
      search.set("perPage", String(params.perPage));
    }

    const qs = search.toString();
    return this.request<NameComListDomainsResponse>(`/domains${qs ? `?${qs}` : ""}`);
  }

  async checkAccountBalance(): Promise<NameComBalanceResponse> {
    return this.request<NameComBalanceResponse>("/accountinfo/balance");
  }

  async checkAvailability(domainNames: string[]): Promise<NameComSearchResponse> {
    const normalized = domainNames
      .map((d) => d.trim().toLowerCase())
      .filter(Boolean)
      .slice(0, 50);

    if (normalized.length === 0) {
      return { results: [] };
    }

    return this.request<NameComSearchResponse>("/domains:checkAvailability", {
      method: "POST",
      body: JSON.stringify({ domainNames: normalized }),
    });
  }

  async searchDomains(input: {
    keyword: string;
    timeout?: number;
    tldFilter?: string[];
  }): Promise<NameComSearchResponse> {
    const payload: Record<string, unknown> = {
      keyword: input.keyword.trim().toLowerCase(),
    };

    if (input.timeout !== undefined) {
      payload.timeout = input.timeout;
    }
    if (input.tldFilter && input.tldFilter.length > 0) {
      payload.tldFilter = input.tldFilter;
    }

    return this.request<NameComSearchResponse>("/domains:search", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  }

  async createDomain(
    input: NameComCreateDomainInput,
    options?: { idempotencyKey?: string }
  ): Promise<NameComCreateDomainResponse> {
    const headers = new Headers();
    if (options?.idempotencyKey) {
      headers.set("X-Idempotency-Key", options.idempotencyKey);
    }

    return this.request<NameComCreateDomainResponse>("/domains", {
      method: "POST",
      headers,
      body: JSON.stringify({
        domain: {
          domainName: input.domainName,
          purchasePrice: input.purchasePrice,
          purchaseType: input.purchaseType,
        },
      }),
    });
  }

  async listRecords(domainName: string, params?: { page?: number; perPage?: number }): Promise<NameComListRecordsResponse> {
    const encodedDomain = encodeURIComponent(domainName);
    const search = new URLSearchParams();

    if (params?.page !== undefined) {
      search.set("page", String(params.page));
    }
    if (params?.perPage !== undefined) {
      search.set("perPage", String(params.perPage));
    }

    const qs = search.toString();
    const path = `/domains/${encodedDomain}/records${qs ? `?${qs}` : ""}`;

    return this.request<NameComListRecordsResponse>(path);
  }

  async createRecord(domainName: string, input: NameComCreateRecordInput): Promise<NameComRecord> {
    const encodedDomain = encodeURIComponent(domainName);

    return this.request<NameComRecord>(`/domains/${encodedDomain}/records`, {
      method: "POST",
      body: JSON.stringify({
        host: input.host,
        type: input.type,
        answer: input.answer,
        ttl: input.ttl,
        priority: input.priority,
      }),
    });
  }

  async updateRecord(domainName: string, recordId: number, input: NameComUpdateRecordInput): Promise<NameComRecord> {
    const encodedDomain = encodeURIComponent(domainName);

    return this.request<NameComRecord>(`/domains/${encodedDomain}/records/${recordId}`, {
      method: "PUT",
      body: JSON.stringify({
        host: input.host,
        type: input.type,
        answer: input.answer,
        ttl: input.ttl,
        priority: input.priority,
      }),
    });
  }

  async deleteRecord(domainName: string, recordId: number): Promise<void> {
    const encodedDomain = encodeURIComponent(domainName);
    await this.request<void>(`/domains/${encodedDomain}/records/${recordId}`, {
      method: "DELETE",
    });
  }

  /* ─── Transfer endpoints (/v4/transfers) ─── */

  async createTransfer(input: NameComTransferInput): Promise<NameComCreateTransferResponse> {
    const payload: Record<string, unknown> = {
      domainName: input.domainName,
      authCode: input.authCode,
    };

    if (input.purchasePrice !== undefined) {
      payload.purchasePrice = input.purchasePrice;
    }
    if (typeof input.privacyEnabled === "boolean") {
      payload.privacyEnabled = input.privacyEnabled;
    }

    return this.requestV4<NameComCreateTransferResponse>("/transfers", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  }

  async getTransfer(domainName: string): Promise<NameComTransferRecord> {
    const encodedDomain = encodeURIComponent(domainName);
    return this.requestV4<NameComTransferRecord>(`/transfers/${encodedDomain}`);
  }

  async cancelTransfer(domainName: string): Promise<NameComTransferRecord> {
    const encodedDomain = encodeURIComponent(domainName);
    return this.requestV4<NameComTransferRecord>(`/transfers/${encodedDomain}:cancel`, {
      method: "POST",
    });
  }

  async listTransfers(params?: { page?: number; perPage?: number }): Promise<NameComListTransfersResponse> {
    const search = new URLSearchParams();
    if (params?.page !== undefined) search.set("page", String(params.page));
    if (params?.perPage !== undefined) search.set("perPage", String(params.perPage));

    const qs = search.toString();
    return this.requestV4<NameComListTransfersResponse>(`/transfers${qs ? `?${qs}` : ""}`);
  }

  async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    this.assertConfigured();

    const headers = new Headers(init.headers || {});
    headers.set("Authorization", this.authorizationHeader());
    headers.set("Accept", "application/json");

    // Name.com Core requires Content-Type for write requests.
    if (init.method && ["POST", "PUT", "PATCH"].includes(init.method.toUpperCase())) {
      headers.set("Content-Type", "application/json");
    }

    const res = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers,
      cache: "no-store",
      signal: AbortSignal.timeout(30_000),
    });

    if (!res.ok) {
      const payload = (await parseResponseBody(res)) as NameComErrorPayload | string | null;
      const message = extractErrorMessage(payload, res.status);
      throw this.toProviderError(res.status, message);
    }

    if (res.status === 204) {
      return undefined as T;
    }

    const body = await parseResponseBody(res);
    return (body ?? undefined) as T;
  }

  private assertConfigured() {
    if (this.basicAuthHeader) {
      return;
    }

    if (!this.username || !this.token) {
      throw new DomainServiceError({
        code: DOMAIN_ERROR_CODES.INTEGRATION_CONFIG_ERROR,
        message:
          "Domain registrar credentials are not configured.",
      });
    }
  }

  /**
   * Name.com transfer endpoints live under /v4/ instead of /core/v1/.
   * Derive the v4 base URL from the configured base URL.
   */
  private v4BaseUrl(): string {
    // Replace /core/v1 suffix with /v4
    return this.baseUrl.replace(/\/core\/v1$/i, "/v4");
  }

  /**
   * Like request(), but uses the /v4/ base path for transfer endpoints.
   */
  private async requestV4<T>(path: string, init: RequestInit = {}): Promise<T> {
    this.assertConfigured();

    const headers = new Headers(init.headers || {});
    headers.set("Authorization", this.authorizationHeader());
    headers.set("Accept", "application/json");

    if (init.method && ["POST", "PUT", "PATCH"].includes(init.method.toUpperCase())) {
      headers.set("Content-Type", "application/json");
    }

    const res = await fetch(`${this.v4BaseUrl()}${path}`, {
      ...init,
      headers,
      cache: "no-store",
      signal: AbortSignal.timeout(30_000),
    });

    if (!res.ok) {
      const payload = (await parseResponseBody(res)) as NameComErrorPayload | string | null;
      const message = extractErrorMessage(payload, res.status);
      throw this.toProviderError(res.status, message);
    }

    if (res.status === 204) {
      return undefined as T;
    }

    const body = await parseResponseBody(res);
    return (body ?? undefined) as T;
  }

  private authorizationHeader(): string {
    if (this.basicAuthHeader) {
      return this.basicAuthHeader.startsWith("Basic ")
        ? this.basicAuthHeader
        : `Basic ${this.basicAuthHeader}`;
    }

    const auth = Buffer.from(`${this.username}:${this.token}`).toString("base64");
    return `Basic ${auth}`;
  }

  private toProviderError(status: number, message: string): DomainServiceError {
    if (status === 400) {
      return new DomainServiceError({
        code: DOMAIN_ERROR_CODES.PROVIDER_VALIDATION_FAILED,
        message: `Registrar request validation failed: ${message}`,
      });
    }

    if (status === 401) {
      return new DomainServiceError({
        code: DOMAIN_ERROR_CODES.PROVIDER_UNAUTHORIZED,
        message: `Registrar authorization failed: ${message}`,
      });
    }

    if (status === 402) {
      return new DomainServiceError({
        code: DOMAIN_ERROR_CODES.PROVIDER_PAYMENT_REQUIRED,
        message: `Registrar account action required: ${message}`,
      });
    }

    if (status === 404) {
      return new DomainServiceError({
        code: DOMAIN_ERROR_CODES.DOMAIN_NOT_FOUND,
        message: `Registrar resource not found: ${message}`,
      });
    }

    if (status === 422) {
      return new DomainServiceError({
        code: DOMAIN_ERROR_CODES.PROVIDER_VALIDATION_FAILED,
        message: `Registrar validation failed: ${message}`,
      });
    }

    if (status === 429) {
      return new DomainServiceError({
        code: DOMAIN_ERROR_CODES.PROVIDER_RATE_LIMITED,
        message: "Registrar rate limit exceeded",
        retryable: true,
      });
    }

    return new DomainServiceError({
      code: DOMAIN_ERROR_CODES.INTERNAL_ERROR,
      message: `Registrar request failed: ${message}`,
      retryable: status >= 500,
    });
  }
}

function normalizeBaseUrl(url: string): string {
  const trimmed = url.trim().replace(/\/+$/, "");

  // Accept both host-only base URLs from docs (https://api.dev.name.com)
  // and fully qualified API roots (.../core/v1).
  if (/\/core\/v1$/i.test(trimmed)) {
    return trimmed;
  }

  return `${trimmed}/core/v1`;
}

function defaultNameComBaseUrl(): string {
  // In local/test environments default to sandbox, while production keeps live API.
  return process.env.NODE_ENV === "production"
    ? "https://api.name.com"
    : "https://api.dev.name.com";
}

async function parseResponseBody(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function extractErrorMessage(payload: NameComErrorPayload | string | null, status: number): string {
  if (!payload) {
    return `Registrar API returned ${status}`;
  }

  if (typeof payload === "string") {
    return payload;
  }

  if (payload.details) {
    return `${payload.message || "Error"}: ${payload.details}`;
  }

  return payload.message || `Registrar API returned ${status}`;
}
