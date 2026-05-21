"use client";

// Compact result display used after a sync or import run.
// Shows a one-line summary, an optional success list, and an
// optional error list in collapsible <details>.

type Row = { ip: string; mac: string };
type ErrorRow = { ip: string; mac?: string; error: string };

export function ResultList({
    title,
    successRows,
    errorRows,
    successColor = "emerald",
    emptyMessage,
}: {
    title: string;
    successRows?: Row[];
    errorRows?: ErrorRow[];
    successColor?: "emerald" | "muted";
    emptyMessage?: string;
}) {
    const ok = successRows?.length ?? 0;
    const err = errorRows?.length ?? 0;
    if (ok === 0 && err === 0) {
        return emptyMessage ? <p className="text-white/55">{emptyMessage}</p> : null;
    }
    const titleClass =
        ok > 0 && successColor === "emerald" ? "text-emerald-400" : "text-white/55";
    return (
        <div className="text-xs">
            <p className={titleClass}>
                {ok > 0 && <>✓ {title}: {ok}</>}
                {ok > 0 && err > 0 && " · "}
                {err > 0 && <span className="text-amber-400">{err} error{err === 1 ? "" : "s"}</span>}
            </p>
            {ok > 0 && (
                <div className="mt-2 max-h-32 overflow-y-auto rounded border border-emerald-500/20 bg-emerald-500/[0.04] p-2 font-mono text-[11px] text-white/65">
                    {successRows!.map((r) => (
                        <div key={`${r.mac}-${r.ip}`}>
                            {r.ip} → {r.mac}
                        </div>
                    ))}
                </div>
            )}
            {err > 0 && (
                <div className="mt-2 max-h-32 overflow-y-auto rounded border border-red-500/20 bg-red-500/[0.04] p-2 font-mono text-[11px] text-red-200/85">
                    {errorRows!.map((e, i) => (
                        <div key={i}>
                            {e.ip} — {e.error}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
