"use client";

// Single read-only stat card used in the vMAC sync header.

type Accent = "warn" | "danger" | undefined;

export function StatTile({
    label,
    value,
    hint,
    accent,
}: {
    label: string;
    value: string;
    hint?: string;
    accent?: Accent;
}) {
    const valueClass =
        accent === "danger"
            ? "text-red-300"
            : accent === "warn"
              ? "text-amber-300"
              : "text-white";
    return (
        <div className="rounded border border-white/[0.06] bg-black/30 px-3 py-2">
            <p className="text-[10px] uppercase tracking-[0.18em] text-white/35">{label}</p>
            <p className={`mt-0.5 font-mono text-lg font-semibold ${valueClass}`}>{value}</p>
            {hint && <p className="text-[10px] text-white/35">{hint}</p>}
        </div>
    );
}
