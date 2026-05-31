"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";

import { Container } from "@/components/ui/container";

// ────────────────────────────────────────────────────────────────────
// Model Training Pipeline — port of the standalone HTML/CSS/JS in
// /public/new-ai-section/Model Training Flow.html.
//
// Faithful reproduction of all 7 cards, the Ready/Diamond tail, the
// SVG flow lines, and the traveling orb animation. The original used
// scroll-hijacking (1 step per wheel gesture); on the homepage that
// fights normal scroll, so this version auto-plays the full sequence
// once when the section enters the viewport.
// ────────────────────────────────────────────────────────────────────

type FeatureTone = "blue" | "alt" | "warn";

type CardData = {
  id: string;
  step: string;
  icon: string;
  title: string;
  sub: string;
  features: Array<{
    tone: FeatureTone;
    title: string;
    sub: string;
    iconSvg: React.ReactNode;
  }>;
};

const ICON_ROOT = "/new-ai-section/icons";

const PHASE_1: CardData[] = [
  {
    id: "c1",
    step: "Step 01",
    icon: `${ICON_ROOT}/01-data-collection.png`,
    title: "Data Collection",
    sub: "Gather raw text from varied sources",
    features: [
      {
        tone: "blue",
        title: "Multi-Source",
        sub: "Text · Web · APIs",
        iconSvg: (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2l9 5-9 5-9-5 9-5z" /><path d="M3 12l9 5 9-5" /><path d="M3 17l9 5 9-5" /></svg>
        ),
      },
      {
        tone: "alt",
        title: "Real-Time",
        sub: "Streaming ingest",
        iconSvg: (
          <svg viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M13 2L3 14h7l-1 8 10-12h-7l1-8z" /></svg>
        ),
      },
    ],
  },
  {
    id: "c2",
    step: "Step 02",
    icon: `${ICON_ROOT}/02-preprocessing.png`,
    title: "Data Cleaning",
    sub: "Strip noise, duplicates, and PII",
    features: [
      {
        tone: "blue",
        title: "Noise Removal",
        sub: "Dedup · Filter",
        iconSvg: (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round"><path d="M3 5h18l-7 9v6l-4-2v-4z" /></svg>
        ),
      },
      {
        tone: "warn",
        title: "PII-Safe",
        sub: "GDPR compliant",
        iconSvg: (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2l8 4v6c0 5-3.5 9-8 10-4.5-1-8-5-8-10V6z" /><path d="M9 12l2 2 4-4" /></svg>
        ),
      },
    ],
  },
  {
    id: "c3",
    step: "Step 03",
    icon: `${ICON_ROOT}/03-feature-engineering.png`,
    title: "Tokenization",
    sub: "Encode text into model tokens",
    features: [
      {
        tone: "blue",
        title: "BPE Encoding",
        sub: "Subword tokens",
        iconSvg: (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round"><polyline points="16 18 22 12 16 6" /><polyline points="8 6 2 12 8 18" /></svg>
        ),
      },
      {
        tone: "alt",
        title: "50k+ Vocab",
        sub: "Multilingual",
        iconSvg: (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round"><line x1="4" y1="9" x2="20" y2="9" /><line x1="4" y1="15" x2="20" y2="15" /><line x1="10" y1="3" x2="8" y2="21" /><line x1="16" y1="3" x2="14" y2="21" /></svg>
        ),
      },
    ],
  },
];

const PHASE_2: CardData[] = [
  {
    id: "c4",
    step: "Step 04",
    icon: `${ICON_ROOT}/04-architecture-selection.png`,
    title: "Architecture Selection",
    sub: "Pick the right model design",
    features: [
      {
        tone: "blue",
        title: "Transformer",
        sub: "Decoder stack",
        iconSvg: (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round"><rect x="5" y="5" width="14" height="14" rx="2" /><rect x="9" y="9" width="6" height="6" /><path d="M3 9h2M3 15h2M19 9h2M19 15h2M9 3v2M15 3v2M9 19v2M15 19v2" /></svg>
        ),
      },
      {
        tone: "warn",
        title: "Configurable",
        sub: "Layers · Heads",
        iconSvg: (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round"><line x1="4" y1="21" x2="4" y2="14" /><line x1="4" y1="10" x2="4" y2="3" /><line x1="12" y1="21" x2="12" y2="12" /><line x1="12" y1="8" x2="12" y2="3" /><line x1="20" y1="21" x2="20" y2="16" /><line x1="20" y1="12" x2="20" y2="3" /><circle cx="4" cy="12" r="2" /><circle cx="12" cy="10" r="2" /><circle cx="20" cy="14" r="2" /></svg>
        ),
      },
    ],
  },
  {
    id: "c5",
    step: "Step 05",
    icon: `${ICON_ROOT}/05-training-env.png`,
    title: "Training Environment",
    sub: "Provision GPUs and data pipelines",
    features: [
      {
        tone: "blue",
        title: "GPU Cluster",
        sub: "H100 · A100",
        iconSvg: (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="4" width="16" height="16" rx="2" /><path d="M9 9h6v6H9z" fill="currentColor" /><path d="M9 1v3M15 1v3M9 20v3M15 20v3M1 9h3M1 15h3M20 9h3M20 15h3" /></svg>
        ),
      },
      {
        tone: "alt",
        title: "Distributed",
        sub: "Multi-node",
        iconSvg: (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="2" /><circle cx="4" cy="6" r="2" /><circle cx="20" cy="6" r="2" /><circle cx="4" cy="18" r="2" /><circle cx="20" cy="18" r="2" /><path d="M6 6L10 11M18 6L14 11M6 18L10 13M18 18L14 13" /></svg>
        ),
      },
    ],
  },
  {
    id: "c6",
    step: "Step 06",
    icon: `${ICON_ROOT}/06-training-monitoring.png`,
    title: "Training Monitoring",
    sub: "Track loss, gradients, and metrics",
    features: [
      {
        tone: "blue",
        title: "Loss Tracking",
        sub: "Per-step metrics",
        iconSvg: (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3v18h18" /><path d="M7 14l4-4 3 3 5-6" /></svg>
        ),
      },
      {
        tone: "alt",
        title: "Live Dashboard",
        sub: "Real-time",
        iconSvg: (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12h4l3-8 4 16 3-8h4" /></svg>
        ),
      },
    ],
  },
  {
    id: "c7",
    step: "Step 07",
    icon: `${ICON_ROOT}/07-fine-tuning.png`,
    title: "Fine-Tuning",
    sub: "Refine on task-specific data",
    features: [
      {
        tone: "blue",
        title: "LoRA Adapters",
        sub: "Param-efficient",
        iconSvg: (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.6 1.6 0 0 0 .3 1.7l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.7-.3 1.6 1.6 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.6 1.6 0 0 0-1-1.5 1.6 1.6 0 0 0-1.7.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.7 1.6 1.6 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.6 1.6 0 0 0 1.5-1 1.6 1.6 0 0 0-.3-1.7l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.7.3h0a1.6 1.6 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.7-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.7v0a1.6 1.6 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z" /></svg>
        ),
      },
      {
        tone: "warn",
        title: "Task-Specific",
        sub: "Domain tuning",
        iconSvg: (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none" /></svg>
        ),
      },
    ],
  },
];

type EdgeKind = "h" | "c3-to-d" | "d-to-r" | "r-to-c4";
type Edge = { from: string; to: string; kind: EdgeKind };

const EDGES: Edge[] = [
  { from: "c1", to: "c2", kind: "h" },
  { from: "c2", to: "c3", kind: "h" },
  { from: "c3", to: "diamond", kind: "c3-to-d" },
  { from: "diamond", to: "ready", kind: "d-to-r" },
  { from: "ready", to: "c4", kind: "r-to-c4" },
  { from: "c4", to: "c5", kind: "h" },
  { from: "c5", to: "c6", kind: "h" },
  { from: "c6", to: "c7", kind: "h" },
];

type Rect = {
  cx: number;
  cy: number;
  left: number;
  right: number;
  top: number;
  bot: number;
  w: number;
  h: number;
};

function easeInOut(t: number) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function buildPath(spec: Edge, R: Record<string, Rect>): string {
  const a = R[spec.from];
  const b = R[spec.to];
  if (!a || !b) return "";

  if (spec.kind === "h") {
    const y = (a.cy + b.cy) / 2;
    return `M ${a.right + 1} ${y} L ${b.left - 8} ${y}`;
  }
  if (spec.kind === "c3-to-d") {
    const sx = a.cx;
    const sy = a.bot + 1;
    const ex = b.cx;
    const ey = b.top + 2;
    const midY = sy + Math.max(18, (ey - sy) * 0.55);
    return `M ${sx} ${sy} L ${sx} ${midY} L ${ex} ${midY} L ${ex} ${ey}`;
  }
  if (spec.kind === "d-to-r") {
    const y = (a.cy + b.cy) / 2;
    const sx = a.left + 4;
    const ex = b.right + 2;
    return `M ${sx} ${y} L ${ex} ${y}`;
  }
  if (spec.kind === "r-to-c4") {
    const sx = a.cx;
    const sy = a.bot - 2;
    const ex = b.cx;
    const ey = b.top + 2;
    const c1y = sy + (ey - sy) * 0.45;
    const c2y = ey - (ey - sy) * 0.45;
    return `M ${sx} ${sy} C ${sx} ${c1y}, ${ex} ${c2y}, ${ex} ${ey}`;
  }
  return "";
}

export function ModelTrainingPipelineSection() {
  const sectionRef = useRef<HTMLDivElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const nodeRefs = useRef<Record<string, HTMLElement | null>>({});
  const setRef = (id: string) => (el: HTMLElement | null) => {
    nodeRefs.current[id] = el;
  };

  const [revealed, setRevealed] = useState<Set<string>>(new Set());
  const [paths, setPaths] = useState<Record<string, { d: string; len: number }>>({});
  const [stageHeight, setStageHeight] = useState(0);
  const [stageWidth, setStageWidth] = useState(0);

  // pathsRef mirrors `paths` so animation callbacks always read the latest
  // path data without being recreated (and without re-binding the observer).
  const pathsRef = useRef<Record<string, { d: string; len: number }>>({});

  const arrowRefs = useRef<Record<string, SVGPathElement | null>>({});
  const glowRefs = useRef<Record<string, SVGPathElement | null>>({});
  const orbRef = useRef<SVGCircleElement | null>(null);
  const orbCoreRef = useRef<SVGCircleElement | null>(null);
  const animRef = useRef<number | null>(null);
  const playedRef = useRef(false);

  // Measure all nodes and rebuild edge paths
  const measure = useCallback(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const sb = stage.getBoundingClientRect();
    setStageHeight(sb.height + 40);
    setStageWidth(sb.width);

    const R: Record<string, Rect> = {};
    Object.entries(nodeRefs.current).forEach(([id, el]) => {
      if (!el) return;
      const r = el.getBoundingClientRect();
      R[id] = {
        cx: r.left - sb.left + r.width / 2,
        cy: r.top - sb.top + r.height / 2,
        left: r.left - sb.left,
        right: r.left - sb.left + r.width,
        top: r.top - sb.top,
        bot: r.top - sb.top + r.height,
        w: r.width,
        h: r.height,
      };
    });

    const next: Record<string, { d: string; len: number }> = {};
    EDGES.forEach((e) => {
      const d = buildPath(e, R);
      next[`${e.from}-${e.to}`] = { d, len: 0 };
    });
    pathsRef.current = next;
    setPaths(next);
  }, []);

  useEffect(() => {
    measure();
    const ro = new ResizeObserver(() => measure());
    if (stageRef.current) ro.observe(stageRef.current);
    window.addEventListener("resize", measure);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [measure]);

  // After paths render, compute their lengths and prime the dasharray.
  // We update both the React state (so re-renders see the latest len) and the
  // ref (so the animation callbacks read the latest len without closures).
  useEffect(() => {
    const next = { ...paths };
    let changed = false;
    EDGES.forEach((e) => {
      const key = `${e.from}-${e.to}`;
      const el = arrowRefs.current[key];
      if (el && next[key]?.d) {
        const len = el.getTotalLength();
        if (next[key].len !== len) {
          next[key] = { ...next[key], len };
          changed = true;
          el.style.strokeDasharray = String(len);
          el.style.strokeDashoffset = String(len);
          const glow = glowRefs.current[key];
          if (glow) {
            glow.style.strokeDasharray = `0 ${len + 10}`;
            glow.style.strokeDashoffset = "0";
            glow.style.opacity = "0";
          }
        }
      }
    });
    if (changed) {
      pathsRef.current = next;
      setPaths(next);
    }
  }, [paths]);

  // Helpers for the animation
  const moveOrb = useCallback((x: number, y: number, opacity: number) => {
    if (orbRef.current) {
      orbRef.current.setAttribute("cx", String(x));
      orbRef.current.setAttribute("cy", String(y));
      orbRef.current.style.opacity = String(opacity);
    }
    if (orbCoreRef.current) {
      orbCoreRef.current.setAttribute("cx", String(x));
      orbCoreRef.current.setAttribute("cy", String(y));
      orbCoreRef.current.style.opacity = String(opacity * 0.95);
    }
  }, []);

  const playEdge = useCallback((edge: Edge): Promise<void> => {
    return new Promise((resolve) => {
      const key = `${edge.from}-${edge.to}`;
      const arrow = arrowRefs.current[key];
      const glow = glowRefs.current[key];
      const meta = pathsRef.current[key];
      if (!arrow || !meta || meta.len === 0) {
        resolve();
        return;
      }
      const len = meta.len;
      const dur = Math.max(700, Math.min(2200, len * 0.55));
      let start: number | null = null;

      const frame = (now: number) => {
        if (start === null) start = now;
        const tRaw = Math.min(1, (now - start) / dur);
        const t = easeInOut(tRaw);
        const head = len * t;

        arrow.style.transition = "none";
        arrow.style.strokeDashoffset = String(len - head);

        if (glow) {
          const trailLen = Math.min(len * 0.45, 75);
          const tail = Math.max(0, head - trailLen);
          const visible = head - tail;
          glow.style.opacity = "1";
          glow.setAttribute(
            "stroke-dasharray",
            `0 ${tail} ${visible} ${Math.max(0, len - head + 10)}`
          );
          glow.setAttribute("stroke-dashoffset", "0");
        }

        const pt = arrow.getPointAtLength(head);
        const visEnv = Math.sin(Math.min(Math.PI, tRaw * Math.PI));
        moveOrb(pt.x, pt.y, 0.9 + 0.1 * visEnv);

        if (tRaw > 0.7) {
          setRevealed((prev) => {
            if (prev.has(edge.to)) return prev;
            const next = new Set(prev);
            next.add(edge.to);
            return next;
          });
        }

        if (tRaw >= 1) {
          arrow.style.strokeDashoffset = "0";
          arrow.setAttribute("marker-end", "url(#mt-arrow-head)");
          if (glow) {
            glow.style.transition = "opacity 0.4s ease";
            glow.style.opacity = "0";
          }
          resolve();
        } else {
          animRef.current = requestAnimationFrame(frame);
        }
      };
      animRef.current = requestAnimationFrame(frame);
    });
  }, [moveOrb]);

  // Wait until every edge has a measured length (the length-priming effect
  // has run). Polls pathsRef so the loop always sees the latest values.
  const waitForPathsReady = useCallback(async (): Promise<boolean> => {
    for (let attempt = 0; attempt < 40; attempt++) {
      const ready = EDGES.every((e) => {
        const meta = pathsRef.current[`${e.from}-${e.to}`];
        return !!meta && meta.len > 0;
      });
      if (ready) return true;
      await new Promise((r) => setTimeout(r, 60));
    }
    return false;
  }, []);

  // Auto-play sequence when in view. Deps intentionally stable so the
  // observer is only created once (it would otherwise tear down/rebuild on
  // every paths update and risk re-firing or missing the trigger).
  useEffect(() => {
    if (!sectionRef.current) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && !playedRef.current) {
          playedRef.current = true;
          // Force a fresh measure on entry so positions reflect any layout
          // shifts since mount.
          measure();
          setTimeout(async () => {
            // Reveal c1 first
            setRevealed(new Set(["c1"]));
            // Place orb at c1
            const c1 = nodeRefs.current["c1"];
            const stage = stageRef.current;
            if (c1 && stage) {
              const sb = stage.getBoundingClientRect();
              const r = c1.getBoundingClientRect();
              moveOrb(
                r.left - sb.left + r.width / 2,
                r.top - sb.top + r.height / 2,
                0.9
              );
            }
            // Make sure the SVG path lengths have been primed before we start
            // traversing them — otherwise every edge skips with len=0.
            await waitForPathsReady();
            await new Promise((r) => setTimeout(r, 500));
            for (const edge of EDGES) {
              await playEdge(edge);
              await new Promise((r) => setTimeout(r, 180));
            }
            // Keep the orb glowing at the final node (c7) instead of
            // fading — anchors the eye to the pipeline's destination.
            const c7 = nodeRefs.current["c7"];
            const stage2 = stageRef.current;
            if (c7 && stage2 && orbRef.current) {
              const sb = stage2.getBoundingClientRect();
              const r = c7.getBoundingClientRect();
              moveOrb(
                r.left - sb.left + r.width / 2,
                r.top - sb.top + r.height / 2,
                0.85
              );
              orbRef.current.classList.add("mt-orb-resting");
            }
          }, 350);
        }
      },
      { threshold: 0.15 }
    );
    obs.observe(sectionRef.current);
    return () => obs.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current);
    };
  }, []);

  return (
    <section
      ref={sectionRef}
      className="mt-pipeline relative z-10 overflow-clip py-20 lg:py-28"
    >
      {/* Section top divider — homepage convention */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[60%] h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />

      {/* Background — very minimal: solid black + one soft brand-blue
          wash at the top + a faint dot grid */}
      <div className="absolute inset-0 -z-10">
        <div className="absolute inset-0 bg-black" />
        <div
          aria-hidden
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(60% 35% at 50% 0%, rgba(51,173,255,0.08), transparent 70%)",
          }}
        />
        <div
          aria-hidden
          className="absolute inset-0 opacity-[0.035]"
          style={{
            backgroundImage:
              "radial-gradient(rgba(255,255,255,0.5) 1px, transparent 1px)",
            backgroundSize: "32px 32px",
            maskImage:
              "radial-gradient(ellipse 70% 50% at 50% 50%, black, transparent 85%)",
            WebkitMaskImage:
              "radial-gradient(ellipse 70% 50% at 50% 50%, black, transparent 85%)",
          }}
        />
      </div>

      <Container className="relative z-10">
        {/* Hero */}
        <header className="mt-hero">
          <h2>
            The Complete Model Training{" "}
            <span className="mt-accent">Pipeline</span>
          </h2>
          <p>
            From data collection to fine-tuning — every step on AhuraCloud A.I. Labs.
          </p>
        </header>

        <div className="mt-stage" ref={stageRef}>
          {/* Phase 1 */}
          <section className="mt-phase">
            <div className="mt-phase__head">
              <div className="mt-phase__num-block">
                <span className="mt-phase__pre">Phase</span>
                <span className="mt-phase__num">01</span>
              </div>
              <div>
                <div className="mt-phase__title">
                  Data Pipeline <em>· Preparation</em>
                </div>
                <div className="mt-phase__sub">
                  Collect, clean, and tokenize raw language data.
                </div>
              </div>
              <div className="mt-phase__tag">Data</div>
            </div>

            <div className="mt-rail mt-rail--3">
              {PHASE_1.map((c) => (
                <Card key={c.id} card={c} setRef={setRef(c.id)} revealed={revealed.has(c.id)} />
              ))}
            </div>

            <div className="mt-tail">
              <div
                ref={setRef("ready")}
                className={`mt-ready ${revealed.has("ready") ? "mt-revealed" : ""}`}
              >
                {/* Inner ring */}
                <span aria-hidden className="mt-ready-ring" />
                <div className="mt-ready-inner">
                  <span className="mt-ready-icon">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="9" />
                      <path d="M8 12l3 3 5-6" />
                    </svg>
                  </span>
                  <div className="mt-ready-meta">
                    <p className="mt-ready-eyebrow">Status</p>
                    <p className="mt-ready-lbl">Ready to train</p>
                  </div>
                </div>
              </div>
              <div className={`mt-yes-arrow ${revealed.has("ready") ? "mt-revealed" : ""}`}>
                <span className="mt-yes-label">YES</span>
              </div>
              <div
                ref={setRef("diamond")}
                className={`mt-diamond ${revealed.has("diamond") ? "mt-revealed" : ""}`}
              >
                <span aria-hidden className="mt-diamond-dot" />
                <span className="mt-diamond-label">
                  <span className="mt-diamond-q">?</span>
                  Meets criteria
                </span>
              </div>
            </div>
          </section>

          {/* Phase 2 */}
          <section className="mt-phase">
            <div className="mt-phase__head mt-phase__head--right">
              <div className="mt-phase__tag">Modeling</div>
              <div>
                <div className="mt-phase__title">
                  Model Training <em>· Development</em>
                </div>
                <div className="mt-phase__sub">
                  Select architecture, set up infra, monitor runs, and fine-tune.
                </div>
              </div>
              <div className="mt-phase__num-block">
                <span className="mt-phase__pre">Phase</span>
                <span className="mt-phase__num">02</span>
              </div>
            </div>

            <div className="mt-rail mt-rail--4">
              {PHASE_2.map((c) => (
                <Card key={c.id} card={c} setRef={setRef(c.id)} revealed={revealed.has(c.id)} />
              ))}
            </div>

            {/* Outcome anchor — gives the pipeline a destination */}
            <div
              className={`mt-outcome ${revealed.has("c7") ? "mt-revealed" : ""}`}
            >
              <div className="mt-outcome__row">
                <span className="mt-outcome__col">
                  <span className="mt-outcome__pre">Model ID</span>
                  <span className="mt-outcome__val">
                    ahura/llama-4-scout<span className="mt-outcome__dim">:ft-a1b2c3</span>
                  </span>
                </span>
                <span className="mt-outcome__col">
                  <span className="mt-outcome__pre">Endpoint</span>
                  <span className="mt-outcome__val mt-outcome__mono">api.ahurasense.com/v1</span>
                </span>
                <span className="mt-outcome__col">
                  <span className="mt-outcome__pre">Status</span>
                  <span className="mt-outcome__live">
                    <span aria-hidden className="mt-outcome__dot" />
                    Live
                  </span>
                </span>
              </div>
            </div>
          </section>

          {/* Flow SVG overlay */}
          <svg
            className="mt-flow-svg"
            width={stageWidth}
            height={stageHeight}
            viewBox={`0 0 ${stageWidth} ${stageHeight}`}
            preserveAspectRatio="none"
          >
            <defs>
              <marker
                id="mt-arrow-head"
                markerWidth="9"
                markerHeight="9"
                refX="6"
                refY="4.5"
                orient="auto"
                markerUnits="strokeWidth"
              >
                <path d="M0,0 L8,4.5 L0,9 Z" className="mt-arrow-head" />
              </marker>
              <radialGradient id="mt-orb-grad" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="#ffffff" stopOpacity="1" />
                <stop offset="35%" stopColor="#9ec2ff" stopOpacity="0.95" />
                <stop offset="75%" stopColor="#4d8bff" stopOpacity="0.6" />
                <stop offset="100%" stopColor="#1d5cff" stopOpacity="0" />
              </radialGradient>
            </defs>

            {EDGES.map((e) => {
              const key = `${e.from}-${e.to}`;
              const p = paths[key];
              if (!p?.d) return null;
              return (
                <g key={key}>
                  <path
                    ref={(el) => {
                      arrowRefs.current[key] = el;
                    }}
                    d={p.d}
                    className="mt-arrow"
                  />
                  <path
                    ref={(el) => {
                      glowRefs.current[key] = el;
                    }}
                    d={p.d}
                    className="mt-glow-line"
                  />
                </g>
              );
            })}

            <circle ref={orbRef} r={9} className="mt-orb" cx={0} cy={0} />
            <circle ref={orbCoreRef} r={2.6} className="mt-orb-core" cx={0} cy={0} />
          </svg>
        </div>
      </Container>

      <style jsx>{`
        .mt-pipeline {
          --mt-text: rgba(255, 255, 255, 0.92);
          --mt-muted: rgba(255, 255, 255, 0.55);
          --mt-line: rgba(255, 255, 255, 0.10);
          --mt-blue: #33adff;
          --mt-blue-soft: #8ecaff;
        }
        .mt-hero {
          text-align: center;
          margin-bottom: 48px;
        }
        /* Match the homepage section-title scale: "Everything You Need to
           Build and Scale" / "Our Core Services" — text-4xl→6xl, font-[400],
           tracking-tight, leading-tight. */
        .mt-hero h2 {
          font-weight: 400;
          font-size: 2.25rem; /* text-4xl */
          letter-spacing: -0.025em; /* tracking-tight */
          line-height: 1.25; /* leading-tight */
          margin: 0 0 16px;
          color: #ffffff;
        }
        @media (min-width: 640px) {
          .mt-hero h2 {
            font-size: 3rem; /* sm:text-5xl */
          }
        }
        @media (min-width: 1024px) {
          .mt-hero h2 {
            font-size: 3.75rem; /* lg:text-6xl */
          }
        }
        .mt-accent {
          color: #33adff;
        }
        .mt-hero p {
          margin: 0 auto;
          max-width: 640px;
          color: var(--mt-muted);
          font-size: clamp(14px, 1vw, 16.5px);
          line-height: 1.55;
        }
        .mt-stage {
          position: relative;
        }
        .mt-phase {
          position: relative;
          isolation: isolate;
        }
        .mt-phase + .mt-phase {
          margin-top: 120px;
        }
        /* Outcome anchor below Phase 2 */
        .mt-outcome {
          margin-top: 80px;
          padding-top: 36px;
          border-top: 1px solid rgba(255, 255, 255, 0.06);
          position: relative;
          opacity: 0;
          transform: translateY(8px);
          transition: opacity 0.7s ease, transform 0.7s ease;
        }
        .mt-outcome.mt-revealed {
          opacity: 1;
          transform: translateY(0);
        }
        .mt-outcome::before {
          content: "";
          position: absolute;
          left: 50%;
          top: -1px;
          transform: translateX(-50%);
          width: 120px;
          height: 1px;
          background: linear-gradient(
            90deg,
            transparent,
            rgba(51, 173, 255, 0.7),
            transparent
          );
        }
        .mt-outcome__row {
          display: grid;
          grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr) auto;
          gap: 32px;
          padding: 18px 24px;
          background: linear-gradient(180deg, #08090c 0%, #050709 100%);
          border: 1px solid rgba(255, 255, 255, 0.06);
          border-radius: 10px;
          box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.03),
            0 12px 32px rgba(0, 0, 0, 0.55);
        }
        @media (max-width: 768px) {
          .mt-outcome__row {
            grid-template-columns: minmax(0, 1fr);
            gap: 14px;
          }
        }
        .mt-outcome__col {
          display: flex;
          flex-direction: column;
          gap: 4px;
          min-width: 0;
        }
        .mt-outcome__pre {
          font-family: var(--font-geist-mono), ui-monospace, monospace;
          font-size: 9px;
          font-weight: 500;
          letter-spacing: 0.22em;
          text-transform: uppercase;
          color: rgba(255, 255, 255, 0.40);
        }
        .mt-outcome__val {
          font-size: 14px;
          color: rgba(255, 255, 255, 0.92);
          font-weight: 600;
          letter-spacing: -0.005em;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .mt-outcome__mono {
          font-family: var(--font-geist-mono), ui-monospace, monospace;
          font-size: 13px;
          font-weight: 500;
          color: rgba(255, 255, 255, 0.85);
        }
        .mt-outcome__dim {
          color: rgba(255, 255, 255, 0.42);
          font-weight: 500;
        }
        .mt-outcome__live {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          font-family: var(--font-geist-mono), ui-monospace, monospace;
          font-size: 11px;
          letter-spacing: 0.16em;
          text-transform: uppercase;
          color: rgba(255, 255, 255, 0.85);
        }
        .mt-outcome__dot {
          width: 7px;
          height: 7px;
          border-radius: 50%;
          background: #33adff;
          box-shadow: 0 0 0 3px rgba(51, 173, 255, 0.15),
            0 0 12px rgba(51, 173, 255, 0.7);
          animation: mt-pulse 2.4s ease-in-out infinite;
        }
        @keyframes mt-pulse {
          0%, 100% { box-shadow: 0 0 0 3px rgba(51,173,255,0.15), 0 0 12px rgba(51,173,255,0.7); }
          50%      { box-shadow: 0 0 0 5px rgba(51,173,255,0.05), 0 0 18px rgba(51,173,255,0.9); }
        }
        .mt-phase__head {
          display: grid;
          grid-template-columns: auto 1fr auto;
          align-items: end;
          gap: 28px;
          margin-bottom: 40px;
          padding-bottom: 18px;
          position: relative;
        }
        .mt-phase__head::after {
          content: "";
          position: absolute;
          left: 0;
          right: 0;
          bottom: 0;
          height: 1px;
          background: linear-gradient(
            to right,
            rgba(255, 255, 255, 0.45) 0%,
            rgba(255, 255, 255, 0.45) 76px,
            rgba(255, 255, 255, 0.05) 76px,
            rgba(255, 255, 255, 0.05) 100%
          );
        }
        .mt-phase__head--right {
          text-align: right;
        }
        .mt-phase__head--right::after {
          background: linear-gradient(
            to right,
            rgba(255, 255, 255, 0.05) 0%,
            rgba(255, 255, 255, 0.05) calc(100% - 76px),
            rgba(255, 255, 255, 0.45) calc(100% - 76px),
            rgba(255, 255, 255, 0.45) 100%
          );
        }
        .mt-phase__num-block {
          display: flex;
          align-items: baseline;
          gap: 10px;
          line-height: 1;
        }
        .mt-phase__pre {
          font-family: var(--font-geist-mono), ui-monospace, monospace;
          font-size: 10.5px;
          font-weight: 600;
          letter-spacing: 0.22em;
          color: var(--mt-muted);
          text-transform: uppercase;
        }
        .mt-phase__num {
          font-size: 52px;
          font-weight: 200;
          color: rgba(255, 255, 255, 0.92);
          line-height: 0.9;
          font-feature-settings: "tnum";
          letter-spacing: -0.03em;
        }
        .mt-phase__title {
          font-weight: 700;
          color: var(--mt-text);
          letter-spacing: 0.04em;
          font-size: clamp(14px, 1.05vw, 17px);
          text-transform: uppercase;
          line-height: 1.15;
          margin-bottom: 6px;
        }
        .mt-phase__title em {
          font-style: normal;
          color: #33adff;
          font-weight: 600;
          letter-spacing: 0.04em;
        }
        .mt-phase__sub {
          color: var(--mt-muted);
          font-size: 13px;
          line-height: 1.5;
          max-width: 520px;
        }
        .mt-phase__head--right .mt-phase__sub {
          margin-left: auto;
        }
        .mt-phase__tag {
          font-family: var(--font-geist-mono), ui-monospace, monospace;
          font-size: 10px;
          font-weight: 500;
          letter-spacing: 0.22em;
          color: rgba(255, 255, 255, 0.55);
          text-transform: uppercase;
          padding: 6px 14px;
          border: 1px solid rgba(255, 255, 255, 0.10);
          background: rgba(255, 255, 255, 0.025);
          border-radius: 999px;
          white-space: nowrap;
          align-self: end;
        }
        .mt-rail {
          display: grid;
          gap: 18px;
          align-items: stretch;
        }
        .mt-rail--3 {
          grid-template-columns: repeat(3, minmax(0, 1fr));
        }
        .mt-rail--4 {
          grid-template-columns: repeat(4, minmax(0, 1fr));
        }
        @media (max-width: 1024px) {
          .mt-rail--3,
          .mt-rail--4 {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }
        }
        @media (max-width: 640px) {
          .mt-rail--3,
          .mt-rail--4 {
            grid-template-columns: minmax(0, 1fr);
          }
          .mt-phase + .mt-phase {
            margin-top: 80px;
          }
        }
        .mt-tail {
          margin-top: 56px;
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 22px;
          align-items: center;
        }
        @media (max-width: 640px) {
          .mt-tail {
            grid-template-columns: minmax(0, 1fr);
            justify-items: center;
          }
        }
        .mt-tail > div:nth-child(1),
        .mt-tail > div:nth-child(2),
        .mt-tail > div:nth-child(3) {
          justify-self: center;
        }
        .mt-diamond {
          position: relative;
          width: 118px;
          height: 118px;
          transform: rotate(45deg);
          border: 1px solid rgba(255, 255, 255, 0.10);
          border-radius: 10px;
          background: linear-gradient(180deg, #08090c 0%, #050709 100%);
          display: grid;
          place-items: center;
          opacity: 0;
          visibility: hidden;
          box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.04),
            0 12px 32px rgba(0, 0, 0, 0.65);
        }
        .mt-diamond.mt-revealed {
          visibility: visible;
          animation: mt-diamondReveal 720ms cubic-bezier(0.34, 1.56, 0.55, 1) forwards;
          border-color: rgba(255, 255, 255, 0.18);
          box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.06),
            inset 0 0 0 1px rgba(255, 255, 255, 0.03),
            0 12px 32px rgba(0, 0, 0, 0.65),
            0 0 24px rgba(51, 173, 255, 0.06);
        }
        /* Inner accent square — gives the diamond more depth */
        .mt-diamond::after {
          content: "";
          position: absolute;
          inset: 6px;
          border-radius: 6px;
          border: 1px dashed rgba(255, 255, 255, 0.05);
          pointer-events: none;
        }
        .mt-diamond-dot {
          position: absolute;
          left: 6px;
          top: 6px;
          width: 6px;
          height: 6px;
          border-radius: 1px;
          background: #33adff;
          box-shadow: 0 0 8px rgba(51, 173, 255, 0.6);
          opacity: 0;
          transition: opacity 0.5s ease;
        }
        .mt-diamond.mt-revealed .mt-diamond-dot {
          opacity: 1;
        }
        @keyframes mt-diamondReveal {
          0% {
            opacity: 0;
            transform: rotate(45deg) scale(0.85);
          }
          60% {
            opacity: 1;
            transform: rotate(45deg) scale(1.08);
          }
          100% {
            opacity: 1;
            transform: rotate(45deg) scale(1);
          }
        }
        .mt-diamond-label {
          transform: rotate(-45deg);
          display: inline-flex;
          align-items: baseline;
          gap: 4px;
          text-align: center;
          color: rgba(255, 255, 255, 0.85);
          font-family: var(--font-geist-mono), ui-monospace, monospace;
          font-weight: 500;
          font-size: 10px;
          letter-spacing: 0.14em;
          line-height: 1;
          text-transform: uppercase;
        }
        .mt-diamond-q {
          color: #33adff;
          font-weight: 700;
          font-size: 12px;
        }
        .mt-yes-arrow {
          position: relative;
          width: 110px;
          height: 60px;
          display: grid;
          place-items: center;
          opacity: 0;
          transition: opacity 0.5s ease;
        }
        .mt-yes-arrow.mt-revealed {
          opacity: 1;
        }
        .mt-yes-label {
          color: rgba(255, 255, 255, 0.55);
          font-family: var(--font-geist-mono), ui-monospace, monospace;
          font-weight: 500;
          font-size: 11px;
          letter-spacing: 0.24em;
        }
        .mt-ready {
          position: relative;
          width: 144px;
          height: 144px;
          border-radius: 50%;
          border: 1px solid rgba(255, 255, 255, 0.10);
          background: radial-gradient(
              circle at 50% 0%,
              rgba(51, 173, 255, 0.08) 0%,
              transparent 60%
            ),
            linear-gradient(180deg, #08090c 0%, #050709 100%);
          display: grid;
          place-items: center;
          text-align: center;
          padding: 14px;
          opacity: 0;
          visibility: hidden;
          box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.04),
            0 12px 32px rgba(0, 0, 0, 0.65);
        }
        .mt-ready.mt-revealed {
          visibility: visible;
          animation: mt-readyReveal 720ms cubic-bezier(0.34, 1.56, 0.55, 1) forwards;
          border-color: rgba(255, 255, 255, 0.20);
          box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.06),
            inset 0 0 0 1px rgba(255, 255, 255, 0.03),
            0 12px 32px rgba(0, 0, 0, 0.65),
            0 0 24px rgba(51, 173, 255, 0.08);
        }
        /* Inner ring — dashed, for engineered look */
        .mt-ready-ring {
          position: absolute;
          inset: 8px;
          border-radius: 50%;
          border: 1px dashed rgba(255, 255, 255, 0.06);
          pointer-events: none;
          opacity: 0;
          transition: opacity 0.5s ease;
        }
        .mt-ready.mt-revealed .mt-ready-ring {
          opacity: 1;
        }
        .mt-ready-inner {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 6px;
        }
        .mt-ready-icon {
          display: grid;
          place-items: center;
          width: 30px;
          height: 30px;
          color: #33adff;
        }
        .mt-ready-meta {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 2px;
        }
        .mt-ready-eyebrow {
          margin: 0;
          font-family: var(--font-geist-mono), ui-monospace, monospace;
          font-size: 8.5px;
          font-weight: 500;
          letter-spacing: 0.20em;
          text-transform: uppercase;
          color: rgba(255, 255, 255, 0.40);
        }
        @keyframes mt-readyReveal {
          0% {
            opacity: 0;
            transform: scale(0.85);
          }
          60% {
            opacity: 1;
            transform: scale(1.08);
          }
          100% {
            opacity: 1;
            transform: scale(1);
          }
        }
        .mt-ready-icon :global(svg) {
          width: 28px;
          height: 28px;
          stroke-width: 1.5;
        }
        .mt-ready-lbl {
          color: rgba(255, 255, 255, 0.90);
          font-family: var(--font-geist-mono), ui-monospace, monospace;
          font-weight: 600;
          font-size: 10px;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          line-height: 1.25;
          margin: 0;
        }
        .mt-flow-svg {
          position: absolute;
          inset: 0;
          pointer-events: none;
          z-index: 3;
          overflow: visible;
        }
      `}</style>

      <style jsx global>{`
        .mt-pipeline .mt-arrow {
          fill: none;
          stroke: rgba(255, 255, 255, 0.16);
          stroke-width: 1.5;
          stroke-linecap: round;
          stroke-linejoin: round;
        }
        .mt-pipeline .mt-arrow-head {
          fill: rgba(255, 255, 255, 0.35);
        }
        .mt-pipeline .mt-glow-line {
          fill: none;
          stroke: #33adff;
          stroke-width: 2.6;
          stroke-linecap: round;
          stroke-linejoin: round;
          filter: drop-shadow(0 0 6px rgba(51, 173, 255, 1))
            drop-shadow(0 0 16px rgba(51, 173, 255, 0.7));
          opacity: 0;
        }
        .mt-pipeline .mt-orb {
          fill: url(#mt-orb-grad);
          filter: drop-shadow(0 0 8px rgba(51, 173, 255, 1))
            drop-shadow(0 0 22px rgba(51, 173, 255, 0.75));
          opacity: 0;
        }
        .mt-pipeline .mt-orb-core {
          fill: #ffffff;
          opacity: 0;
        }
        .mt-pipeline .mt-orb.mt-orb-resting {
          animation: mt-orb-rest 2.6s ease-in-out infinite;
        }
        @keyframes mt-orb-rest {
          0%, 100% {
            opacity: 0.85;
            filter: drop-shadow(0 0 8px rgba(51,173,255,1))
              drop-shadow(0 0 22px rgba(51,173,255,0.75));
          }
          50% {
            opacity: 1;
            filter: drop-shadow(0 0 12px rgba(51,173,255,1))
              drop-shadow(0 0 32px rgba(51,173,255,0.95));
          }
        }
      `}</style>
    </section>
  );
}

// ────────────────────────────────────────────────────────────────────
// Card — used for both phases. The reveal animation runs once when
// the `revealed` prop flips to true.
// ────────────────────────────────────────────────────────────────────
function Card({
  card,
  setRef,
  revealed,
}: {
  card: CardData;
  setRef: (el: HTMLElement | null) => void;
  revealed: boolean;
}) {
  return (
    <div ref={setRef} className={`mt-card ${revealed ? "mt-revealed" : ""}`}>
      <span className="mt-corner">
        <svg viewBox="0 0 56 56">
          <path d="M56 0 L20 0 M56 0 L56 36 M48 0 L48 28 M56 8 L36 8" />
        </svg>
      </span>
      <span className="mt-aura" />
      <div className="mt-badge">{card.step}</div>
      <div className="mt-icn">
        <Image
          src={card.icon}
          alt={card.title}
          width={90}
          height={90}
          unoptimized
        />
      </div>
      <h3>{card.title}</h3>
      <p className="mt-sub">{card.sub}</p>
      <div className="mt-features">
        {card.features.map((f, i) => (
          <div key={i} className={`mt-feat mt-feat--${f.tone}`}>
            <span className="mt-ficon">{f.iconSvg}</span>
            <div className="mt-ftxt">
              <b>{f.title}</b>
              <span>{f.sub}</span>
            </div>
          </div>
        ))}
      </div>

      <style jsx>{`
        .mt-card {
          position: relative;
          background: linear-gradient(180deg, #08090c 0%, #050709 100%);
          border: 1px solid rgba(255, 255, 255, 0.06);
          border-radius: 8px;
          padding: 14px 12px 12px;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 6px;
          box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.03),
            0 8px 24px rgba(0, 0, 0, 0.55);
          opacity: 0;
          visibility: hidden;
          overflow: hidden;
          isolation: isolate;
          transition: border-color 0.5s ease, box-shadow 0.5s ease;
        }
        .mt-card.mt-revealed {
          visibility: visible;
          animation: mt-cardReveal 720ms cubic-bezier(0.34, 1.56, 0.55, 1) forwards;
          border-color: rgba(255, 255, 255, 0.14);
          box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.06),
            0 14px 36px rgba(0, 0, 0, 0.65);
        }
        @keyframes mt-cardReveal {
          0% {
            opacity: 0;
            transform: translateY(12px) scale(0.92);
          }
          60% {
            opacity: 1;
            transform: translateY(-4px) scale(1.04);
          }
          100% {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }
        /* Top accent stripe — white, very subtle, appears only when revealed */
        .mt-card::before {
          content: "";
          position: absolute;
          inset: 0 0 auto 0;
          height: 1px;
          background: linear-gradient(
            90deg,
            transparent,
            rgba(255, 255, 255, 0.20),
            transparent
          );
          opacity: 0;
          transition: opacity 0.6s ease;
          z-index: 4;
          pointer-events: none;
        }
        .mt-card.mt-revealed::before {
          opacity: 1;
        }
        .mt-aura {
          position: absolute;
          top: 24px;
          left: 50%;
          width: 100px;
          height: 100px;
          transform: translateX(-50%);
          background: radial-gradient(
            closest-side,
            rgba(51, 173, 255, 0.12) 0%,
            rgba(51, 173, 255, 0.04) 50%,
            rgba(51, 173, 255, 0) 75%
          );
          border-radius: 50%;
          z-index: 0;
          opacity: 0;
          transition: opacity 0.55s ease;
          pointer-events: none;
        }
        .mt-card.mt-revealed .mt-aura {
          opacity: 1;
          animation: mt-aura-breathe 5s ease-in-out infinite;
        }
        @keyframes mt-aura-breathe {
          0%, 100% { opacity: 0.6; transform: translateX(-50%) scale(1); }
          50%      { opacity: 1.0; transform: translateX(-50%) scale(1.06); }
        }
        .mt-corner {
          position: absolute;
          top: 0;
          right: 0;
          width: 44px;
          height: 44px;
          pointer-events: none;
          z-index: 1;
        }
        .mt-corner svg {
          width: 100%;
          height: 100%;
        }
        .mt-corner path {
          stroke: rgba(255, 255, 255, 0.35);
          stroke-width: 1;
          fill: none;
          stroke-linecap: round;
          opacity: 0;
          transition: opacity 0.55s ease;
        }
        .mt-card.mt-revealed .mt-corner path {
          opacity: 0.45;
        }
        .mt-badge {
          position: relative;
          z-index: 2;
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 3px 10px 3px 12px;
          background: transparent;
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 999px;
          color: rgba(255, 255, 255, 0.50);
          font-family: var(--font-geist-mono), ui-monospace, monospace;
          font-weight: 500;
          font-size: 9.5px;
          letter-spacing: 0.18em;
          line-height: 1;
          text-transform: uppercase;
        }
        .mt-badge::before {
          content: "";
          display: inline-block;
          width: 4px;
          height: 4px;
          border-radius: 50%;
          background: rgba(255, 255, 255, 0.45);
        }
        .mt-icn {
          position: relative;
          z-index: 2;
          height: 64px;
          width: 64px;
          display: grid;
          place-items: center;
        }
        .mt-icn :global(img) {
          width: 100%;
          height: 100%;
          object-fit: contain;
          filter: drop-shadow(0 4px 12px rgba(0, 0, 0, 0.55))
            drop-shadow(0 0 8px rgba(51, 173, 255, 0.18));
        }
        .mt-card h3 {
          position: relative;
          z-index: 2;
          font-size: 13.5px;
          font-weight: 600;
          margin: 4px 0 0;
          color: #8ecaff;
          line-height: 1.2;
          text-align: center;
          letter-spacing: -0.005em;
          max-width: 18ch;
          transition: color 0.5s ease;
        }
        .mt-card.mt-revealed h3 {
          color: #33adff;
        }
        .mt-sub {
          position: relative;
          z-index: 2;
          margin: 0 0 4px;
          text-align: center;
          font-size: 10.5px;
          color: rgba(255, 255, 255, 0.48);
          line-height: 1.35;
          max-width: 22ch;
          font-weight: 400;
        }
        .mt-features {
          position: relative;
          z-index: 2;
          margin-top: auto;
          padding-top: 12px;
          border-top: 1px solid rgba(255, 255, 255, 0.05);
          width: 100%;
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 1px;
          background: rgba(255, 255, 255, 0.04);
        }
        .mt-feat {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 8px 9px;
          background: #050709;
        }
        .mt-feat--alt,
        .mt-feat--warn {
          /* All variants render the same — no candy colors */
        }
        .mt-ficon {
          width: 14px;
          height: 14px;
          flex-shrink: 0;
          display: grid;
          place-items: center;
          background: transparent;
          color: rgba(255, 255, 255, 0.45);
          box-shadow: none;
        }
        .mt-ficon :global(svg) {
          width: 12px;
          height: 12px;
          stroke-width: 1.5;
        }
        .mt-ftxt {
          display: flex;
          flex-direction: column;
          line-height: 1.15;
          min-width: 0;
          gap: 1px;
        }
        .mt-ftxt :global(b) {
          font-size: 10px;
          font-weight: 600;
          color: rgba(255, 255, 255, 0.88);
          letter-spacing: 0.01em;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .mt-ftxt :global(span) {
          font-family: var(--font-geist-mono), ui-monospace, monospace;
          font-size: 9px;
          color: rgba(255, 255, 255, 0.38);
          letter-spacing: 0.04em;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
      `}</style>
    </div>
  );
}

export default ModelTrainingPipelineSection;
