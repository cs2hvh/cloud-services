"use client";

// ServicesConstellation — central Compute hub with 4 service satellites.
// Connections rendered as gently curved energy beams (SVG bezier paths)
// with a bright accent segment travelling from the hub out to each
// satellite — represents the hub dispatching work into the mesh.
//
// Per-satellite status LEDs + breathing radar ripples from the hub
// complete the "live infrastructure" picture.

import Image from "next/image";

const ICONS = {
    compute: "/dashboard-services-icons/da%20compute.png",
    kubernetes: "/dashboard-services-icons/da%20kuubernetes.png",
    database: "/dashboard-services-icons/da%20database.png",
    apps: "/dashboard-services-icons/da%20application%20deployment.png",
    storage: "/dashboard-services-icons/da%20object%20storage.png",
    ddos: "/dashboard-services-icons/da%20ddos%20preotection.png",
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

// Compose a subtly curved quadratic bezier from the hub to a satellite.
// The control point sits on the CCW-perpendicular of the straight line,
// so all beams bow consistently — gives the mesh a "rotational" feel
// rather than a flat star.
function curvedPath(sx: number, sy: number): string {
    const cx = (HERO_X + sx) / 2;
    const cy = (HERO_Y + sy) / 2;
    const dx = sx - HERO_X;
    const dy = sy - HERO_Y;
    // CCW perpendicular: (-dy, dx)
    const offset = 0.16;
    const px = -dy * offset;
    const py = dx * offset;
    return `M ${HERO_X} ${HERO_Y} Q ${(cx + px).toFixed(2)} ${(cy + py).toFixed(2)} ${sx} ${sy}`;
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


// ─── Connection beams (curved energy paths) ────────────────────
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
                const path = curvedPath(s.x, s.y);
                const beamDelay = (i * 0.9).toFixed(2);
                return (
                    <g key={s.id}>
                        {/* Wide soft halo (very dim) */}
                        <path
                            d={path}
                            stroke="rgba(0,149,255,0.06)"
                            strokeWidth={2.5}
                            fill="none"
                            strokeLinecap="round"
                            vectorEffect="non-scaling-stroke"
                            filter="url(#sc-beam-glow)"
                        />
                        {/* Base hairline */}
                        <path
                            d={path}
                            stroke="rgba(255,255,255,0.10)"
                            strokeWidth={0.4}
                            fill="none"
                            strokeLinecap="round"
                            vectorEffect="non-scaling-stroke"
                        />
                        {/* Travelling glow halo (wider, dimmer) */}
                        <path
                            className="sc-beam-halo"
                            d={path}
                            stroke={ACCENT}
                            strokeWidth={1.2}
                            fill="none"
                            strokeLinecap="round"
                            pathLength={100}
                            strokeDasharray="14 260"
                            vectorEffect="non-scaling-stroke"
                            opacity={0.35}
                            style={{ animationDelay: `${beamDelay}s` }}
                        />
                        {/* Bright travelling segment */}
                        <path
                            className="sc-beam"
                            d={path}
                            stroke="#ffffff"
                            strokeWidth={0.7}
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
