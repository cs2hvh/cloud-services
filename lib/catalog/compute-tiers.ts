// The compute tiers we sell, keyed to real Linode classes. Pure data.
//
// Separate from lib/catalog/compute because that module value-imports
// getLinodeCatalog, and this constant is read by a "use client" component
// (the wizard's plan tabs). Importing it from there would pull the whole
// server-side catalog module — and anything it ever grows to touch — into the
// client bundle. Same reasoning as lib/catalog/gpu-editorial.

/**
 * The tiers we actually sell, keyed to real Linode classes.
 *
 * Imported by BOTH the marketing pricing page (via getComputeCategories) and
 * the dashboard's plan tabs (CLASS_TABS in components/dashboard/compute/vps/
 * linode.tsx), so the two cannot drift into advertising different products.
 */
export const COMPUTE_TIERS: ReadonlyArray<{
  key: string;
  label: string;
  classes: readonly string[];
  blurb: string;
  features: readonly string[];
}> = [
  {
    key: "shared",
    label: "Shared CPU",
    classes: ["nanode", "standard"],
    blurb: "Balanced instances on shared cores — the right default for most workloads.",
    features: [
      "Burstable vCPU cores",
      "Best price/performance for dev and test",
      "Full root access and SSH",
      "Snapshots and optional backups",
    ],
  },
  {
    key: "dedicated",
    label: "Dedicated CPU",
    classes: ["dedicated"],
    blurb: "Full-duty workloads needing consistent, dedicated physical cores.",
    features: [
      "Dedicated physical cores",
      "Guaranteed baseline performance",
      "No noisy neighbours",
      "Built for production APIs and SaaS",
    ],
  },
  {
    key: "highmem",
    label: "High Memory",
    classes: ["highmem"],
    blurb: "RAM-heavy instances for in-memory databases and caches.",
    features: [
      "High RAM-to-vCPU ratio",
      "Tuned for Redis, Postgres and Elastic",
      "Low-latency memory bus",
      "Ideal for real-time analytics",
    ],
  },
  {
    key: "premium",
    label: "Premium CPU",
    classes: ["premium"],
    blurb: "Latest-generation AMD EPYC™ hardware with guaranteed baseline performance.",
    features: [
      "Newest-generation AMD EPYC™",
      "Guaranteed baseline performance",
      "Highest single-thread throughput",
      "For latency-sensitive production work",
    ],
  },
];
