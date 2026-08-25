"use client";

import { useState, useCallback, useRef } from "react";
import { FileText, Link } from "lucide-react";
import { MONO } from "@/components/dashboard/inference/chrome";
import { ServiceShell, CARD, FieldLabel, INPUT_CLS } from "./_shell";
import type { ServiceModel } from "@/components/dashboard/inference/playground";

const FALLBACK_modelId = "ahura/ocr-doc";
const MODEL_LABEL       = "OCR";

interface OcrPage   { page: number; markdown: string; }
interface OcrResult { pages: OcrPage[]; usage: { pages: number }; }

const TAB_CLS = (active: boolean) =>
  `${MONO} px-3 py-1.5 text-[10.5px] uppercase tracking-[0.1em] rounded-[4px] transition-colors ` +
  (active ? "bg-white/[0.06] text-white/80" : "text-white/35 hover:text-white/55");

export function OcrService({
  apiBase,
  models = [],
  tabBar,
}: {
  apiBase: string;
  models?: ServiceModel[];
  tabBar?: React.ReactNode;
}) {
  const modelId = models[0]?.model_id ?? FALLBACK_modelId;

  const [inputMode, setInputMode] = useState<"file" | "url">("file");
  const [file, setFile]           = useState<File | null>(null);
  const [url, setUrl]             = useState("");
  const [result, setResult]       = useState<OcrResult | null>(null);
  const [activePage, setActivePage] = useState(0);
  const fileInputRef               = useRef<HTMLInputElement>(null);

  const codeSnippet = inputMode === "file"
    ? `curl ${apiBase}/ocr \\\n  -H "Authorization: Bearer ahu_..." \\\n  -F "model=${modelId}" \\\n  -F "file=@document.pdf"`
    : `curl ${apiBase}/ocr \\\n  -H "Authorization: Bearer ahu_..." \\\n  -H "Content-Type: application/json" \\\n  -d '{"model":"${modelId}","document":{"type":"url","url":"${url || "https://..."}"}}'`;

  const canRun = inputMode === "file" ? !!file : !!url.trim();

  const customRun = useCallback(async ({ apiKey, setError }: {
    apiKey: string;
    setError: (m: string | null) => void;
  }) => {
    setResult(null);
    setActivePage(0);

    let resp: Response;
    if (inputMode === "file" && file) {
      const form = new FormData();
      form.append("model", modelId);
      form.append("file", file);
      resp = await fetch(`${apiBase}/ocr`, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}` },
        body: form,
      });
    } else {
      resp = await fetch(`${apiBase}/ocr`, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model: modelId, document: { type: "url", url: url.trim() } }),
      });
    }

    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      setError((data as { error?: { message?: string } }).error?.message ?? `Error ${resp.status}`);
      return;
    }
    setResult(data as OcrResult);
  }, [apiBase, file, inputMode, url]);

  return (
    <ServiceShell
      tabBar={tabBar}
      apiBase={apiBase}
      modelId={modelId}
      modelLabel={MODEL_LABEL}
      description="Extract text from PDFs and images with layout-aware OCR. Returns per-page markdown."
      canRun={canRun}
      customRun={customRun}
      runLabel="Extract text"
      runningLabel="Extracting…"
      usageLabel={result ? `${result.usage.pages} ${result.usage.pages === 1 ? "page" : "pages"} extracted` : null}
      codeSnippet={codeSnippet}
      renderForm={
        <>
          {/* Input mode toggle */}
          <div>
            <FieldLabel>Input</FieldLabel>
            <div className="flex gap-1">
              <button type="button" className={TAB_CLS(inputMode === "file")} onClick={() => setInputMode("file")}>
                <FileText className="inline h-3 w-3 mr-1" />File
              </button>
              <button type="button" className={TAB_CLS(inputMode === "url")} onClick={() => setInputMode("url")}>
                <Link className="inline h-3 w-3 mr-1" />URL
              </button>
            </div>
          </div>

          {inputMode === "file" ? (
            <div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.png,.jpg,.jpeg,.webp,.gif,application/pdf,image/*"
                className="hidden"
                onChange={(e) => { setFile(e.target.files?.[0] ?? null); setResult(null); }}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className={`${MONO} w-full rounded-[6px] border border-dashed border-white/[0.1] bg-white/[0.02] px-3 py-4 text-[11.5px] text-white/50 hover:border-white/20 hover:text-white/70 transition-colors flex flex-col items-center gap-2`}
              >
                <FileText className="h-5 w-5 text-white/30" />
                {file ? <span className="text-white/80">{file.name}</span> : <span>Click to select PDF or image</span>}
                {file && <span className="text-white/30">{(file.size / 1024).toFixed(0)} KB</span>}
              </button>
            </div>
          ) : (
            <div>
              <FieldLabel>Document URL</FieldLabel>
              <input
                type="url"
                className={INPUT_CLS}
                placeholder="https://example.com/document.pdf"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
              />
            </div>
          )}
        </>
      }
      renderResults={result ? (
        <div className={`${CARD} p-5 space-y-4`}>
          {result.pages.length > 1 && (
            <div className="flex flex-wrap gap-1">
              {result.pages.map((p, i) => (
                <button key={p.page} type="button" onClick={() => setActivePage(i)} className={TAB_CLS(activePage === i)}>
                  p{p.page}
                </button>
              ))}
            </div>
          )}

          <div className="flex items-center justify-between">
            <span className={`${MONO} text-[10px] uppercase tracking-[0.12em] text-white/40`}>
              Page {result.pages[activePage]?.page} of {result.pages.length}
            </span>
            <span className={`${MONO} text-[10px] text-white/25`}>
              {result.pages[activePage]?.markdown.length} chars
            </span>
          </div>

          <pre className={`${MONO} text-[12px] text-white/80 leading-relaxed whitespace-pre-wrap break-words max-h-[600px] overflow-y-auto`}>
            {result.pages[activePage]?.markdown}
          </pre>
        </div>
      ) : null}
    />
  );
}
