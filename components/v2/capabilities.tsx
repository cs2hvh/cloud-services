import Image from "next/image";

import { assetUrl } from "@/lib/asset-url";

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
  icon: string;
}

const ICONS = "/images/kubernetes-ui";

const CAPABILITIES: Capability[] = [
  {
    title: "Reads your repository",
    body:
      "Next.js, Nuxt, Astro, SvelteKit, React, Angular, Gatsby, Hugo, NestJS, Django, FastAPI, Go, Rust, Spring Boot, Laravel and Symfony, detected from the files you already have.",
    caveat: "A Dockerfile in the repository always wins.",
    icon: `${ICONS}/gitops ready.png`,
  },
  {
    title: "Managed build and runtime",
    body:
      "Containers, TLS, health checks and rollouts are handled for you. Each project runs in its own namespace under a gVisor sandbox.",
    icon: `${ICONS}/fully managed.png`,
  },
  {
    title: "Build logs while it builds",
    body:
      "Output appears while the build runs, so a build that stalls is visible immediately.",
    caveat: "Credentials are scrubbed before the log leaves the machine.",
    icon: `${ICONS}/life cycle.png`,
  },
  {
    title: "Rollback to any ready deployment",
    body:
      "Every deployment keeps its image, so going back repoints the hostnames at one that already worked. No rebuild, no pipeline.",
    caveat: "It refuses a deployment that never became ready.",
    icon: `${ICONS}/versoning.png`,
  },
  {
    title: "A preview for every branch",
    body:
      "Push a branch and it gets its own hostname and its own environment, kept apart from production.",
    caveat: "Free, and expires 48 hours after the last push.",
    icon: `${ICONS}/Built in load balancing png.png`,
  },
  {
    title: "Your domain, behind Cloudflare",
    body:
      "Add a hostname and the certificate is issued and renewed for you. The origin accepts traffic only from Cloudflare, so the WAF and rate limits cannot be walked past.",
    caveat: "The page shows the exact records and what each is waiting on.",
    icon: `${ICONS}/Global CDN Integration.png`,
  },
  {
    title: "Sleeps when nothing is asking",
    body:
      "An idle app can scale to zero and cost nothing until the next request, which then waits a few seconds for it to wake.",
    caveat: "Off by default — it is a trade, and the first visitor pays for it.",
    icon: `${ICONS}/auto scaling.png`,
  },
  {
    title: "Billed by the hour, itemised",
    body:
      "Every hour a project runs is a row you can read: the tier, the instance count, and what it cost. The usage tab sums those rows.",
    caveat: "An hour that cannot be verified is not billed.",
    icon: `${ICONS}/s3 Compatible API.png`,
  },
];

function Cell({ title, body, caveat, icon, index }: Capability & { index: number }) {
  return (
    <div className="flex items-start gap-4 py-2">
      <div
        className="relative flex h-16 w-16 shrink-0 items-center justify-center"
        // Staggered so the row does not pulse in unison, which reads as a
        // loading state rather than as decoration.
        style={{ animation: `v2Floaty 5s ease-in-out infinite ${(index % 4) * 0.6}s` }}
      >
        <div
          className="absolute inset-0 opacity-50 blur-xl"
          style={{ background: "radial-gradient(circle, rgba(0,149,255,0.18), transparent 60%)" }}
        />
        <Image
          src={assetUrl(icon)}
          alt=""
          width={64}
          height={64}
          className="relative object-contain"
          unoptimized
        />
      </div>
      <div className="min-w-0 pt-1">
        <h3 className="mb-1 text-[14px] font-semibold tracking-[-0.01em] text-white">{title}</h3>
        <p className="text-[12px] leading-snug text-white/55">{body}</p>
        {caveat ? <p className="mt-1.5 text-[11px] leading-snug text-white/30">{caveat}</p> : null}
      </div>
    </div>
  );
}

export function Capabilities() {
  return (
    <section className="mt-16">
      <h2 className="mb-6 text-[22px] font-semibold tracking-[-0.02em] text-white">
        Engineered <span className="font-normal text-[#0095FF]">for production</span>
        <span className="font-normal text-white/55">.</span>
      </h2>

      <div className="grid grid-cols-1 gap-x-8 gap-y-6 sm:grid-cols-2 xl:grid-cols-4">
        {CAPABILITIES.map((c, i) => (
          <Cell key={c.title} index={i} {...c} />
        ))}
      </div>

      <style>{`
        @keyframes v2Floaty {
          0%, 100% { transform: translateY(0px); }
          50%      { transform: translateY(-6px); }
        }
      `}</style>
    </section>
  );
}
