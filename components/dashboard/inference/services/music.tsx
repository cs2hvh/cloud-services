"use client";

import { useState, useCallback, useMemo, useRef } from "react";
import { Download, ImageIcon, Music, Music2, X } from "lucide-react";
import { CARD, FieldLabel, INPUT_CLS, ServiceShell, TEXTAREA_CLS } from "./_shell";
import { MONO } from "@/components/dashboard/inference/chrome";
import type { ServiceModel } from "@/components/dashboard/inference/playground";

const FALLBACK_MODEL_ID    = "ahura/music-gen";
const FALLBACK_MODEL_LABEL = "Music Gen";
const MODEL_LABEL          = "Music";

type GenerationMode = "t2m" | "i2m"; // text-to-music | image-to-music

// ── Loading skeleton ──────────────────────────────────────────────────────────

function MusicLoadingCard({ elapsed, mode }: { elapsed: number; mode: GenerationMode }) {
  const pct = Math.min((elapsed / 150) * 100, 95);
  const label =
    elapsed < 5   ? mode === "i2m" ? "Reading image…" : "Composing…" :
    elapsed < 60  ? "Generating audio…" :
    elapsed < 120 ? "Rendering mix…" :
                    "Finalizing…";
  return (
    <div className={`${CARD} p-5 space-y-4`}>
      <div className="flex items-center gap-2">
        <Music className="h-3.5 w-3.5 text-white/20" />
        <span className={`${MONO} text-[10px] uppercase tracking-[0.12em] text-white/25`}>
          {mode === "i2m" ? "Generating from image…" : "Generating music…"}
        </span>
        <span className={`${MONO} text-[10px] text-white/20 ml-auto tabular-nums`}>{elapsed}s</span>
      </div>

      <div className="w-full h-24 rounded-[8px] bg-white/[0.03] flex flex-col items-center justify-center gap-3 relative overflow-hidden">
        <div className="absolute inset-0 animate-pulse bg-gradient-to-br from-white/[0.03] to-transparent" />
        <Music2 className="h-8 w-8 text-white/[0.07]" />
        <span className={`${MONO} text-[11px] text-white/[0.15] uppercase tracking-[0.1em]`}>{label}</span>
      </div>

      <div className="space-y-1.5">
        <div className="h-1 rounded-full bg-white/[0.06] overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-1000"
            style={{
              width:      `${pct}%`,
              background: "linear-gradient(90deg, rgba(138,43,226,0.5), rgba(0,149,255,0.2))",
            }}
          />
        </div>
        <p className={`${MONO} text-[10px] text-white/20`}>
          Instrumental: 30–90s · With vocals: 90–180s
        </p>
      </div>
    </div>
  );
}

// ── Audio player ──────────────────────────────────────────────────────────────

function AudioPlayer({
  audioUrl,
  durationLabel,
  onDownload,
}: {
  audioUrl:      string;
  durationLabel: string;
  onDownload:    () => void;
}) {
  return (
    <div className={CARD}>
      <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-white/[0.05]">
        <div className="flex items-center gap-2">
          <Music2 className="h-3.5 w-3.5 text-white/40" />
          <span className={`${MONO} text-[10px] uppercase tracking-[0.12em] text-white/40`}>Audio output</span>
        </div>
        <button
          type="button"
          onClick={onDownload}
          className="flex items-center gap-1.5 text-white/25 hover:text-white/55 transition-colors"
          title="Download audio"
        >
          <Download className="h-3.5 w-3.5" />
          <span className={`${MONO} text-[10px] uppercase tracking-[0.1em]`}>mp3</span>
        </button>
      </div>

      <div className="p-4">
        {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
        <audio src={audioUrl} controls className="w-full" />
      </div>

      <div className={`${MONO} flex gap-4 px-5 pb-4 text-[10px] text-white/20 border-t border-white/[0.04] pt-3`}>
        <span>{durationLabel}</span>
        <span>mp3</span>
        <span>48kHz stereo</span>
      </div>
    </div>
  );
}

// ── Image input ───────────────────────────────────────────────────────────────

function ImageInput({
  value,
  onChange,
}: {
  value:    string;
  onChange: (v: string) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => onChange(ev.target?.result as string);
      reader.readAsDataURL(file);
      e.target.value = "";
    },
    [onChange],
  );

  const isDataUrl = value.startsWith("data:image/");

  return (
    <div className="space-y-2">
      <FieldLabel>Image</FieldLabel>
      {isDataUrl ? (
        <div className="relative rounded-[6px] overflow-hidden border border-white/[0.08] bg-white/[0.02]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={value} alt="Music source" className="w-full max-h-40 object-contain" />
          <button
            type="button"
            onClick={() => onChange("")}
            className="absolute top-2 right-2 p-1 rounded-full bg-black/60 text-white/60 hover:text-white transition-colors"
            title="Remove image"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : (
        <div className="flex gap-2">
          <input
            type="text"
            className={`${INPUT_CLS} flex-1`}
            placeholder="https://… or click Upload"
            value={value}
            onChange={(e) => onChange(e.target.value)}
          />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className={`${INPUT_CLS} flex items-center gap-1.5 px-3 shrink-0 cursor-pointer`}
          >
            <ImageIcon className="h-3.5 w-3.5" />
            <span className={`${MONO} text-[10px] uppercase tracking-[0.1em]`}>Upload</span>
          </button>
        </div>
      )}
      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />
      <p className={`${MONO} text-[10px] text-white/25`}>
        Lyria will generate music inspired by the image.
      </p>
    </div>
  );
}

// ── Service ───────────────────────────────────────────────────────────────────

export function MusicService({
  apiBase,
  models = [],
  tabBar,
}: {
  apiBase:  string;
  models?:  ServiceModel[];
  tabBar?:  React.ReactNode;
}) {
  const modelOptions = useMemo(
    () =>
      models.length > 0
        ? models.map((m) => ({ id: m.model_id, label: m.display_name, tier: m.tier }))
        : [{ id: FALLBACK_MODEL_ID, label: FALLBACK_MODEL_LABEL, tier: null }],
    [models],
  );

  const [modelId, setModelId]               = useState(modelOptions[0]?.id ?? FALLBACK_MODEL_ID);
  const [mode, setMode]                     = useState<GenerationMode>("t2m");
  const [prompt, setPrompt]                 = useState("");
  const [imageUrl, setImageUrl]             = useState("");
  const [makeInstrumental, setInstrumental] = useState(false);
  const [style, setStyle]                   = useState("");
  const [audioUrl, setAudioUrl]             = useState<string | null>(null);
  const [durationLabel, setDurationLabel]   = useState("");
  const [elapsed, setElapsed]               = useState(0);

  const elapsedIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const objectUrlRef       = useRef<string | null>(null);

  const stopTimer = useCallback(() => {
    if (elapsedIntervalRef.current) {
      clearInterval(elapsedIntervalRef.current);
      elapsedIntervalRef.current = null;
    }
  }, []);

  const customRun = useCallback(
    async ({
      apiKey,
      setError,
    }: {
      apiKey:   string;
      setError: (m: string | null) => void;
    }) => {
      stopTimer();
      if (objectUrlRef.current) { URL.revokeObjectURL(objectUrlRef.current); objectUrlRef.current = null; }
      setAudioUrl(null);
      setDurationLabel("");
      setElapsed(0);

      elapsedIntervalRef.current = setInterval(() => setElapsed((s) => s + 1), 1_000);

      let resp: Response;
      try {
        resp = await fetch(`${apiBase}/audio/music`, {
          method:  "POST",
          headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
          body:    JSON.stringify({
            model:             modelId,
            prompt:            prompt.trim(),
            make_instrumental: makeInstrumental,
            response_format:   "mp3",
            ...(style.trim()                          ? { style:     style.trim()      } : {}),
            ...(mode === "i2m" && imageUrl.trim()     ? { image_url: imageUrl.trim()   } : {}),
          }),
        });
      } catch (err) {
        stopTimer();
        setError(`Network error: ${err instanceof Error ? err.message : String(err)}`);
        return;
      }

      stopTimer();

      if (!resp.ok) {
        const data = await resp.json().catch(() => ({}));
        setError((data as { error?: { message?: string } }).error?.message ?? `Error ${resp.status}`);
        return;
      }

      // Worker streams raw mp3 bytes — no JSON parsing, no base64 decode
      const blob = await resp.blob().catch(() => null);
      if (!blob || blob.size === 0) { setError("Music generation returned no audio. Please try again."); return; }

      const url = URL.createObjectURL(blob);
      objectUrlRef.current = url;
      setAudioUrl(url);

      // Estimate duration from byte size (MP3 ~24 kBps average)
      const secs = Math.max(1, Math.round(blob.size / (24 * 1024)));
      const m = Math.floor(secs / 60);
      setDurationLabel(m > 0 ? `${m}m ${secs % 60}s` : `${secs}s`);
    },
    [apiBase, modelId, mode, prompt, imageUrl, makeInstrumental, style, stopTimer],
  );

  const handleDownload = useCallback(() => {
    if (!audioUrl) return;
    const a    = document.createElement("a");
    a.href     = audioUrl;
    a.download = "music-gen.mp3";
    a.click();
  }, [audioUrl]);

  const canRun =
    prompt.trim().length > 0 &&
    prompt.length <= 2_000 &&
    (mode === "t2m" || imageUrl.trim().length > 0);

  const codeSnippet =
    mode === "i2m"
      ? `# Image-to-Music — generate music inspired by an image
curl ${apiBase}/audio/music \\
  -H "Authorization: Bearer ahu_..." \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "${modelId}",
    "prompt": "${prompt.trim() || "Evocative cinematic score"}",
    "image_url": "https://…",
    "make_instrumental": ${makeInstrumental}
  }' --output music.mp3`
      : `# Text-to-Music
curl ${apiBase}/audio/music \\
  -H "Authorization: Bearer ahu_..." \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "${modelId}",
    "prompt": "${prompt.trim() || "An upbeat lo-fi hip hop track with soft piano and rain ambiance"}",
    "make_instrumental": ${makeInstrumental}
  }' --output music.mp3`;

  return (
    <ServiceShell
      tabBar={tabBar}
      apiBase={apiBase}
      modelId={modelId}
      modelLabel={MODEL_LABEL}
      description="Generate original music from text prompts or images. Lyria 3 produces 48kHz stereo audio with full instrumental arrangements."
      canRun={canRun}
      customRun={customRun}
      runLabel="Generate"
      runningLabel="Generating…"
      renderLoading={<MusicLoadingCard elapsed={elapsed} mode={mode} />}
      renderForm={
        <>
          {/* Model selector */}
          {modelOptions.length > 1 && (
            <div>
              <FieldLabel>Model</FieldLabel>
              <select
                className={`${INPUT_CLS} appearance-none`}
                value={modelId}
                onChange={(e) => { setModelId(e.target.value); setAudioUrl(null); }}
              >
                {modelOptions.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}{m.tier === "pro" ? " · Pro" : ""}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Mode toggle */}
          <div>
            <FieldLabel>Mode</FieldLabel>
            <div className="inline-flex rounded-[5px] border border-white/[0.08] bg-white/[0.02] p-0.5 gap-0.5">
              {(["t2m", "i2m"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMode(m)}
                  className={`${MONO} h-7 px-3 text-[10px] uppercase tracking-[0.12em] rounded-[4px] transition-colors ${
                    mode === m
                      ? "bg-[#0095FF]/15 text-white"
                      : "text-white/45 hover:text-white"
                  }`}
                >
                  {m === "t2m" ? "Text to Music" : "Image to Music"}
                </button>
              ))}
            </div>
          </div>

          {/* Image input (i2m only) */}
          {mode === "i2m" && (
            <ImageInput value={imageUrl} onChange={setImageUrl} />
          )}

          {/* Prompt */}
          <div>
            <FieldLabel>
              {mode === "i2m" ? "Music prompt" : "Prompt"}
            </FieldLabel>
            <textarea
              className={`${TEXTAREA_CLS} h-28`}
              placeholder={
                mode === "i2m"
                  ? "Describe the mood or style: cinematic orchestral, melancholic piano, upbeat electronic…"
                  : "An upbeat lo-fi hip hop track with soft piano and gentle rain ambiance, chill and relaxing…"
              }
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
            />
            <p className={`${MONO} mt-1 text-[10px] text-white/30`}>{prompt.length} / 2000 chars</p>
          </div>

          {/* Style */}
          <div>
            <FieldLabel>Style (optional)</FieldLabel>
            <input
              type="text"
              className={INPUT_CLS}
              placeholder="e.g. lo-fi, jazz, cinematic, ambient…"
              value={style}
              onChange={(e) => setStyle(e.target.value)}
              maxLength={200}
            />
          </div>

          {/* Instrumental toggle */}
          <div>
            <FieldLabel>Instrumental</FieldLabel>
            <button
              type="button"
              onClick={() => setInstrumental((v) => !v)}
              className={`${INPUT_CLS} text-left flex items-center gap-2 transition-colors ${makeInstrumental ? "text-white" : "text-white/40"}`}
            >
              <span
                className={`h-3.5 w-3.5 rounded-sm border flex items-center justify-center flex-shrink-0 transition-colors ${
                  makeInstrumental ? "bg-[#0095FF]/70 border-[#0095FF]/50" : "border-white/20 bg-white/[0.04]"
                }`}
              >
                {makeInstrumental && <span className="block h-2 w-2 rounded-[2px] bg-white" />}
              </span>
              <span className={`${MONO} text-[10px] uppercase tracking-[0.1em]`}>
                {makeInstrumental ? "No vocals" : "With vocals"}
              </span>
            </button>
          </div>
        </>
      }
      renderResults={
        audioUrl
          ? <AudioPlayer audioUrl={audioUrl} durationLabel={durationLabel} onDownload={handleDownload} />
          : null
      }
      usageLabel={audioUrl && durationLabel ? `${durationLabel} generated` : null}
      codeSnippet={codeSnippet}
    />
  );
}
