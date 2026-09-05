import Link from "next/link";

import { getPublicComputeCatalog, type PublicComputeTier } from "@/lib/catalog/compute";
import { BARE_METAL_SKUS } from "@/lib/catalog/bare-metal";
import { HERO_REGIONS } from "@/lib/marketing/hero-announcements";
import { createServiceClient } from "@/lib/supabase/server";

/**
 * ComputeSection — the three compute tiers as one pricing row.
 *
 * Shared (shared vCPU), VDS (dedicated vCPU: a virtual dedicated server) and
 * Bare metal servers. Three plan cards inside one hairline frame, the
 * middle card lifted out of the frame with an ink outline and a "most
 * popular" tab, each card: index, name, one line of what it is, the
 * from-price, a check list, an action.
 *
 * THE FROM-PRICES ARE SET BY HAND, everything else is live. Harshit set the
 * three advertised price points (2026-09-05) in ADVERTISED_FROM below. The
 * vCPU, RAM and disk spans come from getPublicComputeCatalog, the same
 * resolver the deploy wizard bills by; the bare-metal count and spans come
 * from lib/catalog/bare-metal, which the dashboard lists. On the day the
 * price points were set, the live floors were $5.40 (Shared), $38.88 (VDS)
 * and $69 (bare metal): an advertised price below the floor a customer can
 * actually buy at is logged on every render (see checkAdvertised) so the gap
 * is visible until pricing catches up. To make the promise true, change
 * linode_pricing.markup_pct / floor_per_hour_usd for the shared and
 * dedicated classes, and the cheapest SKU in lib/catalog/bare-metal.
 */

/** Advertised from-prices, USD per month. Set by hand; see the note above. */
const ADVERTISED_FROM = { shared: 5, vds: 24, bare: 59 } as const;

/** Log when a live floor is above the advertised price, so nobody has to notice by hand. */
function checkAdvertised(name: string, advertised: number, liveFloor: number | null | undefined) {
    if (liveFloor != null && liveFloor > advertised) {
        console.warn(`[compute-section] ${name} advertised from ${advertised}/mo but the cheapest live plan is ${liveFloor}/mo`);
    }
}

type Plan = {
    index: string;
    name: string;
    what: string;
    fromMonthlyUSD: number;
    /** The mono line under the price. */
    priceNote: string;
    features: string[];
    cta: { label: string; href: string };
    featured?: boolean;
};

function usd(n: number): string {
    return Number.isInteger(n) ? `$${n}` : `$${n.toFixed(2)}`;
}

function gb(n: number): string {
    return n >= 1024 ? `${Math.round((n / 1024) * 10) / 10} TB` : `${n} GB`;
}

function range(values: number[], fmt: (n: number) => string = String): string | null {
    if (values.length === 0) return null;
    const lo = Math.min(...values);
    const hi = Math.max(...values);
    return lo === hi ? fmt(lo) : `${fmt(lo)} to ${fmt(hi)}`;
}

/** The live lines for a virtual tier: vCPU and RAM span, then disk span. */
function virtualRanges(tier: PublicComputeTier | undefined): string[] {
    if (!tier || tier.plans.length === 0) return [];
    const vcpu = range(tier.plans.map((p) => p.vcpus));
    const ram = range(tier.plans.map((p) => p.memoryGB), gb);
    const disk = range(tier.plans.map((p) => p.diskGB), gb);
    const out: string[] = [];
    if (vcpu && ram) out.push(`${vcpu} vCPU, ${ram} RAM`);
    if (disk) out.push(`${disk} NVMe storage`);
    return out;
}

function Check() {
    return (
        <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true" className="ah-plan-check mt-[3px] shrink-0">
            <path d="M3 8.5 6.5 12 13 4.5" />
        </svg>
    );
}

function Arrow() {
    return (
        <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
            <path d="M3 8h9M8.5 4.5 12 8l-3.5 3.5" />
        </svg>
    );
}

export async function ComputeSection() {
    let shared: PublicComputeTier | undefined;
    let vds: PublicComputeTier | undefined;
    try {
        const supabase = await createServiceClient();
        const catalog = await getPublicComputeCatalog(supabase);
        shared = catalog.tiers.find((t) => t.key === "shared");
        vds = catalog.tiers.find((t) => t.key === "dedicated");
    } catch (error) {
        console.error("[compute-section] compute catalog read failed:", error);
        // The cards render without prices rather than with invented ones.
    }

    const bareCount = BARE_METAL_SKUS.length;
    const bareFloor = bareCount ? Math.min(...BARE_METAL_SKUS.map((s) => s.priceMonthly)) : null;
    const bareCores = range(BARE_METAL_SKUS.map((s) => s.cpu.cores));
    const bareRam = range(BARE_METAL_SKUS.map((s) => s.ramGb), gb);
    const vendors = new Set(BARE_METAL_SKUS.map((s) => s.vendor));
    const vendorLine = [vendors.has("amd") ? "AMD EPYC and Ryzen" : null, vendors.has("intel") ? "Intel Xeon" : null]
        .filter(Boolean)
        .join(", ");

    checkAdvertised("Shared", ADVERTISED_FROM.shared, shared?.fromMonthlyUSD);
    checkAdvertised("VDS", ADVERTISED_FROM.vds, vds?.fromMonthlyUSD);
    checkAdvertised("Bare metal", ADVERTISED_FROM.bare, bareFloor);

    const plans: Plan[] = [
        {
            index: "01",
            name: "Shared",
            what: "Virtual machines on shared vCPUs. Dev, staging and small production.",
            fromMonthlyUSD: ADVERTISED_FROM.shared,
            priceNote: "/ month · billed hourly",
            features: [
                ...virtualRanges(shared),
                "Full root access, SSH keys",
                "Snapshots and backups",
                "Billed by the hour",
            ],
            cta: { label: "Launch a VM", href: "/dashboard/services/compute/vps" },
        },
        {
            index: "02",
            name: "VDS",
            what: "Virtual dedicated servers on pinned physical cores. Production APIs and databases.",
            fromMonthlyUSD: ADVERTISED_FROM.vds,
            priceNote: "/ month · billed hourly",
            features: [
                "Dedicated cores, no noisy neighbours",
                ...virtualRanges(vds),
                "Guaranteed baseline performance",
                "Full root access, SSH keys",
                "Same API and billing as Shared",
            ],
            cta: { label: "Launch a VDS", href: "/dashboard/services/compute/vps?type=dedicated" },
            featured: true,
        },
        {
            index: "03",
            name: "Bare metal servers",
            what: "A whole physical server, no hypervisor. Your kernel, your hardware.",
            fromMonthlyUSD: ADVERTISED_FROM.bare,
            priceNote: bareCount ? `/ month · ${bareCount} configurations` : "/ month",
            features: [
                bareCores && bareRam ? `${bareCores} cores, ${bareRam} RAM` : null,
                vendorLine || null,
                "IPMI out-of-band access",
                "Custom OS, hardware RAID",
                "Single tenant, monthly term",
            ].filter((f): f is string => Boolean(f)),
            cta: { label: "See the lineup", href: "/services/compute" },
        },
    ];

    return (
        <section
            // The top padding carries this seam on its own: the models section
            // above ends on a tight pb-6/lg:pb-8, so this lands the boundary
            // on the same rhythm as the rest of the page.
            className="px-6 pb-20 pt-28 sm:px-10 lg:px-12 lg:pb-28 lg:pt-40"
            style={{ background: "var(--ah-bg)" }}
            aria-labelledby="compute-heading"
        >
            <div className="mx-auto max-w-[1704px]">
                <div className="mb-14 grid gap-8 lg:mb-20 lg:grid-cols-2 lg:gap-20">
                    <div>
                        <h2 id="compute-heading" className="ah-rise ah-h2">
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
                            {HERO_REGIONS} regions · hourly + monthly · API-first
                        </div>
                    </div>
                </div>

                {/* one hairline frame; the featured plan steps out of it */}
                <div className="ah-plans lg:my-7 lg:grid lg:grid-cols-3">
                    {plans.map((plan) => (
                        <article
                            key={plan.index}
                            className={`ah-plan relative flex flex-col px-8 pb-9 pt-10 lg:px-10 lg:pb-11 lg:pt-12${plan.featured ? " ah-plan--hi" : ""}`}
                        >
                            {plan.featured && (
                                <span className="ah-plan-tab ah-lbl">
                                    <span className="ah-plan-tab-dot" aria-hidden="true" />
                                    Most popular
                                </span>
                            )}

                            <div className="ah-lbl" style={{ color: "var(--ah-muted)" }}>{plan.index}</div>
                            <h3
                                className="mb-3 mt-5 text-[2rem] font-normal leading-none tracking-[-0.02em]"
                                style={{ color: "var(--ah-ink)" }}
                            >
                                {plan.name}
                            </h3>
                            <p className="m-0 min-h-[3.2rem] text-[14.5px] leading-[1.55]" style={{ color: "var(--ah-body)" }}>
                                {plan.what}
                            </p>

                            <div className="my-8" style={{ borderTop: "1px solid var(--ah-line)" }} />

                            <div>
                                <div className="ah-lbl mb-2" style={{ color: "var(--ah-muted)" }}>From</div>
                                <div
                                    className="text-[3.6rem] font-light leading-none tracking-[-0.04em] tabular-nums"
                                    style={{ color: "var(--ah-ink)" }}
                                >
                                    {usd(plan.fromMonthlyUSD)}
                                </div>
                                <div className="ah-lbl mt-3" style={{ color: "var(--ah-body)", textTransform: "none" }}>
                                    {plan.priceNote}
                                </div>
                            </div>

                            <ul className="m-0 mt-9 flex list-none flex-col gap-3.5 p-0">
                                {plan.features.map((f) => (
                                    <li key={f} className="flex items-start gap-3 text-[14px] leading-[1.45]" style={{ color: "var(--ah-ink)" }}>
                                        <Check />
                                        <span>{f}</span>
                                    </li>
                                ))}
                            </ul>

                            <div className="mt-10 lg:mt-auto lg:pt-10">
                                <Link
                                    href={plan.cta.href}
                                    className={`${plan.featured ? "ah-btn-spec" : "ah-btn-outline"} ah-notch-sm inline-flex w-full items-center justify-center gap-2 py-3.5 text-[13.5px] font-medium`}
                                >
                                    {plan.cta.label}
                                    <Arrow />
                                </Link>
                            </div>
                        </article>
                    ))}
                </div>
            </div>
        </section>
    );
}

export default ComputeSection;
