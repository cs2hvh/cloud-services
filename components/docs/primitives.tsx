/**
 * The vocabulary a docs page is written in. Server components; the only
 * client pieces are the code blocks in ./code.tsx.
 *
 * Kept deliberately small: a page is a DocPage with H2 sections, paragraphs,
 * parameter lists, tables, callouts and code. Anything fancier belongs on a
 * marketing page, not here.
 */

import Link from "next/link";
import type { ReactNode } from "react";
import { INFERENCE_DOCS, flattenDocs } from "./nav";

export function DocPage({
  href,
  eyebrow,
  title,
  lede,
  children,
}: {
  /** This page's route, for the previous/next footer. */
  href: string;
  eyebrow: string;
  title: string;
  lede: ReactNode;
  children: ReactNode;
}) {
  const group = INFERENCE_DOCS.find((g) => g.items.some((i) => i.href === href));
  return (
    <article className="min-w-0">
      <header className="mb-10 border-b border-[var(--ah-line)] pb-8">
        <nav aria-label="Breadcrumb" className="ah-lbl mb-4 flex flex-wrap items-center gap-2">
          <Link href="/docs" className="hover:text-[var(--ah-ink)]">
            Docs
          </Link>
          <span aria-hidden>/</span>
          <Link href="/docs/inference" className="hover:text-[var(--ah-ink)]">
            {eyebrow}
          </Link>
          {group ? (
            <>
              <span aria-hidden>/</span>
              <span>{group.label}</span>
            </>
          ) : null}
        </nav>
        <h1 className="text-[clamp(28px,3.4vw,38px)] font-semibold leading-[1.15] tracking-[-0.01em] text-[var(--ah-ink)]">
          {title}
        </h1>
        <p className="mt-4 max-w-[640px] text-[16px] leading-[1.65] text-[var(--ah-body)]">{lede}</p>
      </header>
      <div className="space-y-5">{children}</div>
      <NextPrev href={href} />
      <p className="mt-8 text-[13px] text-[var(--ah-muted)]">
        Something missing or wrong on this page?{" "}
        <Link href="/contact" className="text-[var(--ah-body)] underline decoration-[var(--ah-line-hi)] underline-offset-[3px] hover:text-[var(--ah-ink)]">
          Tell us
        </Link>
        , and quote the page title.
      </p>
    </article>
  );
}

function slug(children: ReactNode): string {
  const text = typeof children === "string" ? children : Array.isArray(children) ? children.join(" ") : "";
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function H2({ id, children }: { id?: string; children: ReactNode }) {
  const anchor = id ?? slug(children);
  return (
    <h2
      id={anchor}
      className="group mt-12 scroll-mt-28 text-[22px] font-semibold leading-tight tracking-[-0.01em] text-[var(--ah-ink)] first:mt-0"
    >
      <a href={`#${anchor}`} className="no-underline">
        {children}
        <span className="ml-2 text-[var(--ah-muted)] opacity-0 transition-opacity group-hover:opacity-100">
          #
        </span>
      </a>
    </h2>
  );
}

export function H3({ id, children }: { id?: string; children: ReactNode }) {
  const anchor = id ?? slug(children);
  return (
    <h3 id={anchor} className="mt-8 scroll-mt-28 text-[16px] font-semibold text-[var(--ah-ink)]">
      {children}
    </h3>
  );
}

export function P({ children }: { children: ReactNode }) {
  return <p className="text-[15px] leading-[1.75] text-[var(--ah-body)]">{children}</p>;
}

export function Ul({ children }: { children: ReactNode }) {
  return <ul className="list-disc space-y-1.5 pl-5 text-[15px] leading-[1.7] text-[var(--ah-body)] marker:text-[var(--ah-muted)]">{children}</ul>;
}

export function Ol({ children }: { children: ReactNode }) {
  return <ol className="list-decimal space-y-1.5 pl-5 text-[15px] leading-[1.7] text-[var(--ah-body)] marker:text-[var(--ah-muted)]">{children}</ol>;
}

export function Li({ children }: { children: ReactNode }) {
  return <li>{children}</li>;
}

/** Inline code. */
export function C({ children }: { children: ReactNode }) {
  return (
    <code className="rounded-[3px] border border-[var(--ah-line)] bg-white/[0.04] px-1.5 py-[1px] font-[family-name:var(--font-geist-mono)] text-[12.5px] text-[var(--ah-ink)]">
      {children}
    </code>
  );
}

export function Strong({ children }: { children: ReactNode }) {
  return <strong className="font-semibold text-[var(--ah-ink)]">{children}</strong>;
}

export function A({ href, children }: { href: string; children: ReactNode }) {
  const cls = "ah-link-blue underline decoration-[var(--ah-line-hi)] underline-offset-[3px] hover:decoration-[var(--ah-blue)]";
  if (href.startsWith("/")) {
    return (
      <Link href={href} className={cls}>
        {children}
      </Link>
    );
  }
  return (
    <a href={href} className={cls} target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  );
}

export function Endpoint({ method, path }: { method: "GET" | "POST" | "DELETE"; path: string }) {
  const tone =
    method === "GET"
      ? "text-[var(--ah-green)] border-[rgba(53,208,127,0.35)]"
      : method === "POST"
        ? "text-[var(--ah-blue-lt)] border-[rgba(0,149,255,0.4)]"
        : "text-[var(--ah-amber)] border-[rgba(245,179,36,0.4)]";
  return (
    <div className="ah-notch-sm my-4 flex flex-wrap items-center gap-3 border border-[var(--ah-line)] bg-[#0a0a0d] px-3 py-2.5">
      <span className={`ah-lbl rounded-[3px] border px-1.5 py-0.5 ${tone}`}>{method}</span>
      <code className="font-[family-name:var(--font-geist-mono)] text-[13px] text-[var(--ah-ink)]">{path}</code>
    </div>
  );
}

export interface ParamItem {
  name: string;
  type: string;
  required?: boolean;
  defaultValue?: string;
  children: ReactNode;
}

export function Params({ items }: { items: ParamItem[] }) {
  return (
    <dl className="my-4 divide-y divide-[var(--ah-line)] border-y border-[var(--ah-line)]">
      {items.map((p) => (
        <div key={p.name} className="py-3.5">
          <dt className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <code className="font-[family-name:var(--font-geist-mono)] text-[13.5px] text-[var(--ah-ink)]">{p.name}</code>
            <span className="ah-lbl">{p.type}</span>
            {p.required ? (
              <span className="ah-lbl text-[var(--ah-amber)]">required</span>
            ) : (
              <span className="ah-lbl">optional</span>
            )}
            {p.defaultValue ? <span className="ah-lbl">default {p.defaultValue}</span> : null}
          </dt>
          <dd className="mt-1.5 text-[14.5px] leading-[1.7] text-[var(--ah-body)]">{p.children}</dd>
        </div>
      ))}
    </dl>
  );
}

export function Table({ head, rows }: { head: ReactNode[]; rows: ReactNode[][] }) {
  return (
    <div className="ah-scroll my-4 overflow-x-auto border border-[var(--ah-line)]">
      <table className="w-full min-w-[520px] border-collapse text-[14px]">
        <thead>
          <tr className="bg-white/[0.03]">
            {head.map((h, i) => (
              <th key={i} className="ah-lbl border-b border-[var(--ah-line)] px-3 py-2 text-left font-normal">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b border-[var(--ah-line)] last:border-b-0">
              {r.map((cell, j) => (
                <td key={j} className="px-3 py-2 align-top leading-[1.6] text-[var(--ah-body)]">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Callout({
  kind = "note",
  title,
  children,
}: {
  kind?: "note" | "warn" | "tip";
  title?: string;
  children: ReactNode;
}) {
  const tone =
    kind === "warn"
      ? "border-l-[var(--ah-amber)]"
      : kind === "tip"
        ? "border-l-[var(--ah-green)]"
        : "border-l-[var(--ah-blue)]";
  const label = title ?? (kind === "warn" ? "Take note" : kind === "tip" ? "Tip" : "Note");
  return (
    <aside className={`my-5 border border-[var(--ah-line)] border-l-2 bg-white/[0.02] px-4 py-3 ${tone}`}>
      <p className="ah-lbl mb-1">{label}</p>
      <div className="text-[14.5px] leading-[1.7] text-[var(--ah-body)]">{children}</div>
    </aside>
  );
}

export function Cards({ items }: { items: { title: string; description: string; href: string }[] }) {
  return (
    <div className="my-4 grid gap-3 sm:grid-cols-2">
      {items.map((it) => (
        <Link
          key={it.href}
          href={it.href}
          className="ah-notch-sm group block border border-[var(--ah-line)] bg-[#121216] p-4 transition-colors hover:border-[var(--ah-line-hi)]"
        >
          <p className="text-[15px] font-semibold text-[var(--ah-ink)] group-hover:text-[var(--ah-blue-lt)]">{it.title}</p>
          <p className="mt-1.5 text-[13.5px] leading-[1.6] text-[var(--ah-body)]">{it.description}</p>
        </Link>
      ))}
    </div>
  );
}

function NextPrev({ href }: { href: string }) {
  const all = flattenDocs();
  const i = all.findIndex((d) => d.href === href);
  if (i < 0) return null;
  const prev = all[i - 1];
  const next = all[i + 1];
  return (
    <nav className="mt-14 grid gap-3 border-t border-[var(--ah-line)] pt-6 sm:grid-cols-2">
      <div>
        {prev ? (
          <Link href={prev.href} className="group block">
            <span className="ah-lbl">Previous</span>
            <span className="mt-1 block text-[15px] text-[var(--ah-ink)] group-hover:text-[var(--ah-blue-lt)]">
              {prev.title}
            </span>
          </Link>
        ) : null}
      </div>
      <div className="sm:text-right">
        {next ? (
          <Link href={next.href} className="group block">
            <span className="ah-lbl">Next</span>
            <span className="mt-1 block text-[15px] text-[var(--ah-ink)] group-hover:text-[var(--ah-blue-lt)]">
              {next.title}
            </span>
          </Link>
        ) : null}
      </div>
    </nav>
  );
}
