"use client";

import { useState, useCallback, useMemo, useRef } from "react";
import { Download, Film, VideoIcon } from "lucide-react";
import { CARD, FieldLabel, INPUT_CLS, ServiceShell, TEXTAREA_CLS } from "./_shell";
import { MONO } from "@/components/dashboard/inference/chrome";
import type { ServiceModel } from "@/components/dashboard/inference/playground";

const FALLBACK_MODEL_ID    = "ahura/video-gen";
const FALLBACK_MODEL_LABEL = "Video Gen";
const MODEL_LABEL          = "Video";

const DURATIONS     = [{ value: 5, label: "5s" }, { value: 8, label: "8s" }, { value: 15, label: "15s" }];
const ASPECT_RATIOS = [{ value: "16:9", label: "16:9 — Landscape" }, { value: "9:16", label: "9:16 — Portrait" }, { value: "1:1", label: "1:1 — Square" }];
const RESOLUTIONS   = [{ value: "480p", label: "480p" }, { value: "720p", label: "720p" }, { value: "1080p", label: "1080p" }];

const POLL_INTERVAL_MS = 5000;
const POLL_MAX_ATTEMPTS = 120; // 10 min @ 5 s

interface JobResponse {
  id: string;
  status: "queued" | "running" | "completed" | "failed";
  output_url?: string;
  data?: Array<{ url: string }>;
  error?: { code?: string; message?: string };
}

// ── Loading skeleton ──────────────────────────────────────────────────────────

function VideoLoadingCard({ elapsed, status }: { elapsed: number; status: string }) {
  const pct = Math.min((elapsed / 90) * 100, 95);
  const label =
    status === "queued"  ? "Queued…" :
    elapsed < 10         ? "Starting render…" :
    elapsed < 40         ? "Rendering frames…" :
                           "Almost done…";
  return (
    <div className={`${CARD} p-5 space-y-4`}>
      <div className="flex items-center gap-2">
        <Film className="h-3.5 w-3.5 text-white/20" />
        <span className={`${MONO} text-[10px] uppercase tracking-[0.12em] text-white/25`}>
          Generating video…
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
              width: `${pct}%`,
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
  videoUrl: string;
  duration: number;
  aspectRatio: string;
  resolution: string;
  onDownload: () => void;
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

// ── Service ───────────────────────────────────────────────────────────────────

export function VideoService({
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

  const [modelId, setModelId]         = useState(modelOptions[0]?.id ?? FALLBACK_MODEL_ID);
  const [prompt, setPrompt]           = useState("");
  const [duration, setDuration]       = useState(8);
  const [aspectRatio, setAspectRatio] = useState("16:9");
  const [resolution, setResolution]   = useState("720p");
  const [videoUrl, setVideoUrl]       = useState<string | null>(null);
  const [elapsed, setElapsed]         = useState(0);
  const [jobStatus, setJobStatus]     = useState<string>("queued");

  const elapsedIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollIntervalRef    = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollCountRef       = useRef(0);

  const stopTimers = useCallback(() => {
    if (elapsedIntervalRef.current) { clearInterval(elapsedIntervalRef.current); elapsedIntervalRef.current = null; }
    if (pollIntervalRef.current)    { clearInterval(pollIntervalRef.current);    pollIntervalRef.current    = null; }
  }, []);

  const customRun = useCallback(async ({
    apiKey,
    setError,
  }: {
    apiKey: string;
    setError: (m: string | null) => void;
  }) => {
    stopTimers();
    setVideoUrl(null);
    setElapsed(0);
    setJobStatus("queued");
    pollCountRef.current = 0;

    // Start elapsed counter
    elapsedIntervalRef.current = setInterval(() => setElapsed((s) => s + 1), 1000);

    // POST /v1/videos — creates async job, returns 202 { id, status }
    let jobResp: Response;
    try {
      jobResp = await fetch(`${apiBase}/videos`, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model: modelId, prompt: prompt.trim(), duration, aspect_ratio: aspectRatio, resolution }),
      });
    } catch (err) {
      stopTimers();
      setError(`Network error: ${err instanceof Error ? err.message : String(err)}`);
      return;
    }

    if (!jobResp.ok) {
      stopTimers();
      const data = await jobResp.json().catch(() => ({}));
      setError((data as { error?: { message?: string } }).error?.message ?? `Error ${jobResp.status}`);
      return;
    }

    const jobData = (await jobResp.json()) as JobResponse;
    const jobId = jobData.id;
    setJobStatus(jobData.status);

    // If the job somehow completed synchronously (edge case)
    if (jobData.status === "completed") {
      stopTimers();
      const url = jobData.output_url ?? jobData.data?.[0]?.url ?? null;
      if (url) { setVideoUrl(url); return; }
      setError("Video generation returned no output. Please try again.");
      return;
    }

    // Poll GET /v1/videos/:id every POLL_INTERVAL_MS
    pollIntervalRef.current = setInterval(async () => {
      pollCountRef.current += 1;
      if (pollCountRef.current > POLL_MAX_ATTEMPTS) {
        stopTimers();
        setError("Video generation timed out. Please try again.");
        return;
      }

      let pollResp: Response;
      try {
        pollResp = await fetch(`${apiBase}/videos/${jobId}`, {
          headers: { Authorization: `Bearer ${apiKey}` },
        });
      } catch {
        // Network hiccup — keep polling
        return;
      }

      if (!pollResp.ok) {
        stopTimers();
        const data = await pollResp.json().catch(() => ({}));
        setError((data as { error?: { message?: string } }).error?.message ?? `Poll error ${pollResp.status}`);
        return;
      }

      const pollData = (await pollResp.json()) as JobResponse;
      setJobStatus(pollData.status);

      if (pollData.status === "completed") {
        stopTimers();
        const url = pollData.output_url ?? pollData.data?.[0]?.url ?? null;
        if (url) { setVideoUrl(url); return; }
        setError("Video generation returned no output. Please try again.");
      }

      if (pollData.status === "failed") {
        stopTimers();
        setError(pollData.error?.message ?? "Video generation failed. Please try again.");
      }
    }, POLL_INTERVAL_MS);
  }, [apiBase, modelId, prompt, duration, aspectRatio, resolution, stopTimers]);

  const handleDownload = useCallback(() => {
    if (!videoUrl) return;
    const a    = document.createElement("a");
    a.href     = videoUrl;
    a.download = "video-gen.mp4";
    a.target   = "_blank";
    a.click();
  }, [videoUrl]);

  const codeSnippet = `# Step 1 — Submit job
curl ${apiBase}/videos \\
  -H "Authorization: Bearer ahu_..." \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "${modelId}",
    "prompt": "A serene mountain landscape at golden hour",
    "duration": ${duration},
    "aspect_ratio": "${aspectRatio}",
    "resolution": "${resolution}"
  }'

# Step 2 — Poll status until "completed"
curl ${apiBase}/videos/<job_id> \\
  -H "Authorization: Bearer ahu_..."`;

  return (
    <ServiceShell
      tabBar={tabBar}
      apiBase={apiBase}
      modelId={modelId}
      modelLabel={MODEL_LABEL}
      description="Generate short videos from text prompts. Results typically take 30–90 seconds."
      canRun={prompt.trim().length > 0 && prompt.length <= 4000}
      customRun={customRun}
      runLabel="Generate"
      runningLabel="Generating…"
      renderLoading={<VideoLoadingCard elapsed={elapsed} status={jobStatus} />}
      renderForm={
        <>
          {modelOptions.length > 1 && (
            <div>
              <FieldLabel>Model</FieldLabel>
              <select
                className={`${INPUT_CLS} appearance-none`}
                value={modelId}
                onChange={(e) => { setModelId(e.target.value); setVideoUrl(null); }}
              >
                {modelOptions.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}{m.tier === "pro" ? " · Pro" : ""}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div>
            <FieldLabel>Prompt</FieldLabel>
            <textarea
              className={`${TEXTAREA_CLS} h-32`}
              placeholder="A cinematic aerial shot of a mountain valley at golden hour, slow drift forward…"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
            />
            <p className={`${MONO} mt-1 text-[10px] text-white/30`}>{prompt.length} / 4000 chars</p>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <FieldLabel>Duration</FieldLabel>
              <select
                className={`${INPUT_CLS} appearance-none`}
                value={duration}
                onChange={(e) => setDuration(Number(e.target.value))}
              >
                {DURATIONS.map((d) => (
                  <option key={d.value} value={d.value}>{d.label}</option>
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
        videoUrl
          ? <VideoPlayer
              videoUrl={videoUrl}
              duration={duration}
              aspectRatio={aspectRatio}
              resolution={resolution}
              onDownload={handleDownload}
            />
          : null
      }
      usageLabel={videoUrl ? "1 video generated" : null}
      codeSnippet={codeSnippet}
    />
  );
}
