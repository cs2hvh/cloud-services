import Link from "next/link";
import { docsMetadata } from "@/components/docs/metadata";
import { Cards } from "@/components/docs/primitives";
import { INFERENCE_DOCS } from "@/components/docs/nav";

export const metadata = docsMetadata({
  title: "Documentation — Developer docs — AhuraSense Cloud",
  description:
    "Developer documentation for the AhuraSense inference API and the cloud platform API.",
  path: "/docs",
});

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

      <div className="grid gap-4 sm:grid-cols-2">
        <Link
          href="/docs/inference"
          className="ah-notch group block border border-[var(--ah-line)] bg-[#121216] p-5 transition-colors hover:border-[var(--ah-blue)]"
        >
          <p className="ah-lbl mb-2 text-[var(--ah-blue-lt)]">Inference API</p>
          <p className="text-[18px] font-semibold text-[var(--ah-ink)]">Call any model with one key</p>
          <p className="mt-2 text-[14px] leading-[1.65] text-[var(--ah-body)]">
            Chat completions and an Anthropic-compatible route, streaming, tool calling, JSON
            mode, per-key limits and caps. Works with the OpenAI and Anthropic SDKs unchanged.
          </p>
          <code className="mt-4 block font-[family-name:var(--font-geist-mono)] text-[12.5px] text-[var(--ah-ink)]">
            https://api.ahurasense.com/v1
          </code>
          <span className="mt-4 inline-block text-[13px] text-[var(--ah-blue-lt)] group-hover:underline">
            Read the docs
          </span>
        </Link>
        <Link
          href="/api-docs"
          className="ah-notch group block border border-[var(--ah-line)] bg-[#121216] p-5 transition-colors hover:border-[var(--ah-line-hi)]"
        >
          <p className="ah-lbl mb-2">Cloud API</p>
          <p className="text-[18px] font-semibold text-[var(--ah-ink)]">Manage the platform</p>
          <p className="mt-2 text-[14px] leading-[1.65] text-[var(--ah-body)]">
            Servers, GPU instances, Kubernetes, object storage, databases, domains and billing,
            as an OpenAPI reference with a request builder.
          </p>
          <code className="mt-4 block font-[family-name:var(--font-geist-mono)] text-[12.5px] text-[var(--ah-ink)]">
            https://ahurasense.com/api/v1
          </code>
          <span className="mt-4 inline-block text-[13px] text-[var(--ah-body)] group-hover:text-[var(--ah-ink)] group-hover:underline">
            Open the reference
          </span>
        </Link>
      </div>

      <section className="mt-12">
        <p className="ah-lbl mb-1">Inference API, by topic</p>
        {INFERENCE_DOCS.map((g) => (
          <div key={g.label} className="mt-6">
            <p className="ah-lbl mb-1 text-[var(--ah-body)]">{g.label}</p>
            <Cards items={g.items} />
          </div>
        ))}
      </section>
    </div>
  );
}
