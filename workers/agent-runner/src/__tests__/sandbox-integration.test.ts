/**
 * Docker-gated integration tests for the real sandbox executor.
 *
 * These run ONLY where a docker daemon + python image are available; they skip
 * automatically in CI without Docker. They cover the behaviours plain unit tests
 * (mock pool) can't: real cross-exec state persistence, notebook auto-echo, and —
 * critically — the per-exec wall-clock TIMEOUT, whose guard silently regressed
 * once because nothing exercised it. This is that missing test.
 */
import { describe, it, expect } from "vitest";
import { spawnSync } from "node:child_process";
import { DockerSandboxPool } from "../tools/sandbox/docker-pool.js";

const DOCKER_OK = (() => {
  try {
    return spawnSync("docker", ["info"], { stdio: "ignore", timeout: 5000 }).status === 0;
  } catch {
    return false;
  }
})();

const opts = { image: "python:3.12-slim", memory: "256m", cpus: "1", pidsLimit: 128, timeoutMs: 2000 };

describe.skipIf(!DOCKER_OK)("DockerSandboxPool (integration · docker required)", () => {
  it("persists variables + imports across exec() calls", async () => {
    const pool = new DockerSandboxPool(opts);
    const s = await pool.start({ runId: "it-state", orgId: "o" });
    await s.exec("import math\nx = 41");
    const r = await s.exec("math.trunc(x + 1.9)");
    expect(r.stdout.trim()).toBe("42");
    await pool.dispose();
  }, 40000);

  it("auto-prints the final bare expression (notebook semantics)", async () => {
    const pool = new DockerSandboxPool(opts);
    const s = await pool.start({ runId: "it-echo", orgId: "o" });
    const r = await s.exec("6 * 7");
    expect(r.stdout.trim()).toBe("42");
    expect(r.exit_code).toBe(0);
    await pool.dispose();
  }, 40000);

  it("enforces the wall-clock timeout on a hung exec, then dies gracefully", async () => {
    const pool = new DockerSandboxPool(opts);
    const s = await pool.start({ runId: "it-timeout", orgId: "o" });
    const t0 = Date.now();
    const r = await s.exec("while True:\n    pass", { timeoutMs: 1500 });
    const elapsed = Date.now() - t0;
    expect(r.capped).toBe(true);
    expect(r.exit_code).toBe(124);
    expect(elapsed).toBeLessThan(6000); // aborted near the cap — not hanging forever
    // Session is now dead: a subsequent exec must return promptly, not block.
    const r2 = await s.exec("1 + 1");
    expect(r2.exit_code).toBe(137);
    await pool.dispose();
  }, 40000);
});
