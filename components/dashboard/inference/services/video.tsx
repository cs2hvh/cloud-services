"use client";

import { useState, useCallback, useMemo, useRef } from "react";
import { Download, Film, ImageIcon, VideoIcon, X } from "lucide-react";
import { CARD, FieldLabel, INPUT_CLS, ServiceShell, TEXTAREA_CLS } from "./_shell";
import { MONO } from "@/components/dashboard/inference/chrome";
import type { ServiceModel } from "@/components/dashboard/inference/playground";

const FALLBACK_MODEL_ID    = "ahura/video-gen";
const FALLBACK_MODEL_LABEL = "Video Gen";
const MODEL_LABEL          = "Video";

// Fallback durations used when a model has no supported_durations in capabilities
const DEFAULT_DURATIONS = [5, 8, 10];

const ASPECT_RATIOS = [
  { value: "16:9", label: "16:9 — Landscape" },
  { value: "9:16", label: "9:16 — Portrait" },
  { value: "1:1",  label: "1:1 — Square" },
];
const RESOLUTIONS = [{ value: "720p", label: "720p" }, { value: "1080p", label: "1080p" }];

const POLL_INTERVAL_MS  = 8_000;
const POLL_MAX_ATTEMPTS = 100; // ~13 min

interface JobResponse {
  id:            string;
  status:        "queued" | "running" | "completed" | "failed";
  output_url?:   string;
  data?:         Array<{ url: string }>;
  error?:        { code?: string; message?: string };
}

type GenerationMode = "t2v" | "i2v";

// ── Loading skeleton ──────────────────────────────────────────────────────────

function VideoLoadingCard({
  elapsed,
  status,
  mode,
}: {
  elapsed: number;
  status:  string;
  mode:    GenerationMode;
}) {
  const pct   = Math.min((elapsed / 120) * 100, 95);
  // Label progresses with elapsed time — "Queued" only during the first few seconds
  // before the first poll. After that, time is the signal even if polls lag.
  const label =
    elapsed < 8  ? (status === "running" ? (mode === "i2v" ? "Animating image…" : "Starting render…") : "Queued…") :
    elapsed < 45 ? "Rendering frames…" :
    elapsed < 90 ? "Almost done…" :
                   "Finalizing…";
  return (
    <div className={`${CARD} p-5 space-y-4`}>
      <div className="flex items-center gap-2">
        <Film className="h-3.5 w-3.5 text-white/20" />
        <span className={`${MONO} text-[10px] uppercase tracking-[0.12em] text-white/25`}>
          {mode === "i2v" ? "Animating image…" : "Generating video…"}
        </span>
        <span className={`${MONO} text-[10px] text-white/20 ml-auto tabular-nums`}>{elapsed}s</span>
      </div>

      <div className="w-full aspect-video rounded-[8px] bg-white/[0.03] flex flex-col items-center justify-center gap-3 overflow-hidden relative">
        <div className="absolute inset-0 animate-pulse bg-gradient-to-br from-white/[0.03] to-transparent" />
        <VideoIcon className="h-10 w-10 text-white/[0.07]" />
        <span className={`${MONO} text-[11px] text-white/[0.15] uppercase tracking-[0.1em]`}>{label}</span>
      </div>

      <div className="space-y-1.5">
        <div className="h-1 rounded-full bg-white/[0.06] overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-1000"
            style={{
              width:      `${pct}%`,
              background: "linear-gradient(90deg, rgba(0,149,255,0.5), rgba(0,149,255,0.2))",
            }}
          />
        </div>
        <p className={`${MONO} text-[10px] text-white/20`}>
          Video generation typically takes 30–90 seconds
        </p>
      </div>
    </div>
  );
}

// ── Video player ──────────────────────────────────────────────────────────────

function VideoPlayer({
  videoUrl,
  duration,
  aspectRatio,
  resolution,
  onDownload,
}: {
  videoUrl:    string;
  duration:    number;
  aspectRatio: string;
  resolution:  string;
  onDownload:  () => void;
}) {
  return (
    <div className={CARD}>
      <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-white/[0.05]">
        <div className="flex items-center gap-2">
          <Film className="h-3.5 w-3.5 text-white/40" />
          <span className={`${MONO} text-[10px] uppercase tracking-[0.12em] text-white/40`}>Video output</span>
        </div>
        <button
          type="button"
          onClick={onDownload}
          className="flex items-center gap-1.5 text-white/25 hover:text-white/55 transition-colors"
          title="Download video"
        >
          <Download className="h-3.5 w-3.5" />
          <span className={`${MONO} text-[10px] uppercase tracking-[0.1em]`}>mp4</span>
        </button>
      </div>

      <div className="p-4">
        {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
        <video
          src={videoUrl}
          controls
          playsInline
          className="w-full rounded-[6px] bg-black"
          style={{ maxHeight: "480px" }}
        />
      </div>

      <div className={`${MONO} flex gap-4 px-5 pb-4 text-[10px] text-white/20 border-t border-white/[0.04] pt-3`}>
        <span>{duration}s</span>
        <span>{aspectRatio}</span>
        <span>{resolution}</span>
        <span>mp4</span>
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
      <FieldLabel>First frame image</FieldLabel>
      {isDataUrl ? (
        <div className="relative rounded-[6px] overflow-hidden border border-white/[0.08] bg-white/[0.02]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={value} alt="First frame" className="w-full max-h-48 object-contain" />
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
        Public URL or uploaded image. The video will animate from this frame.
      </p>
    </div>
  );
}

// ── Service ───────────────────────────────────────────────────────────────────

export function VideoService({
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
        ? models.map((m) => ({
            id:          m.model_id,
            label:       m.display_name,
            tier:        m.tier,
            supportsI2v: m.capabilities?.supports_i2v === true,
            durations:   (m.capabilities?.supported_durations as number[] | undefined) ?? DEFAULT_DURATIONS,
          }))
        : [{ id: FALLBACK_MODEL_ID, label: FALLBACK_MODEL_LABEL, tier: null, supportsI2v: true, durations: DEFAULT_DURATIONS }],
    [models],
  );

  const [modelId, setModelId]         = useState(modelOptions[0]?.id ?? FALLBACK_MODEL_ID);
  const [mode, setMode]               = useState<GenerationMode>("t2v");
  const [prompt, setPrompt]           = useState("");
  const [imageUrl, setImageUrl]       = useState("");
  const [duration, setDuration]       = useState(modelOptions[0]?.durations[0] ?? 5);
  const [aspectRatio, setAspectRatio] = useState("16:9");
  const [resolution, setResolution]   = useState("720p");
  const [videoUrl, setVideoUrl]       = useState<string | null>(null);
  const [elapsed, setElapsed]         = useState(0);
  const [jobStatus, setJobStatus]     = useState<string>("queued");

  const elapsedIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const selectedModel = modelOptions.find((m) => m.id === modelId) ?? modelOptions[0];
  const effectiveMode: GenerationMode =
    mode === "i2v" && !selectedModel?.supportsI2v ? "t2v" : mode;

  const handleModelChange = (id: string) => {
    setModelId(id);
    setVideoUrl(null);
    const m = modelOptions.find((o) => o.id === id);
    if (!m) return;
    if (!m.supportsI2v && mode === "i2v") setMode("t2v");
    // Reset duration to model's first valid option if current is unsupported
    if (!m.durations.includes(duration)) setDuration(m.durations[0] ?? 5);
  };

  // customRun awaits until polling resolves so ServiceShell keeps running=true
  // (and the loading skeleton stays visible) for the full generation window.
  const customRun = useCallback(
    async ({
      apiKey,
      setError,
    }: {
      apiKey:   string;
      setError: (m: string | null) => void;
    }) => {
      if (elapsedIntervalRef.current) {
        clearInterval(elapsedIntervalRef.current);
        elapsedIntervalRef.current = null;
      }
      setVideoUrl(null);
      setElapsed(0);
      setJobStatus("queued");

      elapsedIntervalRef.current = setInterval(
        () => setElapsed((s) => s + 1),
        1_000,
      );

      const stopElapsed = () => {
        if (elapsedIntervalRef.current) {
          clearInterval(elapsedIntervalRef.current);
          elapsedIntervalRef.current = null;
        }
      };

      let jobResp: Response;
      try {
        jobResp = await fetch(`${apiBase}/videos`, {
          method:  "POST",
          headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
          body:    JSON.stringify({
            model:        modelId,
            prompt:       prompt.trim(),
            duration,
            aspect_ratio: aspectRatio,
            resolution,
            ...(effectiveMode === "i2v" && imageUrl.trim()
              ? { image_url: imageUrl.trim() }
              : {}),
          }),
        });
      } catch (err) {
        stopElapsed();
        setError(`Network error: ${err instanceof Error ? err.message : String(err)}`);
        return;
      }

      if (!jobResp.ok) {
        stopElapsed();
        const data = await jobResp.json().catch(() => ({}));
        setError(
          (data as { error?: { message?: string } }).error?.message ?? `Error ${jobResp.status}`,
        );
        return;
      }

      const jobData = (await jobResp.json()) as JobResponse;
      const jobId   = jobData.id;
      setJobStatus(jobData.status);

      if (jobData.status === "completed") {
        stopElapsed();
        try {
          const cr = await fetch(`${apiBase}/videos/${jobId}/content`, { headers: { Authorization: `Bearer ${apiKey}` } });
          if (!cr.ok) throw new Error(`${cr.status}`);
          setVideoUrl(URL.createObjectURL(await cr.blob()));
        } catch {
          setError("Video generated but could not be loaded. Please try again.");
        }
        return;
      }

      // Polling — customRun only returns once we get a terminal status.
      let attempts = 0;
      let consecutiveFails = 0;
      await new Promise<void>((resolve) => {
        const poll = setInterval(async () => {
          attempts += 1;
          if (attempts > POLL_MAX_ATTEMPTS) {
            clearInterval(poll);
            stopElapsed();
            setError("Video generation timed out. Please try again.");
            resolve();
            return;
          }

          let pollResp: Response;
          try {
            pollResp = await fetch(`${apiBase}/videos/${jobId}`, {
              headers: { Authorization: `Bearer ${apiKey}` },
            });
            consecutiveFails = 0;
          } catch {
            consecutiveFails += 1;
            // After 5 consecutive network failures (~40s), stop spinning and tell the user
            if (consecutiveFails >= 5) {
              clearInterval(poll);
              stopElapsed();
              setError("Lost connection to the API. Please refresh and check your job status.");
              resolve();
            }
            return;
          }

          // Non-terminal HTTP errors (502, 503, network hiccup) → skip this attempt
          if (!pollResp.ok && pollResp.status !== 422) return;

          const pollData = await pollResp.json().catch(() => null) as JobResponse | null;
          if (!pollData) return;

          setJobStatus(pollData.status);

          if (pollData.status === "completed") {
            clearInterval(poll);
            stopElapsed();
            try {
              const cr = await fetch(`${apiBase}/videos/${jobId}/content`, { headers: { Authorization: `Bearer ${apiKey}` } });
              if (!cr.ok) throw new Error(`${cr.status}`);
              setVideoUrl(URL.createObjectURL(await cr.blob()));
            } catch {
              setError("Video generated but could not be loaded. Please try again.");
            }
            resolve();
          }

          if (pollData.status === "failed") {
            clearInterval(poll);
            stopElapsed();
            const code = pollData.error?.code;
            setError(
              pollData.error?.message ??
              (code ? `Generation failed (${code}). Please try again.` : "Video generation failed. Please try again."),
            );
            resolve();
          }
        }, POLL_INTERVAL_MS);
      });
    },
    [apiBase, modelId, prompt, duration, aspectRatio, resolution, effectiveMode, imageUrl],
  );

  const handleDownload = useCallback(() => {
    if (!videoUrl) return;
    const a    = document.createElement("a");
    a.href     = videoUrl;
    a.download = "video-gen.mp4";
    a.target   = "_blank";
    a.click();
  }, [videoUrl]);

  const canI2v = selectedModel?.supportsI2v ?? true;

  const canRun =
    prompt.trim().length > 0 &&
    prompt.length <= 4_000 &&
    (effectiveMode === "t2v" || imageUrl.trim().length > 0);

  const codeSnippet =
    effectiveMode === "i2v"
      ? `# Image-to-Video — animate a first frame
curl ${apiBase}/videos \\
  -H "Authorization: Bearer ahu_..." \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "${modelId}",
    "prompt": "${prompt.trim() || "gentle motion, cinematic"}",
    "duration": ${duration},
    "aspect_ratio": "${aspectRatio}",
    "resolution": "${resolution}",
    "image_url": "https://…"
  }'`
      : `# Text-to-Video
curl ${apiBase}/videos \\
  -H "Authorization: Bearer ahu_..." \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "${modelId}",
    "prompt": "${prompt.trim() || "A serene mountain at golden hour"}",
    "duration": ${duration},
    "aspect_ratio": "${aspectRatio}",
    "resolution": "${resolution}"
  }'`;

  return (
    <ServiceShell
      tabBar={tabBar}
      apiBase={apiBase}
      modelId={modelId}
      modelLabel={MODEL_LABEL}
      description="Generate videos from text prompts or animate a first-frame image. Results typically take 30–90 seconds."
      canRun={canRun}
      customRun={customRun}
      runLabel="Generate"
      runningLabel="Generating…"
      renderLoading={
        <VideoLoadingCard elapsed={elapsed} status={jobStatus} mode={effectiveMode} />
      }
      renderForm={
        <>
          {/* Model selector */}
          {modelOptions.length > 1 && (
            <div>
              <FieldLabel>Model</FieldLabel>
              <select
                className={`${INPUT_CLS} appearance-none`}
                value={modelId}
                onChange={(e) => handleModelChange(e.target.value)}
              >
                {modelOptions.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}{m.tier === "pro" ? " · Pro" : ""}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Mode toggle — only shown when the selected model supports i2v */}
          {canI2v && (
            <div>
              <FieldLabel>Mode</FieldLabel>
              <div className="inline-flex rounded-[5px] border border-white/[0.08] bg-white/[0.02] p-0.5 gap-0.5">
                {(["t2v", "i2v"] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setMode(m)}
                    className={`${MONO} h-7 px-3 text-[10px] uppercase tracking-[0.12em] rounded-[4px] transition-colors ${
                      effectiveMode === m
                        ? "bg-[#0095FF]/15 text-white"
                        : "text-white/45 hover:text-white"
                    }`}
                  >
                    {m === "t2v" ? "Text to Video" : "Image to Video"}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* First-frame image (i2v only) */}
          {effectiveMode === "i2v" && (
            <ImageInput value={imageUrl} onChange={setImageUrl} />
          )}

          {/* Prompt */}
          <div>
            <FieldLabel>
              {effectiveMode === "i2v" ? "Motion prompt" : "Prompt"}
            </FieldLabel>
            <textarea
              className={`${TEXTAREA_CLS} h-28`}
              placeholder={
                effectiveMode === "i2v"
                  ? "Describe the motion: gentle waves, clouds drifting, camera slowly pulling back…"
                  : "A cinematic aerial shot of a mountain valley at golden hour, slow drift forward…"
              }
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
            />
            <p className={`${MONO} mt-1 text-[10px] text-white/30`}>{prompt.length} / 4000 chars</p>
          </div>

          {/* Settings row */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <FieldLabel>Duration</FieldLabel>
              <select
                className={`${INPUT_CLS} appearance-none`}
                value={duration}
                onChange={(e) => setDuration(Number(e.target.value))}
              >
                {(selectedModel?.durations ?? DEFAULT_DURATIONS).map((secs) => (
                  <option key={secs} value={secs}>{secs}s</option>
                ))}
              </select>
            </div>

            <div>
              <FieldLabel>Resolution</FieldLabel>
              <select
                className={`${INPUT_CLS} appearance-none`}
                value={resolution}
                onChange={(e) => setResolution(e.target.value)}
              >
                {RESOLUTIONS.map((r) => (
                  <option key={r.value} value={r.value}>{r.label}</option>
                ))}
              </select>
            </div>

            <div>
              <FieldLabel>Aspect ratio</FieldLabel>
              <select
                className={`${INPUT_CLS} appearance-none`}
                value={aspectRatio}
                onChange={(e) => setAspectRatio(e.target.value)}
              >
                {ASPECT_RATIOS.map((a) => (
                  <option key={a.value} value={a.value}>{a.value}</option>
                ))}
              </select>
            </div>
          </div>
        </>
      }
      renderResults={
        videoUrl ? (
          <VideoPlayer
            videoUrl={videoUrl}
            duration={duration}
            aspectRatio={aspectRatio}
            resolution={resolution}
            onDownload={handleDownload}
          />
        ) : null
      }
      usageLabel={videoUrl ? "1 video generated" : null}
      codeSnippet={codeSnippet}
    />
  );
}
