import { describe, expect, it } from "vitest";

import { generateOpenAPIDocument } from "@/lib/openapi/registry";

describe("GPU OpenAPI boundary", () => {
  it("publishes only v1 GPU routes", () => {
    const document = generateOpenAPIDocument();
    const paths = Object.keys(document.paths);
    const gpuPaths = paths.filter((path) => path.includes("/gpu/"));

    expect(gpuPaths).toContain("/api/v1/gpu/pods");
    expect(gpuPaths).toContain("/api/v1/gpu/volumes");
    expect(gpuPaths).toContain("/api/v1/gpu/volumes/{id}");
    expect(gpuPaths.some((path) => path.startsWith("/api/services/gpu/"))).toBe(false);
  });

  it("uses public API-key security and 201 create responses", () => {
    const document = generateOpenAPIDocument();
    const createPod = document.paths["/api/v1/gpu/pods"]?.post;

    expect(createPod?.security).toEqual([{ bearerAuth: [] }]);
    expect(createPod?.responses).toHaveProperty("201");
    expect(createPod?.responses).not.toHaveProperty("200");
  });

  it("does not expose unsafe volume attachment and documents delete conflicts", () => {
    const document = generateOpenAPIDocument();
    const deleteVolume = document.paths["/api/v1/gpu/volumes/{id}"]?.delete;

    expect(JSON.stringify(document.components?.schemas?.GpuPodCreateRequest)).not.toContain(
      "network_volume_id"
    );
    expect(deleteVolume?.responses).toHaveProperty("409");
  });
});
