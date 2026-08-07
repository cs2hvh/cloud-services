/**
 * DockerSandboxPool integration tests (S3) — REAL containers, opt-in.
 *
 * These spawn actual Docker containers, so they're gated behind RUN_SANDBOX_IT=1
 * and skipped by default (CI has no Docker; unit tests use MockSandboxPool). They
 * exist because the code-path they cover — the persistent kernel + the wall-clock
 * timeout — can't be exercised by unit tests, and a dead-timeout regression shipped
 * once precisely because nothing tested it. Run locally:
 *
 *   RUN_SANDBOX_IT=1 npx vitest run sandbox.integration
 *
 * Requires the python:3.12-slim image (docker pull python:3.12-slim).
 */
import { describe, it, expect } from "vitest";
import { DockerSandboxPool } from "../tools/sandbox/docker-pool.js";

const RUN = process.env.RUN_SANDBOX_IT === "1";
const IT_TIMEOUT = 40_000;

const mkPool = (timeoutMs = 2000) =>
  new DockerSandboxPool({ image: "python:3.12-slim", memory: "256m", cpus: "1", pidsLimit: 128, timeoutMs });

describe.skipIf(!RUN)("DockerSandboxPool (integration — needs Docker)", () => {
  it("persists state across exec calls (one kernel per run)", async () => {
    const pool = mkPool();
    const s = await pool.start({ runId: "it-state", orgId: "o" });
    await s.exec("x = 41");
    const r = await s.exec("x + 1");
    expect(r.stdout.trim()).toBe("42");
    expect(r.exit_code).toBe(0);
    await pool.dispose();
  }, IT_TIMEOUT);

  it("auto-prints the final bare expression, but not print() (no double)", async () => {
    const pool = mkPool();
    const s = await pool.start({ runId: "it-repl", orgId: "o" });
    expect((await s.exec("78*907000.87652")).stdout.trim()).toBe("70746068.36856");
    expect((await s.exec("print(1+1)")).stdout.trim()).toBe("2");
    expect((await s.exec("y = 5")).stdout.trim()).toBe(""); // assignment prints nothing
    await pool.dispose();
  }, IT_TIMEOUT);

  it("enforces the wall-clock timeout (regression guard for the dead-timeout bug)", async () => {
    const pool = mkPool(1200);
    const s = await pool.start({ runId: "it-timeout", orgId: "o" });
    const t0 = Date.now();
    const r = await s.exec("import time; time.sleep(10); print('should-not-print')", { timeoutMs: 1200 });
    const elapsed = Date.now() - t0;
    expect(elapsed).toBeLessThan(4000);        // aborted early, not after the full 10s
    expect(r.exit_code).toBe(124);             // timeout exit code
    expect(r.stdout).not.toContain("should-not-print");
    await pool.dispose();
  }, IT_TIMEOUT);

  it("blocks network egress and runs non-root in a read-only rootfs", async () => {
    const pool = mkPool();
    const s = await pool.start({ runId: "it-iso", orgId: "o" });
    const net = await s.exec(
      "import socket\ntry:\n socket.create_connection(('1.1.1.1',53),1); print('LEAK')\nexcept Exception: print('blocked')"
    );
    expect(net.stdout.trim()).toBe("blocked");
    expect((await s.exec("import os; os.getuid()")).stdout.trim()).toBe("65534");
    // rootfs is read-only; only /tmp is writable
    const ro = await s.exec("open('/root_probe','w')");
    expect(ro.exit_code).toBe(1);
    expect((await s.exec("open('/tmp/ok','w').write('x')")).exit_code).toBe(0);
    await pool.dispose();
  }, IT_TIMEOUT);

  it("surfaces a Python error as exit 1 + traceback, kernel survives for the next call", async () => {
    const pool = mkPool();
    const s = await pool.start({ runId: "it-err", orgId: "o" });
    const bad = await s.exec("1/0");
    expect(bad.exit_code).toBe(1);
    expect(bad.stderr).toMatch(/ZeroDivisionError/);
    // session still alive → next call works and state is intact
    expect((await s.exec("7*6")).stdout.trim()).toBe("42");
    await pool.dispose();
  }, IT_TIMEOUT);
});
