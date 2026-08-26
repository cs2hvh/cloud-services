/**
 * GPU web-terminal — WebSocket ⇄ SSH bridge.
 *
 * Runs inside server.ts (the custom Node server), alongside the VNC proxy it
 * is modelled on. A validated ticket arrives naming only a pod id; everything
 * else is resolved here, server-side.
 *
 * SECURITY NOTES, since this ends in a root shell
 * -----------------------------------------------
 * • The client never supplies a host, port, user or key. It supplies a signed
 *   pod id, and this module looks the rest up. There is therefore no request
 *   shape that can point the SSH client at an arbitrary address.
 * • Ownership is re-checked here against the database, not taken from the
 *   ticket alone. A ticket minted before a pod changed hands is useless.
 * • The private key is decrypted into memory for the duration of the
 *   connection and never sent to the client, logged, or placed in the pod's
 *   environment.
 * • `readyTimeout` bounds the handshake so a black-holed pod cannot pin a
 *   socket open indefinitely.
 *
 * Deliberately self-contained: server.ts is a plain Node process started by
 * tsx, outside Next's module graph and alias resolution. Importing
 * config/functions (which reaches into @/lib/supabase/queries) to reuse
 * Encryption would drag the Next app into the bare server. The AES parameters
 * below are duplicated from config/functions.ts instead — the same trade the
 * worker makes with brand-scrub. If those constants ever change, this must
 * change with them.
 */
import { createDecipheriv, pbkdf2Sync } from "crypto";
import { createClient } from "@supabase/supabase-js";
// @ts-expect-error ssh2 has no type declarations
import { Client as SSHClient } from "ssh2";
import type { WebSocket } from "ws";

import type { GpuTerminalTokenPayload } from "./gpu-terminal-token";

// ── Mirrors config/functions.ts — keep in sync ──────────────────────────
const ALGORITHM = "aes-256-gcm";
const KEY_LENGTH = 32;
const ITERATIONS = 100_000;

interface EncryptedData {
  encrypted: string;
  iv: string;
  tag: string;
  salt: string;
}

function decryptBlob(blob: string, secretKey: string): string {
  const { encrypted, iv, tag, salt } = JSON.parse(blob) as EncryptedData;
  const key = pbkdf2Sync(secretKey, Buffer.from(salt, "hex"), ITERATIONS, KEY_LENGTH, "sha256");
  const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(iv, "hex"));
  decipher.setAuthTag(Buffer.from(tag, "hex"));
  return Buffer.concat([
    decipher.update(Buffer.from(encrypted, "hex")),
    decipher.final(),
  ]).toString("utf8");
}

interface PodRow {
  id: number;
  owner_id: string;
  status: string;
  public_ip: string | null;
  port_mappings: Record<string, number> | null;
  terminal_key_blob: string | null;
}

/** Close with a reason the UI can show, without leaking internals. */
function fail(ws: WebSocket, message: string, detail?: string): void {
  if (detail) console.error(`[gpu-terminal] ${message} — ${detail}`);
  try {
    ws.send(`\r\n\x1b[31m${message}\x1b[0m\r\n`);
  } catch {
    /* socket may already be gone */
  }
  ws.close(1011, message.slice(0, 120));
}

export async function handleGpuTerminal(
  clientWs: WebSocket,
  payload: GpuTerminalTokenPayload
): Promise<void> {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const encryptionKey = process.env.ENCRYPTION_KEY;
  if (!url || !serviceKey || !encryptionKey) {
    return fail(clientWs, "Terminal is not configured on this server");
  }

  const supabase = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Ownership is re-verified here rather than trusted from the ticket.
  const { data, error } = await supabase
    .from("gpu_pods")
    .select("id, owner_id, status, public_ip, port_mappings, terminal_key_blob")
    .eq("id", payload.podId)
    .eq("owner_id", payload.userId)
    .maybeSingle<PodRow>();

  if (error) return fail(clientWs, "Could not load pod", error.message);
  if (!data) return fail(clientWs, "Pod not found");
  if (data.status !== "running") return fail(clientWs, `Pod is ${data.status}`);

  const host = data.public_ip;
  const port = data.port_mappings?.["22"];
  if (!host || !port) return fail(clientWs, "Pod has no SSH endpoint");
  if (!data.terminal_key_blob) return fail(clientWs, "Pod has no terminal key");

  let privateKey: string;
  try {
    privateKey = decryptBlob(data.terminal_key_blob, encryptionKey);
  } catch (e) {
    // Almost always an ENCRYPTION_KEY rotation. Say something actionable
    // rather than surfacing a raw crypto error.
    return fail(
      clientWs,
      "Terminal key could not be decrypted",
      e instanceof Error ? e.message : String(e)
    );
  }

  const ssh = new SSHClient();
  let closed = false;
  const shutdown = (why: string) => {
    if (closed) return;
    closed = true;
    try { ssh.end(); } catch { /* already down */ }
    if (clientWs.readyState === clientWs.OPEN) clientWs.close(1000, why.slice(0, 120));
  };

  ssh.on("ready", () => {
    ssh.shell({ term: "xterm-256color", cols: 80, rows: 24 }, (err: Error | undefined, stream: any) => {
      if (err) return fail(clientWs, "Could not open shell", err.message);

      console.log(
        `[gpu-terminal] session open pod=${payload.podId} user=${payload.userId}`
      );

      stream.on("data", (chunk: Buffer) => {
        if (clientWs.readyState === clientWs.OPEN) clientWs.send(chunk);
      });
      stream.stderr?.on("data", (chunk: Buffer) => {
        if (clientWs.readyState === clientWs.OPEN) clientWs.send(chunk);
      });
      stream.on("close", () => shutdown("Shell closed"));

      clientWs.on("message", (raw: Buffer, isBinary: boolean) => {
        // Binary frames are keystrokes. Text frames are control messages —
        // currently only resize. Splitting on the frame type avoids inventing
        // an in-band escape that a user could type by accident.
        if (isBinary) {
          stream.write(raw);
          return;
        }
        try {
          const msg = JSON.parse(raw.toString());
          if (msg?.type === "resize") {
            const cols = Number(msg.cols);
            const rows = Number(msg.rows);
            // Bounded: setWindow is passed straight to the remote pty.
            if (
              Number.isInteger(cols) && Number.isInteger(rows) &&
              cols > 0 && cols <= 500 && rows > 0 && rows <= 300
            ) {
              stream.setWindow(rows, cols, 0, 0);
            }
          }
        } catch {
          // Not JSON — ignore rather than forwarding an unparsed control frame
          // into the shell.
        }
      });
    });
  });

  ssh.on("error", (err: Error) => {
    fail(clientWs, "SSH connection failed", err.message);
    shutdown("ssh error");
  });
  ssh.on("close", () => shutdown("SSH closed"));

  clientWs.on("close", () => shutdown("Client closed"));
  clientWs.on("error", () => shutdown("Client error"));

  ssh.connect({
    host,
    port,
    username: "root",
    privateKey,
    // A pod that is up but not yet accepting SSH should fail fast and let the
    // user retry, not hold the socket.
    readyTimeout: 15_000,
    keepaliveInterval: 20_000,
  });
}
