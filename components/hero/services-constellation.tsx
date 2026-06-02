"use client";
import { assetUrl } from "@/lib/asset-url";

// ServicesConstellation — central Compute hub with 4 service satellites.
// Connections rendered as clean straight beams with a bright accent
// segment travelling from the hub out to each satellite — represents
// the hub dispatching work into the mesh. Short gaps at each end keep
// the lines from piercing the icons; a small perpendicular tick at the
// satellite end gives the beams a "wired plug" feel rather than a flat
// radial line.
//
// Per-satellite status LEDs + breathing radar ripples from the hub
// complete the "live infrastructure" picture.

import Image from "next/image";

const ICONS = {
    compute: assetUrl("/dashboard-services-icons/da%20compute.png"),
    kubernetes: assetUrl("/dashboard-services-icons/da%20kuubernetes.png"),
    database: assetUrl("/dashboard-services-icons/da%20database.png"),
    apps: assetUrl("/dashboard-services-icons/da%20application%20deployment.png"),
    storage: assetUrl("/dashboard-services-icons/da%20object%20storage.png"),
    ddos: assetUrl("/dashboard-services-icons/da%20ddos%20preotection.png"),
} as const;

const ACCENT = "#0095FF";
const HERO_X = 50;
const HERO_Y = 50;

interface Satellite {
    id: string;
    src: string;
    alt: string;
    x: number;
    y: number;
    floatKind: 2 | 3 | 4;
    delay: number;
}

const SATELLITES: Satellite[] = [
    {
        id: "k8s",
        src: ICONS.kubernetes,
        alt: "Kubernetes",
        x: 18,
        y: 20,
        floatKind: 2,
        delay: 0.8,
    },
    {
        id: "database",
        src: ICONS.database,
        alt: "Database",
        x: 82,
        y: 18,
        floatKind: 3,
        delay: 1.4,
    },
    {
        id: "storage",
        src: ICONS.storage,
        alt: "Object storage",
        x: 16,
        y: 80,
        floatKind: 4,
        delay: 2.0,
    },
    {
        id: "ddos",
        src: ICONS.ddos,
        alt: "DDoS protection",
        x: 84,
        y: 82,
        floatKind: 2,
        delay: 0.4,
    },
];

// Straight beam from the hub to a satellite. We carve a short gap at
// each end (so the line doesn't visually fight the icons / hub halo)
// and emit a small perpendicular "tick" at the satellite end — reads
// as a wired connection plug rather than a flat radial line.
const HUB_GAP = 6.5;   // skip this many units near the hub center
const SAT_GAP = 4.5;   // and this many before reaching the satellite
const TICK_LEN = 2.4;  // perpendicular tick at satellite endpoint

interface BeamGeometry {
    line: string;       // main straight path
    tick: string;       // perpendicular tick at the satellite end
    plugX: number;      // satellite-end point (after SAT_GAP)
    plugY: number;
}

function beamGeometry(sx: number, sy: number): BeamGeometry {
    const dx = sx - HERO_X;
    const dy = sy - HERO_Y;
    const len = Math.hypot(dx, dy);
    const ux = dx / len;
    const uy = dy / len;

    // Main line endpoints with gaps so the stroke doesn't pierce the icons
    const x1 = HERO_X + ux * HUB_GAP;
    const y1 = HERO_Y + uy * HUB_GAP;
    const x2 = sx - ux * SAT_GAP;
    const y2 = sy - uy * SAT_GAP;

    // Perpendicular (-uy, ux) for the satellite-end tick
    const tx1 = x2 + -uy * TICK_LEN;
    const ty1 = y2 + ux * TICK_LEN;
    const tx2 = x2 - -uy * TICK_LEN;
    const ty2 = y2 - ux * TICK_LEN;

    return {
        line: `M ${x1.toFixed(2)} ${y1.toFixed(2)} L ${x2.toFixed(2)} ${y2.toFixed(2)}`,
        tick: `M ${tx1.toFixed(2)} ${ty1.toFixed(2)} L ${tx2.toFixed(2)} ${ty2.toFixed(2)}`,
        plugX: x2,
        plugY: y2,
    };
}

// ─── Satellite icon ────────────────────────────────────────────
function SatelliteIcon({ s }: { s: Satellite }) {
    return (
        <div
            className={`sc-float sc-f${s.floatKind} absolute -translate-x-1/2 -translate-y-1/2`}
            style={{
                left: `${s.x}%`,
                top: `${s.y}%`,
                width: "var(--sc-sat)",
                height: "var(--sc-sat)",
                animationDelay: `${s.delay}s`,
                zIndex: 5,
            }}
        >
            <Image
                src={s.src}
                alt={s.alt}
                width={120}
                height={120}
                className="relative object-contain"
                style={{
                    width: "100%",
                    height: "100%",
                    filter:
                        "drop-shadow(0 18px 30px rgba(0,0,0,0.55)) drop-shadow(0 0 8px rgba(0,149,255,0.10))",
                }}
                unoptimized
            />

            {/* Status LED — sized relative to satellite */}
            <span
                className="sc-led absolute"
                style={{
                    top: "8%",
                    right: "14%",
                    width: "7%",
                    height: "7%",
                    minWidth: 5,
                    minHeight: 5,
                    borderRadius: "50%",
                    background: "#4ade80",
                    boxShadow: "0 0 10px #4ade80, 0 0 18px rgba(74,222,128,0.5)",
                    animationDelay: `${s.delay}s`,
                }}
            />
        </div>
    );
}

// ─── Hero icon (center) ────────────────────────────────────────
function HeroIcon() {
    return (
        <div
            className="sc-float sc-f1 absolute -translate-x-1/2 -translate-y-1/2"
            style={{
                left: `${HERO_X}%`,
                top: `${HERO_Y}%`,
                width: "var(--sc-hero)",
                height: "var(--sc-hero)",
                zIndex: 10,
            }}
        >
            <Image
                src={ICONS.compute}
                alt="Compute"
                width={200}
                height={200}
                className="relative object-contain"
                style={{
                    width: "100%",
                    height: "100%",
                    filter:
                        "drop-shadow(0 22px 36px rgba(0,0,0,0.65)) drop-shadow(0 0 14px rgba(0,149,255,0.22))",
                }}
                unoptimized
                priority
            />
        </div>
    );
}


// ─── Connection beams (straight architectural lines) ───────────
function ConnectionBeams() {
    return (
        <svg
            className="pointer-events-none absolute inset-0 h-full w-full"
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            aria-hidden="true"
            style={{ zIndex: 2 }}
        >
            {/* Soft halo glow under each beam */}
            <defs>
                <filter id="sc-beam-glow" x="-20%" y="-20%" width="140%" height="140%">
                    <feGaussianBlur stdDeviation="0.6" />
                </filter>
            </defs>

            {SATELLITES.map((s, i) => {
                const g = beamGeometry(s.x, s.y);
                const beamDelay = (i * 0.9).toFixed(2);
                return (
                    <g key={s.id}>
                        {/* Wide soft halo (very dim) */}
                        <path
                            d={g.line}
                            stroke="rgba(0,149,255,0.10)"
                            strokeWidth={2.4}
                            fill="none"
                            strokeLinecap="round"
                            vectorEffect="non-scaling-stroke"
                            filter="url(#sc-beam-glow)"
                        />
                        {/* Base hairline — slightly brighter so the straight
                            geometry reads as intentional architecture */}
                        <path
                            d={g.line}
                            stroke="rgba(255,255,255,0.18)"
                            strokeWidth={0.5}
                            fill="none"
                            strokeLinecap="round"
                            vectorEffect="non-scaling-stroke"
                        />
                        {/* Perpendicular "plug" tick at the satellite end */}
                        <path
                            d={g.tick}
                            stroke="rgba(255,255,255,0.30)"
                            strokeWidth={0.6}
                            fill="none"
                            strokeLinecap="round"
                            vectorEffect="non-scaling-stroke"
                        />
                        {/* Travelling glow halo (wider, dimmer) */}
                        <path
                            className="sc-beam-halo"
                            d={g.line}
                            stroke={ACCENT}
                            strokeWidth={1.4}
                            fill="none"
                            strokeLinecap="round"
                            pathLength={100}
                            strokeDasharray="14 260"
                            vectorEffect="non-scaling-stroke"
                            opacity={0.45}
                            style={{ animationDelay: `${beamDelay}s` }}
                        />
                        {/* Bright travelling segment */}
                        <path
                            className="sc-beam"
                            d={g.line}
                            stroke="#ffffff"
                            strokeWidth={0.85}
                            fill="none"
                            strokeLinecap="round"
                            pathLength={100}
                            strokeDasharray="6 260"
                            vectorEffect="non-scaling-stroke"
                            style={{ animationDelay: `${beamDelay}s` }}
                        />
                    </g>
                );
            })}
        </svg>
    );
}


// ─── Main constellation ────────────────────────────────────────
export function ServicesConstellation({
    className = "",
}: {
    className?: string;
}) {
    return (
        <div
            className={`relative h-full w-full overflow-hidden ${className}`}
            style={
                {
                    // Responsive sizing — scales by viewport width with sane min/max.
                    // Hero icon: 110px on small mobiles, up to 200px on wide.
                    "--sc-hero": "clamp(110px, 18vw, 200px)",
                    // Satellite icons: 68px → 118px.
                    "--sc-sat": "clamp(68px, 11vw, 118px)",
                } as React.CSSProperties
            }
        >
            <style jsx>{`
                /* ─── Icon float keyframes ─── */
                @keyframes sc-f1 {
                    0%,
                    100% {
                        transform: translate(-50%, -50%) translateY(0) rotate(0deg);
                    }
                    50% {
                        transform: translate(-50%, -50%) translateY(-10px) rotate(0.4deg);
                    }
                }
                @keyframes sc-f2 {
                    0%,
                    100% {
                        transform: translate(-50%, -50%) translate(0, 0);
                    }
                    50% {
                        transform: translate(-50%, -50%) translate(4px, -14px);
                    }
                }
                @keyframes sc-f3 {
                    0%,
                    100% {
                        transform: translate(-50%, -50%) translate(0, 0);
                    }
                    50% {
                        transform: translate(-50%, -50%) translate(-6px, 10px);
                    }
                }
                @keyframes sc-f4 {
                    0%,
                    100% {
                        transform: translate(-50%, -50%) translateY(0);
                    }
                    50% {
                        transform: translate(-50%, -50%) translateY(12px);
                    }
                }

                /* ─── Status LED ─── */
                @keyframes sc-led {
                    0%,
                    100% {
                        opacity: 0.5;
                        transform: scale(0.85);
                    }
                    50% {
                        opacity: 1;
                        transform: scale(1.1);
                    }
                }

                /* ─── Beam travelling along path (hub → satellite) ─── */
                @keyframes sc-beam-flow {
                    0% {
                        stroke-dashoffset: 0;
                    }
                    100% {
                        stroke-dashoffset: -280;
                    }
                }

                /* ─── Big central halo breathe ─── */
                @keyframes sc-halo-breathe {
                    0%,
                    100% {
                        opacity: 0.55;
                        transform: translate(-50%, -50%) scale(1);
                    }
                    50% {
                        opacity: 0.95;
                        transform: translate(-50%, -50%) scale(1.08);
                    }
                }

                /* ─── Bindings ─── */
                .sc-float {
                    will-change: transform;
                    animation-iteration-count: infinite;
                    animation-timing-function: ease-in-out;
                }
                .sc-f1 {
                    animation-name: sc-f1;
                    animation-duration: 7s;
                }
                .sc-f2 {
                    animation-name: sc-f2;
                    animation-duration: 8.5s;
                }
                .sc-f3 {
                    animation-name: sc-f3;
                    animation-duration: 9.5s;
                }
                .sc-f4 {
                    animation-name: sc-f4;
                    animation-duration: 8s;
                }

                .sc-led {
                    animation: sc-led 1.8s ease-in-out infinite;
                }

                .sc-beam,
                .sc-beam-halo {
                    animation: sc-beam-flow 3.6s linear infinite;
                }

                .sc-hero-halo {
                    animation: sc-halo-breathe 6s ease-in-out infinite;
                }
            `}</style>

            {/* Big central halo */}
            <div
                aria-hidden="true"
                className="sc-hero-halo pointer-events-none absolute left-1/2 top-1/2 h-[70%] w-[70%]"
                style={{
                    background:
                        "radial-gradient(circle, rgba(0,149,255,0.20) 0%, rgba(0,149,255,0.06) 40%, transparent 72%)",
                    filter: "blur(30px)",
                }}
            />

            {/* Connection beams */}
            <ConnectionBeams />

            {/* Icons */}
            {SATELLITES.map((s) => (
                <SatelliteIcon key={s.id} s={s} />
            ))}
            <HeroIcon />
        </div>
    );
}

export default ServicesConstellation;
