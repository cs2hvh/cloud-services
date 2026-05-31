"use client";

// RAG Pipeline — faithful port of public/RAG Pipeline.html. The original is a
// fixed 1760×980 canvas scaled to the viewport; here it's an embeddable block
// that keeps that aspect ratio and scales the canvas to the container width.
// All styles are namespaced under `.ragp` (keyframes/ids under `ragp-*`) so it
// can't collide with the rest of the page.

import { useEffect, useRef } from "react";

const CW = 1760;
const CH = 980;

// custom-property style helper (keeps TS happy for `--w` / `--h`)
const v = (o: Record<string, string | number>) => o as React.CSSProperties;

export default function RagPipelineDiagram() {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas) return;
    const fit = () => {
      const s = wrap.clientWidth / CW;
      canvas.style.transform = `scale(${s})`;
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(wrap);
    return () => ro.disconnect();
  }, []);

  return (
    <div className="ragp" ref={wrapRef}>
      <div className="canvas" ref={canvasRef}>
        {/* ================= CONNECTORS ================= */}
        <svg className="links" viewBox="0 0 1760 980">
          <defs>
            <filter id="ragp-glow" x="-60%" y="-60%" width="220%" height="220%">
              <feGaussianBlur stdDeviation="3" result="b" />
              <feMerge>
                <feMergeNode in="b" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
            <marker
              id="ragp-ah-gray"
              markerWidth="9"
              markerHeight="9"
              refX="6"
              refY="4.2"
              orient="auto"
            >
              <path
                d="M1.5 1.5 L7 4.2 L1.5 6.9"
                fill="none"
                stroke="rgba(165,177,194,.72)"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </marker>
          </defs>

          {/* faint structural lines */}
          <path className="ln" d="M196,310 C196,170 380,125 638,125" markerEnd="url(#ragp-ah-gray)" />
          <path className="ln" d="M781,196 L781,386" markerEnd="url(#ragp-ah-gray)" />
          <path className="ln" d="M584,436 C612,436 606,468 620,468" markerEnd="url(#ragp-ah-gray)" />
          <path className="ln" d="M782,688 L782,574" markerEnd="url(#ragp-ah-gray)" />
          <path className="ln" d="M944,452 C982,452 984,378 1010,378" markerEnd="url(#ragp-ah-gray)" />
          <path className="ln" d="M944,480 C980,480 984,504 1010,504" markerEnd="url(#ragp-ah-gray)" />
          <path className="ln" d="M944,510 C982,510 985,630 1010,630" markerEnd="url(#ragp-ah-gray)" />
          <path className="ln" d="M1250,378 C1282,378 1288,452 1298,458" markerEnd="url(#ragp-ah-gray)" />
          <path className="ln" d="M1250,504 C1280,504 1284,512 1298,512" markerEnd="url(#ragp-ah-gray)" />
          <path className="ln" d="M1250,630 C1282,630 1288,564 1298,558" markerEnd="url(#ragp-ah-gray)" />
          <path className="ln" d="M1464,512 L1488,512" markerEnd="url(#ragp-ah-gray)" />
          <path
            className="ln"
            d="M1615,720 L1615,890 Q1615,912 1595,912 L210,912 Q190,912 190,890 L190,640"
            markerEnd="url(#ragp-ah-gray)"
          />

          {/* blue marking that draws on, step by step */}
          <path className="mark m1" pathLength={100} d="M196,310 C196,170 380,125 638,125" />
          <path className="mark m2" pathLength={100} d="M781,196 L781,386" />
          <path className="mark m2" pathLength={100} d="M584,436 C612,436 606,468 620,468" />
          <path className="mark m2" pathLength={100} d="M782,688 L782,574" />
          <path className="mark m3" pathLength={100} d="M944,452 C982,452 984,378 1010,378" />
          <path className="mark m3" pathLength={100} d="M944,480 C980,480 984,504 1010,504" />
          <path className="mark m3" pathLength={100} d="M944,510 C982,510 985,630 1010,630" />
          <path className="mark m4" pathLength={100} d="M1250,378 C1282,378 1288,452 1298,458" />
          <path className="mark m4" pathLength={100} d="M1250,504 C1280,504 1284,512 1298,512" />
          <path className="mark m4" pathLength={100} d="M1250,630 C1282,630 1288,564 1298,558" />
          <path className="mark m5" pathLength={100} d="M1464,512 L1488,512" />
          <path
            className="mark m6"
            pathLength={100}
            d="M1615,720 L1615,890 Q1615,912 1595,912 L210,912 Q190,912 190,890 L190,640"
          />
        </svg>

        <div className="conn-label" style={{ left: 372, top: 182 }}>
          embed &amp; index
        </div>
        <div className="conn-label" style={{ left: 556, top: 930 }}>
          end-to-end encrypted
        </div>

        {/* ================= TITLE / LEGEND ================= */}
        <div className="title">
          <h1>Retrieval-Augmented Generation</h1>
          <p>From your private documents to grounded, cited answers</p>
        </div>
        <div className="legend">
          <div className="lg">
            <span>active flow step</span>
            <span className="sw blue" />
          </div>
          <div className="lg">
            <span>pipeline connection</span>
            <span className="sw gray" />
          </div>
          <div className="lg">
            <span>stays on your infra</span>
            <span className="lk">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <rect x="5" y="11" width="14" height="9" rx="2" />
                <path d="M8 11V8a4 4 0 0 1 8 0v3" />
              </svg>
            </span>
          </div>
        </div>

        {/* ================= NODES ================= */}

        {/* SOURCES */}
        <div className="node" id="ragp-sources">
          <div className="ng" />
          <div className="hd">
            <span className="ic">
              <svg viewBox="0 0 24 24">
                <path className="i-fill" d="M5 4h7l4 4v9a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z" />
                <path className="i-line" d="M8.5 6.5h5.5l4 4V20a1 1 0 0 1-1 1H8.5a1 1 0 0 1-1-1V7.5a1 1 0 0 1 1-1z" />
                <path className="i-line" d="M14 6.5v4h4M10 14h6M10 16.5h4" />
                <path className="i-line" d="M5 5.5v11" />
              </svg>
            </span>
            <span className="t">Private Sources</span>
            <span className="kick">Ingest</span>
          </div>
          <div className="sub">Your documents, indexed on-premise</div>
          <div className="rule" />
          <div className="chips">
            <div className="chip">
              <span className="nm">PDF</span>
              <span className="vb" style={v({ "--w": "84%" })} />
              <span className="ct">612</span>
            </div>
            <div className="chip">
              <span className="nm">DOCX</span>
              <span className="vb" style={v({ "--w": "58%" })} />
              <span className="ct">418</span>
            </div>
            <div className="chip">
              <span className="nm">MD</span>
              <span className="vb" style={v({ "--w": "44%" })} />
              <span className="ct">307</span>
            </div>
            <div className="chip">
              <span className="nm">TXT</span>
              <span className="vb" style={v({ "--w": "30%" })} />
              <span className="ct">144</span>
            </div>
          </div>
          <div className="tags">
            <span className="tag">chunk 512t</span>
            <span className="tag">overlap 64t</span>
          </div>
        </div>

        {/* QUERY */}
        <div className="node" id="ragp-query">
          <div className="ng" />
          <div className="hd">
            <span className="ic">
              <svg viewBox="0 0 24 24">
                <path className="i-fill" d="M4 5h16a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H10l-4 3v-3H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z" />
                <path className="i-line" d="M4 5h16a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H10l-4 3v-3H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z" />
                <path className="i-line" d="M7.5 9.5h9M7.5 12h6" />
              </svg>
            </span>
            <span className="t">Query</span>
            <span className="kick">Request</span>
          </div>
          <div className="qbox">&ldquo;Best practices for cloud access control?&rdquo;</div>
        </div>

        {/* VECTOR DB */}
        <div className="node" id="ragp-vectordb">
          <div className="ng" />
          <div className="hd">
            <span className="ic">
              <svg viewBox="0 0 24 24">
                <ellipse className="i-fill" cx="12" cy="6" rx="7" ry="2.6" />
                <path className="i-line" d="M5 6c0-1.4 3.1-2.6 7-2.6s7 1.2 7 2.6-3.1 2.6-7 2.6-7-1.2-7-2.6z" />
                <path className="i-line" d="M5 6v12c0 1.4 3.1 2.6 7 2.6s7-1.2 7-2.6V6" />
                <path className="i-line" d="M5 12c0 1.4 3.1 2.6 7 2.6s7-1.2 7-2.6" />
              </svg>
            </span>
            <span className="t">Vector Store</span>
            <span className="kick">Index</span>
          </div>
          <div className="sub">Embeddings searchable by meaning</div>
          <div className="vec">
            <i style={v({ "--h": "46%" })} />
            <i style={v({ "--h": "72%" })} />
            <i style={v({ "--h": "32%" })} />
            <i style={v({ "--h": "88%" })} />
            <i style={v({ "--h": "54%" })} />
            <i style={v({ "--h": "66%" })} />
            <i style={v({ "--h": "38%" })} />
            <i style={v({ "--h": "80%" })} />
            <i style={v({ "--h": "48%" })} />
            <i style={v({ "--h": "92%" })} />
            <i style={v({ "--h": "30%" })} />
            <i style={v({ "--h": "62%" })} />
            <i style={v({ "--h": "74%" })} />
            <i style={v({ "--h": "42%" })} />
            <i style={v({ "--h": "58%" })} />
            <i style={v({ "--h": "36%" })} />
          </div>
          <div className="tags">
            <span className="tag">pgvector</span>
            <span className="tag">1536-d</span>
            <span className="tag">HNSW</span>
          </div>
        </div>

        {/* CORE */}
        <div className="node" id="ragp-core">
          <div className="ng" />
          <div className="core-ring">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="6.5" />
              <path d="M16 16 L21 21" />
              <path d="M8.4 11h5.2M11 8.4v5.2" />
            </svg>
          </div>
          <div>
            <div className="core-title">
              Retrieval<span>Semantic Search</span>
            </div>
          </div>
          <div className="core-tags">
            <span className="tag">top-k = 8</span>
            <span className="tag">cosine</span>
          </div>
        </div>

        {/* HYBRID */}
        <div className="node" id="ragp-hybrid">
          <div className="ng" />
          <div className="hd">
            <span className="ic">
              <svg viewBox="0 0 24 24">
                <path className="i-line" d="M4 7h16M4 17h16" />
                <circle className="i-fill" cx="9" cy="7" r="2.7" />
                <circle className="i-line" cx="9" cy="7" r="2.7" />
                <circle className="i-fill" cx="15" cy="17" r="2.7" />
                <circle className="i-line" cx="15" cy="17" r="2.7" />
              </svg>
            </span>
            <span className="t">Hybrid Search</span>
            <span className="kick">Fusion</span>
          </div>
          <div className="sub">Lexical + semantic, fused with RRF</div>
          <div className="blend">
            <div className="brow">
              <span className="bl">Vector</span>
              <span className="bbar" style={v({ "--w": "65%" })} />
              <span className="bv">0.65</span>
            </div>
            <div className="brow">
              <span className="bl">BM25</span>
              <span className="bbar" style={v({ "--w": "35%" })} />
              <span className="bv">0.35</span>
            </div>
          </div>
        </div>

        {/* RESULTS */}
        <div className="label" style={{ left: 1010, top: 294 }}>
          Top results · most relevant chunks
        </div>
        <div className="node result" id="ragp-res1">
          <div className="ng" />
          <span className="rank">1</span>
          <span className="rmid">
            <span className="rsrc">iam-policy.pdf · p.12</span>
            <span className="rlines">
              <i className="rl w1" />
              <i className="rl w2" />
            </span>
          </span>
          <span className="rscore">0.81</span>
        </div>
        <div className="node result" id="ragp-res2">
          <div className="ng" />
          <span className="rank">2</span>
          <span className="rmid">
            <span className="rsrc">security-guide.md · §4</span>
            <span className="rlines">
              <i className="rl w1" />
              <i className="rl w2" />
            </span>
          </span>
          <span className="rscore">0.76</span>
        </div>
        <div className="node result" id="ragp-res3">
          <div className="ng" />
          <span className="rank">3</span>
          <span className="rmid">
            <span className="rsrc">runbook.docx · p.3</span>
            <span className="rlines">
              <i className="rl w1" />
              <i className="rl w2" />
            </span>
          </span>
          <span className="rscore">0.69</span>
        </div>

        {/* RERANK */}
        <div className="node" id="ragp-rerank">
          <div className="ng" />
          <div className="hd">
            <span className="ic">
              <svg viewBox="0 0 24 24">
                <path className="i-fill" d="M4 5h16l-6 7v6l-4 2v-8z" />
                <path className="i-line" d="M4 5h16l-6 7v5.5l-4 2V12z" />
              </svg>
            </span>
            <span className="t">Rerank</span>
          </div>
          <div className="sub" style={{ fontSize: "9.5px" }}>
            Cross-encoder scoring
          </div>
          <div className="scores">
            <div className="score top">
              <span className="k">2</span>
              <span className="bar">
                <i style={{ width: "96%" }} />
              </span>
              <span className="v">0.92</span>
            </div>
            <div className="score">
              <span className="k">1</span>
              <span className="bar">
                <i style={{ width: "84%" }} />
              </span>
              <span className="v">0.87</span>
            </div>
            <div className="score">
              <span className="k">3</span>
              <span className="bar">
                <i style={{ width: "62%" }} />
              </span>
              <span className="v">0.74</span>
            </div>
          </div>
        </div>

        {/* ANSWER */}
        <div className="node" id="ragp-answer">
          <div className="ng" />
          <div className="hd">
            <span className="t">Grounded Answer</span>
            <span className="kick">Generate</span>
          </div>
          <div className="ans-body">
            Apply least-privilege access and rotate credentials regularly
            <span className="cite">1</span>
            <span className="cite">2</span>
          </div>
          <div className="ans-fill">
            <i className="afl a" />
            <i className="afl b" />
            <i className="afl c" />
          </div>
          <div className="sources-row">
            <span className="lab">Sources</span>
            <span className="schip on">1</span>
            <span className="schip on">2</span>
            <span className="schip">3</span>
          </div>
        </div>

        {/* SECURE */}
        <div className="node" id="ragp-secure">
          <span className="lk">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
              <rect x="5" y="11" width="14" height="9" rx="2" />
              <path d="M8 11V8a4 4 0 0 1 8 0v3" />
            </svg>
          </span>
          <span className="t">Private &amp; Secure</span>
        </div>
      </div>

      <style jsx global>{`
        .ragp {
          --bg: #0d0d0f;
          --panel: #131315;
          --panel-2: #0d0f13;
          --line: rgba(255, 255, 255, 0.07);
          --line-2: rgba(255, 255, 255, 0.14);
          --ink: #eaedf2;
          --muted: #969ca6;
          --faint: #5c636d;
          /* Aligned to the page's blue so the diagram reads as part of it. */
          --blue: #4d8dff;
          --blue-bright: #6aa3ff;
          --blue-deep: #2f6fe6;
          --blue-faint: rgba(77, 141, 255, 0.12);
          --display: var(--font-open-sans), -apple-system, sans-serif;
          --body: var(--font-open-sans), -apple-system, sans-serif;
          --mono: var(--font-geist-mono), ui-monospace, Menlo, monospace;
          --T: 13s;

          position: relative;
          width: 100%;
          aspect-ratio: ${CW} / ${CH};
          overflow: hidden;
          /* No outer bounding box — the diagram sits directly on the page. */
          border: none;
          background: transparent;
          box-shadow: none;
          border-radius: 0;
        }
        .ragp * {
          box-sizing: border-box;
          margin: 0;
          padding: 0;
        }
        .ragp .canvas {
          position: absolute;
          left: 0;
          top: 0;
          transform-origin: top left;
          width: ${CW}px;
          height: ${CH}px;
          color: var(--ink);
          -webkit-font-smoothing: antialiased;
          font-family: var(--body);
        }

        .ragp svg.links {
          position: absolute;
          inset: 0;
          width: ${CW}px;
          height: ${CH}px;
          overflow: visible;
          pointer-events: none;
        }
        .ragp .ln {
          fill: none;
          stroke: rgba(165, 177, 194, 0.4);
          stroke-width: 1.6;
          stroke-dasharray: 5 6;
        }
        .ragp .mark {
          fill: none;
          stroke: var(--blue-bright);
          stroke-width: 2.8;
          stroke-linecap: round;
          stroke-linejoin: round;
          stroke-dasharray: 100;
          stroke-dashoffset: 100;
          opacity: 0;
          filter: url(#ragp-glow);
        }
        .ragp .m1 {
          animation: ragp-draw1 var(--T) linear infinite;
        }
        .ragp .m2 {
          animation: ragp-draw2 var(--T) linear infinite;
        }
        .ragp .m3 {
          animation: ragp-draw3 var(--T) linear infinite;
        }
        .ragp .m4 {
          animation: ragp-draw4 var(--T) linear infinite;
        }
        .ragp .m5 {
          animation: ragp-draw5 var(--T) linear infinite;
        }
        .ragp .m6 {
          animation: ragp-draw6 var(--T) linear infinite;
        }
        @keyframes ragp-draw1 {
          0% { stroke-dashoffset: 100; opacity: 0; }
          1% { opacity: 1; }
          8% { stroke-dashoffset: 0; opacity: 1; }
          13% { stroke-dashoffset: 0; opacity: 1; }
          16.6% { stroke-dashoffset: 0; opacity: 0; }
          100% { stroke-dashoffset: 0; opacity: 0; }
        }
        @keyframes ragp-draw2 {
          0%, 16.6% { stroke-dashoffset: 100; opacity: 0; }
          17.6% { opacity: 1; }
          24.6% { stroke-dashoffset: 0; opacity: 1; }
          29.6% { stroke-dashoffset: 0; opacity: 1; }
          33.3% { stroke-dashoffset: 0; opacity: 0; }
          100% { opacity: 0; }
        }
        @keyframes ragp-draw3 {
          0%, 33.3% { stroke-dashoffset: 100; opacity: 0; }
          34.3% { opacity: 1; }
          41.3% { stroke-dashoffset: 0; opacity: 1; }
          46.3% { stroke-dashoffset: 0; opacity: 1; }
          50% { stroke-dashoffset: 0; opacity: 0; }
          100% { opacity: 0; }
        }
        @keyframes ragp-draw4 {
          0%, 50% { stroke-dashoffset: 100; opacity: 0; }
          51% { opacity: 1; }
          58% { stroke-dashoffset: 0; opacity: 1; }
          63% { stroke-dashoffset: 0; opacity: 1; }
          66.6% { stroke-dashoffset: 0; opacity: 0; }
          100% { opacity: 0; }
        }
        @keyframes ragp-draw5 {
          0%, 66.6% { stroke-dashoffset: 100; opacity: 0; }
          67.6% { opacity: 1; }
          74.6% { stroke-dashoffset: 0; opacity: 1; }
          79.6% { stroke-dashoffset: 0; opacity: 1; }
          83.3% { stroke-dashoffset: 0; opacity: 0; }
          100% { opacity: 0; }
        }
        @keyframes ragp-draw6 {
          0%, 83.3% { stroke-dashoffset: 100; opacity: 0; }
          84.3% { opacity: 1; }
          92% { stroke-dashoffset: 0; opacity: 1; }
          97% { stroke-dashoffset: 0; opacity: 1; }
          100% { stroke-dashoffset: 0; opacity: 0; }
        }

        .ragp .node {
          position: absolute;
          border-radius: 16px;
          background: var(--panel);
          border: 1px solid var(--line);
          padding: 15px 17px;
          box-shadow: 0 16px 38px rgba(0, 0, 0, 0.5), inset 0 1px 0 rgba(255, 255, 255, 0.04);
        }
        .ragp .ng {
          position: absolute;
          inset: -1px;
          border-radius: 16px;
          pointer-events: none;
          opacity: 0;
          border: 1.5px solid rgba(63, 134, 255, 0.6);
          box-shadow: 0 0 0 1px rgba(63, 134, 255, 0.18), 0 0 46px rgba(47, 111, 230, 0.42),
            inset 0 0 30px rgba(47, 111, 230, 0.1);
        }
        .ragp .hd {
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .ragp .hd .t {
          font-family: var(--display);
          font-size: 13.5px;
          font-weight: 800;
          letter-spacing: 0.045em;
          color: var(--blue-bright);
          text-transform: uppercase;
          white-space: nowrap;
        }
        .ragp .kick {
          font-family: var(--mono);
          font-size: 9px;
          font-weight: 500;
          letter-spacing: 0.1em;
          color: var(--faint);
          text-transform: uppercase;
          margin-left: auto;
          padding-left: 8px;
        }
        .ragp .sub {
          font-family: var(--mono);
          color: var(--muted);
          font-size: 10.5px;
          letter-spacing: 0;
          margin-top: 8px;
          font-weight: 400;
          line-height: 1.45;
        }
        .ragp .rule {
          height: 1px;
          background: var(--line);
          margin: 13px 0;
        }
        .ragp .ic {
          width: 34px;
          height: 34px;
          border-radius: 9px;
          flex: none;
          display: grid;
          place-items: center;
          background: rgba(255, 255, 255, 0.035);
          border: 1px solid var(--line);
          color: #c2c9d2;
        }
        .ragp .ic svg {
          width: 20px;
          height: 20px;
        }
        .ragp .i-fill {
          fill: currentColor;
          opacity: 0.18;
        }
        .ragp .i-line {
          fill: none;
          stroke: currentColor;
          stroke-width: 1.7;
          stroke-linecap: round;
          stroke-linejoin: round;
        }
        .ragp .tags {
          display: flex;
          gap: 7px;
          flex-wrap: wrap;
          margin-top: 12px;
        }
        .ragp .tag {
          font-family: var(--mono);
          font-size: 10px;
          color: var(--muted);
          border: 1px solid var(--line-2);
          border-radius: 6px;
          padding: 3px 8px;
          letter-spacing: 0.02em;
        }

        .ragp #ragp-sources {
          left: 60px;
          top: 310px;
          width: 272px;
          height: 330px;
        }
        .ragp .chips {
          display: flex;
          flex-direction: column;
          gap: 9px;
          margin-top: 13px;
        }
        .ragp .chip {
          display: flex;
          align-items: center;
          gap: 11px;
        }
        .ragp .chip .nm {
          font-family: var(--mono);
          font-size: 10.5px;
          color: var(--ink);
          width: 42px;
          letter-spacing: 0.03em;
        }
        .ragp .chip .vb {
          flex: 1;
          height: 6px;
          border-radius: 4px;
          background: rgba(255, 255, 255, 0.06);
          position: relative;
          overflow: hidden;
        }
        .ragp .chip .vb::after {
          content: "";
          position: absolute;
          inset: 0;
          width: var(--w);
          border-radius: 4px;
          background: rgba(255, 255, 255, 0.32);
        }
        .ragp .chip .ct {
          font-family: var(--mono);
          font-size: 9.5px;
          color: var(--faint);
          width: 30px;
          text-align: right;
        }

        .ragp #ragp-query {
          left: 402px;
          top: 382px;
          width: 182px;
          height: 108px;
        }
        .ragp .qbox {
          margin-top: 11px;
          border-left: 2px solid var(--line-2);
          padding: 2px 0 2px 10px;
          font-family: var(--mono);
          font-size: 10.5px;
          color: var(--ink);
          font-weight: 400;
          line-height: 1.5;
        }

        .ragp #ragp-vectordb {
          left: 638px;
          top: 56px;
          width: 286px;
          height: 140px;
        }
        .ragp .vec {
          display: flex;
          align-items: flex-end;
          gap: 3px;
          height: 30px;
          margin-top: 13px;
        }
        .ragp .vec i {
          flex: 1;
          background: linear-gradient(180deg, rgba(255, 255, 255, 0.46), rgba(255, 255, 255, 0.14));
          border-radius: 2px;
          height: var(--h);
        }

        .ragp #ragp-core {
          left: 620px;
          top: 386px;
          width: 324px;
          height: 188px;
          border-color: rgba(63, 134, 255, 0.3);
          box-shadow: 0 20px 54px rgba(0, 0, 0, 0.6), 0 0 60px rgba(47, 111, 230, 0.18),
            inset 0 1px 0 rgba(255, 255, 255, 0.05);
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          text-align: center;
          gap: 12px;
        }
        .ragp .core-ring {
          width: 56px;
          height: 56px;
          border-radius: 50%;
          display: grid;
          place-items: center;
          background: radial-gradient(circle at 50% 34%, #1b2740, #0d1014);
          border: 1.5px solid rgba(63, 134, 255, 0.5);
          box-shadow: 0 0 22px rgba(63, 134, 255, 0.32), inset 0 0 14px rgba(63, 134, 255, 0.16);
        }
        .ragp .core-ring svg {
          width: 25px;
          height: 25px;
          color: var(--blue-bright);
        }
        .ragp .core-title {
          font-family: var(--display);
          font-size: 15px;
          font-weight: 800;
          letter-spacing: 0.04em;
          color: var(--blue-bright);
          text-transform: uppercase;
        }
        .ragp .core-title span {
          font-family: var(--mono);
          display: block;
          font-size: 9px;
          color: var(--muted);
          font-weight: 500;
          margin-top: 6px;
          letter-spacing: 0.08em;
        }
        .ragp .core-tags {
          display: flex;
          gap: 7px;
        }

        .ragp #ragp-hybrid {
          left: 620px;
          top: 688px;
          width: 324px;
          height: 122px;
        }
        .ragp .blend {
          margin-top: 13px;
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .ragp .brow {
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .ragp .brow .bl {
          font-family: var(--mono);
          font-size: 10px;
          color: var(--ink);
          width: 48px;
          letter-spacing: 0.03em;
        }
        .ragp .brow .bbar {
          flex: 1;
          height: 6px;
          border-radius: 4px;
          background: rgba(255, 255, 255, 0.06);
          position: relative;
          overflow: hidden;
        }
        .ragp .brow .bbar::after {
          content: "";
          position: absolute;
          inset: 0;
          width: var(--w);
          border-radius: 4px;
          background: rgba(255, 255, 255, 0.34);
        }
        .ragp .brow .bv {
          font-family: var(--mono);
          font-size: 9.5px;
          color: var(--faint);
          width: 34px;
          text-align: right;
        }

        .ragp .result {
          left: 1010px;
          width: 240px;
          height: 112px;
          display: flex;
          align-items: center;
          gap: 13px;
          padding: 0 17px;
        }
        .ragp #ragp-res1 {
          top: 322px;
        }
        .ragp #ragp-res2 {
          top: 448px;
        }
        .ragp #ragp-res3 {
          top: 574px;
        }
        .ragp #ragp-res2 {
          border-color: rgba(63, 134, 255, 0.5);
          box-shadow: 0 16px 42px rgba(0, 0, 0, 0.55), 0 0 40px rgba(47, 111, 230, 0.26),
            inset 0 1px 0 rgba(255, 255, 255, 0.05);
        }
        .ragp .rank {
          width: 25px;
          height: 25px;
          border-radius: 7px;
          display: grid;
          place-items: center;
          flex: none;
          font-family: var(--mono);
          font-size: 11.5px;
          font-weight: 700;
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid var(--line-2);
          color: var(--muted);
        }
        .ragp #ragp-res2 .rank {
          background: var(--blue);
          border-color: var(--blue);
          color: #fff;
          box-shadow: 0 0 15px rgba(63, 134, 255, 0.55);
        }
        .ragp .rmid {
          flex: 1;
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .ragp .rsrc {
          font-family: var(--mono);
          font-size: 9px;
          color: var(--faint);
          letter-spacing: 0.04em;
        }
        .ragp .rlines {
          display: flex;
          flex-direction: column;
          gap: 5px;
        }
        .ragp .rl {
          height: 4px;
          border-radius: 3px;
          background: rgba(255, 255, 255, 0.1);
        }
        .ragp #ragp-res2 .rl {
          background: rgba(120, 170, 255, 0.42);
        }
        .ragp .rl.w1 {
          width: 92%;
        }
        .ragp .rl.w2 {
          width: 68%;
        }
        .ragp .rscore {
          font-family: var(--mono);
          font-size: 11px;
          color: var(--muted);
          font-weight: 700;
          flex: none;
        }
        .ragp #ragp-res2 .rscore {
          color: var(--blue-bright);
        }

        .ragp #ragp-rerank {
          left: 1298px;
          top: 400px;
          width: 166px;
          height: 215px;
        }
        .ragp .scores {
          margin-top: 14px;
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
        .ragp .score {
          display: flex;
          align-items: center;
          gap: 9px;
          font-family: var(--mono);
          font-size: 11.5px;
        }
        .ragp .score .k {
          color: var(--faint);
          width: 9px;
        }
        .ragp .score .bar {
          flex: 1;
          height: 5px;
          border-radius: 3px;
          background: rgba(255, 255, 255, 0.07);
          overflow: hidden;
        }
        .ragp .score .bar i {
          display: block;
          height: 100%;
          border-radius: 3px;
          background: rgba(255, 255, 255, 0.24);
        }
        .ragp .score .v {
          color: var(--muted);
          width: 32px;
          text-align: right;
        }
        .ragp .score.top .k {
          color: var(--blue-bright);
        }
        .ragp .score.top .v {
          color: var(--blue-bright);
          font-weight: 700;
        }
        .ragp .score.top .bar i {
          background: linear-gradient(90deg, var(--blue-deep), var(--blue-bright));
          box-shadow: 0 0 9px rgba(63, 134, 255, 0.5);
        }

        .ragp #ragp-answer {
          left: 1488px;
          top: 290px;
          width: 255px;
          height: 430px;
          padding: 19px;
          display: flex;
          flex-direction: column;
        }
        .ragp .ans-body {
          margin-top: 13px;
          font-size: 15.5px;
          line-height: 1.5;
          color: var(--ink);
          font-weight: 700;
        }
        .ragp .cite {
          display: inline-block;
          font-family: var(--mono);
          font-size: 11px;
          color: var(--blue-bright);
          border: 1px solid rgba(63, 134, 255, 0.45);
          border-radius: 5px;
          padding: 0 5px;
          margin-left: 2px;
          background: var(--blue-faint);
          vertical-align: 1px;
        }
        .ragp .ans-fill {
          display: flex;
          flex-direction: column;
          gap: 8px;
          margin-top: 16px;
        }
        .ragp .afl {
          height: 5px;
          border-radius: 3px;
          background: rgba(255, 255, 255, 0.07);
        }
        .ragp .afl.a {
          width: 100%;
        }
        .ragp .afl.b {
          width: 90%;
        }
        .ragp .afl.c {
          width: 58%;
        }
        .ragp .sources-row {
          margin-top: auto;
          padding-top: 16px;
          border-top: 1px solid var(--line);
          display: flex;
          align-items: center;
          gap: 9px;
        }
        .ragp .sources-row .lab {
          font-family: var(--mono);
          font-size: 9px;
          letter-spacing: 0.1em;
          color: var(--faint);
          text-transform: uppercase;
          font-weight: 500;
        }
        .ragp .schip {
          width: 27px;
          height: 27px;
          border-radius: 7px;
          display: grid;
          place-items: center;
          font-family: var(--mono);
          font-size: 11.5px;
          border: 1px solid var(--line-2);
          color: var(--faint);
        }
        .ragp .schip.on {
          border-color: rgba(63, 134, 255, 0.5);
          color: var(--blue-bright);
          background: var(--blue-faint);
        }

        .ragp #ragp-secure {
          left: 758px;
          top: 856px;
          width: 248px;
          height: 54px;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 11px;
          border-radius: 30px;
          padding: 0;
        }
        .ragp #ragp-secure .lk {
          width: 15px;
          height: 15px;
          color: var(--blue-bright);
        }
        .ragp #ragp-secure .t {
          font-family: var(--display);
          font-size: 12.5px;
          font-weight: 800;
          letter-spacing: 0.07em;
          color: var(--ink);
          text-transform: uppercase;
          white-space: nowrap;
        }

        .ragp .label {
          position: absolute;
          font-family: var(--mono);
          font-size: 10px;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: var(--faint);
          font-weight: 500;
          white-space: nowrap;
        }
        .ragp .conn-label {
          position: absolute;
          font-family: var(--mono);
          font-size: 10px;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          color: var(--faint);
          background: var(--bg);
          padding: 2px 8px;
          border-radius: 5px;
        }
        .ragp .title {
          position: absolute;
          left: 60px;
          top: 52px;
        }
        .ragp .title h1 {
          font-family: var(--display);
          font-size: 23px;
          font-weight: 800;
          letter-spacing: -0.01em;
          color: var(--ink);
          white-space: nowrap;
        }
        .ragp .title h1 b {
          color: var(--blue-bright);
        }
        .ragp .title p {
          margin-top: 10px;
          font-family: var(--mono);
          font-size: 11px;
          color: var(--muted);
          letter-spacing: 0;
          font-weight: 400;
          white-space: nowrap;
        }
        .ragp .legend {
          position: absolute;
          right: 60px;
          top: 56px;
          display: flex;
          flex-direction: column;
          gap: 9px;
          align-items: flex-end;
        }
        .ragp .lg {
          font-family: var(--mono);
          display: flex;
          align-items: center;
          gap: 10px;
          font-size: 10px;
          color: var(--muted);
          font-weight: 400;
          letter-spacing: 0;
          white-space: nowrap;
        }
        .ragp .lg .sw {
          width: 30px;
          height: 0;
          border-top: 2px solid;
        }
        .ragp .lg .blue {
          border-color: var(--blue);
        }
        .ragp .lg .gray {
          border-top: 2px dashed rgba(150, 162, 178, 0.5);
        }
        .ragp .lg .lk {
          width: 13px;
          height: 13px;
          color: var(--faint);
        }

        .ragp #ragp-sources .ng {
          animation: ragp-ng1 var(--T) ease-in-out infinite;
        }
        .ragp #ragp-vectordb .ng {
          animation: ragp-ng2 var(--T) ease-in-out infinite;
        }
        .ragp #ragp-query .ng {
          animation: ragp-ng3 var(--T) ease-in-out infinite;
        }
        .ragp #ragp-hybrid .ng {
          animation: ragp-ng3 var(--T) ease-in-out infinite;
        }
        .ragp #ragp-core .ng {
          animation: ragp-ng4 var(--T) ease-in-out infinite;
        }
        .ragp #ragp-res1 .ng,
        .ragp #ragp-res2 .ng,
        .ragp #ragp-res3 .ng {
          animation: ragp-ng5 var(--T) ease-in-out infinite;
        }
        .ragp #ragp-rerank .ng {
          animation: ragp-ng6 var(--T) ease-in-out infinite;
        }
        .ragp #ragp-answer .ng {
          animation: ragp-ng7 var(--T) ease-in-out infinite;
        }
        @keyframes ragp-ng1 {
          0% { opacity: 1; }
          5% { opacity: 1; }
          9% { opacity: 0; }
          92% { opacity: 0; }
          96% { opacity: 1; }
          100% { opacity: 1; }
        }
        @keyframes ragp-ng2 {
          0%, 11% { opacity: 0; }
          14% { opacity: 1; }
          17% { opacity: 1; }
          21% { opacity: 0; }
          100% { opacity: 0; }
        }
        @keyframes ragp-ng3 {
          0%, 18% { opacity: 0; }
          21% { opacity: 1; }
          25% { opacity: 1; }
          29% { opacity: 0; }
          100% { opacity: 0; }
        }
        @keyframes ragp-ng4 {
          0%, 28% { opacity: 0; }
          31% { opacity: 1; }
          34% { opacity: 1; }
          38% { opacity: 0; }
          100% { opacity: 0; }
        }
        @keyframes ragp-ng5 {
          0%, 45% { opacity: 0; }
          47% { opacity: 1; }
          51% { opacity: 1; }
          55% { opacity: 0; }
          100% { opacity: 0; }
        }
        @keyframes ragp-ng6 {
          0%, 61% { opacity: 0; }
          64% { opacity: 1; }
          67% { opacity: 1; }
          71% { opacity: 0; }
          100% { opacity: 0; }
        }
        @keyframes ragp-ng7 {
          0%, 78% { opacity: 0; }
          81% { opacity: 1; }
          85% { opacity: 1; }
          89% { opacity: 0; }
          100% { opacity: 0; }
        }

        @media (prefers-reduced-motion: reduce) {
          .ragp .mark,
          .ragp .ng {
            animation: none !important;
          }
        }
      `}</style>
    </div>
  );
}
