import Link from "next/link";

/**
 * ComputeSection — the three-tier compute lineup.
 *
 * Previous pass separated the tiers with nothing but a shared vertical rule, so
 * they read as one continuous strip rather than three choices; and the spec
 * rows sat on --ah-muted, which is a label grey and too dim to scan as data.
 * Tiers now sit on their own surfaces with real gutters, and every value moved
 * up a contrast step.
 */

type Tier = {
    index: string;
    label: string;
    title: string;
    desc: string;
    specs: Array<[string, string]>;
    startsAt: string;
    period: string;
    cta: string;
    href: string;
    featured?: boolean;
};

const TIERS: Tier[] = [
    {
        index: "01",
        label: "Shared",
        title: "General purpose",
        desc: "Balanced CPU and memory on shared hosts. Sub-minute provisioning.",
        specs: [
            ["vCPU", "1 – 128"],
            ["Memory", "1 GB – 1 TB"],
            ["Storage", "25 GB – 4 TB NVMe"],
            ["Network", "Up to 25 Gbps"],
        ],
        startsAt: "$4",
        period: "/mo",
        cta: "Launch instance",
        href: "/dashboard/services/compute/vps",
    },
    {
        index: "02",
        label: "Dedicated",
        title: "Compute optimized",
        desc: "Pinned CPU cores. Consistent latency for production traffic.",
        specs: [
            ["vCPU", "2 – 128 dedicated"],
            ["Memory", "4 GB – 1 TB"],
            ["Storage", "80 GB – 8 TB NVMe"],
            ["Network", "Up to 50 Gbps"],
        ],
        startsAt: "$32",
        period: "/mo",
        cta: "Launch dedicated",
        href: "/dashboard/services/compute/vps?type=dedicated",
        featured: true,
    },
    {
        index: "03",
        label: "Bare metal",
        title: "Dedicated Server",
        desc: "Full physical server, no hypervisor. Run your own kernel for HPC or regulated workloads.",
        specs: [
            ["CPU", "32 – 192 cores"],
            ["Memory", "128 GB – 2 TB DDR5"],
            ["Storage", "1 TB – 60 TB NVMe"],
            ["Network", "100 Gbps redundant"],
        ],
        startsAt: "$499",
        period: "/mo",
        cta: "Talk to sales",
        href: "/dashboard/services/compute/bare-metal",
    },
];

const REGIONS = 15;

export function ComputeSection() {
    return (
        <section
            // The top padding carries this seam on its own. The models section
            // above ends on a deliberately tight pb-6/lg:pb-8, so pt-10/lg:pt-12
            // left only 64px (mobile) and 80px (desktop) between the two — under
            // half of every other section boundary on the page, which run
            // 144px and 192-208px. Raised to land on that same rhythm rather
            // than to a round number. Only the homepage renders this section,
            // so nothing else shifts.
            className="px-6 pb-20 pt-28 sm:px-10 lg:px-12 lg:pb-28 lg:pt-40"
            style={{ background: "var(--ah-bg)" }}
            aria-labelledby="compute-heading"
        >
            <div className="mx-auto max-w-[1704px]">
                <div className="mb-14 grid gap-8 lg:grid-cols-2 lg:gap-20">
                    <div>
                        <h2
                            id="compute-heading"
                            className="ah-rise ah-h2"
                        >
                            Compute
                        </h2>
                    </div>
                    <div className="lg:pt-2">
                        <p
                            className="m-0 max-w-[34rem] text-[15.5px] leading-[1.65]"
                            style={{ color: "var(--ah-body)" }}
                        >
                            Three tiers on one control plane. Move between them without
                            rebuilding your stack: same API, same billing, same audit trail,
                            whether you are running a staging box or a regulated workload on
                            its own hardware.
                        </p>
                        <div className="ah-lbl mt-6" style={{ color: "var(--ah-body)" }}>
                            {REGIONS} regions · hourly + monthly · API-first
                        </div>
                    </div>
                </div>

                {/* real gutters, and each tier on its own surface */}
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 lg:gap-5">
                    {TIERS.map((tier) => (
                        <div
                            key={tier.index}
                            className="ah-tier ah-notch flex flex-col p-7 lg:p-8"
                            data-featured={tier.featured ? "true" : undefined}
                        >
                            <div className="mb-7 flex items-baseline justify-between gap-3">
                                <span className="ah-lbl" style={{ color: "var(--ah-body)" }}>
                                    {tier.index} · {tier.label}
                                </span>
                                {tier.featured && (
                                    <span
                                        className="ah-lbl ah-notch-sm px-2.5 py-1"
                                        style={{ background: "var(--ah-blue)", color: "#fff" }}
                                    >
                                        Most popular
                                    </span>
                                )}
                            </div>

                            <div
                                className="mb-3 text-[1.6rem] font-light leading-tight tracking-[-0.02em]"
                                style={{ color: "var(--ah-ink)" }}
                            >
                                {tier.title}
                            </div>
                            <p
                                className="mb-8 min-h-[3.5rem] text-[14.5px] leading-[1.6]"
                                style={{ color: "var(--ah-body)" }}
                            >
                                {tier.desc}
                            </p>

                            <dl className="m-0">
                                {tier.specs.map(([k, v]) => (
                                    <div
                                        key={k}
                                        className="flex items-baseline justify-between gap-4 py-3"
                                        style={{ borderTop: "1px solid var(--ah-line)" }}
                                    >
                                        <dt
                                            className="ah-lbl"
                                            style={{ fontSize: "10.5px", color: "var(--ah-body)" }}
                                        >
                                            {k}
                                        </dt>
                                        <dd
                                            className="m-0 text-right text-[13px]"
                                            style={{
                                                color: "var(--ah-ink)",
                                                fontFamily: "var(--font-geist-mono), ui-monospace, monospace",
                                            }}
                                        >
                                            {v}
                                        </dd>
                                    </div>
                                ))}
                            </dl>

                            <div
                                className="mb-7 mt-8 flex items-baseline gap-2"
                                style={{ borderTop: "1px solid var(--ah-line-hi)", paddingTop: "1.5rem" }}
                            >
                                <span className="ah-lbl" style={{ color: "var(--ah-body)" }}>
                                    From
                                </span>
                                <span
                                    className="text-[2.2rem] font-normal leading-none tracking-[-0.03em] tabular-nums"
                                    style={{ color: "var(--ah-ink)" }}
                                >
                                    {tier.startsAt}
                                </span>
                                <span className="ah-lbl" style={{ color: "var(--ah-body)" }}>
                                    {tier.period}
                                </span>
                            </div>

                            <Link
                                href={tier.href}
                                className="ah-btn-outline ah-notch-sm mt-auto inline-flex w-full items-center justify-center gap-2 py-3.5 text-[13.5px] font-medium"
                            >
                                {tier.cta}
                                <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
                                    <path d="M3 8h9M8.5 4.5 12 8l-3.5 3.5" />
                                </svg>
                            </Link>
                        </div>
                    ))}
                </div>
            </div>
        </section>
    );
}

export default ComputeSection;
