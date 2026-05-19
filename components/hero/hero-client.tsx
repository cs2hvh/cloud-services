"use client";

import { motion } from "motion/react";
import Link from "next/link";

import { AuthAwareServiceCta } from "@/components/services/auth-aware-service-cta";

export type StockStatus = "high" | "medium" | "low" | "none";

export interface HeroInventoryItem {
    gpuCatalogId: string;
    displayName: string;
    memoryGb: number;
    onDemandPerHr: number | null;
    stockStatus: StockStatus;
    maxCount?: number;
}

const BRAND = "#0095FF";

// ─── Custom arrow glyph (no lucide) ──────────────────────────────
function ArrowGlyph({ className = "" }: { className?: string }) {
    return (
        <svg
            className={className}
            viewBox="0 0 16 16"
            fill="none"
            aria-hidden="true"
        >
            <path
                d="M2.5 8H13.5M9 3.5L13.5 8L9 12.5"
                stroke="currentColor"
                strokeWidth="1.4"
                strokeLinecap="square"
                strokeLinejoin="miter"
            />
        </svg>
    );
}

// ─── Premium GPU silicon illustration ────────────────────────────
// Hand-crafted top-down view of a GPU package: substrate, four
// HBM memory stacks, a central die with a grid of compute blocks,
// pin connectors along the bottom edge, surface PCB traces, and a
// brand-blue glow halo from underneath. A faint highlight sweeps
// across the surface every ~9 seconds to simulate ambient light.
function ChipIllustration({
    suffix = "main",
    width = 560,
    height = 380,
    label = "AHURA",
    sublabel = "AH-100 · SXM5",
    interactive = true,
}: {
    suffix?: string;
    width?: number;
    height?: number;
    label?: string;
    sublabel?: string;
    interactive?: boolean;
}) {
    const id = `chip-${suffix}`;
    return (
        <svg
            viewBox="0 0 560 380"
            width={width}
            height={height}
            preserveAspectRatio="xMidYMid meet"
            className="h-auto w-full max-w-full"
            aria-hidden="true"
            xmlns="http://www.w3.org/2000/svg"
        >
            <defs>
                <linearGradient id={`${id}-substrate`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0" stopColor="#0e1422" />
                    <stop offset="0.6" stopColor="#0a0f1a" />
                    <stop offset="1" stopColor="#070b14" />
                </linearGradient>
                <linearGradient id={`${id}-mem`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0" stopColor="#1d232f" />
                    <stop offset="0.5" stopColor="#10141d" />
                    <stop offset="1" stopColor="#1a1f2a" />
                </linearGradient>
                <linearGradient id={`${id}-die`} x1="0" y1="0" x2="0.6" y2="1">
                    <stop offset="0" stopColor="#1a2230" />
                    <stop offset="1" stopColor="#0c111c" />
                </linearGradient>
                <linearGradient id={`${id}-pin`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0" stopColor="#c7ccd6" />
                    <stop offset="0.5" stopColor="#52596a" />
                    <stop offset="1" stopColor="#9aa1ad" />
                </linearGradient>
                <radialGradient
                    id={`${id}-glow`}
                    cx="0.5"
                    cy="0.5"
                    r="0.5"
                    fx="0.5"
                    fy="0.5"
                >
                    <stop offset="0" stopColor={BRAND} stopOpacity="0.55" />
                    <stop offset="0.6" stopColor={BRAND} stopOpacity="0.10" />
                    <stop offset="1" stopColor={BRAND} stopOpacity="0" />
                </radialGradient>
                <linearGradient id={`${id}-sweep`} x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0" stopColor="#ffffff" stopOpacity="0" />
                    <stop offset="0.5" stopColor="#ffffff" stopOpacity="0.06" />
                    <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
                </linearGradient>
                <linearGradient id={`${id}-edge`} x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0" stopColor={BRAND} stopOpacity="0.5" />
                    <stop offset="0.5" stopColor={BRAND} stopOpacity="0.05" />
                    <stop offset="1" stopColor={BRAND} stopOpacity="0.5" />
                </linearGradient>
                <pattern
                    id={`${id}-trace`}
                    x="0"
                    y="0"
                    width="14"
                    height="14"
                    patternUnits="userSpaceOnUse"
                >
                    <path
                        d="M0 7 H14"
                        stroke="rgba(120,180,255,0.045)"
                        strokeWidth="0.5"
                    />
                    <path
                        d="M7 0 V14"
                        stroke="rgba(120,180,255,0.035)"
                        strokeWidth="0.5"
                    />
                </pattern>
                <filter
                    id={`${id}-soft`}
                    x="-50%"
                    y="-50%"
                    width="200%"
                    height="200%"
                >
                    <feGaussianBlur stdDeviation="2" />
                </filter>
            </defs>

            {/* Underlying floor glow */}
            <ellipse
                cx="280"
                cy="345"
                rx="230"
                ry="22"
                fill={`url(#${id}-glow)`}
                opacity="0.85"
            />

            {/* Substrate / PCB */}
            <g>
                <rect
                    x="40"
                    y="50"
                    width="480"
                    height="280"
                    rx="4"
                    fill={`url(#${id}-substrate)`}
                    stroke="rgba(255,255,255,0.06)"
                    strokeWidth="1"
                />
                {/* Trace grid */}
                <rect
                    x="40"
                    y="50"
                    width="480"
                    height="280"
                    rx="4"
                    fill={`url(#${id}-trace)`}
                />
                {/* Curved decorative traces */}
                <path
                    d="M 60 80 H 130 Q 150 80 150 100 V 130"
                    stroke="rgba(0,149,255,0.18)"
                    strokeWidth="0.8"
                    fill="none"
                />
                <path
                    d="M 500 80 H 430 Q 410 80 410 100 V 130"
                    stroke="rgba(0,149,255,0.18)"
                    strokeWidth="0.8"
                    fill="none"
                />
                <path
                    d="M 60 300 H 200 Q 220 300 220 280"
                    stroke="rgba(0,149,255,0.12)"
                    strokeWidth="0.8"
                    fill="none"
                />
                <path
                    d="M 500 300 H 360 Q 340 300 340 280"
                    stroke="rgba(0,149,255,0.12)"
                    strokeWidth="0.8"
                    fill="none"
                />
                {/* Vias (small dots along traces) */}
                {[
                    [60, 80], [130, 80], [150, 130], [500, 80], [430, 80],
                    [410, 130], [60, 300], [200, 300], [220, 280], [500, 300],
                    [360, 300], [340, 280],
                ].map(([cx, cy], i) => (
                    <circle
                        key={`v-${i}`}
                        cx={cx}
                        cy={cy}
                        r="1.4"
                        fill="rgba(0,149,255,0.6)"
                    />
                ))}
            </g>

            {/* Top edge accent line */}
            <line
                x1="40"
                y1="50"
                x2="520"
                y2="50"
                stroke={`url(#${id}-edge)`}
                strokeWidth="1"
            />

            {/* Pin connectors along the bottom */}
            {Array.from({ length: 36 }).map((_, i) => (
                <rect
                    key={`pin-${i}`}
                    x={60 + i * 12}
                    y="326"
                    width="6"
                    height="22"
                    fill={`url(#${id}-pin)`}
                    rx="0.5"
                />
            ))}
            {/* Pin row backing strip */}
            <rect
                x="56"
                y="322"
                width="448"
                height="4"
                fill="rgba(255,255,255,0.04)"
            />

            {/* HBM memory stacks — 4 around the central die */}
            {[
                { x: 76, y: 96 },
                { x: 76, y: 204 },
                { x: 412, y: 96 },
                { x: 412, y: 204 },
            ].map((p, idx) => (
                <g key={`hbm-${idx}`}>
                    <rect
                        x={p.x}
                        y={p.y}
                        width="72"
                        height="80"
                        fill={`url(#${id}-mem)`}
                        stroke="rgba(255,255,255,0.08)"
                        strokeWidth="0.8"
                    />
                    {/* Layered HBM ridges (representing stack) */}
                    {[14, 28, 42, 56, 70].map((y, i) => (
                        <line
                            key={i}
                            x1={p.x + 4}
                            y1={p.y + y}
                            x2={p.x + 68}
                            y2={p.y + y}
                            stroke="rgba(255,255,255,0.05)"
                            strokeWidth="0.6"
                        />
                    ))}
                    {/* Marking */}
                    <text
                        x={p.x + 36}
                        y={p.y + 47}
                        textAnchor="middle"
                        fontSize="8"
                        fill="rgba(255,255,255,0.32)"
                        fontFamily="ui-monospace, 'SF Mono', monospace"
                        fontWeight="600"
                        letterSpacing="0.06em"
                    >
                        HBM3
                    </text>
                    {/* Corner notch */}
                    <path
                        d={`M ${p.x + 2} ${p.y + 2} L ${p.x + 8} ${p.y + 2} L ${p.x + 2} ${p.y + 8} Z`}
                        fill="rgba(0,149,255,0.18)"
                    />
                </g>
            ))}

            {/* Central die package (outer ring) */}
            <rect
                x="170"
                y="80"
                width="220"
                height="220"
                fill="rgba(255,255,255,0.025)"
                stroke="rgba(0,149,255,0.22)"
                strokeWidth="0.8"
            />

            {/* Central die (inner) */}
            <rect
                x="184"
                y="94"
                width="192"
                height="192"
                fill={`url(#${id}-die)`}
                stroke="rgba(0,149,255,0.30)"
                strokeWidth="0.6"
            />

            {/* Die grid — 4x4 functional blocks */}
            {Array.from({ length: 4 }).map((_, row) =>
                Array.from({ length: 4 }).map((_, col) => {
                    const cx = 188 + col * 46 + 21;
                    const cy = 98 + row * 46 + 18;
                    const isCenter =
                        (row === 1 || row === 2) && (col === 1 || col === 2);
                    return (
                        <g key={`b-${row}-${col}`}>
                            <rect
                                x={188 + col * 46}
                                y={98 + row * 46}
                                width="42"
                                height="42"
                                fill={
                                    isCenter
                                        ? "rgba(0,149,255,0.10)"
                                        : "rgba(255,255,255,0.025)"
                                }
                                stroke="rgba(0,149,255,0.20)"
                                strokeWidth="0.5"
                            />
                            {/* Inner block ID */}
                            <text
                                x={cx}
                                y={cy}
                                textAnchor="middle"
                                fontSize="5"
                                fill="rgba(255,255,255,0.22)"
                                fontFamily="ui-monospace, 'SF Mono', monospace"
                                letterSpacing="0.05em"
                            >
                                {`${String.fromCharCode(65 + row)}${col + 1}`}
                            </text>
                        </g>
                    );
                })
            )}

            {/* Glowing center pulse (active core indicator) */}
            <motion.rect
                x="252"
                y="186"
                width="56"
                height="8"
                fill="rgba(0,149,255,0.6)"
                animate={
                    interactive
                        ? { opacity: [0.45, 0.95, 0.45] }
                        : undefined
                }
                transition={{
                    duration: 2.6,
                    repeat: Infinity,
                    ease: "easeInOut",
                }}
            />
            <motion.rect
                x="252"
                y="186"
                width="56"
                height="8"
                fill="none"
                stroke={BRAND}
                strokeWidth="0.6"
                animate={
                    interactive
                        ? { opacity: [0.8, 0.3, 0.8] }
                        : undefined
                }
                transition={{
                    duration: 2.6,
                    repeat: Infinity,
                    ease: "easeInOut",
                }}
            />

            {/* Brand wordmark on die */}
            <text
                x="280"
                y="174"
                textAnchor="middle"
                fontSize="10"
                fill="rgba(255,255,255,0.78)"
                fontFamily="ui-monospace, 'SF Mono', monospace"
                fontWeight="700"
                letterSpacing="0.32em"
            >
                {label}
            </text>

            {/* Die corner index markers */}
            <text
                x="190"
                y="106"
                fontSize="6"
                fill="rgba(255,255,255,0.32)"
                fontFamily="ui-monospace, monospace"
            >
                A1
            </text>
            <text
                x="370"
                y="106"
                fontSize="6"
                fill="rgba(255,255,255,0.32)"
                fontFamily="ui-monospace, monospace"
                textAnchor="end"
            >
                A4
            </text>
            <text
                x="190"
                y="282"
                fontSize="6"
                fill="rgba(255,255,255,0.32)"
                fontFamily="ui-monospace, monospace"
            >
                D1
            </text>
            <text
                x="370"
                y="282"
                fontSize="6"
                fill="rgba(255,255,255,0.32)"
                fontFamily="ui-monospace, monospace"
                textAnchor="end"
            >
                D4
            </text>

            {/* Top header labels */}
            <text
                x="60"
                y="44"
                fontSize="9"
                fill="rgba(255,255,255,0.45)"
                fontFamily="ui-monospace, monospace"
                letterSpacing="0.12em"
            >
                {sublabel}
            </text>
            <g>
                <circle cx="490" cy="40" r="2.5" fill={BRAND} opacity="0.9" />
                <text
                    x="500"
                    y="44"
                    fontSize="9"
                    fill="rgba(255,255,255,0.45)"
                    fontFamily="ui-monospace, monospace"
                    letterSpacing="0.12em"
                >
                    ACTIVE
                </text>
            </g>

            {/* Subtle highlight sweep across surface */}
            {interactive && (
                <motion.rect
                    y="50"
                    width="160"
                    height="280"
                    fill={`url(#${id}-sweep)`}
                    initial={{ x: -180 }}
                    animate={{ x: 580 }}
                    transition={{
                        duration: 7,
                        repeat: Infinity,
                        ease: "linear",
                        delay: 1.8,
                    }}
                />
            )}
        </svg>
    );
}

// ─── Small chip icon used in the GPU lockup ──────────────────────
function ChipMini({
    accent = BRAND,
    keyId,
}: {
    accent?: string;
    keyId: string;
}) {
    const id = `mini-${keyId}`;
    return (
        <svg
            viewBox="0 0 60 60"
            className="h-12 w-12"
            aria-hidden="true"
            xmlns="http://www.w3.org/2000/svg"
        >
            <defs>
                <linearGradient id={`${id}-pkg`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0" stopColor="#161c28" />
                    <stop offset="1" stopColor="#0a0f18" />
                </linearGradient>
                <radialGradient id={`${id}-glow`} cx="0.5" cy="0.55" r="0.5">
                    <stop offset="0" stopColor={accent} stopOpacity="0.55" />
                    <stop offset="1" stopColor={accent} stopOpacity="0" />
                </radialGradient>
            </defs>

            {/* halo glow */}
            <circle cx="30" cy="36" r="22" fill={`url(#${id}-glow)`} />

            {/* outer package */}
            <rect
                x="8"
                y="8"
                width="44"
                height="44"
                fill={`url(#${id}-pkg)`}
                stroke="rgba(255,255,255,0.10)"
                strokeWidth="0.8"
            />

            {/* pins top + bottom */}
            {[12, 18, 24, 30, 36, 42, 48].map((x) => (
                <rect
                    key={`pt-${x}`}
                    x={x - 1}
                    y="4"
                    width="2"
                    height="4"
                    fill="rgba(255,255,255,0.25)"
                />
            ))}
            {[12, 18, 24, 30, 36, 42, 48].map((x) => (
                <rect
                    key={`pb-${x}`}
                    x={x - 1}
                    y="52"
                    width="2"
                    height="4"
                    fill="rgba(255,255,255,0.25)"
                />
            ))}
            {/* pins left + right */}
            {[14, 20, 26, 32, 38, 44].map((y) => (
                <rect
                    key={`pl-${y}`}
                    x="4"
                    y={y - 1}
                    width="4"
                    height="2"
                    fill="rgba(255,255,255,0.25)"
                />
            ))}
            {[14, 20, 26, 32, 38, 44].map((y) => (
                <rect
                    key={`pr-${y}`}
                    x="52"
                    y={y - 1}
                    width="4"
                    height="2"
                    fill="rgba(255,255,255,0.25)"
                />
            ))}

            {/* inner die */}
            <rect
                x="16"
                y="16"
                width="28"
                height="28"
                fill="rgba(0,149,255,0.04)"
                stroke={accent}
                strokeOpacity="0.4"
                strokeWidth="0.6"
            />

            {/* 2x2 die grid */}
            <line
                x1="30"
                y1="16"
                x2="30"
                y2="44"
                stroke={accent}
                strokeOpacity="0.25"
                strokeWidth="0.5"
            />
            <line
                x1="16"
                y1="30"
                x2="44"
                y2="30"
                stroke={accent}
                strokeOpacity="0.25"
                strokeWidth="0.5"
            />

            {/* center pulse */}
            <motion.rect
                x="26"
                y="28"
                width="8"
                height="4"
                fill={accent}
                fillOpacity="0.8"
                animate={{ opacity: [0.5, 1, 0.5] }}
                transition={{
                    duration: 2.4,
                    repeat: Infinity,
                    ease: "easeInOut",
                }}
            />

            {/* corner notch */}
            <path
                d="M 10 10 L 14 10 L 10 14 Z"
                fill={accent}
                fillOpacity="0.5"
            />
        </svg>
    );
}

// ─── GPU price lockup ────────────────────────────────────────────
function GpuLockup({ inventory }: { inventory: HeroInventoryItem[] }) {
    if (inventory.length === 0) return null;
    const shown = inventory.slice(0, 5);

    const stagger = {
        hidden: {},
        show: { transition: { staggerChildren: 0.08, delayChildren: 1.1 } },
    };
    const item = {
        hidden: { opacity: 0, y: 10 },
        show: {
            opacity: 1,
            y: 0,
            transition: { duration: 0.55, ease: [0.16, 1, 0.3, 1] as const },
        },
    };

    return (
        <motion.div
            variants={stagger}
            initial="hidden"
            animate="show"
            className="flex flex-wrap items-start justify-center gap-x-10 gap-y-10 sm:gap-x-14 lg:gap-x-20"
        >
            {shown.map((it) => {
                const out = it.stockStatus === "none";
                const stockColor = out
                    ? "rgba(255,255,255,0.20)"
                    : it.stockStatus === "high"
                      ? "#34d399"
                      : "#f59e0b";
                return (
                    <motion.div
                        key={it.gpuCatalogId}
                        variants={item}
                        className="group flex flex-col items-center text-center"
                    >
                        <ChipMini keyId={it.gpuCatalogId} accent={BRAND} />
                        <div className="mt-3 flex items-center gap-1.5">
                            <span
                                className="h-1.5 w-1.5 rounded-full"
                                style={{ backgroundColor: stockColor }}
                            />
                            <p className="text-[15px] font-semibold text-white/85 transition-colors group-hover:text-white">
                                {it.displayName}
                            </p>
                        </div>
                        <p className="mt-1 font-mono text-[10.5px] uppercase tracking-[0.18em] text-white/35">
                            {it.memoryGb} GB · HBM
                        </p>
                        <p
                            className="mt-2 font-mono text-[15px] font-semibold tabular-nums"
                            style={{
                                color: out ? "rgba(255,255,255,0.30)" : BRAND,
                            }}
                        >
                            ${it.onDemandPerHr !== null
                                ? it.onDemandPerHr.toFixed(2)
                                : "—"}
                            <span className="text-[11px] font-normal text-white/45">
                                /hr
                            </span>
                        </p>
                    </motion.div>
                );
            })}
        </motion.div>
    );
}

// ─── Hero ────────────────────────────────────────────────────────
export default function HeroClient({
    inventory,
}: {
    inventory: HeroInventoryItem[];
}) {
    return (
        <section
            className="relative w-full overflow-hidden bg-[#08080a]"
            aria-label="Ahura — one cloud for AI builders"
        >
            {/* ── Background layers ─────────────────────────────── */}
            <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-y-0 left-[5%] hidden w-px bg-white/[0.04] lg:block"
            />
            <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-y-0 right-[5%] hidden w-px bg-white/[0.04] lg:block"
            />
            <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 opacity-[0.30]"
                style={{
                    backgroundImage:
                        "radial-gradient(rgba(255,255,255,0.07) 1px, transparent 1px)",
                    backgroundSize: "30px 30px",
                    maskImage:
                        "radial-gradient(ellipse 90% 80% at 50% 45%, black 30%, transparent 80%)",
                    WebkitMaskImage:
                        "radial-gradient(ellipse 90% 80% at 50% 45%, black 30%, transparent 80%)",
                }}
            />
            <div
                aria-hidden="true"
                className="pointer-events-none absolute -top-40 right-[-10%] h-[640px] w-[820px] rounded-full"
                style={{
                    background:
                        "radial-gradient(closest-side, rgba(0,149,255,0.20), rgba(0,149,255,0.05) 55%, transparent 80%)",
                }}
            />
            <div
                aria-hidden="true"
                className="pointer-events-none absolute -bottom-32 left-1/2 h-[420px] w-[820px] -translate-x-1/2 rounded-full"
                style={{
                    background:
                        "radial-gradient(closest-side, rgba(105,183,255,0.10), rgba(105,183,255,0.02) 55%, transparent 80%)",
                }}
            />

            {/* ── Main asymmetric grid ──────────────────────────── */}
            <div className="relative z-10 mx-auto w-full max-w-[1320px] px-5 pt-28 pb-12 sm:px-8 sm:pt-32 lg:pt-36">
                <div className="grid grid-cols-1 gap-12 lg:grid-cols-[1fr_1.05fr] lg:gap-16 lg:items-center">
                    {/* LEFT — text */}
                    <div>
                        <motion.div
                            initial={{ opacity: 0, y: 8 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.5 }}
                            className="inline-flex items-center gap-2.5 border border-white/[0.10] bg-white/[0.02] px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.22em] text-white/55"
                        >
                            <span className="relative flex h-1.5 w-1.5">
                                <span
                                    className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-75"
                                    style={{ backgroundColor: BRAND }}
                                />
                                <span
                                    className="relative inline-flex h-1.5 w-1.5 rounded-full"
                                    style={{ backgroundColor: BRAND }}
                                />
                            </span>
                            <span>The cloud for AI builders</span>
                        </motion.div>

                        <motion.h1
                            initial={{ opacity: 0, y: 18 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.7, delay: 0.12 }}
                            className="mt-7 text-[clamp(40px,5.6vw,76px)] font-semibold leading-[0.96] tracking-[-0.045em] text-white"
                            style={{ fontFeatureSettings: '"ss01", "ss02"' }}
                        >
                            Built for the
                            <br />
                            next generation
                            <br />
                            of{" "}
                            <motion.span
                                className="inline-block bg-clip-text text-transparent"
                                style={{
                                    backgroundImage: `linear-gradient(110deg, #ffffff 0%, #cfe9ff 22%, ${BRAND} 50%, #69b7ff 78%, #ffffff 100%)`,
                                    backgroundSize: "220% 100%",
                                }}
                                animate={{ backgroundPositionX: ["0%", "-220%"] }}
                                transition={{
                                    duration: 9,
                                    repeat: Infinity,
                                    ease: "linear",
                                }}
                            >
                                AI builders.
                            </motion.span>
                        </motion.h1>

                        <motion.p
                            initial={{ opacity: 0, y: 12 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.7, delay: 0.28 }}
                            className="mt-7 max-w-[520px] text-[15px] leading-[1.65] text-white/55 sm:text-[16.5px]"
                        >
                            GPU pods, managed databases, Kubernetes, object storage, and
                            AI agents — one cloud, per-second billing, 12 regions
                            worldwide.
                        </motion.p>

                        <motion.div
                            initial={{ opacity: 0, y: 12 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.7, delay: 0.42 }}
                            className="relative mt-9"
                        >
                            <motion.div
                                aria-hidden="true"
                                className="pointer-events-none absolute left-12 top-1/2 -z-10 h-24 w-56 -translate-y-1/2 blur-3xl"
                                style={{ backgroundColor: BRAND }}
                                initial={{ opacity: 0 }}
                                animate={{ opacity: [0.16, 0.34, 0.16] }}
                                transition={{
                                    duration: 4.5,
                                    repeat: Infinity,
                                    ease: "easeInOut",
                                    delay: 1,
                                }}
                            />
                            <div className="flex flex-wrap items-center gap-3">
                                <AuthAwareServiceCta
                                    service="main"
                                    intent="main"
                                    className="group relative inline-flex h-12 items-center justify-center gap-2 overflow-hidden border border-[#0095FF] bg-[#0095FF] px-7 text-[14px] font-semibold text-white transition-all hover:shadow-[0_12px_40px_-8px_rgba(0,149,255,0.55)]"
                                >
                                    <span
                                        aria-hidden="true"
                                        className="pointer-events-none absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/20 to-transparent"
                                    />
                                    <span className="relative">Get Started</span>
                                    <ArrowGlyph className="relative h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                                </AuthAwareServiceCta>
                                <Link
                                    href="/pricing"
                                    className="inline-flex h-12 items-center justify-center border border-white/[0.10] px-7 text-[14px] font-medium text-white/70 transition-colors hover:border-white/25 hover:text-white"
                                >
                                    View pricing
                                </Link>
                            </div>
                        </motion.div>

                        {/* mini proof row */}
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            transition={{ duration: 1, delay: 0.7 }}
                            className="mt-12 flex flex-wrap items-baseline gap-x-7 gap-y-2 border-t border-white/[0.06] pt-5 text-[11px] text-white/45"
                        >
                            <span className="flex items-baseline gap-2">
                                <span className="font-mono text-[13px] font-semibold text-white tabular-nums">
                                    12
                                </span>
                                <span className="uppercase tracking-[0.18em]">
                                    Regions
                                </span>
                            </span>
                            <span className="hidden h-3 w-px bg-white/[0.10] sm:inline-block" />
                            <span className="flex items-baseline gap-2">
                                <span className="font-mono text-[13px] font-semibold text-white tabular-nums">
                                    99.998%
                                </span>
                                <span className="uppercase tracking-[0.18em]">
                                    Uptime · 90d
                                </span>
                            </span>
                            <span className="hidden h-3 w-px bg-white/[0.10] sm:inline-block" />
                            <span className="flex items-baseline gap-2">
                                <span className="font-mono text-[13px] font-semibold text-white tabular-nums">
                                    &lt;90s
                                </span>
                                <span className="uppercase tracking-[0.18em]">
                                    Pod boot
                                </span>
                            </span>
                        </motion.div>
                    </div>

                    {/* RIGHT — premium chip illustration */}
                    <motion.div
                        initial={{ opacity: 0, scale: 0.96, y: 24 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        transition={{
                            duration: 0.9,
                            delay: 0.35,
                            ease: [0.16, 1, 0.3, 1],
                        }}
                        className="relative mx-auto w-full max-w-[640px]"
                    >
                        <motion.div
                            animate={{ y: [0, -8, 0] }}
                            transition={{
                                duration: 8,
                                repeat: Infinity,
                                ease: "easeInOut",
                                delay: 1.2,
                            }}
                        >
                            <ChipIllustration />
                        </motion.div>

                        {/* Floating spec badges around the chip — premium detail */}
                        <motion.div
                            initial={{ opacity: 0, x: -8 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ duration: 0.6, delay: 1.4 }}
                            className="absolute left-2 top-[18%] hidden border border-white/[0.10] bg-[#0c0f17]/85 px-3 py-2 backdrop-blur-sm lg:block"
                        >
                            <p className="font-mono text-[9px] uppercase tracking-[0.22em] text-white/35">
                                Compute
                            </p>
                            <p className="font-mono text-[13px] font-semibold tabular-nums text-white">
                                2,000{" "}
                                <span className="text-[10px] font-normal text-white/40">
                                    TFLOPS
                                </span>
                            </p>
                        </motion.div>

                        <motion.div
                            initial={{ opacity: 0, x: 8 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ duration: 0.6, delay: 1.55 }}
                            className="absolute right-2 top-[58%] hidden border border-white/[0.10] bg-[#0c0f17]/85 px-3 py-2 backdrop-blur-sm lg:block"
                        >
                            <p className="font-mono text-[9px] uppercase tracking-[0.22em] text-white/35">
                                Bandwidth
                            </p>
                            <p
                                className="font-mono text-[13px] font-semibold tabular-nums"
                                style={{ color: BRAND }}
                            >
                                3.35{" "}
                                <span className="text-[10px] font-normal text-white/40">
                                    TB/s
                                </span>
                            </p>
                        </motion.div>
                    </motion.div>
                </div>
            </div>

            {/* ── GPU price lockup — replaces the logo row ──────── */}
            <div className="relative z-10 mx-auto w-full max-w-[1320px] px-5 pb-20 pt-4 sm:px-8 sm:pb-24 sm:pt-8">
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.8, delay: 0.9 }}
                    className="mb-10 flex items-center justify-center sm:mb-14"
                >
                    <span className="h-px w-10 bg-white/[0.10]" />
                    <span className="mx-4 text-[10.5px] font-semibold uppercase tracking-[0.24em] text-white/35">
                        Live pricing · Available now
                    </span>
                    <span className="h-px w-10 bg-white/[0.10]" />
                </motion.div>

                <GpuLockup inventory={inventory} />
            </div>

            {/* Bottom separator */}
            <div
                aria-hidden="true"
                className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/[0.08] to-transparent"
            />
        </section>
    );
}
