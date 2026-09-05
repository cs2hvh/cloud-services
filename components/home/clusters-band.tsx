import Link from "next/link";

/**
 * ClustersBand — the reserved / cluster GPU pitch.
 *
 * The one cream section on a dark page. That is deliberate: it is the
 * enterprise sales moment, and inverting the ground makes it read as a
 * different register rather than another row in the scroll. The dark
 * configuration card sitting inside it inverts back, so the spec sheet still
 * looks like a spec sheet.
 *
 * ONE SCREEN. Until 2026-09-05 this band ran to ~1280px at 1900×900: a
 * headline row, then a benefits grid and the spec card stacked beneath it.
 * It is now three columns in one row (pitch, benefits, spec sheet), and the
 * section is exactly one viewport tall (minus the fixed navbar) with the row
 * centred in it, so scrolling to it shows a full cream screen.
 *
 * The shared `components/clusters-section.tsx` is still used by the GPU service
 * page and is deliberately left alone; this is a homepage-only variant.
 *
 * All colour comes from the .ah-band-light scope in globals.css — the page's
 * dark --ah-* tokens are not used here, and the light --l-* tokens are not
 * visible outside this element.
 */

const BENEFITS: Array<{ title: string; detail: string }> = [
    { title: "Multi-node NVLink fabric", detail: "8× B300 SXM per node · 1.8 TB/s GPU-to-GPU" },
    { title: "Reserved pricing", detail: "Up to 60% off on-demand · 1-mo to 3-yr terms" },
    { title: "Dedicated support", detail: "Priority access, 24/7 coverage, SLA-backed" },
    { title: "Rapid provisioning", detail: "Clusters ready in hours, not days" },
    { title: "Custom networking", detail: "Tailored VPC, routing and isolation" },
    { title: "99.99% uptime SLA", detail: "Enterprise-grade reliability you can build on" },
];

/** `accent` marks the two rows worth pulling the eye to. */
const CONFIG: Array<{ k: string; v: string; accent?: boolean }> = [
    { k: "GPUs", v: "64× NVIDIA B300", accent: true },
    { k: "GPU memory", v: "18.4 TB (288 GB / GPU)" },
    { k: "Interconnect", v: "NVLink Switch System 5.0" },
    { k: "vCPUs / node", v: "96 vCPUs" },
    { k: "Networking", v: "800 Gbps · RDMA", accent: true },
    { k: "Term", v: "12-month reserved" },
];

/** Lit slot colours down the chassis face. */
const SLOTS = ["#2ec8b0", "#2ec8b0", "#f5b324", "#4d8cff", "#2ec8b0", "#f5b324"];

function Chevron() {
    return (
        <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
            <path d="M3 8h9M8.5 4.5 12 8l-3.5 3.5" />
        </svg>
    );
}

export function ClustersBand() {
    return (
        <section
            className="ah-band-light flex items-center px-6 py-14 sm:px-10 lg:px-12 lg:py-16"
            style={{ minHeight: "calc(100svh - 56px)" }}
            aria-labelledby="clusters-heading"
        >
            <div className="mx-auto w-full max-w-[1704px]">
                <div className="grid gap-10 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)_minmax(0,0.95fr)] lg:gap-12">
                    {/* ── pitch ── */}
                    <div className="flex flex-col gap-6">
                        <h2 id="clusters-heading" className="ah-h2">
                            Need bigger?
                            <br />
                            <span className="ah-h2-hl">Reserve a cluster.</span>
                        </h2>
                        <p className="m-0 max-w-[30rem] text-[15px] leading-[1.6]" style={{ color: "var(--l-body)" }}>
                            Multi-node H200, B200 and B300 clusters with NVIDIA NVLink 5.0 fabric,
                            dedicated capacity and committed pricing. From a single 8-GPU node to
                            thousand-GPU training runs; we handle the rest.
                        </p>
                        <div className="ah-cue">
                            <div className="text-[13.5px] font-semibold" style={{ color: "var(--l-ink)" }}>
                                Ready to build?
                            </div>
                            <div className="mt-1 text-[13px] leading-[1.55]" style={{ color: "var(--l-body)" }}>
                                Talk to our infrastructure team and get a custom quote.
                            </div>
                        </div>
                        <div className="flex flex-wrap items-center gap-x-8 gap-y-4">
                            <Link
                                href="/contact?topic=clusters"
                                className="ah-btn-light ah-notch-sm inline-flex items-center gap-2.5 px-6 py-3.5 text-[14px] font-medium hover:-translate-y-px"
                            >
                                Contact sales
                                <svg viewBox="0 0 14 14" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="1.9" aria-hidden="true">
                                    <path d="M3.5 10.5 10.5 3.5M5 3.5h5.5V9" />
                                </svg>
                            </Link>
                            <Link href="/pricing" className="ah-link-light inline-flex items-center gap-2.5 pb-1 text-[14px] font-medium">
                                View pricing guide
                                <svg viewBox="0 0 20 14" width="17" height="12" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
                                    <path d="M1 7h16M12.5 2.5 17 7l-4.5 4.5" />
                                </svg>
                            </Link>
                        </div>
                    </div>

                    {/* ── benefits: one hairline column ── */}
                    <div style={{ borderBottom: "1px solid var(--l-line)" }}>
                        {BENEFITS.map((b) => (
                            <div key={b.title} className="ah-cell flex items-start gap-4 px-4 py-4" style={{ borderLeft: "none" }}>
                                <svg viewBox="0 0 18 8" width="17" height="8" fill="none" stroke="var(--l-blue)" strokeWidth="1.3" aria-hidden="true" className="mt-[7px] shrink-0">
                                    <path d="M1 4h11M9.5 1.5 12.5 4 9.5 6.5" />
                                </svg>
                                <div className="min-w-0">
                                    <div className="text-[14px] font-medium leading-snug" style={{ color: "var(--l-blue)" }}>
                                        {b.title}
                                    </div>
                                    <div className="mt-1 text-[12.5px] leading-[1.5]" style={{ color: "var(--l-body)" }}>
                                        {b.detail}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* ── the spec sheet inverts back to dark ── */}
                    <div
                        className="ah-notch relative overflow-hidden px-6 py-5 sm:px-7 sm:py-6"
                        style={{ background: "#0d0d11", color: "var(--ah-ink)" }}
                    >
                        <div
                            aria-hidden="true"
                            className="pointer-events-none absolute inset-0"
                            style={{ background: "radial-gradient(560px 260px at 78% 12%, rgba(0,149,255,.14), transparent 68%)" }}
                        />
                        <div className="relative">
                            <div className="flex items-center justify-between gap-4 pb-3" style={{ borderBottom: "1px solid rgba(255,255,255,.09)" }}>
                                <span className="ah-lbl" style={{ color: "rgba(255,255,255,.5)" }}>
                                    Cluster configuration
                                </span>
                                <Link
                                    href="/contact?topic=clusters"
                                    className="ah-lbl inline-flex items-center gap-1.5 transition-colors hover:brightness-125"
                                    style={{ color: "var(--ah-blue-lt)" }}
                                >
                                    Review &amp; request
                                    <svg viewBox="0 0 14 14" width="10" height="10" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                                        <path d="M3.5 10.5 10.5 3.5M5 3.5h5.5V9" />
                                    </svg>
                                </Link>
                            </div>

                            <div className="mt-4 flex items-center gap-5">
                                <div className="shrink-0" style={{ transform: "scale(0.62)", transformOrigin: "left center", width: 74, height: 96 }}>
                                    <div className="ah-rack" aria-hidden="true">
                                        <div className="ah-rack-slots">
                                            {SLOTS.map((c, i) => (
                                                <span key={i} style={{ background: c, boxShadow: `0 0 8px ${c}`, animationDelay: `${i * 0.35}s` }} />
                                            ))}
                                        </div>
                                    </div>
                                </div>
                                <div className="min-w-0">
                                    <div className="text-[19px] font-light leading-tight tracking-[-0.02em]">
                                        NVIDIA B300 SXM · 8-node cluster
                                    </div>
                                    <div className="ah-lbl mt-1.5" style={{ color: "rgba(255,255,255,.4)" }}>
                                        NVLink fabric · Redundant power · PCIe 5.0
                                    </div>
                                </div>
                            </div>

                            <dl className="mt-4">
                                {CONFIG.map((c) => (
                                    <div
                                        key={c.k}
                                        className="flex items-baseline justify-between gap-5 py-2"
                                        style={{ borderBottom: "1px solid rgba(255,255,255,.07)" }}
                                    >
                                        <dt className="ah-lbl" style={{ color: "rgba(255,255,255,.42)" }}>{c.k}</dt>
                                        <dd
                                            className="m-0 text-right text-[12.5px]"
                                            style={{
                                                color: c.accent ? "var(--ah-amber)" : "var(--ah-ink)",
                                                fontFamily: "var(--font-geist-mono), ui-monospace, monospace",
                                            }}
                                        >
                                            {c.v}
                                        </dd>
                                    </div>
                                ))}
                            </dl>

                            <Link
                                href="/contact?topic=clusters"
                                className="ah-btn-spec ah-notch-sm mt-5 inline-flex w-full items-center justify-center gap-2 py-3 text-[13.5px] font-medium"
                            >
                                Request this configuration
                                <Chevron />
                            </Link>
                        </div>
                    </div>
                </div>
            </div>
        </section>
    );
}

export default ClustersBand;
