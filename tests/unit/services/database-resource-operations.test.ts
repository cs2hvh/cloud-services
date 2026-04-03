import { beforeEach, describe, expect, it, vi } from "vitest";
import axios from "axios";

import { databaseResourceOperations } from "@/lib/services/database/operations/database-resource-operations";
import { Database_Clusters } from "@/lib/supabase/queries/database_clusters";

vi.mock("axios");
vi.mock("@/lib/supabase/queries/database_clusters", () => ({
  Database_Clusters: {
    read: vi.fn(),
  },
}));
vi.mock("@/lib/supabase/queries/projects", () => ({
  Projects: {
    add_log: vi.fn(),
  },
}));
vi.mock("@/lib/notifications", () => ({
  NotificationService: {
    create: vi.fn(),
  },
  createServiceNotification: vi.fn((payload) => payload),
}));
vi.mock("@/lib/audit", () => ({
  AuditLogService: {
    create: vi.fn(),
  },
  getAuditContext: vi.fn(() => ({
    ipAddress: "127.0.0.1",
    userAgent: "vitest",
    requestId: "req-1",
  })),
}));

describe("databaseResourceOperations.retrieveDatabase", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns provider payload when retrieved database name matches", async () => {
    vi.mocked(Database_Clusters.read).mockResolvedValue({
      success: true,
      data: {
        engine: "pg",
        owner_id: "user-1",
      },
    } as never);
    vi.mocked(axios.get).mockResolvedValue({
      status: 200,
      data: { db: { name: "appdb" } },
    } as never);

    const result = await databaseResourceOperations.retrieveDatabase({
      clusterId: "cluster-1",
      name: "appdb",
      userId: "user-1",
    });

    expect(result.success).toBe(true);
    expect(result.data).toEqual({ name: "appdb" });
    expect(axios.get).toHaveBeenCalledTimes(1);
    expect(axios.get).toHaveBeenNthCalledWith(
      1,
      "https://api.digitalocean.com/v2/databases/cluster-1/dbs/appdb",
      expect.any(Object)
    );
  });

  it("falls back to list lookup when provider returns mismatched database name", async () => {
    vi.mocked(Database_Clusters.read).mockResolvedValue({
      success: true,
      data: {
        engine: "mongodb",
        owner_id: "user-1",
      },
    } as never);
    vi.mocked(axios.get)
      .mockResolvedValueOnce({
        status: 200,
        data: { db: { name: "test" } },
      } as never)
      .mockResolvedValueOnce({
        status: 200,
        data: { dbs: [{ name: "admin" }, { name: "appdb" }] },
      } as never);

    const result = await databaseResourceOperations.retrieveDatabase({
      clusterId: "cluster-1",
      name: "appdb",
      userId: "user-1",
    });

    expect(result.success).toBe(true);
    expect(result.data).toEqual({ name: "appdb" });
    expect(axios.get).toHaveBeenCalledTimes(2);
    expect(axios.get).toHaveBeenNthCalledWith(
      2,
      "https://api.digitalocean.com/v2/databases/cluster-1/dbs",
      expect.any(Object)
    );
  });

  it("returns not found when fallback list has no matching database", async () => {
    vi.mocked(Database_Clusters.read).mockResolvedValue({
      success: true,
      data: {
        engine: "mongodb",
        owner_id: "user-1",
      },
    } as never);
    vi.mocked(axios.get)
      .mockResolvedValueOnce({
        status: 200,
        data: { db: { name: "test" } },
      } as never)
      .mockResolvedValueOnce({
        status: 200,
        data: { dbs: [{ name: "admin" }] },
      } as never);

    const result = await databaseResourceOperations.retrieveDatabase({
      clusterId: "cluster-1",
      name: "appdb",
      userId: "user-1",
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe("database appdb was not found");
  });

  it("returns unsupported error for engines without logical DB support", async () => {
    vi.mocked(Database_Clusters.read).mockResolvedValue({
      success: true,
      data: {
        engine: "redis",
        owner_id: "user-1",
      },
    } as never);

    const result = await databaseResourceOperations.retrieveDatabase({
      clusterId: "cluster-1",
      name: "appdb",
      userId: "user-1",
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("Logical database operations are not supported");
    expect(axios.get).not.toHaveBeenCalled();
  });
});
