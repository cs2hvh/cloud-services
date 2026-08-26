"use client";

// In-browser terminal for a GPU pod.
//
// Modelled on the Linode weblish console next door, with one structural
// difference: there is no long-lived session to renew. A ticket is minted per
// connection, lives 60 seconds, and is spent immediately opening the socket —
// so "reconnect" simply means "mint another one", which is what the retry
// button does.
//
// The ticket carries no credentials (see lib/gpu-terminal-token.ts). The SSH
// key never reaches this component.

import { useCallback, useEffect, useRef, useState } from "react";
import { RefreshCw, TerminalSquare } from "lucide-react";
import "@xterm/xterm/css/xterm.css";

type ConnState = "idle" | "minting" | "connecting" | "open" | "closed" | "error";

const MONO = "font-[var(--font-geist-mono),ui-monospace,monospace]";

export function PodTerminal({ podId, disabled }: { podId: number; disabled?: boolean }) {
    const containerRef = useRef<HTMLDivElement>(null);
    const [state, setState] = useState<ConnState>("idle");
    const [error, setError] = useState<string | null>(null);
    // Bumping this tears down the effect and starts a fresh session.
    const [attempt, setAttempt] = useState(0);
    const [started, setStarted] = useState(false);

    const retry = useCallback(() => {
        setError(null);
        setAttempt((n) => n + 1);
        setStarted(true);
    }, []);

    useEffect(() => {
        if (!started) return;

        let disposed = false;
        let socket: WebSocket | null = null;
        let term: import("@xterm/xterm").Terminal | null = null;
        let fit: import("@xterm/addon-fit").FitAddon | null = null;
        let resizeObserver: ResizeObserver | null = null;

        (async () => {
            // xterm touches `document` on import — client-side only.
            const [{ Terminal }, { FitAddon }] = await Promise.all([
                import("@xterm/xterm"),
                import("@xterm/addon-fit"),
            ]);
            if (disposed || !containerRef.current) return;

            term = new Terminal({
                cursorBlink: true,
                fontSize: 13,
                fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                theme: {
                    background: "#0d0e11",
                    foreground: "#e2e8f0",
                    cursor: "#0095FF",
                    selectionBackground: "rgba(0,149,255,0.3)",
                },
                scrollback: 5000,
            });
            fit = new FitAddon();
            term.loadAddon(fit);
            term.open(containerRef.current);
            fit.fit();

            // Mint the ticket only once the terminal is on screen — it expires
            // in 60s, so fetching it before the UI is ready wastes the window.
            setState("minting");
            let token: string;
            try {
                const res = await fetch(`/api/services/gpu/pods/${podId}/terminal`, {
                    method: "POST",
                    credentials: "include",
                });
                const json = await res.json().catch(() => ({}));
                if (!res.ok || !json?.ok) {
                    throw new Error(json?.error || `Could not start terminal (${res.status})`);
                }
                token = json.token as string;
            } catch (e) {
                if (disposed) return;
                setError(e instanceof Error ? e.message : "Could not start terminal");
                setState("error");
                return;
            }
            if (disposed) return;

            const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
            setState("connecting");
            try {
                socket = new WebSocket(
                    `${proto}//${window.location.host}/ws/gpu-terminal?token=${encodeURIComponent(token)}`
                );
            } catch {
                setState("error");
                return;
            }
            socket.binaryType = "arraybuffer";

            const sendResize = () => {
                if (!term || !socket || socket.readyState !== WebSocket.OPEN) return;
                socket.send(JSON.stringify({ type: "resize", cols: term.cols, rows: term.rows }));
            };

            socket.onopen = () => {
                if (disposed) return;
                setState("open");
                sendResize();
                term?.focus();
            };
            socket.onmessage = (evt) => {
                if (!term) return;
                if (typeof evt.data === "string") term.write(evt.data);
                else term.write(new Uint8Array(evt.data as ArrayBuffer));
            };
            socket.onclose = (evt) => {
                if (disposed) return;
                setState("closed");
                term?.write(
                    `\r\n\x1b[2m— session ended${evt.reason ? `: ${evt.reason}` : ""} —\x1b[0m\r\n`
                );
            };
            socket.onerror = () => {
                if (disposed) return;
                setState("error");
            };

            // Keystrokes go as BINARY; the server treats text frames as control
            // messages, so sending input as text would have it parsed as JSON
            // and dropped.
            term.onData((data) => {
                if (socket?.readyState === WebSocket.OPEN) {
                    socket.send(new TextEncoder().encode(data));
                }
            });

            resizeObserver = new ResizeObserver(() => {
                try {
                    fit?.fit();
                    sendResize();
                } catch {
                    /* container mid-layout */
                }
            });
            resizeObserver.observe(containerRef.current);
        })();

        return () => {
            disposed = true;
            resizeObserver?.disconnect();
            try { socket?.close(); } catch { /* already closed */ }
            try { term?.dispose(); } catch { /* already disposed */ }
        };
    }, [podId, attempt, started]);

    const label: Record<ConnState, string> = {
        idle: "Not started",
        minting: "Authorising…",
        connecting: "Connecting…",
        open: "Connected",
        closed: "Disconnected",
        error: "Error",
    };
    const dot: Record<ConnState, string> = {
        idle: "#52525b",
        minting: "#fbbf24",
        connecting: "#fbbf24",
        open: "#4ade80",
        closed: "#52525b",
        error: "#f87171",
    };

    if (disabled) {
        return (
            <div className="border border-white/[0.06] bg-[#111216] px-5 py-8 text-center">
                <p className={`${MONO} text-[11.5px] text-white/45`}>
                    The terminal is available while the pod is running.
                </p>
            </div>
        );
    }

    return (
        <div className="border border-white/[0.06] bg-[#111216]">
            <div className="flex items-center justify-between gap-3 border-b border-white/[0.06] px-4 py-2.5">
                <div className="flex items-center gap-2">
                    <span
                        className="h-1.5 w-1.5 rounded-full"
                        style={{ background: dot[state] }}
                    />
                    <span className={`${MONO} text-[11px] uppercase tracking-[0.14em] text-white/55`}>
                        {label[state]}
                    </span>
                </div>
                {(state === "closed" || state === "error") && (
                    <button
                        type="button"
                        onClick={retry}
                        className={`${MONO} inline-flex items-center gap-1.5 border border-white/[0.08] px-2.5 py-1 text-[10.5px] uppercase tracking-[0.12em] text-white/65 hover:bg-white/[0.04] hover:text-white transition-colors`}
                    >
                        <RefreshCw className="h-3 w-3" />
                        Reconnect
                    </button>
                )}
            </div>

            {error && (
                <div className="border-b border-white/[0.06] bg-[#1a1214] px-4 py-2.5">
                    <p className="text-[12px] text-[#f87171]">{error}</p>
                </div>
            )}

            {!started ? (
                <div className="px-5 py-10 text-center">
                    <TerminalSquare className="mx-auto h-6 w-6 text-white/25" />
                    <p className="mt-3 text-[13px] text-white/70">Open a shell on this pod</p>
                    <p className={`${MONO} mx-auto mt-1.5 max-w-md text-[11px] leading-relaxed text-white/40`}>
                        Connects over SSH from our servers using a platform key held for this
                        pod. Works on every image, including those without password login.
                    </p>
                    <button
                        type="button"
                        onClick={retry}
                        className={`${MONO} mt-4 inline-flex items-center gap-2 px-3.5 py-2 text-[10.5px] uppercase tracking-[0.12em] font-semibold text-white transition-transform hover:-translate-y-px`}
                        style={{
                            background: "linear-gradient(135deg, #0095FF, #0066B3)",
                            boxShadow: "0 4px 12px rgba(0,149,255,0.18)",
                        }}
                    >
                        <TerminalSquare className="h-3.5 w-3.5" />
                        Start terminal
                    </button>
                </div>
            ) : (
                <div ref={containerRef} className="h-[420px] w-full bg-[#0d0e11] p-2" />
            )}
        </div>
    );
}

export default PodTerminal;
