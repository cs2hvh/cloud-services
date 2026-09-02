import {
  SectionIllustration,
  ServiceFeatureGrid,
} from "@/components/services/feature-grid";

/**
 * What this platform actually does, below the project list.
 *
 * EVERY CLAIM HERE IS ONE THE PLATFORM CAN MEET, and that is the whole reason
 * this file exists rather than a copy of the v1 grid. v1's version advertises
 * auto-scaling under load, 99.99% uptime, multi-AZ replicas, automatic failover
 * and sticky sessions. Deploy v2 has none of those. Uptime is measured here and
 * the measurement excludes unobserved time precisely so the number cannot be
 * inflated; promising four nines above a list of two projects is how a dashboard
 * stops being read.
 *
 * THE ICONS ARE CHOSEN FOR WHAT THEY SHOW, not for their filenames. The set
 * carries `11 nine.png` and `Multi region clusters png.png`, which illustrate
 * two of the claims this file exists to avoid making — so neither is used, and
 * `auto scaling.png` sits beside copy about sleeping when idle rather than
 * scaling under load, because that is the thing the platform actually does.
 */

interface Capability {
  title: string;
  body: string;
  /** The honest edge of the claim, when there is one. */
  caveat?: string;
}

const ICONS = "/images/kubernetes-ui";

const CAPABILITIES: Capability[] = [
  {
    title: "Reads your repository",
    body:
      "Next.js, Nuxt, Astro, SvelteKit, React, Angular, Gatsby, Hugo, NestJS, Django, FastAPI, Go, Rust, Spring Boot, Laravel and Symfony, detected from the files you already have.",
    caveat: "A Dockerfile in the repository always wins.",
  },
  {
    title: "Managed build and runtime",
    body:
      "Containers, TLS, health checks and rollouts are handled for you. Each project runs in its own namespace under a gVisor sandbox.",
  },
  {
    title: "Build logs while it builds",
    body:
      "Output appears while the build runs, so a build that stalls is visible immediately.",
    caveat: "Credentials are scrubbed before the log leaves the machine.",
  },
  {
    title: "Rollback to any ready deployment",
    body:
      "Every deployment keeps its image, so going back repoints the hostnames at one that already worked. No rebuild, no pipeline.",
    caveat: "It refuses a deployment that never became ready.",
  },
  {
    title: "A preview for every branch",
    body:
      "Push a branch and it gets its own hostname and its own environment, kept apart from production.",
    caveat: "Free, and expires 48 hours after the last push.",
  },
  {
    title: "Your domain, behind Cloudflare",
    body:
      "Add a hostname and the certificate is issued and renewed for you. The origin accepts traffic only from Cloudflare, so the WAF and rate limits cannot be walked past.",
    caveat: "The page shows the exact records and what each is waiting on.",
  },
  {
    title: "Sleeps when nothing is asking",
    body:
      "An idle app can scale to zero and cost nothing until the next request, which then waits a few seconds for it to wake.",
    caveat: "Off by default — it is a trade, and the first visitor pays for it.",
  },
  {
    title: "Billed by the hour, itemised",
    body:
      "Every hour a project runs is a row you can read: the tier, the instance count, and what it cost. The usage tab sums those rows.",
    caveat: "An hour that cannot be verified is not billed.",
  },
];


export function Capabilities() {
  return (
    <section className="mt-16">
      {/* One illustration for the section, not eight identical-looking ones
          for the cards. */}
      <div className="mb-6 flex items-center gap-4">
        <SectionIllustration src={`${ICONS}/gitops ready.png`} />
        <h2 className="text-[22px] font-semibold tracking-[-0.02em] text-white">
          Engineered <span className="font-normal text-[#0095FF]">for production</span>
          <span className="font-normal text-white/55">.</span>
        </h2>
      </div>

      <ServiceFeatureGrid
        features={CAPABILITIES.map((c) => ({ title: c.title, desc: c.body, caveat: c.caveat }))}
        columns={4}
      />
    </section>
  );
}
