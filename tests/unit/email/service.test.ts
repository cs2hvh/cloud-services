import { EmailService } from "@/lib/email/service";
import { describe, expect, it } from "vitest";

describe("EmailService", () => {
  const service = new EmailService();

  it("builds OTP email payloads from the registered template", () => {
    process.env.RESEND_FROM_EMAIL = "platform@example.com";
    process.env.RESEND_REPLY_TO = "help@example.com";

    const message = service.buildMessage({
      template: "otp",
      to: "user@example.com",
      data: {
        username: "Taylor",
        otp: "123456",
      },
      tags: [{ name: "module", value: "auth" }],
    });

    expect(message.from).toBe("platform@example.com");
    expect(message.replyTo).toBe("help@example.com");
    expect(message.to).toBe("user@example.com");
    expect(message.subject).toBe("AhuraSense | Your OTP Code");
    expect(message.text).toContain("Taylor");
    expect(message.tags).toEqual([
      { name: "category", value: "auth" },
      { name: "module", value: "auth" },
    ]);
    expect(message.react).toBeTruthy();
  });

  it("builds deployment emails with dynamic tags and subject data", () => {
    const message = service.buildMessage({
      template: "deploymentStatus",
      to: ["ops@example.com", "owner@example.com"],
      data: {
        customerName: "Jordan",
        serviceName: "payments-api",
        environment: "production",
        status: "failed",
        deployedAt: "2026-03-06T12:00:00Z",
        errorMessage: "CrashLoopBackOff",
      },
    });

    expect(message.subject).toBe(
      "AhuraSense | payments-api deployment failed on production",
    );
    expect(message.to).toEqual(["ops@example.com", "owner@example.com"]);
    expect(message.tags).toEqual([
      { name: "category", value: "deployments" },
      { name: "status", value: "failed" },
      { name: "environment", value: "production" },
    ]);
  });

  it("builds new login alert emails", () => {
    const message = service.buildMessage({
      template: "newLoginAlert",
      to: "user@example.com",
      data: {
        username: "Taylor",
        device: "MacBook Pro",
        location: "Bengaluru, IN",
        loggedInAt: "2026-03-06 14:00 UTC",
      },
    });

    expect(message.subject).toBe(
      "AhuraSense | New login detected from Bengaluru, IN",
    );
    expect(message.text).toContain("MacBook Pro");
    expect(message.tags).toEqual([
      { name: "category", value: "account-security" },
    ]);
  });
});
