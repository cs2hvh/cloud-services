import { describe, expect, it } from "vitest";
import {
  canSupportStatusBeReopened,
  getFileExtension,
  getSupportTopicById,
  isAllowedSupportFile,
  isSupportOpenStatus,
  getSupportTopicLabel,
  isValidSupportTopic,
} from "@/lib/support/catalog";

describe("Support catalog helpers", () => {
  it("should validate configured topics", () => {
    expect(isValidSupportTopic("kubernetes")).toBe(true);
    expect(isValidSupportTopic("unknown_topic")).toBe(false);
  });

  it("should expose the topic label, or null for unknown topics", () => {
    expect(getSupportTopicLabel("billing")).toBe("Billing & Transactions");
    expect(getSupportTopicLabel("unknown_topic")).toBeNull();
  });

  it("should return topic metadata for known topics", () => {
    const topic = getSupportTopicById("kubernetes");
    expect(topic?.label).toContain("Kubernetes");
    expect(topic?.resourceType).toBe("kubernetes");
  });

  it("should support attachment extensions added for support workflow", () => {
    expect(isAllowedSupportFile("logs.csv", "text/csv")).toBe(true);
    expect(
      isAllowedSupportFile(
        "capacity.xlsx",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      )
    ).toBe(true);
    expect(isAllowedSupportFile("notes.txt", "text/plain")).toBe(true);
    expect(isAllowedSupportFile("report.doc", "application/msword")).toBe(true);
  });

  it("should reject unsupported file types", () => {
    expect(isAllowedSupportFile("payload.exe", "application/octet-stream")).toBe(false);
  });

  it("should allow octet-stream when extension is in allowed list", () => {
    expect(isAllowedSupportFile("capture.docx", "application/octet-stream")).toBe(true);
  });

  it("should parse file extension safely", () => {
    expect(getFileExtension("archive.tar.gz")).toBe("gz");
    expect(getFileExtension("README")).toBe("");
  });

  it("should classify open and reopenable statuses correctly", () => {
    expect(isSupportOpenStatus("open")).toBe(true);
    expect(isSupportOpenStatus("resolved")).toBe(false);
    expect(canSupportStatusBeReopened("closed")).toBe(true);
    expect(canSupportStatusBeReopened("permantly_close")).toBe(false);
  });
});
