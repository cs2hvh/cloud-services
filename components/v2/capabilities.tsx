import type { ReactNode } from "react";

import { V2_MONO } from "@/components/v2/kit";

/**
 * What this platform actually does, below the project list.
 *
 * EVERY CLAIM HERE IS ONE THE PLATFORM CAN MEET, and that is the whole reason
 * this file exists rather than a copy of the v1 grid. v1's version of this
 * section advertises auto-scaling under load, 99.99% uptime, multi-AZ replicas,
 * automatic failover and sticky sessions. Deploy v2 has none of those. Uptime is
 * measured here and the measurement excludes unobserved time precisely so the
 * number cannot be inflated; promising four nines above a list of two projects
 * is how a dashboard stops being read.
 *
 * Where something is real but partial it SAYS SO — scale-to-zero exists and is
 * off by default, previews expire, PHP has no builder. A caveat in small text
 * costs a line and buys the reader a reason to believe the rest.
 */

interface Capability {
  title: string;
  body: string;
  /** The honest edge of the claim, when there is one. */
  caveat?: string;
}

const CAPABILITIES: Capability[] = [
  {
    title: "Reads your repository",
    body:
      "Next.js, Nuxt, Astro, SvelteKit, React, Angular, Gatsby, Hugo, Docusaurus, NestJS, Express, Django, FastAPI, Go, Rust, Spring Boot, Laravel and Symfony are detected from the files you already have.",
    caveat: "A Dockerfile in the repository always wins, and is the escape hatch when detection is wrong.",
  },
  {
    title: "Build logs while it builds",
    body:
      "The log streams from the build machine every few seconds rather than appearing when it finishes, so a build that hangs is visible while it hangs.",
    caveat: "Credentials are scrubbed on the machine before the log ever leaves it.",
  },
  {
    title: "Rollback to any ready deployment",
    body:
      "Every deployment keeps its image, so going back repoints the hostnames at one that already worked. No rebuild, no wait for a pipeline.",
    caveat: "It refuses a deployment that never became ready, or whose image is gone.",
  },
  {
    title: "A preview for every branch",
    body:
      "Push a branch and it gets its own hostname and its own environment, separate from production.",
    caveat: "Previews are free and expire 48 hours after their last push.",
  },
  {
    title: "Your own domain, with TLS",
    body:
      "Add a hostname, add the records it shows you, and the certificate is issued and renewed for you.",
    caveat: "The page shows the exact DNS records and what each one is waiting on.",
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
      "Every hour a project runs is a row you can read: the tier, the instance count, and what it cost. The usage tab sums the rows rather than re-deriving from today's price.",
    caveat: "An hour that cannot be verified is not billed.",
  },
  {
    title: "Isolated, and behind Cloudflare",
    body:
      "Each project runs in its own namespace under a gVisor sandbox, and the origin accepts traffic only from Cloudflare — so the WAF and the rate limits cannot be walked past.",
  },
];

function Cell({ title, body, caveat }: Capability) {
  return (
    <div className="border-t border-white/[0.07] pt-4">
      <h3 className="text-[13.5px] font-medium tracking-[-0.01em] text-white">{title}</h3>
      <p className="mt-1.5 text-[12.5px] leading-[1.65] text-white/50">{body}</p>
      {caveat ? (
        <p className={`${V2_MONO} mt-2 text-[11px] leading-[1.6] text-white/30`}>{caveat}</p>
      ) : null}
    </div>
  );
}

export function Capabilities({ heading }: { heading?: ReactNode }) {
  return (
    <section className="mt-16">
      <div className="mb-6">
        <p className={`${V2_MONO} mb-1.5 text-[10.5px] uppercase tracking-[0.14em] text-white/40`}>
          What you get
        </p>
        <h2 className="text-[20px] font-semibold tracking-[-0.02em] text-white">
          {heading ?? (
            <>
              Everything here is <span className="text-[#0095FF]">something it does</span>
              <span className="text-white/50">.</span>
            </>
          )}
        </h2>
      </div>

      <div className="grid grid-cols-1 gap-x-10 gap-y-7 sm:grid-cols-2 xl:grid-cols-4">
        {CAPABILITIES.map((c) => (
          <Cell key={c.title} {...c} />
        ))}
      </div>
    </section>
  );
}
