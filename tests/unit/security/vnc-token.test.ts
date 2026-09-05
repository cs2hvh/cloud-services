import { beforeAll, describe, expect, it } from "vitest";

/**
 * The VNC token carries the Proxmox session ticket. These tests hold the
 * 2026-09-05 rule: the browser must not be able to read it, and nothing but
 * the proxy holding the secret may mint or accept one.
 */
describe("lib/vnc-token", () => {
  beforeAll(() => {
    process.env.VNC_TOKEN_SECRET = "test-secret-for-vnc-tokens";
  });

  const sample = {
    proxmoxUrl: "https://pve.example.test:8006",
    allowInsecureTls: false,
    node: "pve1",
    vmid: 101,
    vncPort: 5901,
    vncTicket: "PVEVNC:ticket-value",
    pveTicket: "PVE:root@pam:ABCDEF",
    userId: "00000000-0000-0000-0000-000000000001",
  };

  it("round-trips a payload", async () => {
    const { createVncToken, validateVncToken } = await import("@/lib/vnc-token");
    const token = createVncToken(sample, 300);
    const payload = validateVncToken(token);
    expect(payload).not.toBeNull();
    expect(payload).toMatchObject(sample);
    expect(typeof payload?.nonce).toBe("string");
    expect(payload!.exp).toBeGreaterThan(Math.floor(Date.now() / 1000));
  });

  it("does not expose the tickets to whoever holds the token", async () => {
    const { createVncToken } = await import("@/lib/vnc-token");
    const token = createVncToken(sample, 300);
    const decodedParts = token.split(".").map((p) => {
      try {
        return Buffer.from(p, "base64url").toString("utf8");
      } catch {
        return "";
      }
    });
    for (const part of decodedParts) {
      expect(part).not.toContain(sample.pveTicket);
      expect(part).not.toContain(sample.vncTicket);
      expect(part).not.toContain("proxmoxUrl");
    }
  });

  it("refuses a tampered token", async () => {
    const { createVncToken, validateVncToken } = await import("@/lib/vnc-token");
    const token = createVncToken(sample, 300);
    const [v, iv, ct, tag] = token.split(".");
    const flipped = Buffer.from(ct, "base64url");
    flipped[0] ^= 0xff;
    expect(validateVncToken(`${v}.${iv}.${flipped.toString("base64url")}.${tag}`)).toBeNull();
    expect(validateVncToken(`${v}.${iv}.${ct}.${Buffer.alloc(16).toString("base64url")}`)).toBeNull();
  });

  it("refuses an expired token", async () => {
    const { createVncToken, validateVncToken } = await import("@/lib/vnc-token");
    const token = createVncToken(sample, -1);
    expect(validateVncToken(token)).toBeNull();
  });

  it("refuses the previous signed-but-readable format", async () => {
    const { validateVncToken } = await import("@/lib/vnc-token");
    const legacyPayload = Buffer.from(JSON.stringify({ ...sample, nonce: "x", exp: 9999999999 })).toString("base64url");
    expect(validateVncToken(`${legacyPayload}.anysignature`)).toBeNull();
    expect(validateVncToken("")).toBeNull();
    expect(validateVncToken("v2.a.b")).toBeNull();
  });
});
