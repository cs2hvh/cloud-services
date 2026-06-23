"use client";

import { useState, useCallback, useRef } from "react";
import { FileAudio, Mic } from "lucide-react";
import { MONO } from "@/components/dashboard/inference/chrome";
import { ServiceShell, CARD, FieldLabel, INPUT_CLS } from "./_shell";
import type { ServiceModel } from "@/components/dashboard/inference/playground";

const FALLBACK_MODEL_ID = "ahura/stt-whisper";
const MODEL_LABEL       = "STT";

function SttLoadingCard() {
  return (
    <div className={`${CARD} p-5 space-y-3`}>
      <div className="flex items-center gap-2">
        <Mic className="h-3.5 w-3.5 text-white/20" />
        <span className={`${MONO} text-[10px] uppercase tracking-[0.12em] text-white/25`}>Transcribing…</span>
      </div>
      <div className="space-y-2 animate-pulse">
        <div className="h-2.5 rounded-full bg-white/[0.06] w-full" />
        <div className="h-2.5 rounded-full bg-white/[0.06] w-5/6" />
        <div className="h-2.5 rounded-full bg-white/[0.06] w-3/4" />
      </div>
    </div>
  );
}

interface SttResult { text: string; duration: number; }

export function SttService({
  apiBase,
  models = [],
  tabBar,
}: {
  apiBase: string;
  models?: ServiceModel[];
  tabBar?: React.ReactNode;
}) {
  const modelId = models[0]?.model_id ?? FALLBACK_MODEL_ID;

  const [file, setFile]         = useState<File | null>(null);
  const [language, setLanguage] = useState("");
  const [result, setResult]     = useState<SttResult | null>(null);
  const fileInputRef             = useRef<HTMLInputElement>(null);

  const codeSnippet = `curl ${apiBase}/audio/transcriptions \\
  -H "Authorization: Bearer ahu_..." \\
  -F "model=${modelId}" \\
  -F "file=@audio.mp3"`;

  const customRun = useCallback(async ({ apiKey, setError }: {
    apiKey: string;
    setError: (m: string | null) => void;
  }) => {
    if (!file) return;
    const form = new FormData();
    form.append("model", modelId);
    form.append("file", file);
    if (language.trim()) form.append("language", language.trim());

    const resp = await fetch(`${apiBase}/audio/transcriptions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      setError((data as { error?: { message?: string } }).error?.message ?? `Error ${resp.status}`);
      return;
    }
    setResult(data as SttResult);
  }, [apiBase, file, language]);

  return (
    <ServiceShell
      tabBar={tabBar}
      apiBase={apiBase}
      modelId={modelId}
      modelLabel={MODEL_LABEL}
      description="Transcribe audio files to text. Supports MP3, WAV, M4A, WebM, FLAC, and OGG."
      canRun={!!file}
      customRun={customRun}
      renderLoading={<SttLoadingCard />}
      runLabel="Transcribe"
      runningLabel="Transcribing…"
      usageLabel={result ? `${result.duration.toFixed(1)}s audio transcribed` : null}
      codeSnippet={codeSnippet}
      renderForm={
        <>
          <div>
            <FieldLabel>Audio file</FieldLabel>
            <input
              ref={fileInputRef}
              type="file"
              accept="audio/*,.mp3,.wav,.m4a,.webm,.flac,.ogg"
              className="hidden"
              onChange={(e) => { setFile(e.target.files?.[0] ?? null); setResult(null); }}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className={`${MONO} w-full rounded-[6px] border border-dashed border-white/[0.1] bg-white/[0.02] px-3 py-4 text-[11.5px] text-white/50 hover:border-white/20 hover:text-white/70 transition-colors flex flex-col items-center gap-2`}
            >
              <FileAudio className="h-5 w-5 text-white/30" />
              {file ? <span className="text-white/80">{file.name}</span> : <span>Click to select audio file</span>}
              {file && <span className="text-white/30">{(file.size / 1024).toFixed(0)} KB</span>}
            </button>
          </div>

          <div>
            <FieldLabel>Language (optional)</FieldLabel>
            <input
              type="text"
              className={INPUT_CLS}
              placeholder="en, fr, es, de …"
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
            />
          </div>
        </>
      }
      renderResults={result ? (
        <div className={`${CARD} p-5 space-y-3`}>
          <div className="flex items-center justify-between">
            <span className={`${MONO} text-[10px] uppercase tracking-[0.12em] text-white/40`}>Transcript</span>
            <span className={`${MONO} text-[10px] text-white/30`}>{result.duration.toFixed(1)}s audio</span>
          </div>
          <p className={`${MONO} text-[13px] text-white/85 leading-relaxed`}>{result.text}</p>
        </div>
      ) : null}
    />
  );
}
