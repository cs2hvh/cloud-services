"use client";

import { motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import {
  CheckCircle2,
  Cloud,
  Container as ContainerIcon,
  Cpu,
  Terminal,
  Timer,
} from "lucide-react";

import { Container } from "@/components/ui/container";

export default function FineTuningServingSection() {
  const ref = useRef<HTMLDivElement | null>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    if (!ref.current || inView) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) setInView(true);
      },
      { threshold: 0.12 }
    );
    obs.observe(ref.current);
    return () => obs.disconnect();
  }, [inView]);

  return (
    <section
      ref={ref}
      className="relative isolate overflow-hidden bg-[#0E0F0F] py-24 sm:py-32"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.20]"
        style={{
          background:
            "radial-gradient(50% 50% at 20% 50%, rgba(34,197,94,0.15), transparent 70%), radial-gradient(50% 50% at 80% 50%, rgba(0,149,255,0.18), transparent 70%)",
        }}
      />

      <Container className="relative z-10">
        <div className="mx-auto max-w-3xl text-center">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/45">
            Serving
          </p>
          <h2 className="mt-4 text-3xl font-[400] leading-[1.05] tracking-tight text-white sm:text-4xl lg:text-[3.4rem]">
            Two paths to{" "}
            <span className="text-[#8ecaff]">production.</span>
          </h2>
          <p className="mt-5 text-[15px] leading-7 text-white/55 sm:text-[16px]">
            Pick what fits the workload. Switch any time — your adapter stays the same.
          </p>
        </div>

        <div className="mt-16 grid gap-4 lg:grid-cols-2">
          {/* ─── LEFT — Self-serve docker ──────────────────────── */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={inView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
            className="group relative overflow-hidden rounded-[10px] border border-white/[0.08] bg-white/[0.015] p-7 transition-colors hover:border-white/[0.18]"
          >
            {/* Top emerald accent — signals "free path" */}
            <span
              aria-hidden
              className="pointer-events-none absolute inset-x-0 top-0 h-[2px]"
              style={{
                background:
                  "linear-gradient(90deg, transparent, rgba(74,222,128,0.7), transparent)",
                boxShadow: "0 0 18px rgba(34,197,94,0.4)",
              }}
            />

            <div className="flex items-start justify-between">
              <div className="flex h-10 w-10 items-center justify-center rounded-[6px] border border-emerald-400/30 bg-emerald-400/[0.08] text-emerald-300">
                <ContainerIcon className="h-4 w-4" strokeWidth={1.75} />
              </div>
              <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-emerald-300/85">
                Free · BYO GPU
              </span>
            </div>

            <h3 className="mt-5 text-[20px] font-semibold leading-tight tracking-tight text-white">
              Self-serve docker
            </h3>
            <p className="mt-2 text-[13px] leading-relaxed text-white/55">
              We pack your adapter into a 6-hour signed URL and a ready-to-paste docker command. Run it on any GPU pod you control — ours, yours, your laptop.
            </p>

            {/* Code preview */}
            <div className="mt-5 overflow-hidden rounded-[6px] border border-white/[0.06] bg-black/40">
              <div className="flex items-center gap-1.5 border-b border-white/[0.04] px-3 py-1.5">
                <Terminal className="h-3 w-3 text-white/40" />
                <span className="text-[10px] uppercase tracking-[0.14em] text-white/35">
                  copy &amp; paste
                </span>
              </div>
              <pre className="px-4 py-3 font-mono text-[11px] leading-relaxed text-white/80">
{`docker run --gpus all -p 8000:8000 \\
  -e BASE_MODEL="phi-4" \\
  -e ADAPTER_DOWNLOAD_URL=<presigned> \\
  ghcr.io/ahuracloud/serving-vllm:latest`}
              </pre>
            </div>

            <ul className="mt-6 space-y-2">
              {[
                "vLLM with --enable-lora, OpenAI-compatible on :8000",
                "First boot ~60s; subsequent requests 1-2s",
                "6-hour adapter URL; mint a fresh one any time",
                "No R2 credentials leave AhuraCloud",
              ].map((b) => (
                <li key={b} className="flex items-start gap-2 text-[12.5px] leading-relaxed text-white/65">
                  <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-400/80" />
                  <span>{b}</span>
                </li>
              ))}
            </ul>
          </motion.div>

          {/* ─── RIGHT — Managed hosted serving ────────────────── */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={inView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1], delay: 0.1 }}
            className="group relative overflow-hidden rounded-[10px] border border-[#33adff]/30 bg-[#0095FF]/[0.04] p-7 transition-colors hover:border-[#33adff]/60"
          >
            {/* Top brand accent — signals "premium path" */}
            <span
              aria-hidden
              className="pointer-events-none absolute inset-x-0 top-0 h-[2px]"
              style={{
                background:
                  "linear-gradient(90deg, transparent, rgba(51,173,255,0.85), transparent)",
                boxShadow: "0 0 18px rgba(0,149,255,0.55)",
              }}
            />

            <div className="flex items-start justify-between">
              <div className="flex h-10 w-10 items-center justify-center rounded-[6px] border border-[#33adff]/40 bg-[#0095FF]/[0.12] text-[#33adff]">
                <Cloud className="h-4 w-4" strokeWidth={1.75} />
              </div>
              <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-[#33adff]">
                Per-hour · Managed
              </span>
            </div>

            <h3 className="mt-5 text-[20px] font-semibold leading-tight tracking-tight text-white">
              Managed hosted serving
            </h3>
            <p className="mt-2 text-[13px] leading-relaxed text-white/55">
              One click. We provision a dedicated GPU instance, route it through the same gateway as the rest of inference. Pay per second, auto-stops when idle.
            </p>

            {/* Call-the-model preview */}
            <div className="mt-5 overflow-hidden rounded-[6px] border border-white/[0.06] bg-black/40">
              <div className="flex items-center gap-1.5 border-b border-white/[0.04] px-3 py-1.5">
                <Terminal className="h-3 w-3 text-white/40" />
                <span className="text-[10px] uppercase tracking-[0.14em] text-white/35">
                  call your fine-tune
                </span>
              </div>
              <pre className="px-4 py-3 font-mono text-[11px] leading-relaxed text-white/80">
{`curl https://api.cs2hvh.com/v1/chat/completions \\
  -H "Authorization: Bearer $AHURA_API_KEY" \\
  -d '{"model": "ahura/phi-4:ft-a1b2c3d4",
       "messages": [...]}'`}
              </pre>
            </div>

            <ul className="mt-6 space-y-2">
              {[
                "Dedicated GPU — never shared with another customer",
                "Pick the SKU (A40 / A100 / H100), billed per second",
                "Auto-stop after your configured idle window",
                "Cold-start returns 503 + Retry-After; SDK auto-retries",
              ].map((b) => (
                <li key={b} className="flex items-start gap-2 text-[12.5px] leading-relaxed text-white/65">
                  <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#33adff]" />
                  <span>{b}</span>
                </li>
              ))}
            </ul>

            {/* Sub-rail metrics */}
            <div className="mt-6 grid grid-cols-3 gap-3 border-t border-white/[0.06] pt-5">
              <div>
                <p className="font-mono text-[9.5px] uppercase tracking-[0.14em] text-white/40">
                  Starts at
                </p>
                <p className="mt-1 font-mono text-[14px] font-semibold text-white tabular-nums">
                  $0.40/hr
                </p>
              </div>
              <div>
                <p className="font-mono text-[9.5px] uppercase tracking-[0.14em] text-white/40">
                  Cold start
                </p>
                <p className="mt-1 font-mono text-[14px] font-semibold text-white tabular-nums">
                  ~60s
                </p>
              </div>
              <div>
                <p className="font-mono text-[9.5px] uppercase tracking-[0.14em] text-white/40">
                  Auto-stop
                </p>
                <p className="mt-1 font-mono text-[14px] font-semibold text-white tabular-nums">
                  6h idle
                </p>
              </div>
            </div>
          </motion.div>
        </div>

        {/* Footer signal */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={inView ? { opacity: 1 } : {}}
          transition={{ duration: 0.5, delay: 0.6 }}
          className="mt-10 flex flex-wrap items-center justify-center gap-x-8 gap-y-2 font-mono text-[10.5px] uppercase tracking-[0.14em] text-white/40"
        >
          <span className="inline-flex items-center gap-1.5">
            <Cpu className="h-3.5 w-3.5 text-white/40" />
            Same adapter, both paths
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Timer className="h-3.5 w-3.5 text-white/40" />
            Switch any time
          </span>
        </motion.div>
      </Container>
    </section>
  );
}
