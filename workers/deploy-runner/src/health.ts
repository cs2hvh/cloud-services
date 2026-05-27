import { createServer, type Server } from "http";
import type { Logger } from "./logger.js";

export interface HealthState {
  ready: boolean;
  lastClaimTickAt: number | null;
  lastWorkerActivityAt: number;
}

export function startHealthServer(port: number, state: HealthState, logger: Logger): Server {
  const server = createServer((req, res) => {
    const url = req.url ?? "/";
    if (url === "/ready") {
      res.writeHead(state.ready ? 200 : 503, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ready: state.ready }));
      return;
    }
    if (url === "/health" || url === "/healthz" || url === "/") {
      const now = Date.now();
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          ok: true,
          ready: state.ready,
          last_claim_tick_ms_ago: state.lastClaimTickAt === null ? null : now - state.lastClaimTickAt,
          last_worker_activity_ms_ago: now - state.lastWorkerActivityAt,
        })
      );
      return;
    }
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "not found" }));
  });

  server.listen(port, () => {
    logger.info({ port }, "health server listening");
  });

  return server;
}
