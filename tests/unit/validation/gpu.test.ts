import { describe, expect, it } from "vitest";

import { gpuV1PodCreateSchema } from "@/lib/validation/gpu";

describe("GPU request validation", () => {
  it("validates the public snake_case request contract", () => {
    expect(
      gpuV1PodCreateSchema.safeParse({
        name: "training-run-1",
        gpu_catalog_id: "h100-80gb-hbm3",
        gpu_count: 2,
        interruptible: true,
        image_name: "example/image:latest",
        ports: ["22/tcp", "8888/http"],
      }).success
    ).toBe(true);

    const minimalImageRequest = gpuV1PodCreateSchema.safeParse({
      name: "training-run-1",
      gpu_catalog_id: "h100-80gb-hbm3",
      image_name: "example/image:latest",
    });
    expect(minimalImageRequest.success).toBe(true);

    expect(
      gpuV1PodCreateSchema.safeParse({
        name: "training-run-1",
        gpu_catalog_id: "h100-80gb-hbm3",
        template_id: "pytorch-cuda-12",
        ports: ["99999/tcp"],
      }).success
    ).toBe(false);
  });

  it("requires template_id or image_name — not neither", () => {
    expect(
      gpuV1PodCreateSchema.safeParse({
        name: "training-run-1",
        gpu_catalog_id: "h100-80gb-hbm3",
        template_id: "pytorch-cuda-12",
      }).success
    ).toBe(true);

    expect(
      gpuV1PodCreateSchema.safeParse({
        name: "training-run-1",
        gpu_catalog_id: "h100-80gb-hbm3",
        image_name: "example/image:latest",
      }).success
    ).toBe(true);

    expect(
      gpuV1PodCreateSchema.safeParse({
        name: "training-run-1",
        gpu_catalog_id: "h100-80gb-hbm3",
      }).success
    ).toBe(false);
  });
});
