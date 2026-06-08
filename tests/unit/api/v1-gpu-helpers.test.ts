import { describe, expect, it } from "vitest";

import {
  serializeGpuInventoryForV1,
  serializeGpuPodDetailForV1,
  v1GpuServiceError,
} from "@/lib/api/v1-gpu-helpers";

describe("GPU v1 helpers", () => {
  it("removes provider IDs and wholesale pricing from inventory", () => {
    const serialized = serializeGpuInventoryForV1({
      gpuCatalogId: "h100",
      runpodGpuId: "provider-h100",
      displayName: "H100",
      memoryGb: 80,
      cloudType: "SECURE",
      stockStatus: "high",
      availableCounts: [1, 2, 8, 9, 10],
      onDemandPerHr: 2,
      spotPerHr: 1,
      resaleOnDemandPerHr: 2.5,
      resaleSpotPerHr: 1.25,
      observedAt: "2026-06-06T00:00:00.000Z",
    });

    expect(serialized).not.toHaveProperty("runpodGpuId");
    expect(serialized).not.toHaveProperty("onDemandPerHr");
    expect(serialized.on_demand_price_per_gpu_hour).toBe(2.5);
    expect(serialized.available_counts).toEqual([1, 2, 8]);
  });

  it("omits provider attachment data and raw pod details", () => {
    const serialized = serializeGpuPodDetailForV1({
      id: 42,
      name: "pod",
      status: "running",
      gpuCatalogId: "h100",
      gpuCount: 1,
      cloudType: "SECURE",
      interruptible: false,
      publicIp: null,
      portMappings: null,
      hourlyCostUsd: 2.5,
      createdAt: "2026-06-06T00:00:00.000Z",
      runpodPodId: "provider-pod",
      ownerId: "00000000-0000-0000-0000-000000000000",
      imageName: "image",
      templateId: null,
      containerDiskGb: 50,
      volumeGb: 0,
      networkVolumeId: "7",
      dataCenterId: "PROVIDER-DC",
      ports: ["22/tcp"],
      envKeys: [],
      sshCommand: null,
      details: { provider: "raw" },
      billingStart: null,
      billingEnd: null,
    });

    expect(serialized).not.toHaveProperty("network_volume_id");
    expect(serialized).not.toHaveProperty("runpodPodId");
    expect(serialized).not.toHaveProperty("ownerId");
    expect(serialized).not.toHaveProperty("details");
    expect(serialized).not.toHaveProperty("dataCenterId");
  });

  it("maps payment and capacity failures to v1 errors", async () => {
    const payment = v1GpuServiceError(
      { errorCode: "INVALID", error: "Insufficient credits" },
      "CREATE_FAILED",
      "Create failed"
    );
    expect(payment.status).toBe(402);
    expect((await payment.json()).error).toBe("INSUFFICIENT_BALANCE");

    const capacity = v1GpuServiceError(
      { errorCode: "CAPACITY", error: "Unavailable" },
      "CREATE_FAILED",
      "Create failed"
    );
    expect(capacity.status).toBe(409);
  });
});
