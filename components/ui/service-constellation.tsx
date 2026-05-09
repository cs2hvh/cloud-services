"use client";

import { useEffect, useRef, useCallback } from "react";
import { motion } from "motion/react";
import Image from "next/image";
import { Layers } from "lucide-react";

/* ── Node & connection definitions ── */

interface NodeDef {
  id: string;
  label: string;
  imageSrc?: string;
  x: number; // % of container width
  y: number; // % of container height
}

const NODES: NodeDef[] = [
  { id: "hub",      label: "Platform",    x: 50, y: 46 },
  { id: "security", label: "Security",    imageSrc: "/images/Features/protection.png",             x: 50, y: 10 },
  { id: "gpu",      label: "GPU Compute", imageSrc: "/images/main-page/gpu aniamtion resized.png", x: 18, y: 28 },
  { id: "ai",       label: "AI / ML",     imageSrc: "/images/Features/ai-agent.png",               x: 82, y: 28 },
  { id: "k8s",      label: "Kubernetes",  imageSrc: "/images/main-page/kubernetes.png",            x: 18, y: 66 },
  { id: "deploy",   label: "App Deploy",  imageSrc: "/images/main-page/app-deploy.png",            x: 82, y: 66 },
  { id: "db",       label: "Database",    imageSrc: "/images/Features/database.png",               x: 35, y: 84 },
  { id: "storage",  label: "Storage",     imageSrc: "/images/main-page/object-space.png",          x: 65, y: 84 },
];

const CONNECTIONS = [
  // Hub ↔ every service (star topology)
  ["hub", "security"],
  ["hub", "gpu"],
  ["hub", "ai"],
  ["hub", "k8s"],
  ["hub", "deploy"],
  ["hub", "db"],
  ["hub", "storage"],
  // Cross-connections (mesh)
  ["gpu", "ai"],
  ["gpu", "k8s"],
  ["k8s", "deploy"],
  ["db", "storage"],
  ["security", "ai"],
  ["k8s", "db"],
  ["deploy", "storage"],
];

/* ── Helpers ── */

function nodePos(id: string, w: number, h: number): [number, number] {
  const n = NODES.find((n) => n.id === id);
  if (!n) return [0, 0];
  return [(n.x / 100) * w, (n.y / 100) * h];
}

/* ── Component ── */

export function ServiceConstellation({
  className = "",
}: {
  className?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const boot = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return () => {};
    const ctx = canvas.getContext("2d");
    if (!ctx) return () => {};

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let w = 0,
      h = 0,
      animId = 0;

    /* pulse state per connection */
    const pulses = CONNECTIONS.map(() => ({
      progress: Math.random(),
      speed: 0.0007 + Math.random() * 0.0008,
      forward: Math.random() > 0.5,
      rest: 0,
    }));

    function resize() {
      const rect = container!.getBoundingClientRect();
      w = rect.width;
      h = rect.height;
      canvas!.width = w * dpr;
      canvas!.height = h * dpr;
      canvas!.style.width = w + "px";
      canvas!.style.height = h + "px";
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    let prev = 0;
    function frame(ts: number) {
      const dt = prev ? (ts - prev) / 1000 : 0.016;
      prev = ts;
      ctx!.clearRect(0, 0, w, h);

      /* draw static connection lines */
      for (const [fromId, toId] of CONNECTIONS) {
        const [x1, y1] = nodePos(fromId, w, h);
        const [x2, y2] = nodePos(toId, w, h);
        ctx!.beginPath();
        ctx!.moveTo(x1, y1);
        ctx!.lineTo(x2, y2);
        ctx!.strokeStyle = "rgba(255,255,255,0.055)";
        ctx!.lineWidth = 1;
        ctx!.stroke();
      }

      /* animate pulses */
      for (let i = 0; i < pulses.length; i++) {
        const p = pulses[i];

        // rest timer at endpoints
        if (p.rest > 0) {
          p.rest -= dt;
          continue;
        }

        p.progress += p.speed;

        if (p.progress >= 1) {
          p.progress = 0;
          p.forward = !p.forward;
          p.rest = 1.2 + Math.random() * 2.0;
          p.speed = 0.0007 + Math.random() * 0.0008;
          continue;
        }

        const [fromId, toId] = CONNECTIONS[i];
        const [x1, y1] = nodePos(
          p.forward ? fromId : toId,
          w,
          h
        );
        const [x2, y2] = nodePos(
          p.forward ? toId : fromId,
          w,
          h
        );

        const px = x1 + (x2 - x1) * p.progress;
        const py = y1 + (y2 - y1) * p.progress;

        // outer glow
        const glow = ctx!.createRadialGradient(px, py, 0, px, py, 14);
        glow.addColorStop(0, "rgba(0,149,255,0.5)");
        glow.addColorStop(0.5, "rgba(0,149,255,0.1)");
        glow.addColorStop(1, "rgba(0,149,255,0)");
        ctx!.beginPath();
        ctx!.arc(px, py, 14, 0, Math.PI * 2);
        ctx!.fillStyle = glow;
        ctx!.fill();

        // core dot
        ctx!.beginPath();
        ctx!.arc(px, py, 2, 0, Math.PI * 2);
        ctx!.fillStyle = "rgba(0,149,255,0.9)";
        ctx!.fill();

        // trail
        const trailT = Math.max(0, p.progress - 0.1);
        const tx = x1 + (x2 - x1) * trailT;
        const ty = y1 + (y2 - y1) * trailT;
        const trail = ctx!.createLinearGradient(tx, ty, px, py);
        trail.addColorStop(0, "rgba(0,149,255,0)");
        trail.addColorStop(1, "rgba(0,149,255,0.25)");
        ctx!.beginPath();
        ctx!.moveTo(tx, ty);
        ctx!.lineTo(px, py);
        ctx!.strokeStyle = trail;
        ctx!.lineWidth = 1.5;
        ctx!.stroke();
      }

      /* node highlight ring on hub */
      const [hx, hy] = nodePos("hub", w, h);
      const hubGlow = ctx!.createRadialGradient(hx, hy, 18, hx, hy, 40);
      hubGlow.addColorStop(0, "rgba(0,149,255,0.08)");
      hubGlow.addColorStop(1, "rgba(0,149,255,0)");
      ctx!.beginPath();
      ctx!.arc(hx, hy, 40, 0, Math.PI * 2);
      ctx!.fillStyle = hubGlow;
      ctx!.fill();

      animId = requestAnimationFrame(frame);
    }

    resize();
    animId = requestAnimationFrame(frame);

    const onResize = () => resize();
    window.addEventListener("resize", onResize);
    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener("resize", onResize);
    };
  }, []);

  useEffect(() => {
    const cleanup = boot();
    return cleanup;
  }, [boot]);

  return (
    <div
      ref={containerRef}
      className={`relative w-full h-full ${className}`}
    >
      {/* Animated lines + pulses */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 pointer-events-none"
      />

      {/* Service nodes */}
      {NODES.map((node, i) => {
        const isHub = node.id === "hub";

        return (
          <motion.div
            key={node.id}
            className="absolute pointer-events-none"
            style={{
              left: `${node.x}%`,
              top: `${node.y}%`,
              transform: "translate(-50%, -50%)",
            }}
            animate={{ scale: [1, isHub ? 1.06 : 1.08, 1] }}
            transition={{
              duration: isHub ? 3.5 : 2.8 + i * 0.35,
              repeat: Infinity,
              ease: "easeInOut" as const,
            }}
          >
            <div className="flex flex-col items-center gap-2">
              {isHub ? (
                <div className="relative flex items-center justify-center w-14 h-14">
                  <div className="absolute inset-0 rounded-full bg-[#0095FF]/15 blur-[18px]" />
                  <Layers size={30} className="text-[#0095FF] relative z-10" />
                </div>
              ) : node.imageSrc ? (
                <Image
                  src={node.imageSrc}
                  alt={node.label}
                  width={56}
                  height={56}
                  className="object-contain drop-shadow-[0_0_8px_rgba(0,149,255,0.15)]"
                />
              ) : null}
              <span
                className={`text-[10px] font-medium whitespace-nowrap tracking-wide ${
                  isHub ? "text-[#0095FF]/70" : "text-white/35"
                }`}
              >
                {node.label}
              </span>
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}
