/**
 * Docker-backed sandbox pool (S3.1) — a REAL, testable, STATEFUL code executor.
 *
 * One hardened container per run holds a persistent Python kernel, so variables,
 * imports, defined functions AND files in the /tmp workspace persist across
 * `exec()` calls within a run (like OpenAI's Code Interpreter). That makes it a
 * general-purpose interpreter, not just a one-shot calculator: an agent can load
 * data in one step and analyse it in the next.
 *
 * Hardening (per exec's container, kept for the session lifetime):
 *   --network none        no egress (blocks metadata/SSRF/lateral movement)
 *   --memory / --cpus     hard resource caps
 *   --pids-limit          fork-bomb cap
 *   --read-only + tmpfs   root FS read-only; only /tmp (the workspace) is writable
 *   --user 65534 (nobody) non-root
 *   --cap-drop ALL + no-new-privileges
 *
 * REPL semantics: the kernel auto-prints the value of each exec's final
 * expression (notebook-style) so a bare `2 + 2` isn't silently lost.
 *
 * ⚠️ DEV/TESTABLE pool: containers share the host kernel — NOT the microVM
 * isolation the security review (doc 13) requires for production. The prod pool
 * swaps the runtime to gVisor (runsc)/Firecracker behind this same interface, and
 * it all stays behind SANDBOX_ENABLED regardless.
 */
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { randomBytes } from "node:crypto";
import type { ExecResult, SandboxPool, SandboxSession } from "./pool.js";

export interface DockerPoolOpts {
  image: string;        // e.g. python:3.12-slim (or a data image with numpy/pandas)
  memory: string;       // e.g. 256m
  cpus: string;         // e.g. "1"
  pidsLimit: number;    // e.g. 128
  timeoutMs: number;    // per-exec wall-clock cap
  runtime?: string;     // e.g. "runsc" (gVisor) when available; default docker runtime
}

const MAX_STREAM_BYTES = 100_000;

/**
 * The persistent kernel (run as `python -c`). Reads base64(code) lines from
 * stdin; for each, AST-transforms the last bare expression into an auto-print,
 * execs it in ONE shared globals dict with a persistent /tmp cwd, and replies
 * with `<sentinel> <stdout_b64> <stderr_b64> <status> <cpu>`. base64 on both
 * sides means no delimiter/injection collisions. (No `${` — safe as a template.)
 */
const KERNEL = `
import sys, os, ast, io, base64, time, contextlib, traceback
os.chdir('/tmp')
_S = os.environ.get('AGENT_KERNEL_SENTINEL', 'SENT')
_G = {'__name__': '__main__'}
def _wrap(mod):
    b = mod.body
    if b and isinstance(b[-1], ast.Expr):
        e = b[-1]
        asn = ast.Assign(targets=[ast.Name(id='_agent_last', ctx=ast.Store())], value=e.value)
        grd = ast.If(
            test=ast.Compare(left=ast.Name(id='_agent_last', ctx=ast.Load()), ops=[ast.IsNot()], comparators=[ast.Constant(value=None)]),
            body=[ast.Expr(value=ast.Call(func=ast.Name(id='print', ctx=ast.Load()), args=[ast.Name(id='_agent_last', ctx=ast.Load())], keywords=[]))],
            orelse=[])
        b[-1:] = [asn, grd]
        ast.fix_missing_locations(mod)
    return mod
while True:
    line = sys.stdin.readline()
    if not line:
        break
    line = line.strip()
    if not line:
        continue
    out = io.StringIO(); err = io.StringIO(); status = 0
    t0 = time.process_time()
    try:
        src = base64.b64decode(line).decode('utf-8')
        co = compile(_wrap(ast.parse(src)), '<agent-code>', 'exec')
        with contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
            exec(co, _G)
    except SystemExit:
        pass
    except BaseException:
        traceback.print_exc(file=err); status = 1
    cpu = time.process_time() - t0
    so = base64.b64encode(out.getvalue().encode('utf-8', 'replace')).decode()
    se = base64.b64encode(err.getvalue().encode('utf-8', 'replace')).decode()
    sys.stdout.write(_S + ' ' + so + ' ' + se + ' ' + str(status) + ' ' + ('%.4f' % cpu) + '\\n')
    sys.stdout.flush()
`;

/** One long-lived container + kernel. Serialises execs (one interpreter). */
class DockerSession implements SandboxSession {
  readonly id: string;
  private child: ChildProcessWithoutNullStreams | null = null;
  private readonly sentinel = `AGENT_K_${randomBytes(9).toString("hex")}`;
  private buf = "";
  private waiter: ((line: string | null) => void) | null = null;
  private totalCpu = 0;
  private dead = false;

  constructor(private readonly opts: DockerPoolOpts, runId: string) {
    this.id = `sbx_${runId.replace(/[^a-zA-Z0-9]/g, "").slice(0, 24)}_${Date.now().toString(36)}`;
  }

  private ensureStarted(): ChildProcessWithoutNullStreams {
    if (this.child) return this.child;
    const args = [
      "run", "--rm", "-i", "--name", this.id,
      "--network", "none",
      "--memory", this.opts.memory,
      "--cpus", this.opts.cpus,
      "--pids-limit", String(this.opts.pidsLimit),
      "--read-only", "--tmpfs", "/tmp:size=256m,exec",
      "--workdir", "/tmp",
      "--user", "65534:65534",
      "--security-opt", "no-new-privileges",
      "--cap-drop", "ALL",
      "-e", "PYTHONUNBUFFERED=1",
      "-e", `AGENT_KERNEL_SENTINEL=${this.sentinel}`,
      ...(this.opts.runtime ? ["--runtime", this.opts.runtime] : []),
      this.opts.image, "python", "-c", KERNEL,
    ];
    const child = spawn("docker", args, { stdio: ["pipe", "pipe", "pipe"] });
    child.stdout.on("data", (d) => this.onStdout(d.toString()));
    child.stderr.on("data", () => {}); // container/docker noise — kernel replies go to stdout
    child.on("close", () => { this.dead = true; this.waiter?.(null); this.waiter = null; });
    child.on("error", () => { this.dead = true; this.waiter?.(null); this.waiter = null; });
    child.stdin.on("error", () => {});
    this.child = child;
    return child;
  }

  // Accumulate stdout; deliver the first complete sentinel line to a waiter.
  private onStdout(chunk: string): void {
    this.buf += chunk;
    let nl: number;
    while ((nl = this.buf.indexOf("\n")) !== -1) {
      const line = this.buf.slice(0, nl);
      this.buf = this.buf.slice(nl + 1);
      if (line.startsWith(this.sentinel + " ") && this.waiter) {
        const w = this.waiter;
        this.waiter = null;
        w(line);
        return;
      }
      // non-sentinel line (stray print) is ignored — kernel batches real output in the reply
    }
  }

  async exec(code: string, opts?: { timeoutMs?: number }): Promise<ExecResult> {
    if (this.dead) {
      return { stdout: "", stderr: "sandbox session is no longer available", exit_code: 137, cpu_seconds: 0, capped: true };
    }
    const child = this.ensureStarted();
    const timeoutMs = opts?.timeoutMs ?? this.opts.timeoutMs;
    const start = Date.now();

    const replyLine = await new Promise<string | null>((resolve) => {
      // `done` is the single settle path — used both by onStdout (real reply) and
      // the timeout. The guard MUST compare against `done` (the ref `this.waiter`
      // holds), not `resolve`, or the timeout never fires and a hung exec (e.g.
      // `while True`) blocks forever + leaks the container.
      const done = (l: string | null) => { this.waiter = null; clearTimeout(timer); resolve(l); };
      const timer = setTimeout(() => {
        if (this.waiter === done) {
          // A hung exec can't be interrupted inside the single-threaded kernel, so
          // we kill the whole container. Trade-off: the rest of the run's code
          // steps lose session state (they get "session no longer available",
          // exit 137). Safer than leaking a CPU-burning container.
          this.dead = true;
          spawn("docker", ["kill", this.id]).on("error", () => {});
          done(null);
        }
      }, timeoutMs);
      this.waiter = done;
      child.stdin.write(Buffer.from(code, "utf8").toString("base64") + "\n");
    });

    if (replyLine === null) {
      return { stdout: "", stderr: "code execution timed out", exit_code: 124, cpu_seconds: (Date.now() - start) / 1000, capped: true };
    }
    const [, soB64 = "", seB64 = "", statusStr = "0", cpuStr = "0"] = replyLine.split(" ");
    const stdout = Buffer.from(soB64, "base64").toString("utf8").slice(0, MAX_STREAM_BYTES);
    const stderr = Buffer.from(seB64, "base64").toString("utf8").slice(0, MAX_STREAM_BYTES);
    const cpu = Number(cpuStr) || (Date.now() - start) / 1000;
    this.totalCpu += cpu;
    return { stdout, stderr, exit_code: Number(statusStr) || 0, cpu_seconds: cpu };
  }

  async stop(): Promise<{ cpu_seconds: number }> {
    // Per-run teardown is done by the pool's dispose(); a per-exec stop() must NOT
    // kill the session (that would drop state between code calls). No-op here.
    return { cpu_seconds: this.totalCpu };
  }

  async destroy(): Promise<{ cpu_seconds: number }> {
    if (this.child && !this.dead) {
      try { this.child.stdin.end(); } catch { /* ignore */ }
      spawn("docker", ["kill", this.id]).on("error", () => {}); // best-effort; --rm cleans up
    }
    this.dead = true;
    return { cpu_seconds: this.totalCpu };
  }
}

/**
 * Per-run pool: one instance is created per run and holds ONE session, so every
 * `code` call in that run shares state. `dispose()` (called at run end by the
 * runner) tears the container down and returns total CPU-seconds for billing.
 */
export class DockerSandboxPool implements SandboxPool {
  private session: DockerSession | null = null;
  constructor(private readonly opts: DockerPoolOpts) {}

  async start(ctx: { runId: string; orgId: string }): Promise<SandboxSession> {
    if (!this.session) this.session = new DockerSession(this.opts, ctx.runId);
    return this.session;
  }

  async dispose(): Promise<{ cpu_seconds: number }> {
    if (!this.session) return { cpu_seconds: 0 };
    return this.session.destroy();
  }
}
