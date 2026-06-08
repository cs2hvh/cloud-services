import { beforeEach, describe, expect, it, vi } from "vitest";

const { requestMock } = vi.hoisted(() => ({
  requestMock: vi.fn(),
}));

vi.mock("axios", () => ({
  default: {
    request: requestMock,
    post: vi.fn(),
    isAxiosError: (error: unknown) =>
      Boolean(error && typeof error === "object" && "isAxiosError" in error),
  },
}));

import { RunPodClient } from "@/lib/services/runpod/client";

describe("RunPodClient", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("RUNPOD_API_KEY", "test-key");
  });

  it("does not retry non-idempotent POST requests after a timeout", async () => {
    requestMock.mockRejectedValue({
      isAxiosError: true,
      message: "timeout",
    });

    await expect(
      RunPodClient.rest("POST", "/pods", { name: "pod" })
    ).rejects.toMatchObject({
      code: "TIMEOUT",
      retryable: true,
    });

    expect(requestMock).toHaveBeenCalledTimes(1);
  });

  it("allows idempotent GET list lookups used for timeout recovery", async () => {
    requestMock.mockResolvedValue({
      data: [{ id: "pod-1", name: "samatva-1-test" }],
    });

    await expect(RunPodClient.rest("GET", "/pods")).resolves.toEqual([
      { id: "pod-1", name: "samatva-1-test" },
    ]);

    expect(requestMock).toHaveBeenCalledTimes(1);
  });
});
