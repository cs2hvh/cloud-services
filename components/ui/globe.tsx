"use client";

import { useEffect, useRef, useCallback } from "react";
import createGlobe from "cobe";

// Data center locations [lat, lng]
const LOCATIONS: [number, number][] = [
  [37.7749, -122.4194],   // San Francisco
  [51.5074, -0.1278],     // London
  [35.6762, 139.6503],    // Tokyo
  [1.3521, 103.8198],     // Singapore
  [-33.8688, 151.2093],   // Sydney
  [50.1109, 8.6821],      // Frankfurt
  [19.076, 72.8777],      // Mumbai
  [37.5665, 126.978],     // Seoul
  [-23.5505, -46.6333],   // Sao Paulo
  [45.5017, -73.5673],    // Montreal
  [55.7558, 37.6173],     // Moscow
  [25.2048, 55.2708],     // Dubai
];

// Network routes between data centers (index pairs)
const ARCS: [number, number][] = [
  [0, 1],   // SF -> London
  [1, 5],   // London -> Frankfurt
  [5, 10],  // Frankfurt -> Moscow
  [10, 11], // Moscow -> Dubai
  [11, 6],  // Dubai -> Mumbai
  [6, 3],   // Mumbai -> Singapore
  [3, 2],   // Singapore -> Tokyo
  [2, 7],   // Tokyo -> Seoul
  [3, 4],   // Singapore -> Sydney
  [0, 9],   // SF -> Montreal
  [1, 8],   // London -> Sao Paulo
  [0, 2],   // SF -> Tokyo
];

const DEG = Math.PI / 180;

function latLngToXYZ(lat: number, lng: number, phi: number, theta: number): [number, number, number] {
  const latR = lat * DEG;
  const lngR = lng * DEG + phi;
  const x = Math.cos(latR) * Math.sin(lngR);
  const y = Math.sin(latR) * Math.cos(theta) - Math.cos(latR) * Math.sin(theta) * Math.cos(lngR);
  const z = Math.sin(latR) * Math.sin(theta) + Math.cos(latR) * Math.cos(theta) * Math.cos(lngR);
  return [x, y, z];
}

// Interpolate along great circle
function greatCirclePoints(
  a: [number, number],
  b: [number, number],
  steps: number
): [number, number][] {
  const lat1 = a[0] * DEG, lng1 = a[1] * DEG;
  const lat2 = b[0] * DEG, lng2 = b[1] * DEG;
  const d = 2 * Math.asin(
    Math.sqrt(
      Math.sin((lat2 - lat1) / 2) ** 2 +
      Math.cos(lat1) * Math.cos(lat2) * Math.sin((lng2 - lng1) / 2) ** 2
    )
  );
  if (d < 0.001) return [a, b];

  const pts: [number, number][] = [];
  for (let i = 0; i <= steps; i++) {
    const f = i / steps;
    const A = Math.sin((1 - f) * d) / Math.sin(d);
    const B = Math.sin(f * d) / Math.sin(d);
    const x = A * Math.cos(lat1) * Math.cos(lng1) + B * Math.cos(lat2) * Math.cos(lng2);
    const y = A * Math.cos(lat1) * Math.sin(lng1) + B * Math.cos(lat2) * Math.sin(lng2);
    const z = A * Math.sin(lat1) + B * Math.sin(lat2);
    pts.push([Math.atan2(z, Math.sqrt(x * x + y * y)) / DEG, Math.atan2(y, x) / DEG]);
  }
  return pts;
}

export function Globe({ className = "" }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const arcCanvasRef = useRef<HTMLCanvasElement>(null);
  const pointerInteracting = useRef<number | null>(null);
  const pointerInteractionMovement = useRef(0);
  const phiRef = useRef(0);
  const widthRef = useRef(0);
  const frameRef = useRef(0);

  const onResize = useCallback(() => {
    if (canvasRef.current) {
      widthRef.current = canvasRef.current.offsetWidth;
    }
    if (arcCanvasRef.current) {
      const w = arcCanvasRef.current.offsetWidth;
      arcCanvasRef.current.width = w * 2;
      arcCanvasRef.current.height = w * 2;
    }
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const arcCanvas = arcCanvasRef.current;
    if (!canvas || !arcCanvas) return;

    window.addEventListener("resize", onResize);
    onResize();

    const globe = createGlobe(canvas, {
      devicePixelRatio: 2,
      width: widthRef.current * 2,
      height: widthRef.current * 2,
      phi: 0,
      theta: 0.25,
      dark: 1,
      diffuse: 1.6,
      mapSamples: 20000,
      mapBrightness: 8,
      baseColor: [0.25, 0.25, 0.28],
      markerColor: [0.9, 0.9, 0.9],
      glowColor: [0.06, 0.06, 0.08],
      markers: LOCATIONS.map((location) => ({ location, size: 0.06 })),
      onRender: (state) => {
        if (!pointerInteracting.current) {
          phiRef.current += 0.0005;
        }
        state.phi = phiRef.current + pointerInteractionMovement.current;
        state.width = widthRef.current * 2;
        state.height = widthRef.current * 2;
        frameRef.current++;

        drawArcs(arcCanvas, phiRef.current + pointerInteractionMovement.current, 0.25, frameRef.current);
      },
    });

    setTimeout(() => {
      if (canvas) canvas.style.opacity = "1";
    }, 0);

    return () => {
      globe.destroy();
      window.removeEventListener("resize", onResize);
    };
  }, [onResize]);

  function drawArcs(canvas: HTMLCanvasElement, currentPhi: number, theta: number, frame: number) {
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;
    const cx = w / 2;
    const cy = h / 2;
    const r = w * 0.44;

    ctx.clearRect(0, 0, w, h);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    ARCS.forEach(([fromIdx, toIdx], arcIndex) => {
      const from = LOCATIONS[fromIdx];
      const to = LOCATIONS[toIdx];
      const pts = greatCirclePoints(from, to, 80);

      // Project all points
      const projected = pts.map((p) => {
        const [x, y, z] = latLngToXYZ(p[0], p[1], currentPhi, theta);
        return { sx: cx + x * r, sy: cy - y * r, z };
      });

      // Get visible segments (continuous runs on front face)
      const runs: { sx: number; sy: number; z: number }[][] = [];
      let currentRun: { sx: number; sy: number; z: number }[] = [];
      for (const pt of projected) {
        if (pt.z > 0) {
          currentRun.push(pt);
        } else if (currentRun.length > 0) {
          runs.push(currentRun);
          currentRun = [];
        }
      }
      if (currentRun.length > 0) runs.push(currentRun);

      // Draw each visible run
      for (const run of runs) {
        if (run.length < 2) continue;

        // --- Dim base arc ---
        ctx.beginPath();
        ctx.moveTo(run[0].sx, run[0].sy);
        for (let i = 1; i < run.length; i++) {
          ctx.lineTo(run[i].sx, run[i].sy);
        }
        ctx.strokeStyle = "rgba(255, 255, 255, 0.1)";
        ctx.lineWidth = 1;
        ctx.stroke();
      }

      // --- Animated ray ---
      const speed = 0.18;
      const totalLen = pts.length;
      const offset = arcIndex * 29;
      const cycleLen = totalLen + 40;
      const headPos = ((frame * speed + offset) % cycleLen);
      const tailLen = 28;

      // Find the visible pulse points
      const pulseStart = Math.max(0, Math.floor(headPos - tailLen));
      const pulseEnd = Math.min(totalLen - 1, Math.floor(headPos));

      if (pulseEnd > pulseStart) {
        // Collect visible pulse points
        const pulsePoints: { sx: number; sy: number; t: number }[] = [];
        for (let i = pulseStart; i <= pulseEnd; i++) {
          const pt = projected[i];
          if (pt.z > 0) {
            const t = (i - pulseStart) / tailLen; // 0 = tail, 1 = head
            pulsePoints.push({ sx: pt.sx, sy: pt.sy, t });
          }
        }

        if (pulsePoints.length >= 2) {
          const first = pulsePoints[0];
          const last = pulsePoints[pulsePoints.length - 1];

          // Create linear gradient from tail to head
          const grad = ctx.createLinearGradient(first.sx, first.sy, last.sx, last.sy);
          grad.addColorStop(0, "rgba(255, 255, 255, 0)");
          grad.addColorStop(0.3, "rgba(255, 255, 255, 0.15)");
          grad.addColorStop(0.7, "rgba(255, 255, 255, 0.5)");
          grad.addColorStop(1, "rgba(255, 255, 255, 0.95)");

          // Outer glow — wide soft layer
          ctx.beginPath();
          ctx.moveTo(pulsePoints[0].sx, pulsePoints[0].sy);
          for (let i = 1; i < pulsePoints.length; i++) {
            ctx.lineTo(pulsePoints[i].sx, pulsePoints[i].sy);
          }
          ctx.strokeStyle = grad;
          ctx.lineWidth = 10;
          ctx.globalAlpha = 0.25;
          ctx.stroke();

          // Mid glow
          ctx.beginPath();
          ctx.moveTo(pulsePoints[0].sx, pulsePoints[0].sy);
          for (let i = 1; i < pulsePoints.length; i++) {
            ctx.lineTo(pulsePoints[i].sx, pulsePoints[i].sy);
          }
          ctx.lineWidth = 5;
          ctx.globalAlpha = 0.5;
          ctx.stroke();

          // Core bright ray
          ctx.beginPath();
          ctx.moveTo(pulsePoints[0].sx, pulsePoints[0].sy);
          for (let i = 1; i < pulsePoints.length; i++) {
            ctx.lineTo(pulsePoints[i].sx, pulsePoints[i].sy);
          }
          ctx.lineWidth = 2;
          ctx.globalAlpha = 1;
          ctx.stroke();

          // Bright head dot
          ctx.beginPath();
          ctx.arc(last.sx, last.sy, 3, 0, Math.PI * 2);
          ctx.fillStyle = "rgba(255, 255, 255, 0.9)";
          ctx.fill();

          ctx.globalAlpha = 1;
        }
      }

      // --- Marker dots at endpoints (larger, prominent) ---
      [from, to].forEach((loc) => {
        const [x, y, z] = latLngToXYZ(loc[0], loc[1], currentPhi, theta);
        if (z > 0.05) {
          const sx = cx + x * r;
          const sy = cy - y * r;
          const depth = Math.min(1, z * 1.5); // fade near edges

          // Outer pulsing ring
          const pulse = 0.5 + 0.5 * Math.sin(frame * 0.03 + arcIndex * 2);
          ctx.beginPath();
          ctx.arc(sx, sy, 8 + pulse * 4, 0, Math.PI * 2);
          ctx.strokeStyle = `rgba(255, 255, 255, ${(0.06 + pulse * 0.06) * depth})`;
          ctx.lineWidth = 1;
          ctx.stroke();

          // Glow halo
          ctx.beginPath();
          ctx.arc(sx, sy, 5, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(255, 255, 255, ${0.1 * depth})`;
          ctx.fill();

          // Core dot
          ctx.beginPath();
          ctx.arc(sx, sy, 3, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(255, 255, 255, ${0.85 * depth})`;
          ctx.fill();
        }
      });
    });
  }

  return (
    <div className={`relative ${className}`}>
      <canvas
        ref={canvasRef}
        onPointerDown={(e) => {
          pointerInteracting.current = e.clientX - pointerInteractionMovement.current;
          if (canvasRef.current) canvasRef.current.style.cursor = "grabbing";
        }}
        onPointerUp={() => {
          pointerInteracting.current = null;
          if (canvasRef.current) canvasRef.current.style.cursor = "grab";
        }}
        onPointerOut={() => {
          pointerInteracting.current = null;
          if (canvasRef.current) canvasRef.current.style.cursor = "grab";
        }}
        onPointerMove={(e) => {
          if (pointerInteracting.current !== null) {
            const delta = e.clientX - pointerInteracting.current;
            pointerInteractionMovement.current = delta / 200;
          }
        }}
        style={{
          width: "100%",
          height: "100%",
          cursor: "grab",
          contain: "layout paint size",
          opacity: 0,
          transition: "opacity 1s ease",
        }}
      />
      <canvas
        ref={arcCanvasRef}
        className="pointer-events-none"
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
        }}
      />
    </div>
  );
}
