// Per-host Windows template build.
//
// Streams NDJSON ({type, message, t}) while it runs
// scripts/create-windows-template.js against this host (using the host's
// stored SSH creds). The script downloads the golden Windows qcow2(s) from
// WINDOWS_2022_DC_IMAGE_URL / WINDOWS_2025_DC_IMAGE_URL, imports them, wraps
// each in a UEFI VM, converts to a template, and registers it in
// proxmox_templates (owner_id null → shows in the customer OS list).
//
// Mirrors the auto-setup endpoint's streaming + child-process pattern.

import { NextRequest } from "next/server";
import { spawn } from "child_process";

import { requireAdmin } from "@/lib/supabase/auth";
import { createServerSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const maxDuration = 1800;

type EmitType = "step" | "log" | "ok" | "error" | "done";
type Emit = (type: EmitType, message: string, extra?: Record<string, unknown>) => void;

function jsonError(status: number, error: string): Response {
    return new Response(JSON.stringify({ ok: false, error }), {
        status,
        headers: { "Content-Type": "application/json" },
    });
}

function makeEmitter(
    controller: ReadableStreamDefaultController<Uint8Array>,
    enc: TextEncoder
): Emit {
    let closed = false;
    return (type, message, extra) => {
        if (closed) return;
        try {
            controller.enqueue(
                enc.encode(JSON.stringify({ type, message, t: Date.now(), ...extra }) + "\n")
            );
        } catch {
            closed = true;
        }
    };
}

export async function POST(
    _req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const auth = await requireAdmin();
    if (!auth.ok) return jsonError(403, "Not authorized");

    const { id } = await params;
    if (!id) return jsonError(400, "Missing host id");

    // Confirm the host exists before streaming (the script reads its SSH creds).
    const sb = createServerSupabase();
    const { data: host, error } = await sb
        .from("proxmox_hosts")
        .select("id, name")
        .eq("id", id)
        .maybeSingle();
    if (error) return jsonError(500, `Host lookup failed: ${error.message}`);
    if (!host) return jsonError(404, "Host not found");

    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
        start(controller) {
            const emit = makeEmitter(controller, encoder);
            emit("step", `Building Windows templates on ${host.name} (3–8 min each)`);

            const child = spawn(
                "node",
                ["scripts/create-windows-template.js", "--host-id", id],
                { env: process.env, shell: process.platform === "win32" }
            );

            let outBuf = "";
            let errBuf = "";
            const flush = (buf: string, isErr: boolean): string => {
                const lines = buf.split(/\r?\n/);
                const tail = lines.pop() ?? "";
                for (const ln of lines) {
                    if (ln.length > 0) emit("log", (isErr ? "[stderr] " : "") + ln);
                }
                return tail;
            };

            child.stdout?.on("data", (d: Buffer) => { outBuf = flush(outBuf + d.toString(), false); });
            child.stderr?.on("data", (d: Buffer) => { errBuf = flush(errBuf + d.toString(), true); });
            child.on("error", (e) => {
                emit("error", `child process error: ${e.message}`);
                try { controller.close(); } catch { /* already closed */ }
            });
            child.on("close", (code) => {
                if (outBuf.length > 0) emit("log", outBuf);
                if (errBuf.length > 0) emit("log", "[stderr] " + errBuf);
                if (code === 0) emit("done", "Windows templates built and registered", { hostId: id });
                else emit("error", `Windows template build exited with code ${code}`);
                try { controller.close(); } catch { /* already closed */ }
            });
        },
    });

    return new Response(stream, {
        headers: {
            "Content-Type": "application/x-ndjson",
            "Cache-Control": "no-cache, no-transform",
            "X-Accel-Buffering": "no",
        },
    });
}
