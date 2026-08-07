/**
 * Sandbox pool seam (S3.1) — the interface the `code` tool depends on.
 *
 * ⚠️ GATE: the REAL pool (gVisor/Firecracker microVMs) is NOT implemented and is
 * BLOCKED until the security review signs off (nextstespsAI/13-agent-s3-sandbox-
 * security-review.md) AND the §15.3 infra decision is made. Only the interface +
 * a deterministic MockSandboxPool exist now, so the `code` tool, settle, and
 * reaper logic can be built and unit-tested WITHOUT executing any customer code.
 *
 * The `code` tool is additionally hard-gated behind `SANDBOX_ENABLED` (default
 * false everywhere) — see code.ts. Wiring a real executor here without both the
 * sign-off and the flag would breach the gate.
 */

/** Result of one code execution inside a session. */
export interface ExecResult {
  stdout: string;
  stderr: string;
  exit_code: number;
  /** CPU-seconds consumed by this exec — the billing basis (cents_per_cpu_second). */
  cpu_seconds: number;
  /** True if a hard cap (wall-clock/memory) killed the exec. */
  capped?: boolean;
}

/** One live sandbox session (one microVM). */
export interface SandboxSession {
  readonly id: string;
  exec(code: string, opts?: { timeoutMs?: number }): Promise<ExecResult>;
  /** Tear down the VM; returns total CPU-seconds for the session (settle basis). */
  stop(): Promise<{ cpu_seconds: number }>;
}

/**
 * Hands out a code-interpreter session for a run. One pool instance per run: it
 * returns the SAME session for every `code` call so state (variables, imports,
 * files) persists across calls. `dispose()` (called by the runner at run end)
 * tears the session down and returns total CPU-seconds. Implemented by the real
 * pool (S3, gated) and the mock.
 */
export interface SandboxPool {
  start(ctx: { runId: string; orgId: string }): Promise<SandboxSession>;
  dispose(): Promise<{ cpu_seconds: number }>;
}

/**
 * Deterministic mock pool — NO real execution, NO isolation. For unit tests and
 * as the default until the real pool lands. `exec` returns a canned, safe result
 * derived from the input so tests can assert wiring/metering without a VM.
 */
export class MockSandboxPool implements SandboxPool {
  private session: SandboxSession | null = null;
  private total = 0;
  constructor(private readonly perExecCpuSeconds = 0.05) {}

  async start(ctx: { runId: string; orgId: string }): Promise<SandboxSession> {
    if (this.session) return this.session; // one session per run — state "persists"
    const perExec = this.perExecCpuSeconds;
    const self = this;
    this.session = {
      id: `mock_sess_${ctx.runId}`,
      async exec(code: string): Promise<ExecResult> {
        self.total += perExec;
        // Echo a bounded, deterministic marker — never actually runs `code`.
        return { stdout: `[mock-sandbox] executed ${code.length} chars`, stderr: "", exit_code: 0, cpu_seconds: perExec };
      },
      async stop() {
        return { cpu_seconds: self.total };
      },
    };
    return this.session;
  }

  async dispose(): Promise<{ cpu_seconds: number }> {
    return { cpu_seconds: this.total };
  }
}
