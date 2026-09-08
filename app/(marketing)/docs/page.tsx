import type { Metadata } from "next";
import Link from "next/link";
import { Cards, P } from "@/components/docs/primitives";
import { INFERENCE_DOCS } from "@/components/docs/nav";

export const metadata: Metadata = {
  title: "Documentation — AhuraSense Cloud",
  description:
    "Developer documentation for the AhuraSense inference API and the cloud platform API.",
};

// Every "View documentation" link on the marketing site lands here.
export default function DocsHome() {
  return (
    <div>
      <header className="mb-10 border-b border-[var(--ah-line)] pb-8">
        <p className="ah-lbl mb-3">Documentation</p>
        <h1 className="text-[clamp(28px,3.4vw,38px)] font-semibold leading-[1.15] tracking-[-0.01em] text-[var(--ah-ink)]">
          Build on AhuraSense
        </h1>
        <p className="mt-4 max-w-[640px] text-[16px] leading-[1.65] text-[var(--ah-body)]">
          Two APIs. The inference API serves frontier and open-source models behind one
          OpenAI-compatible endpoint. The cloud API manages compute, storage, databases,
          Kubernetes and the rest of the platform.
        </p>
      </header>

      <section>
        <p className="ah-lbl mb-1">Inference API</p>
        <P>
          <code className="font-[family-name:var(--font-geist-mono)] text-[13px] text-[var(--ah-ink)]">
            https://api.ahurasense.com/v1
          </code>
        </P>
        {INFERENCE_DOCS.map((g) => (
          <div key={g.label} className="mt-6">
            <p className="ah-lbl mb-1">{g.label}</p>
            <Cards items={g.items} />
          </div>
        ))}
      </section>

      <section className="mt-14 border-t border-[var(--ah-line)] pt-8">
        <p className="ah-lbl mb-1">Cloud API</p>
        <P>
          Servers, GPU instances, Kubernetes, object storage, databases, domains and billing, as
          an OpenAPI reference with a request builder.
        </P>
        <Link
          href="/api-docs"
          className="ah-notch-sm mt-4 inline-block border border-[var(--ah-line)] bg-[#121216] px-4 py-2.5 text-[14px] text-[var(--ah-ink)] transition-colors hover:border-[var(--ah-line-hi)]"
        >
          Open the cloud API reference
        </Link>
      </section>
    </div>
  );
}
