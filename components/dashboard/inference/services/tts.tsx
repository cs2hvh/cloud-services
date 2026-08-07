"use client";

import { useState, useCallback, useMemo, useRef } from "react";
import { Download, Volume2 } from "lucide-react";
import { CARD, FieldLabel, INPUT_CLS, ServiceShell, TEXTAREA_CLS } from "./_shell";
import { MONO } from "@/components/dashboard/inference/chrome";
import type { ServiceModel } from "@/components/dashboard/inference/playground";

const FALLBACK_MODEL_ID    = "ahura/voice-aria";
const FALLBACK_MODEL_LABEL = "Voice Aria";
const MODEL_LABEL          = "TTS";

const VOICES = [
  { value: "aria",    label: "Aria"    },
  { value: "echo",    label: "Echo"    },
  { value: "nova",    label: "Nova"    },
  { value: "onyx",    label: "Onyx"    },
  { value: "shimmer", label: "Shimmer" },
  { value: "fable",   label: "Fable"   },
];

interface TtsResult {
  data: Array<{ b64_json: string }>;
  usage: { chars: number };
}

export function TtsService({
  apiBase,
  models = [],
  tabBar,
}: {
  apiBase: string;
  models?: ServiceModel[];
  tabBar?: React.ReactNode;
}) {
  const modelOptions = useMemo(
    () =>
      models.length > 0
        ? models.map((m) => ({ id: m.model_id, label: m.display_name, tier: m.tier }))
        : [{ id: FALLBACK_MODEL_ID, label: FALLBACK_MODEL_LABEL, tier: null }],
    [models]
  );

  const [modelId, setModelId] = useState(modelOptions[0]?.id ?? FALLBACK_MODEL_ID);
  const [input, setInput]     = useState("");
  const [voice, setVoice]     = useState("aria");
  const [result, setResult]   = useState<TtsResult | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const audioUrlRef = useRef<string | null>(null);

  const body = useMemo(() => ({
    model:           modelId,
    input:           input.trim(),
    voice,
    response_format: "b64_json",
  }), [modelId, input, voice]);

  const onSuccess = useCallback((data: unknown) => {
    const r = data as TtsResult;
    setResult(r);
    const b64 = r.data?.[0]?.b64_json;
    if (b64) {
      if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);
      const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      const blob  = new Blob([bytes], { type: "audio/wav" });
      const url   = URL.createObjectURL(blob);
      audioUrlRef.current = url;
      setAudioUrl(url);
    }
  }, []);

  const SELECT_CLS =
    `${MONO} w-full rounded-[6px] bg-white/[0.03] border border-white/[0.06] px-3 py-2.5 ` +
    `text-[12.5px] text-white/90 outline-none focus:border-[rgba(0,149,255,0.35)] transition-colors`;

  const renderForm = (
    <>
      {modelOptions.length > 1 && (
        <div>
          <FieldLabel>Model</FieldLabel>
          <select className={`${INPUT_CLS} appearance-none`} value={modelId} onChange={(e) => { setModelId(e.target.value); setResult(null); setAudioUrl(null); }}>
            {modelOptions.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}{m.tier === "pro" ? " · Pro" : ""}
              </option>
            ))}
          </select>
        </div>
      )}
      <div>
        <FieldLabel>Text input</FieldLabel>
        <textarea
          className={`${TEXTAREA_CLS} h-28`}
          placeholder="Enter text to convert to speech…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
        />
        <p className={`${MONO} mt-1 text-[10px] text-white/30`}>{input.length} / 4096 chars</p>
      </div>
      <div>
        <FieldLabel>Voice</FieldLabel>
        <select className={SELECT_CLS} value={voice} onChange={(e) => setVoice(e.target.value)}>
          {VOICES.map((v) => (
            <option key={v.value} value={v.value}>{v.label}</option>
          ))}
        </select>
      </div>
    </>
  );

  const handleDownload = useCallback(() => {
    if (!audioUrlRef.current) return;
    const a = document.createElement("a");
    a.href = audioUrlRef.current;
    a.download = "tts-output.wav";
    a.click();
  }, []);

  const renderResults = audioUrl ? (
    <div className={`${CARD} p-5 space-y-4`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Volume2 className="h-3.5 w-3.5 text-white/40" />
          <span className={`${MONO} text-[10px] uppercase tracking-[0.12em] text-white/40`}>Audio output</span>
        </div>
        <button
          type="button"
          onClick={handleDownload}
          className="flex items-center gap-1.5 text-white/25 hover:text-white/60 transition-colors"
          title="Download WAV"
        >
          <Download className="h-3.5 w-3.5" />
          <span className={`${MONO} text-[10px] uppercase tracking-[0.1em]`}>wav</span>
        </button>
      </div>
      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
      <audio controls src={audioUrl} className="w-full" style={{ filter: "invert(1) hue-rotate(180deg)" }} />
      {result && (
        <p className={`${MONO} text-[10.5px] text-white/35`}>
          {result.usage.chars} chars generated
        </p>
      )}
    </div>
  ) : null;

  const codeSnippet = `curl ${apiBase}/audio/speech \\
  -H "Authorization: Bearer ahu_..." \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "${modelId}",
    "input": "Welcome to AhuraCloud.",
    "voice": "${voice}"
  }' \\
  --output speech.wav`;

  return (
    <ServiceShell
      tabBar={tabBar}
      apiBase={apiBase}
      modelId={modelId}
      modelLabel={MODEL_LABEL}
      endpoint="/audio/speech"
      description="Convert text to natural-sounding speech. Choose from multiple voices."
      body={body}
      canRun={input.trim().length > 0 && input.length <= 4096}
      onSuccess={onSuccess}
      renderForm={renderForm}
      renderResults={renderResults}
      usageLabel={result ? `${result.usage.chars} characters` : null}
      codeSnippet={codeSnippet}
    />
  );
}
