// POST /api/services/compute/vms/[id]/reset-password
//
// Resets ONLY the login password of the VM's primary account (no reboot, no
// data change) via the QEMU guest agent, then emails the newly generated
// password to the owner. The password is never returned to the frontend and
// never stored — it exists only in the email.

import { NextRequest } from "next/server";
import { randomBytes } from "crypto";

import { createClient, createWorkerClient } from "@/lib/supabase/server";
import { limitByUser } from "@/lib/cooldown/userbased";
import {
  proxmoxAuth,
  getDispatcher,
  resetVmPassword,
  type ProxmoxHost,
} from "@/lib/proxmox-utils";
import { emailService } from "@/lib/email";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

type Ctx = { params: Promise<{ id: string }> };

// Strong, shell-safe password: guarantees Windows complexity (upper/lower/digit/
// symbol) and avoids cmd/shell metacharacters (" ' ` % ^ & $ < > | space) so it
// is safe inside the guest-agent command on both Windows (`net user`) and Linux
// (base64'd anyway). Ambiguous chars (0/O/1/l/I) are excluded for legibility.
function generateVmPassword(length = 20): string {
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const lower = "abcdefghijkmnopqrstuvwxyz";
  const digit = "23456789";
  const symbol = "!@#-_=+";
  const all = upper + lower + digit + symbol;
  const pick = (set: string) => set[randomBytes(1)[0] % set.length];
  const chars = [pick(upper), pick(lower), pick(digit), pick(symbol)];
  const bytes = randomBytes(length);
  for (let i = chars.length; i < length; i++) chars.push(all[bytes[i] % all.length]);
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomBytes(1)[0] % (i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
}

// The account whose password gets reset. Prefer what was actually set at create
// time (stored on the server row); fall back to the OS-derived default, matching
// the create flow's ciuser logic.
function deriveUsername(os: string, details: unknown, isWindows: boolean): string {
  const d = details as { ssh?: { username?: string }; rdp?: { username?: string } } | null;
  const fromDetails = d?.ssh?.username || d?.rdp?.username;
  if (fromDetails) return String(fromDetails);
  const o = (os || "").toLowerCase();
  if (isWindows) return "admin";
  if (o.includes("debian")) return "debian";
  if (o.includes("centos")) return "centos";
  return "ubuntu";
}

function maskEmail(email: string): string {
  const [name, domain] = email.split("@");
  if (!domain) return email;
  const head = name.length <= 2 ? name[0] : name.slice(0, 2);
  return `${head}${"*".repeat(Math.max(1, name.length - head.length))}@${domain}`;
}

export async function POST(_req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const serverId = Number(id);
  if (!serverId || isNaN(serverId)) {
    return Response.json({ ok: false, error: "Invalid server ID" }, { status: 400 });
  }

  const supabaseAuth = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabaseAuth.auth.getUser();
  if (authError || !user) {
    return Response.json({ ok: false, error: "Authentication required" }, { status: 401 });
  }

  // Rate limit: 5 resets / hour / user.
  const rl = await limitByUser(user.id, { prefix: "rl:vm-reset-pass", limit: 5, windowMs: 3600_000 });
  if (!rl.allowed) {
    return Response.json(
      { ok: false, error: "Too many password reset requests. Try again later.", retryAfterSec: rl.retryAfterSec },
      { status: 429 }
    );
  }

  const supabase = await createWorkerClient();
  const { data: server, error: serverErr } = await supabase
    .from("servers")
    .select("id, vmid, node, location, owner_id, owner_email, status, os, ip, name, details")
    .eq("id", serverId)
    .maybeSingle();

  if (serverErr) return Response.json({ ok: false, error: "Unable to load server" }, { status: 500 });
  if (!server) return Response.json({ ok: false, error: "Server not found" }, { status: 404 });
  if (server.owner_id !== user.id) {
    return Response.json({ ok: false, error: "Not authorized" }, { status: 403 });
  }
  if (String(server.status) !== "running") {
    return Response.json(
      { ok: false, error: "The server must be running to reset its password. Start it and try again." },
      { status: 409 }
    );
  }
  if (!server.vmid || !server.node || !server.location) {
    return Response.json({ ok: false, error: "Server configuration is incomplete." }, { status: 422 });
  }

  // Recipient: the signed-in user's email (fallback to the stored owner email).
  const to = user.email || server.owner_email || "";
  if (!to) {
    return Response.json(
      { ok: false, error: "No email address on file to send the new password to." },
      { status: 422 }
    );
  }

  const { data: hostRow, error: hostErr } = await supabase
    .from("proxmox_hosts")
    .select("id, name, host_url, allow_insecure_tls, node, storage, bridge, username, password, token_id, token_secret")
    .eq("id", server.location)
    .maybeSingle();
  if (hostErr || !hostRow) {
    return Response.json({ ok: false, error: "Server host is unavailable. Try again later." }, { status: 502 });
  }

  const os = String(server.os || "");
  const isWindows = os.toLowerCase().includes("windows") || os.toLowerCase().includes("win");
  const username = deriveUsername(os, server.details, isWindows);
  const password = generateVmPassword();
  const protocol: "SSH" | "RDP" = isWindows ? "RDP" : "SSH";
  const port = isWindows ? 3389 : 22;

  // Run the guest-agent reset against the node the VM actually lives on.
  const host = { ...hostRow, node: server.node } as unknown as ProxmoxHost;
  try {
    const dispatcher = getDispatcher(Boolean(host.allow_insecure_tls));
    const auth = await proxmoxAuth(host, dispatcher);
    await resetVmPassword(host, server.vmid, { username, password, isWindows }, auth, dispatcher);
  } catch (err) {
    console.error("[vm-reset-password] guest-agent reset failed:", err);
    return Response.json(
      {
        ok: false,
        error:
          "Couldn't reset the password on the server. Make sure it's running and the guest agent is active, then try again.",
      },
      { status: 502 }
    );
  }

  // Email the new password. (It is intentionally NOT returned in the response.)
  const recipientName =
    (user.user_metadata?.name as string | undefined) ||
    (user.email ? user.email.split("@")[0] : "there");
  const sent = await emailService.sendTemplate({
    template: "vpsPasswordReset",
    to,
    data: {
      recipientName,
      serverName: server.name,
      ipAddress: String(server.ip),
      loginUsername: username,
      password,
      protocol,
      port,
    },
  });
  if (!sent.success) {
    console.error("[vm-reset-password] email send failed for server", server.id);
    return Response.json(
      { ok: false, error: "The password was reset, but the email failed to send. Please try again." },
      { status: 502 }
    );
  }

  return Response.json({
    ok: true,
    message: "Password reset. The new password has been emailed to you.",
    emailedTo: maskEmail(to),
  });
}
