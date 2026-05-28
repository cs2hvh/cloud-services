"use client";

import Image from "next/image";
import { GitBranch, Hammer } from "lucide-react";
import { IconGlobeFilled } from "@tabler/icons-react";

import { Container } from "@/components/ui/container";

const MONO = "font-[var(--font-geist-mono),ui-monospace,monospace]";

type Step = {
    icon: React.ReactNode;
    accent: string;
    label: string;
    title: string;
    description: string;
    line: string;
};

const STEPS: Step[] = [
    {
        icon: <GitBranch className="h-[18px] w-[18px]" strokeWidth={1.7} />,
        accent: "#0095FF",
        label: "01",
        title: "Connect a repository",
        description:
            "Authorize GitHub, GitLab, or Bitbucket and select the branch to track. Pushes are detected automatically; pull requests receive isolated preview environments.",
        line: "$ git push origin main",
    },
    {
        icon: <Hammer className="h-[18px] w-[18px]" strokeWidth={1.7} />,
        accent: "#F59E0B",
        label: "02",
        title: "Managed build pipeline",
        description:
            "Runtime is detected from the repository manifest. Builds run on layer-cached infrastructure using buildpacks or your Dockerfile — no configuration required.",
        line: "→ build · next.js detected · cache hit 87%",
    },
    {
        icon: <IconGlobeFilled size={18} />,
        accent: "#10B981",
        label: "03",
        title: "Released to the edge",
        description:
            "Zero-downtime rollout to twelve regions with TLS, HTTP/3, and IPv6 enabled by default. Each release is immutable and reversible in a single action.",
        line: "✓ released · 12 regions · 19s",
    },
];

export default function AppDeployHowSection() {
    return (
        <section className="relative overflow-hidden bg-[#0D0D0F] py-20 sm:py-24 lg:py-28">
            {/* Top hairline */}
            <div
                aria-hidden="true"
                className="absolute top-0 left-1/2 h-px w-[60%] -translate-x-1/2 bg-gradient-to-r from-transparent via-white/10 to-transparent"
            />

            <Container className="relative z-10">
                {/* Header */}
                <div className="mx-auto max-w-[760px] text-center">
                    <p
                        className={`${MONO} mb-5 inline-flex items-center gap-2 text-[10.5px] font-semibold uppercase tracking-[0.24em] text-white/50`}
                    >
                        <span className="h-1.5 w-1.5 rounded-full bg-[#0095FF]" />
                        How it works
                    </p>
                    <h2 className="text-3xl font-semibold leading-[1.05] tracking-[-0.02em] text-white sm:text-4xl lg:text-[46px]">
                        From repository to production in three steps.
                    </h2>
                    <p className="mx-auto mt-5 max-w-[620px] text-[15px] leading-[1.6] text-white/60 sm:text-[16.5px]">
                        Connect a repository, push to the tracked branch, and a build
                        is released to the edge. Build infrastructure, certificates, and
                        DNS are fully managed.
                    </p>
                </div>

                {/* Two-column: visual + steps */}
                <div className="mt-14 grid gap-10 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)] lg:gap-14">
                    {/* Visual */}
                    <div className="relative">
                        <div className="relative overflow-hidden rounded-[10px] border border-white/[0.08] bg-[#0A0B0D]">
                            <div
                                className="pointer-events-none absolute inset-0 opacity-[0.04]"
                                style={{
                                    backgroundImage:
                                        "radial-gradient(circle, #fff 1px, transparent 1px)",
                                    backgroundSize: "26px 26px",
                                }}
                            />
                            <Image
                                src="/app/shelf aniamtion.png"
                                alt="Deployment workflow"
                                width={760}
                                height={760}
                                priority
                                className="relative h-auto w-full"
                            />
                        </div>

                        {/* Caption strip */}
                        <div className="mt-3 grid grid-cols-3 gap-px overflow-hidden rounded-[6px] border border-white/[0.08] bg-white/[0.08]">
                            {[
                                { v: "<60s", l: "Median build" },
                                { v: "12", l: "Edge regions" },
                                { v: "99.99%", l: "Release SLA" },
                            ].map((s) => (
                                <div
                                    key={s.l}
                                    className="flex flex-col items-center gap-1.5 bg-[#0D0D0F] px-3 py-4"
                                >
                                    <span
                                        className={`${MONO} text-[16px] font-bold leading-none tabular-nums text-white`}
                                    >
                                        {s.v}
                                    </span>
                                    <span
                                        className={`${MONO} text-[9.5px] font-semibold uppercase tracking-[0.16em] text-white/45`}
                                    >
                                        {s.l}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Steps */}
                    <ol className="relative flex flex-col">
                        {STEPS.map((step, i) => {
                            const isLast = i === STEPS.length - 1;
                            return (
                                <li
                                    key={step.label}
                                    className="relative flex gap-5 pb-7 last:pb-0"
                                >
                                    {/* Vertical connector */}
                                    {!isLast && (
                                        <span
                                            aria-hidden="true"
                                            className="absolute left-[19px] top-11 bottom-0 w-px bg-gradient-to-b from-white/15 via-white/8 to-transparent"
                                        />
                                    )}

                                    {/* Icon tile */}
                                    <div
                                        className="relative z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-[6px] border"
                                        style={{ background: `${step.accent}18`, borderColor: `${step.accent}40`, color: step.accent }}
                                    >
                                        {step.icon}
                                        <span
                                            className="absolute -right-0.5 -top-0.5 h-1.5 w-1.5 rounded-full"
                                            style={{ background: step.accent }}
                                        />
                                    </div>

                                    {/* Content */}
                                    <div className="min-w-0 flex-1">
                                        <div className="flex items-baseline gap-3">
                                            <span
                                                className={`${MONO} text-[10.5px] tabular-nums text-white/35`}
                                            >
                                                {step.label}
                                            </span>
                                            <h3 className="text-[18px] font-semibold leading-tight tracking-[-0.01em] text-white">
                                                {step.title}
                                            </h3>
                                        </div>
                                        <p className="mt-2 text-[13.5px] leading-[1.65] text-white/65">
                                            {step.description}
                                        </p>
                                        <pre
                                            className={`${MONO} mt-3 overflow-hidden rounded-[5px] border border-white/[0.06] bg-white/[0.02] px-3 py-2 text-[11.5px] text-white/55`}
                                        >
                                            {step.line}
                                        </pre>
                                    </div>
                                </li>
                            );
                        })}
                    </ol>
                </div>
            </Container>
        </section>
    );
}
