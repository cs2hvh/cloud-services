"use client";

// ─── Atmospheric Editorial — signature design primitives ─────────────
//
// Three primitives, used with restraint. The brand is the mood — slow
// drifting blue light on dark surfaces, warm paper on cream surfaces,
// strong editorial type carrying the rest.
//
//   ①  <Aurora />     slow-drift blue ribbons behind dark sections
//   ②  <Eclipse />    soft radial halo anchored to focal content
//   ③  <PaperGrain /> faint paper-grain texture on cream sections
//
// Plus a typography helper:
//
//   SERIF_ITALIC      inline style for italic-serif accent words

import * as React from "react";

const ACCENT = "#0095FF";

/* ─── ① AURORA — slow-drifting light ribbons ───────────────────── */

export function Aurora({
    intensity = "medium",
    className = "",
}: {
    intensity?: "soft" | "medium" | "bright";
    className?: string;
}) {
    const m = intensity === "soft" ? 0.6 : intensity === "bright" ? 1.5 : 1;

    return (
        <div
            aria-hidden
            className={`pointer-events-none absolute inset-0 overflow-hidden ${className}`}
        >
            {/* Ribbon A — top-left, drifts diagonally */}
            <div
                className="absolute aurora-r1"
                style={{
                    top: "-25%",
                    left: "-15%",
                    width: "85%",
                    height: "120%",
                    background: `radial-gradient(ellipse at 35% 50%, rgba(0,149,255,${0.20 * m}) 0%, rgba(0,149,255,${0.07 * m}) 30%, transparent 65%)`,
                    filter: "blur(60px)",
                    willChange: "transform",
                }}
            />
            {/* Ribbon B — bottom-right, counter-drift */}
            <div
                className="absolute aurora-r2"
                style={{
                    bottom: "-25%",
                    right: "-15%",
                    width: "85%",
                    height: "120%",
                    background: `radial-gradient(ellipse at 65% 50%, rgba(0,149,255,${0.14 * m}) 0%, rgba(0,149,255,${0.05 * m}) 35%, transparent 70%)`,
                    filter: "blur(80px)",
                    willChange: "transform",
                }}
            />
            {/* Subtle cool wash overlay to push slight color shift */}
            <div
                className="absolute inset-0 aurora-r3"
                style={{
                    background: `radial-gradient(circle at 50% 40%, rgba(130,173,251,${0.04 * m}) 0%, transparent 60%)`,
                    willChange: "opacity",
                }}
            />

            <style jsx>{`
                @keyframes aurora-1 {
                    0%, 100% { transform: translate(0, 0) rotate(-5deg) scale(1); }
                    50%      { transform: translate(8%, -4%) rotate(5deg) scale(1.05); }
                }
                @keyframes aurora-2 {
                    0%, 100% { transform: translate(0, 0) rotate(4deg) scale(1); }
                    50%      { transform: translate(-7%, 5%) rotate(-4deg) scale(1.08); }
                }
                @keyframes aurora-3 {
                    0%, 100% { opacity: 0.7; }
                    50%      { opacity: 1; }
                }
                .aurora-r1 { animation: aurora-1 22s ease-in-out infinite; }
                .aurora-r2 { animation: aurora-2 28s ease-in-out infinite; }
                .aurora-r3 { animation: aurora-3 14s ease-in-out infinite; }

                @media (prefers-reduced-motion: reduce) {
                    .aurora-r1, .aurora-r2, .aurora-r3 { animation: none; }
                }
            `}</style>
        </div>
    );
}

/* ─── ② ECLIPSE — radial halo anchored to focal content ─────────── */

type EclipsePosition =
    | "center"
    | "top" | "top-left" | "top-right"
    | "bottom" | "bottom-left" | "bottom-right"
    | "left" | "right";

function hexToRgba(hex: string, a: number): string {
    const h = hex.replace("#", "");
    const r = parseInt(h.substring(0, 2), 16);
    const g = parseInt(h.substring(2, 4), 16);
    const b = parseInt(h.substring(4, 6), 16);
    return `rgba(${r},${g},${b},${a})`;
}

const POS: Record<EclipsePosition, React.CSSProperties> = {
    center: { left: "50%", top: "50%", transform: "translate(-50%, -50%)" },
    top: { left: "50%", top: 0, transform: "translate(-50%, -45%)" },
    "top-left": { left: 0, top: 0, transform: "translate(-35%, -35%)" },
    "top-right": { right: 0, top: 0, transform: "translate(35%, -35%)" },
    bottom: { left: "50%", bottom: 0, transform: "translate(-50%, 45%)" },
    "bottom-left": { left: 0, bottom: 0, transform: "translate(-35%, 35%)" },
    "bottom-right": { right: 0, bottom: 0, transform: "translate(35%, 35%)" },
    left: { left: 0, top: "50%", transform: "translate(-45%, -50%)" },
    right: { right: 0, top: "50%", transform: "translate(45%, -50%)" },
};

export function Eclipse({
    size = 600,
    intensity = 0.16,
    position = "center",
    color = ACCENT,
    blur = 60,
    className = "",
}: {
    size?: number;
    intensity?: number;
    position?: EclipsePosition;
    color?: string;
    blur?: number;
    className?: string;
}) {
    return (
        <div
            aria-hidden
            className={`pointer-events-none absolute rounded-full ${className}`}
            style={{
                width: size,
                height: size,
                background: `radial-gradient(circle, ${hexToRgba(color, intensity)} 0%, transparent 65%)`,
                filter: `blur(${blur}px)`,
                ...POS[position],
            }}
        />
    );
}

/* ─── ③ PAPER GRAIN — faint noise texture for cream sections ─────── */

export function PaperGrain({
    opacity = 0.06,
    className = "",
}: {
    opacity?: number;
    className?: string;
}) {
    return (
        <svg
            aria-hidden
            className={`pointer-events-none absolute inset-0 h-full w-full ${className}`}
            style={{ opacity, mixBlendMode: "multiply" }}
        >
            <filter id="ah-paper-grain">
                <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="3" />
                <feColorMatrix
                    values="0 0 0 0 0
                            0 0 0 0 0
                            0 0 0 0 0
                            0 0 0 0.55 0"
                />
            </filter>
            <rect width="100%" height="100%" filter="url(#ah-paper-grain)" />
        </svg>
    );
}

/* ─── TYPOGRAPHY — Nunito display accent for headlines ─────────── */

export const ACCENT_FONT: React.CSSProperties = {
    fontFamily: "var(--font-nunito), system-ui, sans-serif",
    fontWeight: 500,
    fontStyle: "normal",
};

/** @deprecated use ACCENT_FONT — kept as alias to avoid breaking call sites. */
export const SERIF_ITALIC = ACCENT_FONT;
