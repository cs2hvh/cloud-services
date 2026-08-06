/**
 * GET /api/agents/runs/:id/stream — live SSE step feed for the dashboard.
 *
 * Session-authed, org-scoped. Pushes `step`/`status`/`done` events as the run
 * progresses so the playground renders steps the instant they land instead of
 * polling every 1.5s. Bounded by MAX_ITERS and aborts when the client disconnects.
 * (The api-key gateway equivalent is GET /v1/agents/runs/:id/stream.)
 */
import { NextRequest, NextResponse } from "next/server";
import { controlPlaneAuth } from "@/lib/inference/control-plane-auth";
import { agentScopeMismatch } from "@/lib/inference/api-key-auth";
import { AgentcoreRuns } from "@/lib/supabase/queries/agentcore";

export const dynamic = "force-dynamic";

const TERMINAL = new Set(["completed", "failed", "cancelled", "expired"]);
const POLL_MS = 900;
const MAX_ITERS = 400; // ~6 min cap; client reconnects/falls back for longer runs

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const authResult = await controlPlaneAuth(request, { session: "header", org: "bootstrap", allowAgentScoped: true });
  if (!authResult.ok) return authResult.response;
  const auth = authResult.auth;

  const org = { org_id: auth.orgId, role: auth.orgRole };

  // Verify the run is this org's before opening the stream (org-scoped, no IDOR).
  const initial = await AgentcoreRuns.getWithSteps(org.org_id, id);
  if (!initial) return NextResponse.json({ error: "Run not found" }, { status: 404 });
  // Same rule as ../trace: an agent-scoped key may only tail its own agent's
  // runs. Checked on the INITIAL read, before any SSE frame is written.
  if (agentScopeMismatch(auth, initial.agent_id)) {
    return NextResponse.json({ error: "Run not found" }, { status: 404 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      };
      let lastIndex = -1;
      try {
        for (let i = 0; i < MAX_ITERS; i++) {
          if (request.signal.aborted) break; // client navigated away

          const run = i === 0 ? initial : await AgentcoreRuns.getWithSteps(org.org_id, id);
          if (!run) { send("error", { error: "run gone" }); break; }

          for (const step of run.steps ?? []) {
            if (step.step_index > lastIndex) {
              send("step", { step });
              lastIndex = step.step_index;
            }
          }
          send("status", { status: run.status, cost_cents: run.cost_cents, step_count: run.step_count });

          if (TERMINAL.has(run.status)) {
            send("done", { status: run.status, output: run.output, error: run.error, cost_cents: run.cost_cents, step_count: run.step_count });
            break;
          }
          await new Promise((r) => setTimeout(r, POLL_MS));
        }
      } catch {
        try { send("error", { error: "stream error" }); } catch { /* controller closed */ }
      } finally {
        try { controller.close(); } catch { /* already closed */ }
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no", // disable proxy buffering
    },
  });
}
