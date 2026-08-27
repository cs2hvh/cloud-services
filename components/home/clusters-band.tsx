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
 * The shared `components/clusters-section.tsx` is still used by the GPU service
 * page and is deliberately left alone; this is a homepage-only variant.
 *
 * All colour comes from the .ah-band-light scope in globals.css — the page's
 * dark --ah-* tokens are not used here, and the light --l-* tokens are not
 * visible outside this element.
 */

const BENEFITS: Array<{ title: string; detail: string }> = [
    {
        title: "Multi-node NVLink fabric",
        detail: "8× B300 SXM per node · 1.8 TB/s GPU-to-GPU bandwidth",
    },
    {
        title: "Reserved pricing",
        detail: "Up to 60% off on-demand · 1-mo to 3-yr commitment",
    },
    {
        title: "Dedicated support",
        detail: "Priority access, 24/7 coverage, and SLA-backed reliability",
    },
    {
        title: "Rapid provisioning",
        detail: "Clusters ready in hours, not days",
    },
    {
        title: "Custom networking",
        detail: "Tailored VPC, routing and isolation to fit your architecture",
    },
    {
        title: "99.99% uptime SLA",
        detail: "Enterprise-grade reliability you can build on",
    },
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
            className="ah-band-light px-6 py-20 sm:px-10 lg:px-12 lg:py-28"
            aria-labelledby="clusters-heading"
        >
            <div className="mx-auto max-w-[1704px]">
                {/* ── headline + pitch ── */}
                <div className="grid gap-10 lg:grid-cols-2 lg:gap-20">
                    <div>
                        <h2
                            id="clusters-heading"
                            className="ah-h2"
                        >
                            Need bigger?
                            <br />
                            <span className="ah-h2-hl">Reserve a cluster.</span>
                        </h2>
                    </div>

                    <div className="lg:pt-2">
                        <p
                            className="m-0 max-w-[34rem] text-[15.5px] leading-[1.65]"
                            style={{ color: "var(--l-body)" }}
                        >
                            Multi-node H200, B200, and B300 clusters with NVIDIA NVLink 5.0
                            fabric, dedicated capacity, and committed pricing. From a single
                            8-GPU node to thousand-GPU training runs. We handle the rest.
                        </p>

                        <div className="ah-cue mt-8">
                            <div className="text-[13.5px] font-semibold" style={{ color: "var(--l-ink)" }}>
                                Ready to build?
                            </div>
                            <div className="mt-1 text-[13px] leading-[1.55]" style={{ color: "var(--l-body)" }}>
                                Talk to our infrastructure team and get a custom quote.
                            </div>
                        </div>

                        <div className="mt-8 flex flex-wrap items-center gap-x-8 gap-y-4">
                            <Link
                                href="/contact?topic=clusters"
                                className="ah-btn-light ah-notch-sm inline-flex items-center gap-2.5 px-6 py-3.5 text-[14px] font-medium hover:-translate-y-px"
                            >
                                Contact sales
                                <svg viewBox="0 0 14 14" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="1.9" aria-hidden="true">
                                    <path d="M3.5 10.5 10.5 3.5M5 3.5h5.5V9" />
                                </svg>
                            </Link>
                            <Link
                                href="/pricing"
                                className="ah-link-light inline-flex items-center gap-2.5 pb-1 text-[14px] font-medium"
                            >
                                View pricing guide
                                <svg viewBox="0 0 20 14" width="17" height="12" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
                                    <path d="M1 7h16M12.5 2.5 17 7l-4.5 4.5" />
                                </svg>
                            </Link>
                        </div>
                    </div>
                </div>

                {/* ── benefits + configuration ── */}
                <div className="mt-16 grid gap-10 lg:grid-cols-2 lg:gap-14">
                    {/* hairline grid, borders on two edges so shared edges never double */}
                    <div
                        className="grid grid-cols-1 sm:grid-cols-2"
                        style={{ borderRight: "1px solid var(--l-line)", borderBottom: "1px solid var(--l-line)" }}
                    >
                        {BENEFITS.map((b) => (
                            <div key={b.title} className="ah-cell px-6 py-7">
                                <svg viewBox="0 0 18 8" width="17" height="8" fill="none" stroke="var(--l-blue)" strokeWidth="1.3" aria-hidden="true" className="mb-3.5">
                                    <path d="M1 4h11M9.5 1.5 12.5 4 9.5 6.5" />
                                </svg>
                                <div className="text-[14px] font-medium leading-snug" style={{ color: "var(--l-blue)" }}>
                                    {b.title}
                                </div>
                                <div className="mt-2 text-[12.5px] leading-[1.6]" style={{ color: "var(--l-body)" }}>
                                    {b.detail}
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* the spec sheet inverts back to dark */}
                    <div
                        className="ah-notch relative overflow-hidden px-7 py-6 sm:px-9 sm:py-8"
                        style={{ background: "#0d0d11", color: "var(--ah-ink)" }}
                    >
                        <div
                            aria-hidden="true"
                            className="pointer-events-none absolute inset-0"
                            style={{
                                background:
                                    "radial-gradient(560px 260px at 78% 12%, rgba(0,149,255,.14), transparent 68%)",
                            }}
                        />

                        <div className="relative">
                            <div
                                className="flex items-center justify-between gap-4 pb-4"
                                style={{ borderBottom: "1px solid rgba(255,255,255,.09)" }}
                            >
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

                            <div className="ah-lbl mt-3" style={{ color: "rgba(255,255,255,.32)" }}>
                                Reserved · Single-tenant · Enterprise ready
                            </div>

                            <div className="my-7 flex justify-center">
                                <div className="ah-rack" aria-hidden="true">
                                    <div className="ah-rack-slots">
                                        {SLOTS.map((c, i) => (
                                            <span
                                                key={i}
                                                style={{
                                                    background: c,
                                                    boxShadow: `0 0 8px ${c}`,
                                                    animationDelay: `${i * 0.35}s`,
                                                }}
                                            />
                                        ))}
                                    </div>
                                </div>
                            </div>

                            <div className="text-[22px] font-light leading-tight tracking-[-0.02em]">
                                NVIDIA B300 SXM · 8-node cluster
                            </div>
                            <div className="ah-lbl mt-2" style={{ color: "rgba(255,255,255,.4)" }}>
                                NVLink fabric · Redundant power · PCIe 5.0
                            </div>

                            <dl className="mt-6">
                                {CONFIG.map((c) => (
                                    <div
                                        key={c.k}
                                        className="flex items-baseline justify-between gap-5 py-3"
                                        style={{ borderBottom: "1px solid rgba(255,255,255,.07)" }}
                                    >
                                        <dt className="ah-lbl" style={{ color: "rgba(255,255,255,.42)" }}>
                                            {c.k}
                                        </dt>
                                        <dd
                                            className="m-0 text-right text-[13px]"
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
                                className="ah-btn-spec ah-notch-sm mt-7 inline-flex w-full items-center justify-center gap-2 py-3.5 text-[13.5px] font-medium"
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
