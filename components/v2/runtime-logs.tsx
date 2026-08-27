"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Pause, Play, RefreshCw } from "lucide-react";

/**
 * What the app is printing right now.
 *
 * Build logs answer the first question a customer asks. This answers the one
 * they ask every day afterwards, and it was the last thing in v1's app platform
 * with a working API and no way to reach it.
 *
 * POLLED, NOT STREAMED, and for the same reason the build log is: the API
 * clamps the request, decides whether a crash-looping pod's PREVIOUS container
 * is the interesting one, and explains an empty read. A socket straight from a
 * pod to a browser would route around all of it.
 *
 * FOLLOW STOPS THE MOMENT YOU SCROLL UP. Reading a stack trace while the view
 * yanks itself to the bottom every three seconds is the specific frustration
 * that makes people copy logs out into a text editor.
 */

interface PodLog {
  pod: string;
  previous: boolean;
  lines: string[];
  note: string | null;
}

interface Payload {
  ref: string;
  state: string;
  namespace?: string;
  pods?: PodLog[];
  lines?: string[];
  reason?: string;
}

const REFRESH_MS = 4000;

export function RuntimeLogs({ deploymentRef }: { deploymentRef: string }) {
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [follow, setFollow] = useState(true);
  const boxRef = useRef<HTMLPreElement | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/v2/deployments/${deploymentRef}/runtime-logs?tail=500`, {
        cache: "no-store",
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        // The message from the API, not a generic one. It distinguishes "no
        // pods, this deployment was superseded" from "the cluster is
        // unreachable", and those need different reactions.
        setError(body?.error?.message ?? `Could not read runtime logs (${res.status}).`);
        return;
      }
      setError(null);
      setData(body as Payload);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [deploymentRef]);

  useEffect(() => {
    void load();
    if (!follow) return;
    const id = setInterval(() => void load(), REFRESH_MS);
    return () => clearInterval(id);
  }, [load, follow]);

  useEffect(() => {
    if (!follow || !boxRef.current) return;
    boxRef.current.scrollTop = boxRef.current.scrollHeight;
  }, [data, follow]);

  if (loading && !data) {
    return <p className="text-xs text-white/40">Reading pod output…</p>;
  }

  if (error) {
    return (
      <div className="rounded-lg border border-red-500/25 bg-red-500/[0.06] px-4 py-3">
        <p className="text-sm font-medium text-red-200">Could not read runtime logs.</p>
        <p className="mt-1 text-xs text-red-300/70">{error}</p>
        <button type="button" onClick={() => void load()} className="mt-2 text-xs text-red-200 underline">
          Try again
        </button>
      </div>
    );
  }

  const pods = data?.pods ?? [];

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="font-mono text-[11px] text-white/40">
          {pods.length > 0
            ? `${pods.length} pod${pods.length === 1 ? "" : "s"}`
            : "no pods"}
          {data?.namespace ? ` · ${data.namespace}` : ""}
        </p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setFollow((f) => !f)}
            className="inline-flex items-center gap-1.5 rounded-md border border-white/[0.12] bg-white/[0.04] px-2.5 py-1 text-xs text-white/80 transition-colors hover:bg-white/[0.08]"
          >
            {follow ? <Pause className="h-3 w-3" aria-hidden /> : <Play className="h-3 w-3" aria-hidden />}
            {follow ? "Following" : "Paused"}
          </button>
          <button
            type="button"
            onClick={() => void load()}
            className="inline-flex items-center gap-1.5 rounded-md border border-white/[0.12] bg-white/[0.04] px-2.5 py-1 text-xs text-white/80 transition-colors hover:bg-white/[0.08]"
          >
            <RefreshCw className="h-3 w-3" aria-hidden />
            Refresh
          </button>
        </div>
      </div>

      {/*
        `reason` is the API explaining an empty read — superseded and scaled to
        zero, or not started yet. A blank box with no explanation is what sends
        somebody to support.
      */}
      {pods.length === 0 ? (
        <p className="rounded border border-dashed border-white/[0.09] px-4 py-6 text-center text-xs text-white/40">
          {data?.reason ?? "No output. This deployment has no running pods."}
        </p>
      ) : (
        <div className="space-y-3">
          {pods.map((pod) => (
            <div key={pod.pod}>
              <div className="mb-1 flex flex-wrap items-baseline gap-2">
                <span className="font-mono text-[11px] text-white/60">{pod.pod}</span>
                {pod.previous ? (
                  // Worth saying loudly: these lines are from the container that
                  // DIED, which is the only place the reason for a crash loop is.
                  <span className="rounded border border-amber-500/25 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-300">
                    previous container
                  </span>
                ) : null}
              </div>
              {pod.note ? <p className="mb-1 text-[11px] text-white/40">{pod.note}</p> : null}
              {pod.lines.length > 0 ? (
                <pre
                  ref={boxRef}
                  onScroll={(e) => {
                    // Stop following the moment the reader scrolls away from the
                    // bottom. Yanking the view down mid stack-trace is what makes
                    // people paste logs into a text editor instead.
                    const el = e.currentTarget;
                    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 24;
                    if (!atBottom && follow) setFollow(false);
                  }}
                  className="max-h-[420px] overflow-auto rounded border border-white/[0.07] bg-black/40 p-3 font-mono text-[11.5px] leading-[1.6] text-white/75"
                >
                  {pod.lines.join("\n")}
                </pre>
              ) : (
                <p className="rounded border border-dashed border-white/[0.09] px-3 py-4 text-center text-[11px] text-white/30">
                  No output yet.
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
