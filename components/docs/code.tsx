"use client";

/**
 * Code blocks for the docs.
 *
 *   <Code lang="bash" title="curl">…</Code>          one sample, copy button
 *   <CodeTabs tabs={[{label, lang, code}, …]} />     the same call in several
 *                                                    languages, one panel
 *
 * The tab choice is remembered per browser so a reader who picked Python on
 * the first page keeps Python on the rest.
 */

import { useEffect, useState, type ReactNode } from "react";
import { TOKEN_CLASS, tokenize, type Lang } from "./highlight";

const TAB_STORAGE_KEY = "ahura-docs-lang";

function Highlighted({ code, lang }: { code: string; lang: Lang }) {
  return (
    <>
      {tokenize(code, lang).map((t, i) =>
        t.kind === "plain" ? (
          <span key={i}>{t.text}</span>
        ) : (
          <span key={i} className={TOKEN_CLASS[t.kind]}>
            {t.text}
          </span>
        ),
      )}
    </>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1400);
        } catch {
          // Clipboard blocked: the reader can still select the text.
        }
      }}
      className="ah-lbl rounded-[4px] border border-[var(--ah-line)] px-2 py-1 transition-colors hover:border-[var(--ah-line-hi)] hover:text-[var(--ah-ink)]"
      aria-label="Copy to clipboard"
    >
      {copied ? "copied" : "copy"}
    </button>
  );
}

function Frame({
  header,
  code,
  lang,
}: {
  header: ReactNode;
  code: string;
  lang: Lang;
}) {
  return (
    <div className="ah-notch-sm my-5 overflow-hidden border border-[var(--ah-line)] bg-[#0a0a0d]">
      <div className="flex items-center justify-between gap-3 border-b border-[var(--ah-line)] px-3 py-1.5">
        <div className="flex min-w-0 items-center gap-1">{header}</div>
        <CopyButton text={code} />
      </div>
      <pre className="overflow-x-auto px-4 py-3.5 font-[family-name:var(--font-geist-mono)] text-[12.5px] leading-[1.7] text-[var(--ah-body)]">
        <code>
          <Highlighted code={code} lang={lang} />
        </code>
      </pre>
    </div>
  );
}

export function Code({
  children,
  lang = "text",
  title,
}: {
  children: string;
  lang?: Lang;
  title?: string;
}) {
  const code = children.replace(/^\n/, "").replace(/\n\s*$/, "");
  return (
    <Frame
      header={<span className="ah-lbl truncate">{title ?? lang}</span>}
      code={code}
      lang={lang}
    />
  );
}

export interface CodeTab {
  label: string;
  lang: Lang;
  code: string;
}

export function CodeTabs({ tabs }: { tabs: CodeTab[] }) {
  const [active, setActive] = useState(0);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(TAB_STORAGE_KEY);
      const idx = tabs.findIndex((t) => t.label === saved);
      if (idx >= 0) setActive(idx);
    } catch {
      // storage unavailable: default tab
    }
  }, [tabs]);

  const tab = tabs[active] ?? tabs[0];
  if (!tab) return null;
  const code = tab.code.replace(/^\n/, "").replace(/\n\s*$/, "");

  return (
    <Frame
      header={tabs.map((t, i) => (
        <button
          key={t.label}
          type="button"
          onClick={() => {
            setActive(i);
            try {
              window.localStorage.setItem(TAB_STORAGE_KEY, t.label);
            } catch {
              // ignore
            }
          }}
          className={`ah-lbl rounded-[4px] px-2 py-1 transition-colors ${
            i === active
              ? "bg-white/[0.06] text-[var(--ah-ink)]"
              : "hover:text-[var(--ah-ink)]"
          }`}
        >
          {t.label}
        </button>
      ))}
      code={code}
      lang={tab.lang}
    />
  );
}
