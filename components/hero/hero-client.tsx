"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import {
    ArrowRight,
    Bot,
    Boxes,
    Cpu,
    Database,
    HardDrive,
    Network,
    Rocket,
    Server,
    ShieldCheck,
    type LucideIcon,
} from "lucide-react";

import { AuthAwareServiceCta } from "@/components/services/auth-aware-service-cta";

const BRAND = "#0095FF";

type ServiceRow = {
    icon: LucideIcon;
    name: string;
    tagline: string;
    href: string;
};

const SERVICES: ServiceRow[] = [
    {
        icon: Cpu,
        name: "GPU Cloud",
        tagline: "H100 / H200 / B200",
        href: "/services/gpu",
    },
    {
        icon: Server,
        name: "Compute",
        tagline: "VMs and bare metal",
        href: "/services/compute",
    },
    {
        icon: Network,
        name: "Kubernetes",
        tagline: "Managed clusters",
        href: "/services/kubernetes",
    },
    {
        icon: Database,
        name: "Databases",
        tagline: "Postgres / MySQL / Redis",
        href: "/services/database",
    },
    {
        icon: HardDrive,
        name: "Storage",
        tagline: "S3-compatible object store",
        href: "/services/object-storage",
    },
    {
        icon: Rocket,
        name: "Apps",
        tagline: "Git and Docker deploys",
        href: "/services/app-deployment",
    },
    {
        icon: Bot,
        name: "AI Agents",
        tagline: "Serverless automation",
        href: "/services/ai-agents",
    },
];

const CAPABILITIES = [
    { icon: ShieldCheck, label: "Private networking" },
    { icon: Boxes, label: "Unified billing" },
    { icon: Network, label: "Automated deployments" },
];

function InfrastructureCanvas() {
    const canvasRef = useRef<HTMLCanvasElement | null>(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const context = canvas.getContext("2d");
        if (!context) return;

        const reduceMotion = window.matchMedia(
            "(prefers-reduced-motion: reduce)"
        ).matches;

        let animationFrame = 0;
        let width = 0;
        let height = 0;
        let pixelRatio = 1;
        let visible = true;
        const start = performance.now();

        type Point3D = { x: number; y: number; z: number };
        const points: Point3D[] = [];
        const edges: Array<[number, number]> = [];
        const grid = 5;

        for (let z = 0; z < grid; z += 1) {
            for (let y = 0; y < grid; y += 1) {
                for (let x = 0; x < grid; x += 1) {
                    points.push({
                        x: (x / (grid - 1) - 0.5) * 2,
                        y: (y / (grid - 1) - 0.5) * 2,
                        z: (z / (grid - 1) - 0.5) * 2,
                    });
                }
            }
        }

        const index = (x: number, y: number, z: number) =>
            z * grid * grid + y * grid + x;

        for (let z = 0; z < grid; z += 1) {
            for (let y = 0; y < grid; y += 1) {
                for (let x = 0; x < grid; x += 1) {
                    if (x < grid - 1) edges.push([index(x, y, z), index(x + 1, y, z)]);
                    if (y < grid - 1) edges.push([index(x, y, z), index(x, y + 1, z)]);
                    if (z < grid - 1) edges.push([index(x, y, z), index(x, y, z + 1)]);
                }
            }
        }

        const resize = () => {
            const rect = canvas.getBoundingClientRect();
            width = Math.max(1, rect.width);
            height = Math.max(1, rect.height);
            pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
            canvas.width = Math.round(width * pixelRatio);
            canvas.height = Math.round(height * pixelRatio);
            context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
        };

        const project = (point: Point3D, time: number) => {
            const rotationY = reduceMotion ? -0.44 : time * 0.00008 - 0.52;
            const rotationX = reduceMotion ? 0.28 : Math.sin(time * 0.00022) * 0.08 + 0.28;
            const contentWidth = Math.min(width, 1440);
            const contentLeft = (width - contentWidth) / 2;
            const cubeCenterX =
                width < 720 ? width * 0.7 : contentLeft + contentWidth * 0.73;
            const cubeCenterY = height * (width < 720 ? 0.63 : 0.5);

            const cosY = Math.cos(rotationY);
            const sinY = Math.sin(rotationY);
            const cosX = Math.cos(rotationX);
            const sinX = Math.sin(rotationX);

            const x1 = point.x * cosY - point.z * sinY;
            const z1 = point.x * sinY + point.z * cosY;
            const y1 = point.y * cosX - z1 * sinX;
            const z2 = point.y * sinX + z1 * cosX;

            const depth = 3.1 + z2;
            const scaleBase =
                width < 720
                    ? Math.min(width, height) * 0.4
                    : Math.min(width, height) * 0.43;
            const scale = scaleBase / depth;
            return {
                x: cubeCenterX + x1 * scale,
                y: cubeCenterY + y1 * scale,
                z: z2,
                scale,
            };
        };

        const drawGridBackground = () => {
            context.save();
            context.globalAlpha = 0.18;
            context.strokeStyle = "rgba(255,255,255,0.04)";
            context.lineWidth = 1;
            const cell = width < 720 ? 44 : 64;
            for (let x = width * 0.34; x < width; x += cell) {
                context.beginPath();
                context.moveTo(x, 0);
                context.lineTo(x, height);
                context.stroke();
            }
            for (let y = 0; y < height; y += cell) {
                context.beginPath();
                context.moveTo(width * 0.34, y);
                context.lineTo(width, y);
                context.stroke();
            }
            context.restore();
        };

        const draw = (now: number) => {
            const elapsed = reduceMotion ? 0 : Math.max(0, now - start);
            context.clearRect(0, 0, width, height);

            const bg = context.createLinearGradient(0, 0, width, height);
            bg.addColorStop(0, "#020406");
            bg.addColorStop(0.52, "#04101a");
            bg.addColorStop(1, "#020406");
            context.fillStyle = bg;
            context.fillRect(0, 0, width, height);

            drawGridBackground();

            const glow = context.createRadialGradient(
                width < 720 ? width * 0.7 : (width - Math.min(width, 1440)) / 2 + Math.min(width, 1440) * 0.73,
                height * (width < 720 ? 0.62 : 0.5),
                0,
                width < 720 ? width * 0.7 : (width - Math.min(width, 1440)) / 2 + Math.min(width, 1440) * 0.73,
                height * (width < 720 ? 0.62 : 0.5),
                Math.min(width, height) * 0.66
            );
            glow.addColorStop(0, "rgba(0,149,255,0.43)");
            glow.addColorStop(0.42, "rgba(0,149,255,0.16)");
            glow.addColorStop(1, "rgba(0,0,0,0)");
            context.fillStyle = glow;
            context.fillRect(0, 0, width, height);

            const projected = points.map((point) => project(point, elapsed));

            context.save();
            context.lineWidth = width < 720 ? 1.15 : 1.45;
            context.shadowBlur = width < 720 ? 2 : 4;
            context.shadowColor = "rgba(0,149,255,0.26)";
            for (const [a, b] of edges) {
                const pa = projected[a];
                const pb = projected[b];
                const opacity = 0.28 + (pa.z + pb.z + 2.3) * 0.08;
                context.strokeStyle = `rgba(96, 210, 255, ${Math.max(
                    0.22,
                    Math.min(0.72, opacity)
                )})`;
                context.beginPath();
                context.moveTo(pa.x, pa.y);
                context.lineTo(pb.x, pb.y);
                context.stroke();
            }
            context.restore();

            const scan = (elapsed * 0.00018) % 1;
            const planeZ = -1 + scan * 2;
            context.save();
            context.strokeStyle = "rgba(0,149,255,0.92)";
            context.fillStyle = "rgba(0,149,255,0.1)";
            context.lineWidth = width < 720 ? 1.4 : 1.8;
            context.shadowBlur = width < 720 ? 5 : 9;
            context.shadowColor = "rgba(0,149,255,0.36)";
            const plane = [
                project({ x: -1.04, y: -1.04, z: planeZ }, elapsed),
                project({ x: 1.04, y: -1.04, z: planeZ }, elapsed),
                project({ x: 1.04, y: 1.04, z: planeZ }, elapsed),
                project({ x: -1.04, y: 1.04, z: planeZ }, elapsed),
            ];
            context.beginPath();
            context.moveTo(plane[0].x, plane[0].y);
            for (const p of plane.slice(1)) context.lineTo(p.x, p.y);
            context.closePath();
            context.fill();
            context.stroke();
            context.restore();

            context.save();
            context.shadowColor = "rgba(100, 214, 255, 0.45)";
            for (let i = 0; i < projected.length; i += 1) {
                const p = projected[i];
                const hot = i % 17 === 0 || i % 29 === 0;
                context.shadowBlur = hot ? 8 : 4;
                context.fillStyle = hot
                    ? "rgba(255,198,71,0.98)"
                    : "rgba(221,249,255,0.95)";
                context.beginPath();
                context.arc(p.x, p.y, hot ? 3 : 2.05, 0, Math.PI * 2);
                context.fill();
            }
            context.restore();

            const pulses = 9;
            context.save();
            context.shadowBlur = 9;
            context.shadowColor = "rgba(0,149,255,0.52)";
            for (let i = 0; i < pulses; i += 1) {
                const edge =
                    edges[
                        (i * 23 + Math.floor(elapsed * 0.00016)) %
                            edges.length
                    ];
                if (!edge) continue;
                const a = projected[edge[0]];
                const b = projected[edge[1]];
                const t = (elapsed * 0.00028 + i * 0.137) % 1;
                const x = a.x + (b.x - a.x) * t;
                const y = a.y + (b.y - a.y) * t;
                context.fillStyle = i % 3 === 0 ? "rgba(52,255,179,0.95)" : "rgba(0,149,255,0.98)";
                context.beginPath();
                context.arc(x, y, width < 720 ? 2.6 : 3.15, 0, Math.PI * 2);
                context.fill();
            }
            context.restore();

            if (!reduceMotion && visible) {
                animationFrame = requestAnimationFrame(draw);
            }
        };

        resize();
        const hydrationResize = window.setTimeout(resize, 250);
        window.addEventListener("resize", resize, { passive: true });
        const resizeObserver = new ResizeObserver(resize);
        resizeObserver.observe(canvas);
        const intersectionObserver = new IntersectionObserver(([entry]) => {
            visible = entry?.isIntersecting ?? true;
            if (visible && !reduceMotion) {
                cancelAnimationFrame(animationFrame);
                animationFrame = requestAnimationFrame(draw);
            }
        });
        intersectionObserver.observe(canvas);
        animationFrame = requestAnimationFrame((timestamp) => {
            resize();
            draw(timestamp);
        });

        return () => {
            window.removeEventListener("resize", resize);
            window.clearTimeout(hydrationResize);
            resizeObserver.disconnect();
            intersectionObserver.disconnect();
            cancelAnimationFrame(animationFrame);
        };
    }, []);

    return (
        <canvas
            ref={canvasRef}
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 z-0 h-full w-full"
        />
    );
}

function Capabilities() {
    return (
        <div className="mt-6 grid max-w-[640px] grid-cols-1 gap-2 text-xs text-white/62 sm:grid-cols-3">
            {CAPABILITIES.map((capability) => {
                const Icon = capability.icon;
                return (
                    <div
                        key={capability.label}
                        className="flex items-center gap-2"
                    >
                        <Icon
                            className="h-4 w-4 text-[#6fd0ff]"
                            aria-hidden="true"
                        />
                        {capability.label}
                    </div>
                );
            })}
        </div>
    );
}

function ServiceRail() {
    return (
        <div className="relative z-20 h-[88px] border-y border-white/10 bg-[#020407] shadow-[0_-28px_80px_-52px_rgba(0,149,255,0.55)] lg:h-[100px]">
            <div className="mx-auto flex h-full max-w-[1440px] overflow-x-auto">
                <div className="hidden w-[190px] shrink-0 flex-col justify-center border-r border-white/10 px-8 lg:flex">
                    <p className="text-[10px] font-semibold uppercase text-white/36">
                        Platform
                    </p>
                    <p className="mt-1.5 text-sm font-semibold text-white">
                        Services
                    </p>
                </div>

                <div className="flex min-w-max flex-1 lg:grid lg:min-w-0 lg:grid-cols-7">
                    {SERVICES.map((service, index) => {
                        const Icon = service.icon;
                        return (
                            <Link
                                key={service.name}
                                href={service.href}
                                className="group relative flex h-[88px] w-[174px] flex-col justify-between border-r border-white/10 px-4 py-3 transition-colors hover:bg-white/[0.045] lg:h-[100px] lg:w-auto"
                            >
                                <span
                                    aria-hidden="true"
                                    className="absolute inset-x-0 top-0 h-[2px] bg-[#0095FF] opacity-0 transition-opacity group-hover:opacity-100"
                                />
                                <div className="flex items-center justify-between gap-3">
                                    <Icon
                                        className="h-4 w-4 text-white/45 transition-colors group-hover:text-[#0095FF]"
                                        aria-hidden="true"
                                    />
                                    <span className="font-mono text-[10px] text-white/28">
                                        {String(index + 1).padStart(2, "0")}
                                    </span>
                                </div>
                                <div>
                                    <p className="text-sm font-semibold text-white">
                                        {service.name}
                                    </p>
                                    <p className="mt-1 truncate text-[11px] text-white/42">
                                        {service.tagline}
                                    </p>
                                </div>
                            </Link>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}

export default function HeroClient() {
    return (
        <section
            className="relative isolate h-[100svh] min-h-[700px] w-full overflow-hidden bg-[#020406] text-white lg:min-h-[740px]"
            aria-label="Ahura Cloud AI infrastructure"
        >
            <InfrastructureCanvas />

            <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 z-[1] bg-[linear-gradient(90deg,#020406_0%,#020406_28%,rgba(2,4,6,0.86)_43%,rgba(2,4,6,0.12)_66%,rgba(2,4,6,0.46)_90%,#020406_100%)]"
            />
            <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 z-[1] bg-[linear-gradient(0deg,#020406_0%,rgba(2,4,6,0.2)_24%,rgba(2,4,6,0.02)_76%,#020406_100%)]"
            />

            <div className="relative z-10 mx-auto flex h-[calc(100svh-88px)] min-h-[612px] w-full max-w-[1440px] flex-col px-5 sm:px-8 lg:h-[calc(100svh-100px)] lg:min-h-[640px]">
                <div className="grid flex-1 items-center gap-10 pb-10 pt-20 sm:pt-24 lg:grid-cols-[minmax(0,650px)_minmax(520px,1fr)] lg:gap-14 lg:pb-12 lg:pt-24">
                    <div className="max-w-[660px]">
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[10px] font-semibold uppercase text-white/56 sm:text-[11px]">
                            <span className="flex items-center gap-2">
                                <span
                                    className="h-1.5 w-1.5"
                                    style={{ backgroundColor: BRAND }}
                                />
                                AI infrastructure
                            </span>
                            <span className="hidden h-3 w-px bg-white/20 sm:block" />
                            <span>GPU cloud</span>
                            <span>compute</span>
                            <span>Kubernetes</span>
                        </div>

                        <h1 className="mt-5 max-w-[660px] text-[44px] font-semibold leading-[0.94] text-white sm:text-7xl lg:text-[88px]">
                            Ahura Cloud
                        </h1>

                        <p className="mt-5 max-w-[590px] text-[15px] leading-7 text-white/70 sm:text-base lg:text-lg lg:leading-8">
                            GPU capacity, compute, Kubernetes, storage,
                            databases, apps, and AI agents managed from one
                            production control plane.
                        </p>

                        <div className="mt-7 flex flex-wrap items-center gap-3">
                            <AuthAwareServiceCta
                                service="main"
                                intent="main"
                                className="group inline-flex h-12 items-center justify-center gap-2 rounded-none border border-[#0095FF] bg-[#0095FF] px-6 text-sm font-semibold text-white shadow-[0_18px_46px_-18px_rgba(0,149,255,0.8)] transition-colors hover:bg-[#0aa0ff]"
                            >
                                Launch console
                                <ArrowRight
                                    className="h-4 w-4 transition-transform group-hover:translate-x-0.5"
                                    aria-hidden="true"
                                />
                            </AuthAwareServiceCta>
                            <Link
                                href="/services/gpu"
                                className="group inline-flex h-12 items-center justify-center gap-2 rounded-none border border-white/16 bg-white/[0.045] px-5 text-sm font-semibold text-white/84 backdrop-blur transition-colors hover:border-white/30 hover:bg-white/[0.085] hover:text-white"
                            >
                                Explore GPUs
                                <ArrowRight
                                    className="h-4 w-4 transition-transform group-hover:translate-x-0.5"
                                    aria-hidden="true"
                                />
                            </Link>
                        </div>

                        <Capabilities />
                    </div>

                    <div className="hidden h-full min-h-[420px] lg:block" />
                </div>
            </div>

            <ServiceRail />
        </section>
    );
}
