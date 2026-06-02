"use client";

// Per-host Windows template setup, shown inside the expanded host card.
//
// Hits POST /api/admin/proxmox/hosts/<id>/build-windows which streams NDJSON
// while it imports the golden Windows qcow2(s) and registers them as public
// templates (so they appear in the customer OS list). Mirrors the auto-setup
// panel's stream parsing in a compact, inline form like VmacSyncPanel.

import { useCallback, useRef, useState } from "react";
import { Loader2, MonitorCog, StopCircle, Terminal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

type StreamEvent = {
    type: "step" | "log" | "ok" | "error" | "done";
    message: string;
    t: number;
    hostId?: string;
};

type Props = {
    hostId: string;
    hostName: string;
    /** True if this host already has one or more Windows templates. */
    hasWindows?: boolean;
    onBuilt?: () => void;
};

export function WindowsTemplatePanel({ hostId, hostName, hasWindows, onBuilt }: Props) {
    const [running, setRunning] = useState(false);
    const [events, setEvents] = useState<StreamEvent[]>([]);
    const abortRef = useRef<AbortController | null>(null);
    const logBoxRef = useRef<HTMLDivElement | null>(null);

    const append = useCallback((ev: StreamEvent) => {
        setEvents((prev) => [...prev, ev]);
        requestAnimationFrame(() => {
            if (logBoxRef.current) logBoxRef.current.scrollTop = logBoxRef.current.scrollHeight;
        });
    }, []);

    const cancel = useCallback(() => abortRef.current?.abort(), []);

    const start = useCallback(async () => {
        setRunning(true);
        setEvents([]);
        const ac = new AbortController();
        abortRef.current = ac;

        try {
            const res = await fetch(`/api/admin/proxmox/hosts/${hostId}/build-windows`, {
                method: "POST",
                signal: ac.signal,
            });

            if (!res.ok || !res.body) {
                let errMsg = `HTTP ${res.status}`;
                try {
                    const j = await res.json();
                    if (j?.error) errMsg = j.error;
                } catch { /* not JSON */ }
                append({ type: "error", message: errMsg, t: Date.now() });
                toast.error(errMsg);
                return;
            }

            const reader = res.body.getReader();
            const decoder = new TextDecoder();
            let buf = "";
            let anyError = false;
            let done = false;

            const handleLine = (line: string) => {
                if (!line) return;
                try {
                    const ev = JSON.parse(line) as StreamEvent;
                    if (ev.type === "error") anyError = true;
                    if (ev.type === "done") done = true;
                    append(ev);
                } catch {
                    append({ type: "log", message: line, t: Date.now() });
                }
            };

            for (;;) {
                const { value, done: streamDone } = await reader.read();
                if (streamDone) break;
                buf += decoder.decode(value, { stream: true });
                let nl = buf.indexOf("\n");
                while (nl !== -1) {
                    handleLine(buf.slice(0, nl).trim());
                    buf = buf.slice(nl + 1);
                    nl = buf.indexOf("\n");
                }
            }
            if (buf.trim().length > 0) handleLine(buf.trim());

            if (done && !anyError) {
                toast.success("Windows templates built");
                onBuilt?.();
            } else if (anyError) {
                toast.warning("Windows build finished with errors — check the log");
                onBuilt?.();
            }
        } catch (err) {
            if ((err as Error).name === "AbortError") {
                append({ type: "error", message: "Cancelled by operator", t: Date.now() });
                toast.info("Cancelled");
            } else {
                const m = err instanceof Error ? err.message : String(err);
                append({ type: "error", message: m, t: Date.now() });
                toast.error(m);
            }
        } finally {
            setRunning(false);
            abortRef.current = null;
        }
    }, [hostId, append, onBuilt]);

    const colorFor = (t: StreamEvent["type"]): string =>
        t === "step" ? "text-cyan-300"
            : t === "ok" ? "text-green-400"
                : t === "error" ? "text-red-400"
                    : t === "done" ? "text-emerald-400 font-semibold"
                        : "text-white/70";

    return (
        <div className="border-t border-white/10 pt-4">
            <div className="flex items-center justify-between gap-3 mb-2">
                <div className="min-w-0">
                    <p className="text-white/70 text-xs font-semibold flex items-center gap-1.5">
                        <MonitorCog className="h-3.5 w-3.5 text-[#0095FF]" />
                        Windows templates
                    </p>
                    <p className="text-[11px] text-white/40 mt-0.5">
                        Imports the golden Server 2022 / 2025 Datacenter image(s) and registers them
                        as customer-visible OS options. {hasWindows ? "This host already has Windows — rebuilds/refreshes." : ""}
                    </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                    {running && (
                        <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={cancel}
                            className="h-8 border-white/10 bg-white/[0.04] text-white/70 hover:bg-white/[0.08]"
                        >
                            <StopCircle className="h-3.5 w-3.5 mr-1" /> Cancel
                        </Button>
                    )}
                    <Button
                        type="button"
                        size="sm"
                        onClick={start}
                        disabled={running}
                        className="h-8 bg-[#0095FF] hover:bg-[#0085e0] text-white"
                    >
                        {running ? (
                            <><Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> Building…</>
                        ) : (
                            <><MonitorCog className="h-3.5 w-3.5 mr-1" /> {hasWindows ? "Rebuild Windows" : "Set up Windows"}</>
                        )}
                    </Button>
                </div>
            </div>

            {events.length > 0 && (
                <div>
                    <div className="flex items-center gap-2 mb-1 text-white/55 text-[11px]">
                        <Terminal className="h-3 w-3" /> {hostName}
                    </div>
                    <div
                        ref={logBoxRef}
                        className="bg-black border border-white/10 rounded p-2 font-mono text-[11px] h-56 overflow-y-auto"
                    >
                        {events.map((ev, idx) => (
                            <div key={idx} className={`${colorFor(ev.type)} whitespace-pre-wrap`}>
                                {ev.message}
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
