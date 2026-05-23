/**
 * Custom Next.js server with VNC WebSocket proxy.
 *
 * This wraps the standard Next.js HTTP server and adds a WebSocket
 * upgrade handler on /ws/vnc for proxying VNC traffic to Proxmox.
 *
 * Usage:
 *   DEV:   tsx server.ts
 *   PROD:  node server.js  (after building)
 */
import { createServer } from 'http';
import https from 'https';
import { parse } from 'url';
import next from 'next';
import { WebSocketServer, WebSocket } from 'ws';
import { validateVncToken } from './lib/vnc-token';
import { startBuildWorkers } from './lib/workers/build-worker';
import { startProjectDeployWorker } from './lib/workers/project-deploy-worker';

const dev = process.env.NODE_ENV !== 'production';
const hostname = process.env.HOSTNAME || '0.0.0.0';
const port = parseInt(process.env.PORT || '3000', 10);

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const server = createServer((req, res) => {
    const parsedUrl = parse(req.url!, true);
    handle(req, res, parsedUrl);
  });

  // ── VNC WebSocket Proxy ──────────────────────────────
  const wss = new WebSocketServer({ noServer: true });

  // In dev mode, Next.js registers its own upgrade handler for HMR.
  // We need to intercept upgrade before Next.js gets it, but only for /ws/vnc.
  // Save any existing upgrade listeners that Next.js registers during prepare().
  const existingUpgradeListeners = server.listeners('upgrade').slice();

  // Remove Next.js upgrade listeners so we can intercept first
  server.removeAllListeners('upgrade');

  server.on('upgrade', (req, socket, head) => {
    const { pathname, query } = parse(req.url!, true);

    // Only handle VNC WebSocket upgrades; everything else goes to Next.js HMR
    if (pathname !== '/ws/vnc') {
      // Forward to Next.js HMR upgrade handler(s)
      for (const listener of existingUpgradeListeners) {
        (listener as Function).call(server, req, socket, head);
      }
      return;
    }

    console.log('[vnc-proxy] Upgrade request received for /ws/vnc');

    const token = query.token as string;
    if (!token) {
      console.log('[vnc-proxy] No token provided');
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return;
    }

    const payload = validateVncToken(token);
    if (!payload) {
      console.log('[vnc-proxy] Invalid or expired token');
      socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
      socket.destroy();
      return;
    }

    console.log(`[vnc-proxy] Token valid for VM ${payload.vmid} on ${payload.node}`);

    wss.handleUpgrade(req, socket, head, (clientWs) => {
      wss.emit('connection', clientWs, req, payload);
    });
  });

  wss.on('connection', (clientWs: WebSocket, _req: unknown, payload: unknown) => {
    const { proxmoxUrl, allowInsecureTls, node, vmid, vncPort, vncTicket, pveTicket } =
      payload as NonNullable<ReturnType<typeof validateVncToken>>;

    // Build upstream Proxmox VNC WebSocket URL
    const base = proxmoxUrl.replace(/\/$/, '');
    const wsBase = base.replace('https://', 'wss://').replace('http://', 'ws://');
    const upstreamUrl =
      `${wsBase}/api2/json/nodes/${encodeURIComponent(node)}/qemu/${vmid}/vncwebsocket` +
      `?port=${vncPort}&vncticket=${encodeURIComponent(vncTicket)}`;

    console.log(`[vnc-proxy] Connecting upstream for VM ${vmid} on ${node}, port ${vncPort}`);

    // Build HTTPS agent for self-signed cert handling
    const agent = allowInsecureTls
      ? new https.Agent({ rejectUnauthorized: false })
      : undefined;

    // Connect to Proxmox VNC WebSocket (requires PVE auth cookie + VNC ticket)
    const upstreamWs = new WebSocket(upstreamUrl, {
      agent,
      rejectUnauthorized: !allowInsecureTls,
      headers: {
        Cookie: `PVEAuthCookie=${pveTicket}`,
      },
    });

    let upstreamReady = false;
    const pendingMessages: { data: Buffer | ArrayBuffer; isBinary: boolean }[] = [];

    upstreamWs.on('open', () => {
      upstreamReady = true;
      console.log(`[vnc-proxy] Upstream connected for VM ${vmid}`);
      // Flush any buffered messages
      for (const msg of pendingMessages) {
        upstreamWs.send(msg.data, { binary: msg.isBinary });
      }
      console.log(`[vnc-proxy] Flushed ${pendingMessages.length} buffered messages`);
      pendingMessages.length = 0;
    });

    // Relay: client → Proxmox (preserve binary frame type)
    clientWs.on('message', (data: Buffer | ArrayBuffer, isBinary: boolean) => {
      if (upstreamReady && upstreamWs.readyState === WebSocket.OPEN) {
        upstreamWs.send(data, { binary: isBinary });
      } else {
        pendingMessages.push({ data, isBinary });
      }
    });

    // Relay: Proxmox → client (preserve binary frame type)
    upstreamWs.on('message', (data: Buffer | ArrayBuffer, isBinary: boolean) => {
      if (clientWs.readyState === WebSocket.OPEN) {
        clientWs.send(data, { binary: isBinary });
      }
    });

    // Error handling
    upstreamWs.on('error', (err) => {
      console.error('[vnc-proxy] Upstream error:', (err as any).code || err.message, err);
      if (clientWs.readyState === WebSocket.OPEN) {
        clientWs.close(1011, 'Upstream connection error');
      }
    });

    upstreamWs.on('unexpected-response', (req, res) => {
      let body = '';
      res.on('data', (chunk: Buffer) => { body += chunk.toString(); });
      res.on('end', () => {
        console.error(`[vnc-proxy] Upstream rejected: ${res.statusCode} ${res.statusMessage}`, body.slice(0, 500));
        if (clientWs.readyState === WebSocket.OPEN) {
          clientWs.close(1011, `Proxmox rejected: ${res.statusCode}`);
        }
      });
    });

    clientWs.on('error', (err) => {
      console.error('[vnc-proxy] Client error:', err.message);
      if (upstreamWs.readyState === WebSocket.OPEN) {
        upstreamWs.close();
      }
    });

    // Close propagation
    upstreamWs.on('close', (code, reason) => {
      console.log(`[vnc-proxy] Upstream closed: code=${code}, reason=${reason?.toString()}`);
      if (clientWs.readyState === WebSocket.OPEN) {
        clientWs.close(1000, 'VNC session ended');
      }
    });

    clientWs.on('close', () => {
      if (upstreamWs.readyState === WebSocket.OPEN) {
        upstreamWs.close();
      }
    });
  });

  server.listen(port, () => {
    console.log(`> Ready on http://${hostname}:${port}`);
    console.log(`> VNC WebSocket proxy active on /ws/vnc`);

    const buildWorkers = startBuildWorkers();
    const deployWorker = startProjectDeployWorker();

    async function shutdown(signal: string) {
      console.log(`\n> ${signal} received — shutting down workers`);
      await Promise.all([buildWorkers.close(), deployWorker.close()]);
      server.close(() => process.exit(0));
    }

    process.once('SIGTERM', () => shutdown('SIGTERM'));
    process.once('SIGINT',  () => shutdown('SIGINT'));
  });
});
