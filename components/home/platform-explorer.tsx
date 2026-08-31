"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";

/**
 * PlatformExplorer — "Everything you need to build and scale".
 *
 * A two-level browser rather than a grid: the chip row picks a service, the
 * left column lists that service's topics, the right panel shows the selected
 * one. Seven services × three topics is twenty-one panels of detail reachable
 * without leaving the page, which is what the old seven-tab section and the
 * later mosaic both failed to do — one hid six services behind a click, the
 * other showed all seven but could only afford a sentence each.
 *
 * The reference for this layout is a light design; every surface is inverted
 * here. The selected row is cream-on-dark where the reference is black-on-white
 * — same contrast move, opposite ground.
 */

type Topic = {
    label: string;
    title: string;
    desc: string;
    tags?: string[];
};

type Service = {
    key: string;
    chip: string;
    href: string;
    cta: string;
    /** Optimised from the existing library — see public/images/home/. */
    img: string;
    topics: Topic[];
};

/* Copy is drawn from the existing service bullets — nothing invented. */
const SERVICES: Service[] = [
    {
        key: "gpu",
        chip: "GPU Pods",
        href: "/services/gpu",
        cta: "Explore GPU Pods",
        img: "/images/home/svc-gpu.png",
        topics: [
            {
                label: "GPU Pods",
                title: "GPU Pods",
                desc: "H100, H200 and B200 accelerators on demand. Reserve a single GPU or a multi-node cluster, provisioned in under 90 seconds and billed by the second, with persistent volumes that follow your workload between sessions.",
                tags: ["H100", "H200", "B200", "B300"],
            },
            {
                label: "Provisioning",
                title: "Live in under 90 seconds",
                desc: "Pods come up in well under two minutes and stop billing the moment they go idle. Direct SSH, region-pinned snapshots, and network volumes that survive the pod they were attached to.",
                tags: ["Per-second billing", "Direct SSH", "Snapshots"],
            },
            {
                label: "GPU Infrastructure",
                title: "Single GPU to NVLink cluster",
                desc: "Scale from one card to eight SXM GPUs on an NVLink fabric, or reserve committed multi-node capacity at up to 60% below on-demand.",
                tags: ["8× SXM", "NVLink 5.0", "Reserved capacity"],
            },
        ],
    },
    {
        key: "ai",
        chip: "A.I. Labs",
        href: "/services/ai",
        cta: "Explore A.I. Labs",
        img: "/images/home/svc-ai.png",
        topics: [
            {
                label: "Inference",
                title: "50+ models, one API key",
                desc: "OpenAI- and Anthropic-compatible inference across frontier and open-source models. Streaming, tool calling, structured outputs and batches, billed per token with no markup on the upstream rate.",
                tags: ["OpenAI-compatible", "BYOK", "Zero markup"],
            },
            {
                label: "Fine-tuning",
                title: "Train on your own data",
                desc: "LoRA fine-tuning on Llama, DeepSeek, Qwen, Mistral and Phi, then serve the result from the same control plane on dedicated single-tenant GPUs.",
                tags: ["LoRA", "Llama", "DeepSeek", "Qwen"],
            },
            {
                label: "Embeddings & Vector",
                title: "Retrieval that stays in region",
                desc: "Hosted embeddings and managed pgvector collections, so the index and the documents behind it never leave the jurisdiction you chose.",
                tags: ["pgvector", "Hosted embeddings"],
            },
        ],
    },
    {
        key: "compute",
        chip: "Compute",
        href: "/services/compute",
        cta: "Explore Compute",
        img: "/images/home/svc-compute.png",
        topics: [
            {
                label: "Shared",
                title: "General purpose",
                desc: "Balanced CPU and memory on shared hosts with sub-minute provisioning. The right starting point for staging, internal tools and bursty workloads.",
                tags: ["1 – 128 vCPU", "From $4/mo"],
            },
            {
                label: "Dedicated",
                title: "Compute optimized",
                desc: "Pinned CPU cores for consistent latency under production traffic, with up to 50 Gbps of network throughput.",
                tags: ["Pinned cores", "Up to 50 Gbps"],
            },
            {
                label: "Bare metal",
                title: "The whole machine",
                desc: "A full physical server with no hypervisor. Run your own kernel for HPC or for regulated workloads that cannot share silicon.",
                tags: ["32 – 192 cores", "100 Gbps redundant"],
            },
        ],
    },
    {
        key: "database",
        chip: "Database",
        href: "/services/database",
        cta: "Explore Database",
        img: "/images/home/svc-database.png",
        topics: [
            {
                label: "Engines",
                title: "Postgres, MySQL and Redis",
                desc: "Production-ready managed clusters in minutes, with the version allowlist tracking upstream releases rather than lagging them.",
                tags: ["PostgreSQL", "MySQL", "Redis"],
            },
            {
                label: "Backups",
                title: "Recovery you can rehearse",
                desc: "Automated daily backups with 30-day retention and point-in-time recovery, so a bad migration is an inconvenience rather than an incident.",
                tags: ["30-day retention", "PITR"],
            },
            {
                label: "Availability",
                title: "Failover without downtime",
                desc: "Zero-downtime failover and rolling upgrades, with fine-grained access controls and audit logging on every connection.",
                tags: ["Read replicas", "Audit logging"],
            },
        ],
    },
    {
        key: "kubernetes",
        chip: "Kubernetes",
        href: "/services/kubernetes",
        cta: "Explore Kubernetes",
        img: "/images/home/svc-kubernetes.png",
        topics: [
            {
                label: "Control plane",
                title: "Conformant, and operated for you",
                desc: "A managed control plane you do not patch, upgrade or page for, running conformant Kubernetes with your own kubeconfig.",
                tags: ["Managed control plane", "kubeconfig"],
            },
            {
                label: "Node pools",
                title: "Nodes you size",
                desc: "Autoscaling node pools across CPU and GPU shapes, so a training job and a web tier can share one cluster without sharing a machine.",
                tags: ["Autoscaling", "GPU node pools"],
            },
            {
                label: "Networking",
                title: "Private by default",
                desc: "Clusters sit inside a private VPC with built-in load balancing and managed ingress, and custom domains terminate TLS for you.",
                tags: ["Private VPC", "Load balancing"],
            },
        ],
    },
    {
        key: "storage",
        chip: "Object Storage",
        href: "/services/object-storage",
        cta: "Explore Object Storage",
        img: "/images/home/svc-storage.png",
        topics: [
            {
                label: "S3 API",
                title: "Buckets that speak plain S3",
                desc: "A compatible API surface, so the SDK, CLI and tooling you already use keep working, with no client rewrite to move a workload in region.",
                tags: ["S3-compatible", "Existing SDKs"],
            },
            {
                label: "Versioning",
                title: "Immutability and lifecycle",
                desc: "Object versioning with lifecycle policies, so retention is a bucket setting rather than a cron job somebody has to remember.",
                tags: ["Versioning", "Lifecycle rules"],
            },
            {
                label: "Access",
                title: "Share without exposing",
                desc: "Signed URLs with expiry, plus fine-grained keys scoped per bucket, so a public download link is never a public bucket.",
                tags: ["Signed URLs", "Scoped keys"],
            },
        ],
    },
    {
        key: "apps",
        chip: "App Deploy",
        href: "/services/app-deployment",
        cta: "Explore App Deploy",
        img: "/images/home/svc-apps.png",
        topics: [
            {
                label: "Builds",
                title: "Git push, and it ships",
                desc: "Connect GitHub, GitLab or Bitbucket and every push builds and deploys straight into the cluster, with the framework detected for you.",
                tags: ["GitHub", "GitLab", "Bitbucket"],
            },
            {
                label: "Runtime",
                title: "Logs, metrics and rollbacks",
                desc: "Streaming build and runtime logs, with a one-click rollback to any previous deploy when a release does not behave.",
                tags: ["Build logs", "Rollbacks"],
            },
            {
                label: "Domains & TLS",
                title: "Custom domains, certificates handled",
                desc: "Point a domain, and DNS and certificate issuance are managed from the same dashboard as the rest of your infrastructure.",
                tags: ["Custom domains", "Managed TLS"],
            },
        ],
    },
];

function ArrowUpRight({ size = 14 }: { size?: number }) {
    return (
        <svg viewBox="0 0 14 14" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
            <path d="M3.5 10.5 10.5 3.5M5 3.5h5.5V9" />
        </svg>
    );
}

export function PlatformExplorer() {
    const [serviceKey, setServiceKey] = useState(SERVICES[0].key);
    const [topicIndex, setTopicIndex] = useState(0);

    const service = SERVICES.find((s) => s.key === serviceKey) ?? SERVICES[0];
    const topic = service.topics[topicIndex] ?? service.topics[0];

    function pickService(key: string) {
        setServiceKey(key);
        setTopicIndex(0);
    }

    /*
      Autoplay: the topic list walks itself so the section reads as alive
      rather than as a control panel waiting to be poked.

      The timer IS the progress bar. Rather than run a setInterval alongside a
      CSS animation — two clocks that drift apart the moment either one is
      paused — the bar's `animationend` is what advances the topic. One clock,
      so the fill always lands exactly as the row changes, and pausing the
      animation pauses the advance for free.

      Consequences that fall out of that choice, all of them wanted:
      - `prefers-reduced-motion` kills the animation in CSS, so `animationend`
        never fires and autoplay is simply off. Auto-advancing content is what
        WCAG 2.2.2 is about, so that is the correct behaviour, not a gap.
      - Hover, focus and off-screen just set `paused`, which maps to
        `animation-play-state` — the fill freezes mid-track and resumes from
        where it stopped instead of snapping back.
    */
    const [hovered, setHovered] = useState(false);
    const [focused, setFocused] = useState(false);
    const [onScreen, setOnScreen] = useState(false);
    const explorerRef = useRef<HTMLDivElement | null>(null);
    const paused = hovered || focused || !onScreen;

    // Don't burn a loop on a section nobody has scrolled to — and, more to the
    // point, don't let it arrive already three topics deep.
    useEffect(() => {
        const el = explorerRef.current;
        if (!el || typeof IntersectionObserver === "undefined") {
            setOnScreen(true);
            return;
        }
        const io = new IntersectionObserver(
            ([entry]) => setOnScreen(entry.isIntersecting),
            { threshold: 0.35 },
        );
        io.observe(el);
        return () => io.disconnect();
    }, []);

    const advance = useCallback(() => {
        setTopicIndex((i) => (i + 1) % service.topics.length);
    }, [service.topics.length]);

    return (
        <section
            className="px-6 py-16 sm:px-10 lg:px-12 lg:py-24"
            style={{ background: "var(--ah-bg-2)", borderTop: "1px solid var(--ah-line)" }}
            aria-labelledby="platform-heading"
        >
            <div className="mx-auto max-w-[1704px]">
                {/* ── masthead ── */}
                <div className="max-w-[52rem]">

                    <h2
                        id="platform-heading"
                        className="ah-rise ah-h2"
                    >
                        Everything you need to
                        <br />
                        <span className="ah-h2-hl">build and scale.</span>
                    </h2>
                </div>

                {/* ── service switcher — sits directly under the heading ── */}
                <div className="mt-10 flex flex-wrap gap-2.5">
                    {SERVICES.map((s) => (
                        <button
                            key={s.key}
                            type="button"
                            onClick={() => pickService(s.key)}
                            aria-pressed={s.key === serviceKey}
                            className={`ah-chip ah-notch-sm px-4 py-2.5 text-[13px] font-medium ${
                                s.key === serviceKey ? "ah-chip-on" : ""
                            }`}
                        >
                            {s.chip}
                        </button>
                    ))}
                </div>

                {/* ── explorer ── */}
                <div
                    ref={explorerRef}
                    className="mt-12 grid lg:grid-cols-[minmax(0,0.82fr)_minmax(0,1fr)]"
                    style={{ borderTop: "1px solid var(--ah-line-hi)" }}
                    onMouseEnter={() => setHovered(true)}
                    onMouseLeave={() => setHovered(false)}
                    onFocusCapture={() => setFocused(true)}
                    onBlurCapture={() => setFocused(false)}
                >
                    {/* topics */}
                    <div style={{ borderRight: "1px solid var(--ah-line)" }}>
                        {service.topics.map((t, i) => {
                            const active = i === topicIndex;
                            return (
                                <button
                                    key={t.label}
                                    type="button"
                                    onClick={() => setTopicIndex(i)}
                                    aria-current={active ? "true" : undefined}
                                    className={`ah-topic ${active ? "ah-topic-on ah-notch-sm" : ""} flex w-full items-center gap-5 px-6 py-6 text-left lg:px-8 lg:py-7`}
                                    style={{ borderBottom: active ? "none" : "1px solid var(--ah-line)" }}
                                >
                                    <span className="ah-lbl shrink-0" style={{ fontSize: "10px" }}>
                                        {String(i + 1).padStart(2, "0")}
                                    </span>
                                    <span className="flex-1 text-[17px] font-normal tracking-[-0.015em]">
                                        {t.label}
                                    </span>
                                    <ArrowUpRight />
                                    {/*
                                      Keyed on the selection so the fill restarts
                                      from zero each time the row becomes active —
                                      and `animationend` here is what moves us on.
                                    */}
                                    {active && (
                                        <span
                                            key={`${serviceKey}-${topicIndex}`}
                                            aria-hidden="true"
                                            className="ah-topic-progress"
                                            style={{ animationPlayState: paused ? "paused" : "running" }}
                                            onAnimationEnd={(e) => {
                                                if (e.animationName === "ah-topic-progress") advance();
                                            }}
                                        />
                                    )}
                                </button>
                            );
                        })}
                    </div>

                    {/* detail */}
                    {/*
                      Keyed on the selection so React remounts the panel and the
                      entry animation replays on every switch — otherwise the
                      content swaps instantly and the section feels inert.
                    */}
                    <div
                        key={`${serviceKey}-${topicIndex}`}
                        className="ah-panel grid gap-8 px-0 py-8 lg:grid-cols-[minmax(0,1fr)_15rem] lg:items-start lg:gap-10 lg:px-12 lg:py-10"
                    >
                        <div className="order-2 lg:order-1">
                        <div className="ah-lbl mb-6" style={{ color: "var(--ah-blue-lt)" }}>
                            {service.chip}
                        </div>

                        <h3
                            className="m-0 text-[clamp(1.7rem,2.8vw,2.25rem)] font-light leading-tight tracking-[-0.025em]"
                            style={{ color: "var(--ah-ink)" }}
                        >
                            {topic.title}
                        </h3>

                        <p
                            className="mt-5 max-w-[38rem] text-[15px] leading-[1.7]"
                            style={{ color: "var(--ah-body)" }}
                        >
                            {topic.desc}
                        </p>

                        {topic.tags && (
                            <div className="mt-7 flex flex-wrap gap-2">
                                {topic.tags.map((tag) => (
                                    <span key={tag} className="ah-tag ah-notch-sm px-3 py-1.5 text-[12px]">
                                        {tag}
                                    </span>
                                ))}
                            </div>
                        )}

                        <Link
                            href={service.href}
                            className="ah-link-blue mt-9 inline-flex items-center gap-2 pb-1 text-[13.5px] font-medium"
                        >
                            {service.cta}
                            <ArrowUpRight size={12} />
                        </Link>
                        </div>

                        {/*
                          Visual per service, pulled from the existing library.
                          It sits on its own — no frame — over a blue pool, a
                          soft pool — no frame, and nothing sliding across it.
                        */}
                        <div className="ah-vis order-1 lg:order-2">
                            <span aria-hidden="true" className="ah-vis-pool" />                            <Image
                                src={service.img}
                                alt=""
                                width={440}
                                height={440}
                                aria-hidden="true"
                                className="ah-vis-img relative w-[62%] max-w-[15rem] lg:w-full"
                            />
                        </div>
                    </div>
                </div>
            </div>
        </section>
    );
}

export default PlatformExplorer;
