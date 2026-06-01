"use client";

// Lazy, viewport-gated wrapper around PixelBlast.
//
// PixelBlast pulls in three.js + postprocessing (~hundreds of KB). It is a
// purely decorative, aria-hidden ambient backdrop, so there is no reason to
// ship it in the route's initial JS or render it server-side. We:
//   1. code-split it with next/dynamic({ ssr: false }) so three.js lands in a
//      separate async chunk loaded only after hydration, and
//   2. only mount it once its container scrolls near the viewport
//      (IntersectionObserver, rootMargin 200px) so below-the-fold instances
//      (e.g. the compute section) don't download three.js until needed.
//
// The default export keeps the same name/props as PixelBlast, so call sites
// only change their import path.

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import type { PixelBlastProps } from "./pixel-blast";

const PixelBlast = dynamic(() => import("./pixel-blast"), {
  ssr: false,
  loading: () => null,
});

export default function PixelBlastLazy(props: PixelBlastProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [show, setShow] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // No IO support (old browser / SSR guard) → just render it.
    if (typeof IntersectionObserver === "undefined") {
      setShow(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setShow(true);
          io.disconnect();
        }
      },
      { rootMargin: "200px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div ref={ref} className="absolute inset-0">
      {show ? <PixelBlast {...props} /> : null}
    </div>
  );
}
