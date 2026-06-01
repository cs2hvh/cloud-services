"use client";

// ─── Telemetry Mesh — signature design primitives ──────────────────
//
// One vocabulary, used at three scales (decoration / annotation / diagram).
// Build everything from these six primitives to keep brand consistency:
//
//   ①  <MeshNode />          filled dot at one of three fixed sizes
//   ②  <MeshTrace />          hairline between two points (+ optional plug tick)
//   ③  <MeshPulse />          breathing ring around an active anchor
//   ④  <CoordBadge />         mono bracketed label like [01/06] or [LIVE]
//   ⑤  <Sparkline />          60×16 mini-chart, single 1px stroke
//   ⑥  <MeshLattice />        very faint 24px dot-grid background
//
// Plus one composition helper:
//
//   <MeshDecoration seed="…" />   sparse node+trace ornament for backgrounds

import * as React from "react";

const ACCENT = "#0095FF";

// ─── PRNG — deterministic so the same `seed` always renders the same scatter
function seedRandom(seed: string): () => number {
    let h = 1779033703 ^ seed.length;
    for (let i = 0; i < seed.length; i++) {
        h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
        h = (h << 13) | (h >>> 19);
    }
    return () => {
        h = Math.imul(h ^ (h >>> 16), 2246822507);
        h = Math.imul(h ^ (h >>> 13), 3266489909);
        h ^= h >>> 16;
        return (h >>> 0) / 4294967296;
    };
}

/* ─── ① NODE ────────────────────────────────────────────────── */

export type NodeSize = "dot" | "endpoint" | "hub";
export type NodeTone = "active" | "resting" | "dim";

const SIZE_PX: Record<NodeSize, number> = { dot: 4, endpoint: 6, hub: 10 };

function toneColor(tone: NodeTone, surface: "dark" | "cream"): string {
    if (tone === "active") return ACCENT;
    if (surface === "cream") {
        return tone === "resting" ? "rgba(0,0,0,0.55)" : "rgba(0,0,0,0.20)";
    }
    return tone === "resting" ? "rgba(255,255,255,0.65)" : "rgba(255,255,255,0.22)";
}

export function MeshNode({
    size = "endpoint",
    tone = "resting",
    surface = "dark",
    glow = false,
    className = "",
}: {
    size?: NodeSize;
    tone?: NodeTone;
    surface?: "dark" | "cream";
    glow?: boolean;
    className?: string;
}) {
    const d = SIZE_PX[size];
    const color = toneColor(tone, surface);
    return (
        <span
            aria-hidden
            className={`inline-block shrink-0 rounded-full ${className}`}
            style={{
                width: d,
                height: d,
                background: color,
                boxShadow: glow && tone === "active" ? `0 0 6px ${ACCENT}` : undefined,
            }}
        />
    );
}

/* ─── ② TRACE — SVG line with optional perpendicular tick ─────── */

export function MeshTrace({
    from,
    to,
    tick = false,
    tone = "resting",
    surface = "dark",
    className = "",
}: {
    from: [number, number];
    to: [number, number];
    tick?: boolean;
    tone?: NodeTone;
    surface?: "dark" | "cream";
    className?: string;
}) {
    const [x1, y1] = from;
    const [x2, y2] = to;
    const color = toneColor(tone, surface);

    let tickPath = "";
    if (tick) {
        const dx = x2 - x1;
        const dy = y2 - y1;
        const len = Math.hypot(dx, dy) || 1;
        const ux = dx / len;
        const uy = dy / len;
        const T = 2.4;
        tickPath = `M ${(x2 + -uy * T).toFixed(2)} ${(y2 + ux * T).toFixed(2)} L ${(x2 - -uy * T).toFixed(2)} ${(y2 - ux * T).toFixed(2)}`;
    }

    return (
        <g className={className}>
            <line
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                stroke={color}
                strokeWidth={0.6}
                strokeLinecap="round"
                vectorEffect="non-scaling-stroke"
            />
            {tick && (
                <path
                    d={tickPath}
                    stroke={color}
                    strokeWidth={0.7}
                    strokeLinecap="round"
                    vectorEffect="non-scaling-stroke"
                />
            )}
        </g>
    );
}

/* ─── ③ PULSE RING — animated ping around an anchor ──────────── */

export function MeshPulse({
    size = 12,
    color = ACCENT,
    className = "",
}: {
    size?: number;
    color?: string;
    className?: string;
}) {
    return (
        <span
            aria-hidden
            className={`relative inline-flex shrink-0 items-center justify-center ${className}`}
            style={{ width: size, height: size }}
        >
            <span
                className="absolute inset-0 animate-ping rounded-full opacity-60"
                style={{ background: color }}
            />
            <span
                className="relative rounded-full"
                style={{
                    width: size * 0.35,
                    height: size * 0.35,
                    background: color,
                    boxShadow: `0 0 6px ${color}`,
                }}
            />
        </span>
    );
}

/* ─── ④ COORD BADGE — bracketed mono label ────────────────────── */

const MONO = "font-[var(--font-geist-mono),ui-monospace,monospace]";

export function CoordBadge({
    children,
    tone = "resting",
    surface = "dark",
    className = "",
}: {
    children: React.ReactNode;
    tone?: "resting" | "active" | "dim";
    surface?: "dark" | "cream";
    className?: string;
}) {
    let color: string;
    if (tone === "active") color = ACCENT;
    else if (surface === "cream") {
        color = tone === "resting" ? "rgba(0,0,0,0.50)" : "rgba(0,0,0,0.30)";
    } else {
        color = tone === "resting" ? "rgba(255,255,255,0.55)" : "rgba(255,255,255,0.30)";
    }

    return (
        <span
            className={`${MONO} inline-flex items-center text-[9.5px] font-semibold uppercase tracking-[0.16em] ${className}`}
            style={{ color }}
        >
            <span aria-hidden style={{ opacity: 0.6 }}>[</span>
            <span className="px-[2px]">{children}</span>
            <span aria-hidden style={{ opacity: 0.6 }}>]</span>
        </span>
    );
}

/* ─── ⑤ SPARKLINE — 60×16 single-stroke mini-chart ────────────── */

export type SparklineTrend = "stable" | "stable-high" | "rising" | "falling";

function generateSparklinePoints(
    seed: string,
    trend: SparklineTrend,
    count = 16
): number[] {
    const rng = seedRandom(seed);
    const pts: number[] = [];
    for (let i = 0; i < count; i++) {
        const t = i / (count - 1); // 0..1
        let base = 50;
        if (trend === "rising") base = 20 + t * 60;
        else if (trend === "falling") base = 80 - t * 60;
        else if (trend === "stable-high") base = 75;
        else base = 50;
        const noise = (rng() - 0.5) * (trend === "stable-high" ? 10 : 30);
        pts.push(base + noise);
    }
    return pts;
}

export function Sparkline({
    points,
    seed,
    trend = "stable",
    width = 60,
    height = 16,
    color = ACCENT,
    showDot = true,
    className = "",
}: {
    points?: number[];
    seed?: string;
    trend?: SparklineTrend;
    width?: number;
    height?: number;
    color?: string;
    showDot?: boolean;
    className?: string;
}) {
    const data = points && points.length >= 2 ? points : seed ? generateSparklinePoints(seed, trend) : null;
    if (!data) return null;

    const min = Math.min(...data);
    const max = Math.max(...data);
    const range = max - min || 1;
    const stepX = width / (data.length - 1);
    const pad = 1.5;
    const norm = (v: number) =>
        height - pad - ((v - min) / range) * (height - 2 * pad);

    const path = data
        .map(
            (v, i) =>
                `${i === 0 ? "M" : "L"} ${(i * stepX).toFixed(1)} ${norm(v).toFixed(1)}`
        )
        .join(" ");

    const lastX = (data.length - 1) * stepX;
    const lastY = norm(data[data.length - 1]);

    return (
        <svg
            width={width}
            height={height}
            className={`shrink-0 ${className}`}
            aria-hidden
        >
            <path
                d={path}
                fill="none"
                stroke={color}
                strokeWidth={1}
                strokeLinecap="round"
                strokeLinejoin="round"
                opacity={0.85}
            />
            {showDot && <circle cx={lastX} cy={lastY} r={1.6} fill={color} />}
        </svg>
    );
}

/* ─── ⑥ LATTICE — faint background dot grid ───────────────────── */

export function MeshLattice({
    spacing = 24,
    opacity = 0.05,
    color = "rgba(255,255,255,1)",
    className = "",
}: {
    spacing?: number;
    opacity?: number;
    color?: string;
    className?: string;
}) {
    return (
        <div
            aria-hidden
            className={`pointer-events-none absolute inset-0 ${className}`}
            style={{
                backgroundImage: `radial-gradient(circle at 1px 1px, ${color} 1px, transparent 0)`,
                backgroundSize: `${spacing}px ${spacing}px`,
                opacity,
            }}
        />
    );
}

/* ─── COMPOSITION — sparse mesh ornament for backgrounds ────── */

export function MeshDecoration({
    seed,
    density = "sparse",
    surface = "dark",
    className = "",
    viewBox = "0 0 100 100",
}: {
    seed: string;
    density?: "sparse" | "medium";
    surface?: "dark" | "cream";
    className?: string;
    viewBox?: string;
}) {
    const rng = seedRandom(seed);
    const count = density === "sparse" ? 6 : 10;
    type Pt = { x: number; y: number; size: number; bright: boolean };
    const nodes: Pt[] = [];
    for (let i = 0; i < count; i++) {
        nodes.push({
            x: rng() * 100,
            y: rng() * 100,
            size: rng() > 0.7 ? 1.0 : 0.55,
            bright: rng() > 0.65,
        });
    }
    // Trace a sparse set of edges between consecutive nodes
    const edges: Array<[number, number]> = [];
    for (let i = 0; i < nodes.length - 1; i++) {
        if (rng() > 0.4) edges.push([i, i + 1]);
    }

    const nodeBright = surface === "cream" ? "rgba(0,0,0,0.45)" : "rgba(255,255,255,0.45)";
    const nodeDim = surface === "cream" ? "rgba(0,0,0,0.18)" : "rgba(255,255,255,0.22)";
    const edgeColor = surface === "cream" ? "rgba(0,0,0,0.08)" : "rgba(255,255,255,0.10)";

    return (
        <svg
            aria-hidden
            className={`pointer-events-none absolute inset-0 ${className}`}
            viewBox={viewBox}
            preserveAspectRatio="none"
        >
            {edges.map(([a, b], i) => {
                const from = nodes[a];
                const to = nodes[b];
                return (
                    <line
                        key={`e-${i}`}
                        x1={from.x}
                        y1={from.y}
                        x2={to.x}
                        y2={to.y}
                        stroke={edgeColor}
                        strokeWidth={0.4}
                        vectorEffect="non-scaling-stroke"
                    />
                );
            })}
            {nodes.map((n, i) => (
                <circle
                    key={`n-${i}`}
                    cx={n.x}
                    cy={n.y}
                    r={n.size}
                    fill={n.bright ? nodeBright : nodeDim}
                />
            ))}
        </svg>
    );
}
