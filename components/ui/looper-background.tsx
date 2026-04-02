"use client";

import { useEffect, useRef, useCallback } from "react";

interface LooperGroupConfig {
  count: number;
  outerW: number;
  outerH: number;
  innerW: number;
  innerH: number;
  rotation: number;
  groupOpacity: number;
}

const GROUPS: LooperGroupConfig[] = [
  { count: 60, outerW: 350, outerH: 167, innerW: 275, innerH: 85, rotation: 15.66, groupOpacity: 0.18 },
  { count: 60, outerW: 155, outerH: 75, innerW: 122, innerH: 38, rotation: 35.65, groupOpacity: 0.03 },
];

export function LooperBackground({ className = "" }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const rect = container.getBoundingClientRect();
    const w = rect.width;
    const h = rect.height;

    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = w + "px";
    canvas.style.height = h + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const cx = w / 2;
    const cy = h / 2;
    // 1vw in pixels
    const vw = w / 100;

    for (const group of GROUPS) {
      ctx.save();
      ctx.globalAlpha = group.groupOpacity;
      ctx.translate(cx, cy);
      ctx.rotate((group.rotation * Math.PI) / 180);

      for (let i = 0; i < group.count; i++) {
        const t = i / (group.count - 1);
        const rw = (group.outerW + (group.innerW - group.outerW) * t) * vw / 2;
        const rh = (group.outerH + (group.innerH - group.outerH) * t) * vw / 2;

        ctx.beginPath();
        ctx.ellipse(0, 0, rw, rh, 0, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(255,255,255,${0.45 * t})`;
        ctx.lineWidth = 1;
        ctx.stroke();
      }

      ctx.restore();
    }
  }, []);

  useEffect(() => {
    draw();
    const onResize = () => draw();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [draw]);

  return (
    <div ref={containerRef} className={`absolute inset-0 pointer-events-none overflow-hidden ${className}`}>
      <canvas ref={canvasRef} className="absolute inset-0" />
    </div>
  );
}
