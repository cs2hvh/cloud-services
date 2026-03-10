import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";

import { PUT as putStorage } from "@/app/api/v1/databases/[id]/storage/route";
import { PUT as putUpsize } from "@/app/api/v1/databases/[id]/storage/upsize/route";
import { authenticateApiRequest, getRateLimitConfig } from "@/lib/api-auth";
import {
  v1EnsureOwnedDatabaseCluster,
  v1ExtractDatabaseId,
  v1ResolveDatabaseClusterId,
} from "@/lib/api/v1-database-helpers";
import { limitByUser } from "@/lib/cooldown/userbased";
import { DatabaseService } from "@/lib/services/database-service";

vi.mock("@/lib/api-auth", () => ({
  authenticateApiRequest: vi.fn(),
  getRateLimitConfig: vi.fn(),
}));
vi.mock("@/lib/cooldown/userbased", () => ({
  limitByUser: vi.fn(),
}));
vi.mock("@/lib/services/database-service", () => ({
  DatabaseService: {
    updateStorage: vi.fn(),
    upsizeStorage: vi.fn(),
  },
}));
vi.mock("@/lib/api/v1-database-helpers", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api/v1-database-helpers")>(
    "@/lib/api/v1-database-helpers"
  );
  return {
    ...actual,
    v1ExtractDatabaseId: vi.fn(),
    v1EnsureOwnedDatabaseCluster: vi.fn(),
    v1ResolveDatabaseClusterId: vi.fn(),
  };
});

const mockAuth = {
  authenticated: true as const,
  kind: "pat" as const,
  userId: "ccf391ef-271b-45e7-9799-3b1be3422363",
  tokenId: "token-1",
  plan: "free" as const,
};

function createContext(id: string) {
  return { params: Promise.resolve({ id }) } as { params: Promise<{ id: string }> };
}

describe("v1 database storage routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(authenticateApiRequest).mockResolvedValue(mockAuth);
    vi.mocked(getRateLimitConfig).mockReturnValue({ limit: 30, windowMs: 60_000 });
    vi.mocked(limitByUser).mockResolvedValue({ allowed: true } as never);

    vi.mocked(v1ExtractDatabaseId).mockResolvedValue({
      id: "374278cf-e944-43fa-aec7-03fa34fd5d5d",
      error: null,
    } as never);
    vi.mocked(v1EnsureOwnedDatabaseCluster).mockResolvedValue({
      cluster: { cluster_id: "6dc4e9fe-039b-41ad-9928-143ba0cfc6da" },
      error: null,
    } as never);
    vi.mocked(v1ResolveDatabaseClusterId).mockReturnValue("6dc4e9fe-039b-41ad-9928-143ba0cfc6da");

    vi.mocked(DatabaseService.updateStorage).mockResolvedValue({ success: true } as never);
    vi.mocked(DatabaseService.upsizeStorage).mockResolvedValue({ success: true } as never);
  });

  it("returns 401 when authentication fails", async () => {
    vi.mocked(authenticateApiRequest).mockResolvedValue({
      authenticated: false,
      error: "Missing Authorization header",
      status: 401,
    });

    const req = new Request("http://localhost:3000/api/v1/databases/x/storage", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ size: "db-s-2vcpu-4gb" }),
    });
    const res = await putStorage(req as never, createContext("x") as never);
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body.error).toBe("UNAUTHORIZED");
  });

  it("returns 400 for invalid storage resize body", async () => {
    const req = new Request("http://localhost:3000/api/v1/databases/id/storage", {
      method: "PUT",
      headers: {
        authorization: "Bearer sk_live_test",
        "content-type": "application/json",
      },
      body: JSON.stringify({ size: "bad-size" }),
    });
    const res = await putStorage(req as never, createContext("id") as never);
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toBe("VALIDATION_ERROR");
  });

  it("returns 404 when cluster ownership check fails as not found", async () => {
    vi.mocked(v1EnsureOwnedDatabaseCluster).mockResolvedValue({
      cluster: null,
      error: NextResponse.json(
        { error: "NOT_FOUND", message: "Database cluster not found" },
        { status: 404 }
      ),
    } as never);

    const req = new Request("http://localhost:3000/api/v1/databases/id/storage", {
      method: "PUT",
      headers: {
        authorization: "Bearer sk_live_test",
        "content-type": "application/json",
      },
      body: JSON.stringify({ size: "db-s-2vcpu-4gb" }),
    });
    const res = await putStorage(req as never, createContext("id") as never);

    expect(res.status).toBe(404);
  });

  it("returns 403 when cluster ownership check fails as forbidden", async () => {
    vi.mocked(v1EnsureOwnedDatabaseCluster).mockResolvedValue({
      cluster: null,
      error: NextResponse.json(
        { error: "FORBIDDEN", message: "You do not have permission to modify this database cluster" },
        { status: 403 }
      ),
    } as never);

    const req = new Request("http://localhost:3000/api/v1/databases/id/storage", {
      method: "PUT",
      headers: {
        authorization: "Bearer sk_live_test",
        "content-type": "application/json",
      },
      body: JSON.stringify({ size: "db-s-2vcpu-4gb" }),
    });
    const res = await putStorage(req as never, createContext("id") as never);

    expect(res.status).toBe(403);
  });

  it("returns 200 for successful storage resize", async () => {
    const req = new Request("http://localhost:3000/api/v1/databases/id/storage", {
      method: "PUT",
      headers: {
        authorization: "Bearer sk_live_test",
        "content-type": "application/json",
      },
      body: JSON.stringify({ size: "db-s-2vcpu-4gb" }),
    });
    const res = await putStorage(req as never, createContext("id") as never);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data).toEqual({
      cluster_id: "6dc4e9fe-039b-41ad-9928-143ba0cfc6da",
      size: "db-s-2vcpu-4gb",
      updated: true,
    });
  });

  it("maps provider validation failures to 400 for storage resize", async () => {
    vi.mocked(DatabaseService.updateStorage).mockResolvedValue({
      success: false,
      error: "invalid request",
      errorCode: "DIGITALOCEAN_API_ERROR",
    } as never);

    const req = new Request("http://localhost:3000/api/v1/databases/id/storage", {
      method: "PUT",
      headers: {
        authorization: "Bearer sk_live_test",
        "content-type": "application/json",
      },
      body: JSON.stringify({ size: "db-s-2vcpu-4gb" }),
    });
    const res = await putStorage(req as never, createContext("id") as never);
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toBe("INVALID_PARAMETER");
  });

  it("maps unknown failures to 500 for storage resize", async () => {
    vi.mocked(DatabaseService.updateStorage).mockResolvedValue({
      success: false,
      error: "boom",
      errorCode: "UNKNOWN_ERROR",
    } as never);

    const req = new Request("http://localhost:3000/api/v1/databases/id/storage", {
      method: "PUT",
      headers: {
        authorization: "Bearer sk_live_test",
        "content-type": "application/json",
      },
      body: JSON.stringify({ size: "db-s-2vcpu-4gb" }),
    });
    const res = await putStorage(req as never, createContext("id") as never);
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.error).toBe("UPDATE_FAILED");
  });

  it("returns 400 for invalid upsize request", async () => {
    const req = new Request("http://localhost:3000/api/v1/databases/id/storage/upsize", {
      method: "PUT",
      headers: {
        authorization: "Bearer sk_live_test",
        "content-type": "application/json",
      },
      body: JSON.stringify({ storage_size_mib: 1 }),
    });
    const res = await putUpsize(req as never, createContext("id") as never);
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toBe("VALIDATION_ERROR");
  });

  it("returns 200 for successful storage upsize", async () => {
    const req = new Request("http://localhost:3000/api/v1/databases/id/storage/upsize", {
      method: "PUT",
      headers: {
        authorization: "Bearer sk_live_test",
        "content-type": "application/json",
      },
      body: JSON.stringify({ storage_size_mib: 20480 }),
    });
    const res = await putUpsize(req as never, createContext("id") as never);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data).toEqual({
      cluster_id: "6dc4e9fe-039b-41ad-9928-143ba0cfc6da",
      storage_size_mib: 20480,
      updated: true,
    });
  });

  it("maps provider validation failures to 400 for upsize", async () => {
    vi.mocked(DatabaseService.upsizeStorage).mockResolvedValue({
      success: false,
      error: "invalid request",
      errorCode: "DIGITALOCEAN_API_ERROR",
    } as never);

    const req = new Request("http://localhost:3000/api/v1/databases/id/storage/upsize", {
      method: "PUT",
      headers: {
        authorization: "Bearer sk_live_test",
        "content-type": "application/json",
      },
      body: JSON.stringify({ storage_size_mib: 20480 }),
    });
    const res = await putUpsize(req as never, createContext("id") as never);

    expect(res.status).toBe(400);
  });

  it("maps unknown failures to 500 for upsize", async () => {
    vi.mocked(DatabaseService.upsizeStorage).mockResolvedValue({
      success: false,
      error: "boom",
      errorCode: "UNKNOWN_ERROR",
    } as never);

    const req = new Request("http://localhost:3000/api/v1/databases/id/storage/upsize", {
      method: "PUT",
      headers: {
        authorization: "Bearer sk_live_test",
        "content-type": "application/json",
      },
      body: JSON.stringify({ storage_size_mib: 20480 }),
    });
    const res = await putUpsize(req as never, createContext("id") as never);

    expect(res.status).toBe(500);
  });
});
