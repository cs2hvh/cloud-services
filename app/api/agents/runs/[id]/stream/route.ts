/**
 * GET /api/agents/runs/:id/stream — live SSE step feed for the dashboard.
 *
 * Session-authed, org-scoped. Pushes `step`/`status`/`done` events as the run
 * progresses so the playground renders steps the instant they land instead of
 * polling every 1.5s. Bounded by MAX_ITERS and aborts when the client disconnects.
 * (The api-key gateway equivalent is GET /v1/agents/runs/:id/stream.)
 */
import { NextRequest, NextResponse } from "next/server";
import { authenticateUserFromHeader } from "@/lib/auth/server-auth";
import { getOrBootstrapOrgForUser } from "@/lib/inference/orgs";
import { AgentcoreRuns } from "@/lib/supabase/queries/agentcore";

export const dynamic = "force-dynamic";

const TERMINAL = new Set(["completed", "failed", "cancelled", "expired"]);
const POLL_MS = 900;
const MAX_ITERS = 400; // ~6 min cap; client reconnects/falls back for longer runs

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await authenticateUserFromHeader(request);
  if (!auth.authenticated) return auth.response;

  let org;
  try {
    org = await getOrBootstrapOrgForUser(auth.user!.id, auth.user!.email ?? "");
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Org error" }, { status: 500 });
  }

  // Verify the run is this org's before opening the stream (org-scoped, no IDOR).
  const initial = await AgentcoreRuns.getWithSteps(org.org_id, id);
  if (!initial) return NextResponse.json({ error: "Run not found" }, { status: 404 });

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
