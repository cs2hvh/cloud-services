import { describe, expect, it } from "vitest";

import { computeMonthlyVolumeCost } from "@/lib/services/runpod/operations/volume-operations";

describe("GPU network volume pricing", () => {
  it("applies tiered provider pricing and the existing GPU markup", () => {
    expect(computeMonthlyVolumeCost(1000)).toEqual({
      runpod: 70,
      resale: 87.5,
    });
    expect(computeMonthlyVolumeCost(1500)).toEqual({
      runpod: 95,
      resale: 118.75,
    });
  });
});
