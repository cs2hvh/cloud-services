import { beforeEach, describe, expect, it, vi } from "vitest";
import axios from "axios";

import { scalingResourceOperations } from "@/lib/services/database/operations/scaling-resource-operations";
import { Database_Clusters } from "@/lib/supabase/queries/database_clusters";
import { Projects } from "@/lib/supabase/queries/projects";

vi.mock("axios");
vi.mock("@/lib/supabase/queries/database_clusters", () => ({
  Database_Clusters: {
    read: vi.fn(),
    update_storage: vi.fn(),
    update_storage_size: vi.fn(),
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

describe("scalingResourceOperations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("updateStorage sends requested size and preserves num_nodes/storage_size_mib", async () => {
    vi.mocked(Database_Clusters.read).mockResolvedValue({
      success: true,
      data: {
        owner_id: "user-1",
        name: "cluster-1",
        project_id: "project-1",
        num_nodes: 3,
        storage_size_mib: 20480,
      },
    } as never);
    vi.mocked(Database_Clusters.update_storage).mockResolvedValue({ success: true } as never);
    vi.mocked(Projects.add_log).mockResolvedValue(undefined as never);
    vi.mocked(axios.put).mockResolvedValue({ status: 202 } as never);

    const result = await scalingResourceOperations.updateStorage("cluster-1", "db-s-2vcpu-4gb");

    expect(result.success).toBe(true);
    expect(axios.put).toHaveBeenCalledWith(
      "https://api.digitalocean.com/v2/databases/cluster-1/resize",
      {
        size: "db-s-2vcpu-4gb",
        num_nodes: 3,
        storage_size_mib: 20480,
      },
      expect.any(Object)
    );
  });

  it("upsizeStorage preserves existing num_nodes instead of hardcoding 1", async () => {
    vi.mocked(Database_Clusters.read).mockResolvedValue({
      success: true,
      data: {
        owner_id: "user-1",
        name: "cluster-1",
        project_id: "project-1",
        num_nodes: 3,
        engine: "pg",
        size: "db-s-2vcpu-4gb",
        storage_size_mib: 20480,
      },
    } as never);
    vi.mocked(Database_Clusters.update_storage_size).mockResolvedValue({ success: true } as never);
    vi.mocked(Projects.add_log).mockResolvedValue(undefined as never);
    vi.mocked(axios.put).mockResolvedValue({ status: 202 } as never);

    const result = await scalingResourceOperations.upsizeStorage({
      clusterId: "cluster-1",
      storageSizeMib: 30720,
    });

    expect(result.success).toBe(true);
    expect(axios.put).toHaveBeenCalledWith(
      "https://api.digitalocean.com/v2/databases/cluster-1/resize",
      {
        size: "db-s-2vcpu-4gb",
        num_nodes: 3,
        storage_size_mib: 30720,
      },
      expect.any(Object)
    );
  });

  it("returns NOT_FOUND when cluster is missing", async () => {
    vi.mocked(Database_Clusters.read).mockResolvedValue({
      success: false,
      error: "not found",
    } as never);

    const result = await scalingResourceOperations.updateStorage("missing-cluster", "db-s-1vcpu-2gb");

    expect(result.success).toBe(false);
    expect(result.errorCode).toBe("NOT_FOUND");
  });

  it("returns INVALID_PARAMETER when upsize value is not greater than current", async () => {
    vi.mocked(Database_Clusters.read).mockResolvedValue({
      success: true,
      data: {
        owner_id: "user-1",
        name: "cluster-1",
        engine: "pg",
        size: "db-s-1vcpu-1gb",
        num_nodes: 1,
        storage_size_mib: 20480,
      },
    } as never);

    const result = await scalingResourceOperations.upsizeStorage({
      clusterId: "cluster-1",
      storageSizeMib: 20480,
    });

    expect(result.success).toBe(false);
    expect(result.errorCode).toBe("INVALID_PARAMETER");
  });

  it("returns DIGITALOCEAN_API_ERROR when provider resize call fails", async () => {
    vi.mocked(Database_Clusters.read).mockResolvedValue({
      success: true,
      data: {
        owner_id: "user-1",
        name: "cluster-1",
        engine: "pg",
        size: "db-s-1vcpu-1gb",
        num_nodes: 1,
        storage_size_mib: 10240,
      },
    } as never);

    const providerError = Object.assign(new Error("provider error"), {
      response: { status: 400, data: { message: "invalid request" } },
    });
    vi.mocked(axios.put).mockRejectedValue(providerError as never);

    const result = await scalingResourceOperations.updateStorage("cluster-1", "db-s-2vcpu-4gb");

    expect(result.success).toBe(false);
    expect(result.errorCode).toBe("DIGITALOCEAN_API_ERROR");
  });

  it("retries resize without storage_size_mib when provider rejects first payload", async () => {
    vi.mocked(Database_Clusters.read).mockResolvedValue({
      success: true,
      data: {
        owner_id: "user-1",
        name: "cluster-1",
        project_id: "project-1",
        engine: "pg",
        size: "db-s-1vcpu-1gb",
        num_nodes: 1,
        storage_size_mib: 10240,
      },
    } as never);
    vi.mocked(Database_Clusters.update_storage).mockResolvedValue({ success: true } as never);
    vi.mocked(Projects.add_log).mockResolvedValue(undefined as never);

    const firstError = Object.assign(new Error("bad storage for target size"), {
      response: { status: 400, data: { message: "invalid storage_size_mib" } },
    });
    vi.mocked(axios.put)
      .mockRejectedValueOnce(firstError as never)
      .mockResolvedValueOnce({ status: 202 } as never);

    const result = await scalingResourceOperations.updateStorage("cluster-1", "db-s-1vcpu-2gb");

    expect(result.success).toBe(true);
    expect(vi.mocked(axios.put)).toHaveBeenCalledTimes(2);
    expect(vi.mocked(axios.put).mock.calls[1]?.[1]).toEqual({
      size: "db-s-1vcpu-2gb",
      num_nodes: 1,
    });
  });

  it("applies mongodb storage limits (1gb ram max 25GiB)", async () => {
    vi.mocked(Database_Clusters.read).mockResolvedValue({
      success: true,
      data: {
        owner_id: "user-1",
        name: "cluster-1",
        engine: "mongodb",
        size: "db-s-1vcpu-1gb",
        num_nodes: 1,
        storage_size_mib: 15360, // 15GiB
      },
    } as never);

    const result = await scalingResourceOperations.upsizeStorage({
      clusterId: "cluster-1",
      storageSizeMib: 26624, // 26GiB > mongodb 1gb max 25GiB
    });

    expect(result.success).toBe(false);
    expect(result.errorCode).toBe("INVALID_PARAMETER");
    expect(result.error).toContain("cannot exceed 25 GiB");
  });
});
