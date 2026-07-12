"use client";

// AI Use Cases — faithful port of the standalone design at
// public/AI Use Cases.html. All styles are namespaced under `.aiuc` (and
// keyframes under `aiuc-*`) so nothing leaks into the rest of the app. The
// text animations (typewriter / decrypt / code-ghost typing) are reproduced
// in the effect below. Nav + footer are omitted — the marketing layout
// already provides them.

import { useEffect, useRef } from "react";
import Link from "next/link";

import PixelBlast from "@/components/hero/pixel-blast";
import RagPipelineDiagram from "./rag-pipeline-diagram";
import CodeEditorDemo from "./code-editor-demo";

export default function AiUseCasesContent() {
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    let cancelled = false;
    const timers: number[] = [];
    const rafs: number[] = [];
    const after = (fn: () => void, ms: number) => {
      const id = window.setTimeout(() => {
        if (!cancelled) fn();
      }, ms);
      timers.push(id);
      return id;
    };
    const frame = (fn: (ts: number) => void) => {
      const id = window.requestAnimationFrame((ts) => {
        if (!cancelled) fn(ts);
      });
      rafs.push(id);
      return id;
    };

    const CHARS_DEFAULT =
      "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*";
    const CHARS_NUM = "0123456789.,";
    const CHARS_CODE = "{}[]();,.:=+-*/<>?\"'_@#&|";

    const pickCharset = (text: string) => {
      if (/^[\d.,+%MKkBb]+$/.test(text)) return CHARS_NUM;
      if (/[{}[\]();:=<>/"']/.test(text)) return CHARS_CODE;
      return CHARS_DEFAULT;
    };
    const rand = (set: string) => set[(Math.random() * set.length) | 0];

    // ===== DECRYPT / SCRAMBLE =====
    function decrypt(el: HTMLElement) {
      const final = el.dataset.final ?? el.textContent ?? "";
      const charset = pickCharset(final);
      const delay = parseInt(el.dataset.delay || "0", 10);
      const totalDur = 900;
      const perChar = totalDur / Math.max(final.length, 1);
      const buf = final.split("").map((c) => (c === " " ? " " : rand(charset)));
      el.textContent = buf.join("");
      let start: number | null = null;
      const step = (ts: number) => {
        if (start === null) start = ts;
        const t = ts - start;
        const settled = Math.min(final.length, Math.floor(t / perChar));
        for (let i = 0; i < final.length; i++) {
          if (i < settled) buf[i] = final[i];
          else if (final[i] !== " ") buf[i] = rand(charset);
        }
        el.textContent = buf.join("");
        if (settled < final.length) frame(step);
        else el.textContent = final;
      };
      after(() => frame(step), delay);
    }

    // ===== TYPEWRITER =====
    function typewriter(el: HTMLElement) {
      const text = el.dataset.text ?? el.textContent ?? "";
      const delay = parseInt(el.dataset.delay || "0", 10);
      const speed = parseInt(el.dataset.speed || "32", 10);
      el.textContent = "";
      const caret = document.createElement("span");
      caret.className = "cursor";
      el.appendChild(caret);
      let i = 0;
      const step = () => {
        if (cancelled) return;
        if (i < text.length) {
          caret.insertAdjacentText("beforebegin", text[i]);
          i++;
          after(step, speed + Math.random() * 30);
        } else {
          after(() => caret.remove(), 600);
        }
      };
      after(step, delay);
    }

    // ===== KICK OFF =====
    root
      .querySelectorAll<HTMLElement>("[data-decrypt]")
      .forEach((el) => decrypt(el));
    root
      .querySelectorAll<HTMLElement>("[data-typewriter]")
      .forEach((el) => typewriter(el));

    return () => {
      cancelled = true;
      timers.forEach((id) => window.clearTimeout(id));
      rafs.forEach((id) => window.cancelAnimationFrame(id));
    };
  }, []);

  return (
    <div className="aiuc" ref={rootRef}>
      {/* ================ HERO ================ */}
      <header className="hero">
        <div className="hero-bg" data-bg aria-hidden="true">
          <PixelBlast
            variant="circle"
            color="#4d8dff"
            pixelSize={5}
            patternScale={3}
            patternDensity={0.7}
            pixelSizeJitter={0.4}
            enableRipples={false}
            speed={0.3}
            edgeFade={0.4}
            transparent
          />
        </div>
        <h1>
          Four patterns. <span className="ital">One API.</span>
          <br />
          <span className="blue">Ship AI to production.</span>
        </h1>
        <p className="lede">
          <span className="colon" />
          <span className="hl">
            From conversational agents to document understanding
          </span>{" "}
          — every workload runs on the same control plane, the same key, and one
          consolidated bill.
        </p>
        <div className="hero-actions">
          <Link href="/signup" className="btn primary">
            Start building
          </Link>
          <Link href="/api-docs" className="btn">
            Read the docs →
          </Link>
        </div>

        <div className="hero-meta">
          <div className="meta-cell">
            <div className="k">Models</div>
            <div className="v">
              <span className="num">50+</span> <small>hosted</small>
            </div>
          </div>
          <div className="meta-cell">
            <div className="k">Median TTFT</div>
            <div className="v">
              <span className="num">380</span>
              <small>ms</small>
            </div>
          </div>
          <div className="meta-cell">
            <div className="k">Context</div>
            <div className="v">
              <span className="num">1M</span> <small>tokens</small>
            </div>
          </div>
          <div className="meta-cell">
            <div className="k">Uptime SLA</div>
            <div className="v">
              <span className="num">99.99</span>
              <small>%</small>
            </div>
          </div>
        </div>
      </header>

      <div className="section-divider">
        <hr />
      </div>

      {/* ================ SECTION 01 — CHATBOTS ================ */}
      <section className="section" id="chatbots">
        <div className="section-head">
          <div className="section-num">
            01<span className="bar" />
          </div>
          <div>
            <h2>
              <span className="blue">Conversational agents</span> that{" "}
              <span className="ital">act,</span> not just answer.
            </h2>
            <p className="blurb">
              <span className="colon" />
              <span className="hl">
                Streaming responses, tool calls, and persistent memory
              </span>{" "}
              — wired together with first-class function calling and
              OpenAI-compatible endpoints.
            </p>
          </div>
        </div>

        <div className="split">
          <div>
            <div className="icon-badge" aria-hidden="true">
              <div style={{ position: "relative", width: 28, height: 24 }}>
                <div
                  style={{
                    position: "absolute",
                    left: 0,
                    top: 0,
                    width: 18,
                    height: 11,
                    borderRadius: "5px 5px 5px 1px",
                    background: "var(--blue)",
                  }}
                />
                <div
                  style={{
                    position: "absolute",
                    right: 0,
                    bottom: 0,
                    width: 18,
                    height: 11,
                    borderRadius: "5px 5px 1px 5px",
                    background: "rgba(255,255,255,0.25)",
                  }}
                />
              </div>
            </div>

            <ul className="feature-list">
              <li>
                <span className="ico" />
                <div>
                  <span className="ft-title">Streaming responses</span>
                  <span className="ft-sub">
                    Token-by-token output via SSE or WebSocket.
                  </span>
                </div>
              </li>
              <li>
                <span className="ico" />
                <div>
                  <span className="ft-title">Tool / function calling</span>
                  <span className="ft-sub">
                    Native JSON schemas, parallel tool execution.
                  </span>
                </div>
              </li>
              <li>
                <span className="ico" />
                <div>
                  <span className="ft-title">Persistent memory</span>
                  <span className="ft-sub">Thread-scoped state across sessions.</span>
                </div>
              </li>
              <li>
                <span className="ico" />
                <div>
                  <span className="ft-title">Guardrails &amp; moderation</span>
                  <span className="ft-sub">
                    Built-in PII scrubbing and policy filters.
                  </span>
                </div>
              </li>
            </ul>

            <div className="pills">
              <span className="pill on">gpt-4o-mini</span>
              <span className="pill on">claude-haiku</span>
              <span className="pill on">llama-4-scout</span>
              <span className="pill">qwen-2.5-72b</span>
            </div>
          </div>

          <div className="frame" aria-label="Chat agent demo">
            <div className="frame-label">
              <span className="live">●</span>{" "}
              <span
                data-typewriter
                data-text="live · thread #4821"
                data-delay="150"
              />
            </div>
            <div className="chat-stage">
              <div className="msg me">
                <div className="av">U</div>
                <div className="bubble">What&apos;s the status of order #4821?</div>
              </div>
              <div className="tool-call">
                <span className="tag">→ tool_call</span>lookup_order(id: &quot;4821&quot;)
                <span
                  className="out"
                  data-typewriter
                  data-text={'{"status":"shipped","carrier":"DHL","eta":"May 29"}'}
                  data-delay="900"
                />
              </div>
              <div className="msg">
                <div className="av">A</div>
                <div className="bubble">
                  Order <strong>#4821</strong> shipped via DHL — arrives May 29.
                  Want me to share tracking?
                </div>
              </div>
              <div className="msg me">
                <div className="av">U</div>
                <div className="bubble">
                  Yes please
                  <span className="typing">
                    <i />
                    <i />
                    <i />
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="section-divider">
        <hr />
      </div>

      {/* ================ SECTION 02 — RAG ================ */}
      <section className="section" id="rag">
        <div className="section-head">
          <div className="section-num">
            02<span className="bar" />
          </div>
          <div>
            <h2>
              From private docs to{" "}
              <span className="blue">grounded, cited answers.</span>
            </h2>
            <p className="blurb">
              <span className="colon" />
              <span className="hl">
                Ingest, embed, retrieve, rerank, and generate
              </span>{" "}
              — the full retrieval pipeline below, every step running on your own
              infrastructure.
            </p>
          </div>
        </div>

        <RagPipelineDiagram />
      </section>

      <div className="section-divider">
        <hr />
      </div>

      {/* ================ SECTION 03 — CODE GENERATION ================ */}
      <section className="section" id="code">
        <div className="section-head">
          <div className="section-num">
            03<span className="bar" />
          </div>
          <div>
            <h2>
              Code completion, refactors, and{" "}
              <span className="blue">autonomous</span> commits.
            </h2>
            <p className="blurb">
              <span className="colon" />
              <span className="hl">
                Codestral, DeepSeek-Coder, and Qwen-Coder
              </span>{" "}
              — host on dedicated GPUs or stream from the shared pool, with
              fill-in-middle and repo-level context.
            </p>
          </div>
        </div>

        <div className="split">
          <div>
            <div className="icon-badge" aria-hidden="true">
              <div style={{ position: "relative", width: 32, height: 22 }}>
                <div
                  style={{
                    position: "absolute",
                    left: 0,
                    top: "50%",
                    width: 9,
                    height: 9,
                    borderRadius: 2,
                    background: "var(--blue)",
                    transform: "translate(0,-50%) rotate(45deg)",
                  }}
                />
                <div
                  style={{
                    position: "absolute",
                    right: 0,
                    top: "50%",
                    width: 9,
                    height: 9,
                    borderRadius: 2,
                    background: "rgba(255,255,255,0.3)",
                    transform: "translate(0,-50%) rotate(45deg)",
                  }}
                />
                <div
                  style={{
                    position: "absolute",
                    left: 12,
                    top: "50%",
                    width: 8,
                    height: 2,
                    borderRadius: 1,
                    background: "rgba(255,255,255,0.4)",
                    transform: "translateY(-50%)",
                  }}
                />
              </div>
            </div>

            <ul className="feature-list">
              <li>
                <span className="ico" />
                <div>
                  <span className="ft-title">Fill-in-the-middle</span>
                  <span className="ft-sub">
                    Bidirectional context, ghost completions.
                  </span>
                </div>
              </li>
              <li>
                <span className="ico" />
                <div>
                  <span className="ft-title">Repo-level context</span>
                  <span className="ft-sub">128k window across multi-file edits.</span>
                </div>
              </li>
              <li>
                <span className="ico" />
                <div>
                  <span className="ft-title">Dedicated GPU hosting</span>
                  <span className="ft-sub">Your fine-tune, your latency floor.</span>
                </div>
              </li>
              <li>
                <span className="ico" />
                <div>
                  <span className="ft-title">Streaming diffs</span>
                  <span className="ft-sub">Patch-format output for safe applies.</span>
                </div>
              </li>
            </ul>

            <div className="pills">
              <span className="pill on">codestral-22b</span>
              <span className="pill on">deepseek-coder-v2</span>
              <span className="pill on">qwen-coder-32b</span>
              <span className="pill">starcoder-2</span>
            </div>
          </div>

          <div className="frame" aria-label="Code completion demo">
            <div className="frame-label">
              <span
                data-typewriter
                data-text="codestral · 22b · fim"
                data-delay="150"
              />
            </div>
            <CodeEditorDemo />
          </div>
        </div>
      </section>

      <div className="section-divider">
        <hr />
      </div>

      {/* ================ SECTION 04 — DOCUMENT INTEL ================ */}
      <section className="section" id="docs">
        <div className="section-head">
          <div className="section-num">
            04<span className="bar" />
          </div>
          <div>
            <h2>
              Structured data from{" "}
              <span className="blue">unstructured docs.</span>
            </h2>
            <p className="blurb">
              <span className="colon" />
              <span className="hl">
                Long-context models, strict JSON mode, and batch endpoints
              </span>{" "}
              — extract, classify, and summarize at archive scale, on a schedule.
            </p>
          </div>
        </div>

        <div className="split reverse">
          <div>
            <div className="icon-badge" aria-hidden="true">
              <div style={{ position: "relative", width: 24, height: 28 }}>
                <div
                  style={{
                    position: "absolute",
                    left: 4,
                    top: 0,
                    width: 18,
                    height: 24,
                    borderRadius: 3,
                    background: "rgba(255,255,255,0.18)",
                  }}
                />
                <div
                  style={{
                    position: "absolute",
                    left: 0,
                    top: 4,
                    width: 18,
                    height: 24,
                    borderRadius: 3,
                    background: "var(--blue)",
                  }}
                />
                <div
                  style={{
                    position: "absolute",
                    left: 3,
                    top: 9,
                    width: 10,
                    height: 1.5,
                    borderRadius: 1,
                    background: "rgba(0,0,0,0.35)",
                  }}
                />
                <div
                  style={{
                    position: "absolute",
                    left: 3,
                    top: 13,
                    width: 12,
                    height: 1.5,
                    borderRadius: 1,
                    background: "rgba(0,0,0,0.35)",
                  }}
                />
                <div
                  style={{
                    position: "absolute",
                    left: 3,
                    top: 17,
                    width: 8,
                    height: 1.5,
                    borderRadius: 1,
                    background: "rgba(0,0,0,0.35)",
                  }}
                />
              </div>
            </div>

            <ul className="feature-list">
              <li>
                <span className="ico" />
                <div>
                  <span className="ft-title">1M-token context</span>
                  <span className="ft-sub">Whole-PDF, whole-codebase in one pass.</span>
                </div>
              </li>
              <li>
                <span className="ico" />
                <div>
                  <span className="ft-title">Strict JSON mode</span>
                  <span className="ft-sub">
                    Schema-constrained decoding, no parse fails.
                  </span>
                </div>
              </li>
              <li>
                <span className="ico" />
                <div>
                  <span className="ft-title">Batch API · 50% off</span>
                  <span className="ft-sub">Overnight processing for archive jobs.</span>
                </div>
              </li>
              <li>
                <span className="ico" />
                <div>
                  <span className="ft-title">OCR + vision</span>
                  <span className="ft-sub">
                    Scanned PDFs, handwriting, table layouts.
                  </span>
                </div>
              </li>
            </ul>

            <div className="pills">
              <span className="pill on">claude-opus</span>
              <span className="pill on">gpt-4o</span>
              <span className="pill on">gemini-1.5-pro</span>
              <span className="pill">batch · JSON</span>
            </div>
          </div>

          <div className="frame" aria-label="Document extraction demo">
            <div className="frame-label">
              <span
                data-typewriter
                data-text="batch · 1,284 docs · json_schema"
                data-delay="150"
              />
            </div>
            <div className="doc-stage">
              <div className="doc-input">
                <div className="ttl">invoice_4821.pdf</div>
                <div className="ln w1" />
                <div className="ln w2" />
                <div className="ln w3 hi" />
                <div className="ln w4" />
                <div className="ln w5" />
                <div className="ln w6 hi2" />
                <div className="ln w2" />
                <div className="ln w3" />
                <div className="ln w4 hi" />
                <div className="ln w1" />
              </div>
              <div className="arrow" aria-hidden="true">
                <div className="tag">extract</div>
                <div className="line" />
              </div>
              <pre className="doc-output">
                <span className="k">{"{"}</span>
                {"\n"}
                {"  "}
                <span className="k">&quot;vendor&quot;:</span>{" "}
                <span
                  className="s"
                  data-typewriter
                  data-text={'"Acme Corp"'}
                  data-delay="300"
                />
                ,{"\n"}
                {"  "}
                <span className="k">&quot;invoice_id&quot;:</span>{" "}
                <span
                  className="s"
                  data-typewriter
                  data-text={'"4821"'}
                  data-delay="650"
                />
                ,{"\n"}
                {"  "}
                <span className="k">&quot;issued&quot;:</span>{" "}
                <span
                  className="s"
                  data-typewriter
                  data-text={'"2026-05-12"'}
                  data-delay="950"
                />
                ,{"\n"}
                {"  "}
                <span className="k">&quot;due&quot;:</span>{" "}
                <span
                  className="s"
                  data-typewriter
                  data-text={'"2026-06-11"'}
                  data-delay="1300"
                />
                ,{"\n"}
                {"  "}
                <span className="k">&quot;line_items&quot;:</span>{" "}
                <span className="n" data-decrypt data-final="12" data-delay="1650">
                  12
                </span>
                ,{"\n"}
                {"  "}
                <span className="k">&quot;subtotal&quot;:</span>{" "}
                <span
                  className="n"
                  data-decrypt
                  data-final="8420.00"
                  data-delay="1850"
                >
                  8420.00
                </span>
                ,{"\n"}
                {"  "}
                <span className="k">&quot;tax&quot;:</span>{" "}
                <span
                  className="n"
                  data-decrypt
                  data-final="673.60"
                  data-delay="2100"
                >
                  673.60
                </span>
                ,{"\n"}
                {"  "}
                <span className="k">&quot;total&quot;:</span>{" "}
                <span
                  className="n"
                  data-decrypt
                  data-final="9093.60"
                  data-delay="2350"
                >
                  9093.60
                </span>
                ,{"\n"}
                {"  "}
                <span className="k">&quot;currency&quot;:</span>{" "}
                <span
                  className="s"
                  data-typewriter
                  data-text={'"USD"'}
                  data-delay="2650"
                />
                {"\n"}
                <span className="k">{"}"}</span>
              </pre>
            </div>
          </div>
        </div>
      </section>

      <div className="section-divider">
        <hr />
      </div>

      {/* ================ MATRIX ================ */}
      <section className="matrix">
        <div className="mtile">
          <span className="num">01 · IDENTITY</span>
          <h4>One API key</h4>
          <p>Same auth across every model, every endpoint, every region.</p>
        </div>
        <div className="mtile">
          <span className="num">02 · BILLING</span>
          <h4>One consolidated bill</h4>
          <p>Tokens, GPUs, storage, batches — itemized, per-second.</p>
        </div>
        <div className="mtile">
          <span className="num">03 · COMPATIBILITY</span>
          <h4>OpenAI-compatible</h4>
          <p>Swap the base URL. Your SDKs, agents, and tooling just work.</p>
        </div>
        <div className="mtile">
          <span className="num">04 · LOCALITY</span>
          <h4>12 regions, sub-20ms</h4>
          <p>Inference next to your users, your data, and your compute.</p>
        </div>
      </section>

      {/* ================ CTA ================ */}
      <section className="cta">
        <div className="cta-card">
          <div>
            <h3>
              Pick a pattern. <span className="blue">Ship by Friday.</span>
            </h3>
            <p>
              <span className="colon" />
              <span className="hl">Free $50 credit on signup.</span> No card
              required. Every model, every region — yours to try in under two
              minutes.
            </p>
          </div>
          <div className="cta-actions">
            <Link href="/signup" className="btn primary">
              Get started →
            </Link>
            <Link href="/contact" className="btn">
              Talk to sales
            </Link>
          </div>
        </div>
      </section>

      <style jsx global>{`
        .aiuc {
          --bg: #0a0a0a;
          --bg-soft: #0f0f10;
          --surface: #131315;
          --surface-2: #17171a;
          --border: rgba(255, 255, 255, 0.07);
          --border-strong: rgba(255, 255, 255, 0.14);
          --text: #f3f3f3;
          --muted: #8a8a8e;
          --dim: #5a5a60;
          --blue: #4d8dff;
          --blue-bright: #6aa3ff;
          --blue-soft: rgba(77, 141, 255, 0.14);
          --blue-line: rgba(77, 141, 255, 0.28);
          --blue-ring: rgba(77, 141, 255, 0.18);
          --accent: var(--blue);
          --radius-sm: 8px;
          --radius: 14px;
          --radius-lg: 22px;
          --maxw: 1200px;
          --sans: var(--font-open-sans), ui-sans-serif, system-ui, -apple-system, sans-serif;
          --display: var(--font-open-sans), ui-sans-serif, system-ui, sans-serif;
          --mono: var(--font-geist-mono), ui-monospace, SFMono-Regular, monospace;

          position: relative;
          color: var(--text);
          font-family: var(--sans);
          line-height: 1.5;
          font-weight: 400;
          -webkit-font-smoothing: antialiased;
          background: radial-gradient(
              1200px 600px at 50% -200px,
              rgba(77, 141, 255, 0.1),
              transparent 60%
            ),
            radial-gradient(800px 400px at 90% 10%, rgba(77, 141, 255, 0.04), transparent 60%),
            var(--bg);
        }
        .aiuc * {
          box-sizing: border-box;
        }
        .aiuc a {
          color: inherit;
          text-decoration: none;
        }
        .aiuc ::selection {
          background: var(--blue);
          color: #fff;
        }

        /* Width matches the site-wide <Container>: 92% / 85% / 75% with the
           same clamp() horizontal padding, so this page lines up with the rest. */
        .aiuc .hero,
        .aiuc .section,
        .aiuc .section-divider,
        .aiuc .matrix,
        .aiuc .cta {
          width: 100%;
          max-width: 92%;
          margin-left: auto;
          margin-right: auto;
          padding-left: clamp(16px, 3vw, 80px);
          padding-right: clamp(16px, 3vw, 80px);
        }
        @media (min-width: 640px) {
          .aiuc .hero,
          .aiuc .section,
          .aiuc .section-divider,
          .aiuc .matrix,
          .aiuc .cta {
            max-width: 85%;
          }
        }
        @media (min-width: 1024px) {
          .aiuc .hero,
          .aiuc .section,
          .aiuc .section-divider,
          .aiuc .matrix,
          .aiuc .cta {
            max-width: 75%;
          }
        }

        .aiuc .ital {
          font-family: var(--sans);
          font-style: normal;
          font-weight: 400;
          letter-spacing: -0.025em;
          background: linear-gradient(180deg, #ffffff 0%, #9aa0a6 100%);
          -webkit-background-clip: text;
          background-clip: text;
          color: transparent;
        }

        .aiuc .colon {
          display: inline-block;
          width: 0.6em;
          height: 0.6em;
          margin-right: 0.5em;
          position: relative;
          top: -0.02em;
          vertical-align: middle;
        }
        .aiuc .colon::before,
        .aiuc .colon::after {
          content: "";
          position: absolute;
          left: 50%;
          width: 5px;
          height: 5px;
          border-radius: 50%;
          background: var(--blue);
          box-shadow: 0 0 8px rgba(77, 141, 255, 0.55);
          transform: translateX(-50%);
        }
        .aiuc .colon::before {
          top: 0;
        }
        .aiuc .colon::after {
          bottom: 0;
        }
        .aiuc .hl {
          color: #fff;
        }
        .aiuc .blue {
          color: var(--blue);
          font-family: var(--font-nunito), var(--sans);
          font-weight: 500;
        }

        .aiuc .btn {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 10px 18px;
          border-radius: 8px;
          font-size: 13.5px;
          font-weight: 600;
          border: 1px solid var(--border-strong);
          color: var(--text);
          background: transparent;
          cursor: pointer;
          transition: all 0.15s ease;
          white-space: nowrap;
          font-family: var(--sans);
        }
        .aiuc .btn:hover {
          background: rgba(255, 255, 255, 0.04);
        }
        .aiuc .btn.primary {
          background: #fff;
          color: #000;
          border-color: #fff;
        }
        .aiuc .btn.primary:hover {
          background: var(--blue);
          color: #fff;
          border-color: var(--blue);
          transform: translateY(-1px);
        }

        .aiuc .hero {
          padding-top: 120px;
          padding-bottom: 64px;
          position: relative;
          isolation: isolate;
        }
        /* PixelBlast backdrop sits behind; everything else lifts above it. */
        .aiuc .hero > *:not([data-bg]) {
          position: relative;
          z-index: 1;
        }
        .aiuc .hero-bg {
          position: absolute;
          inset: 0;
          z-index: 0;
          opacity: 0.55;
          pointer-events: none;
        }
        .aiuc .eyebrow {
          display: inline-flex;
          align-items: center;
          gap: 10px;
          padding: 6px 12px 6px 8px;
          border-radius: 999px;
          border: 1px solid var(--border-strong);
          background: rgba(255, 255, 255, 0.02);
          font-size: 12px;
          color: var(--muted);
          font-family: var(--mono);
          letter-spacing: 0.04em;
        }
        .aiuc .eyebrow .dot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: var(--blue);
          box-shadow: 0 0 0 4px var(--blue-ring);
        }
        .aiuc .hero h1 {
          font-family: var(--display);
          font-size: clamp(34px, 5vw, 60px);
          line-height: 1.08;
          letter-spacing: -0.02em;
          font-weight: 400;
          margin: 24px 0 22px;
          max-width: 920px;
        }
        .aiuc .hero p.lede {
          font-size: 18.5px;
          color: var(--muted);
          max-width: 640px;
          margin: 0 0 32px;
          line-height: 1.55;
          font-weight: 500;
        }
        .aiuc .hero-actions {
          display: flex;
          gap: 12px;
          flex-wrap: wrap;
          align-items: center;
        }
        .aiuc .hero-meta {
          margin-top: 64px;
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 0;
          border-top: 1px solid var(--border);
          padding-top: 32px;
        }
        .aiuc .meta-cell {
          padding-right: 24px;
        }
        .aiuc .meta-cell .k {
          font-family: var(--mono);
          font-size: 11.5px;
          color: var(--dim);
          letter-spacing: 0.06em;
          text-transform: uppercase;
        }
        .aiuc .meta-cell .v {
          font-size: 26px;
          margin-top: 6px;
          letter-spacing: -0.01em;
          font-weight: 700;
          font-family: var(--display);
        }
        .aiuc .meta-cell .v small {
          font-size: 13px;
          color: var(--muted);
          margin-left: 4px;
          font-weight: 600;
        }
        .aiuc .meta-cell .v .num {
          color: var(--blue-bright);
        }

        .aiuc .section {
          padding-top: 96px;
          padding-bottom: 96px;
          position: relative;
        }
        .aiuc .section-divider {
          padding-top: 0;
          padding-bottom: 0;
        }
        .aiuc .section-divider hr {
          border: 0;
          height: 1px;
          background: linear-gradient(90deg, transparent, var(--border-strong), transparent);
          margin: 0;
        }
        .aiuc .section-head {
          display: grid;
          grid-template-columns: 80px 1fr;
          gap: 24px;
          align-items: start;
          margin-bottom: 48px;
        }
        .aiuc .section-num {
          font-family: var(--mono);
          font-size: 12px;
          color: var(--dim);
          letter-spacing: 0.06em;
          padding-top: 14px;
        }
        .aiuc .section-num .bar {
          display: block;
          width: 40px;
          height: 1px;
          background: var(--border-strong);
          margin-top: 10px;
        }
        .aiuc .section-tag {
          font-family: var(--mono);
          font-size: 11.5px;
          color: var(--blue);
          letter-spacing: 0.08em;
          text-transform: uppercase;
          display: inline-flex;
          align-items: center;
          gap: 8px;
        }
        .aiuc .section-tag .pip {
          width: 6px;
          height: 6px;
          background: var(--blue);
          border-radius: 1px;
          box-shadow: 0 0 8px rgba(77, 141, 255, 0.6);
        }
        .aiuc .section h2 {
          font-family: var(--display);
          font-size: clamp(28px, 3.6vw, 46px);
          line-height: 1.1;
          letter-spacing: -0.02em;
          font-weight: 400;
          margin: 14px 0 16px;
          max-width: 720px;
        }
        .aiuc .section .blurb {
          font-size: 17px;
          color: var(--muted);
          max-width: 560px;
          margin: 0;
          font-weight: 500;
        }

        .aiuc .split {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 64px;
          align-items: center;
        }
        .aiuc .split.reverse > :first-child {
          order: 2;
        }
        .aiuc .split.reverse > :last-child {
          order: 1;
        }

        .aiuc .feature-list {
          list-style: none;
          padding: 0;
          margin: 32px 0 0;
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 18px 28px;
        }
        .aiuc .feature-list li {
          display: flex;
          gap: 12px;
          align-items: flex-start;
          font-size: 14.5px;
          color: var(--text);
        }
        .aiuc .feature-list .ico {
          flex: 0 0 auto;
          width: 18px;
          height: 18px;
          border-radius: 5px;
          background: rgba(77, 141, 255, 0.08);
          border: 1px solid var(--blue-line);
          display: grid;
          place-items: center;
          margin-top: 2px;
        }
        .aiuc .feature-list .ico::before {
          content: "";
          width: 6px;
          height: 6px;
          background: var(--blue);
          border-radius: 1.5px;
          box-shadow: 0 0 6px rgba(77, 141, 255, 0.7);
        }
        .aiuc .feature-list .ft-title {
          font-weight: 700;
        }
        .aiuc .feature-list .ft-sub {
          display: block;
          color: var(--muted);
          font-size: 13px;
          margin-top: 2px;
          font-weight: 500;
        }

        .aiuc .pills {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          margin-top: 28px;
        }
        .aiuc .pill {
          font-family: var(--mono);
          font-size: 12px;
          color: var(--muted);
          padding: 5px 11px;
          border-radius: 999px;
          border: 1px solid var(--border);
          background: rgba(255, 255, 255, 0.02);
        }
        .aiuc .pill.on {
          color: var(--text);
          border-color: var(--blue-line);
          background: var(--blue-soft);
        }

        .aiuc .frame {
          position: relative;
          aspect-ratio: 5/4.2;
          border-radius: var(--radius-lg);
          border: 1px solid var(--border);
          background: radial-gradient(120% 80% at 50% 0%, rgba(77, 141, 255, 0.06), transparent 60%),
            linear-gradient(180deg, #131315 0%, #0d0d0f 100%);
          overflow: hidden;
          box-shadow: 0 1px 0 rgba(255, 255, 255, 0.04) inset,
            0 30px 60px -30px rgba(0, 0, 0, 0.6), 0 0 0 1px rgba(77, 141, 255, 0.04);
        }
        .aiuc .frame::before {
          content: "";
          position: absolute;
          inset: 0;
          pointer-events: none;
          background-image: linear-gradient(rgba(255, 255, 255, 0.025) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255, 255, 255, 0.025) 1px, transparent 1px);
          background-size: 28px 28px;
          -webkit-mask-image: radial-gradient(80% 60% at 50% 50%, #000 30%, transparent 80%);
          mask-image: radial-gradient(80% 60% at 50% 50%, #000 30%, transparent 80%);
        }
        .aiuc .frame-label {
          position: absolute;
          top: 14px;
          left: 16px;
          z-index: 5;
          font-family: var(--mono);
          font-size: 11px;
          color: var(--dim);
          letter-spacing: 0.06em;
        }
        .aiuc .frame-label .live {
          color: var(--blue);
        }

        .aiuc .icon-badge {
          width: 56px;
          height: 56px;
          border-radius: 14px;
          background: linear-gradient(180deg, #1a1a1d 0%, #121214 100%);
          border: 1px solid var(--blue-line);
          display: grid;
          place-items: center;
          box-shadow: 0 1px 0 rgba(255, 255, 255, 0.05) inset,
            0 10px 30px -15px rgba(0, 0, 0, 0.8), 0 0 24px -10px rgba(77, 141, 255, 0.5);
          position: relative;
        }

        .aiuc .chat-stage {
          position: absolute;
          inset: 60px 28px 28px;
          display: flex;
          flex-direction: column;
          gap: 14px;
        }
        .aiuc .msg {
          display: flex;
          gap: 10px;
          align-items: flex-end;
          max-width: 78%;
        }
        .aiuc .msg.me {
          align-self: flex-end;
          flex-direction: row-reverse;
        }
        .aiuc .msg .av {
          width: 26px;
          height: 26px;
          border-radius: 8px;
          flex: 0 0 auto;
          background: #1c1c20;
          border: 1px solid var(--border-strong);
          display: grid;
          place-items: center;
          font-family: var(--mono);
          font-size: 10px;
          color: var(--muted);
          font-weight: 600;
        }
        .aiuc .msg.me .av {
          background: var(--blue);
          color: #fff;
          border-color: transparent;
        }
        .aiuc .bubble {
          padding: 10px 14px;
          border-radius: 14px;
          background: #1a1a1d;
          border: 1px solid var(--border);
          font-size: 13.5px;
          color: var(--text);
          line-height: 1.45;
          font-weight: 500;
        }
        .aiuc .msg.me .bubble {
          background: var(--blue-soft);
          border-color: var(--blue-line);
        }
        .aiuc .tool-call {
          align-self: flex-start;
          max-width: 88%;
          border: 1px dashed var(--blue-line);
          border-radius: 12px;
          padding: 10px 12px;
          background: rgba(77, 141, 255, 0.03);
          font-family: var(--mono);
          font-size: 11.5px;
          color: var(--muted);
        }
        .aiuc .tool-call .tag {
          color: var(--blue);
          margin-right: 8px;
          font-weight: 600;
        }
        .aiuc .tool-call .out {
          display: block;
          color: var(--text);
          margin-top: 6px;
          white-space: pre-wrap;
          word-break: break-word;
        }
        .aiuc .typing {
          display: inline-flex;
          gap: 3px;
          padding: 0 2px;
          vertical-align: middle;
        }
        .aiuc .typing i {
          width: 5px;
          height: 5px;
          border-radius: 50%;
          background: var(--blue);
          animation: aiuc-blink 1.2s infinite;
        }
        .aiuc .typing i:nth-child(2) {
          animation-delay: 0.2s;
        }
        .aiuc .typing i:nth-child(3) {
          animation-delay: 0.4s;
        }
        @keyframes aiuc-blink {
          0%,
          80%,
          100% {
            opacity: 0.25;
          }
          40% {
            opacity: 1;
          }
        }

        .aiuc .code-stage {
          position: absolute;
          inset: 60px 28px 28px;
          display: flex;
          flex-direction: column;
          border-radius: 12px;
          overflow: hidden;
          border: 1px solid var(--border);
          background: #0d0d0f;
        }
        .aiuc .code-tabs {
          display: flex;
          gap: 0;
          border-bottom: 1px solid var(--border);
          background: #101013;
        }
        .aiuc .code-tab {
          padding: 9px 14px;
          font-family: var(--mono);
          font-size: 11.5px;
          color: var(--muted);
          background: transparent;
          border: 0;
          border-right: 1px solid var(--border);
          cursor: pointer;
          position: relative;
          -webkit-appearance: none;
          appearance: none;
          transition: color 0.15s ease, background 0.15s ease;
        }
        .aiuc .code-tab:hover {
          color: var(--text);
        }
        .aiuc .code-tab.on {
          color: var(--text);
          background: #0d0d0f;
        }
        .aiuc .code-tab.on::before {
          content: "";
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          height: 1.5px;
          background: var(--blue);
        }
        .aiuc .code-body {
          flex: 1;
          display: grid;
          grid-template-columns: 36px 1fr;
          font-family: var(--mono);
          font-size: 12px;
          line-height: 1.65;
          min-height: 0;
        }
        .aiuc .gutter {
          padding: 12px 8px 0;
          text-align: right;
          color: var(--dim);
          background: rgba(255, 255, 255, 0.015);
          border-right: 1px solid var(--border);
        }
        .aiuc .gutter div {
          height: 1.65em;
        }
        .aiuc .code {
          padding: 12px 16px;
          color: #d4d4d8;
          overflow: hidden;
          margin: 0;
          white-space: pre;
        }
        .aiuc .code .kw {
          color: #8ab4ff;
        }
        .aiuc .code .fn {
          color: #9ec5ff;
        }
        .aiuc .code .str {
          color: #c9d6f0;
        }
        .aiuc .code .com {
          color: #52525b;
          font-style: italic;
        }
        .aiuc .code .var {
          color: #f3f3f3;
        }
        .aiuc .code .num {
          color: #bcd0ff;
        }
        .aiuc .code .ghost {
          color: var(--blue-bright);
          background: rgba(77, 141, 255, 0.08);
          border-bottom: 1px dashed var(--blue-line);
        }
        .aiuc .cursor {
          display: inline-block;
          width: 6px;
          height: 1em;
          background: var(--blue);
          vertical-align: text-bottom;
          margin-left: 1px;
          animation: aiuc-caret 1s steps(1) infinite;
        }
        @keyframes aiuc-caret {
          50% {
            opacity: 0;
          }
        }
        .aiuc .code-status {
          padding: 8px 14px;
          border-top: 1px solid var(--border);
          display: flex;
          gap: 14px;
          align-items: center;
          font-family: var(--mono);
          font-size: 10.5px;
          color: var(--dim);
          background: #101013;
        }
        .aiuc .code-status .ok {
          color: var(--blue-bright);
        }
        .aiuc .code-status .sep {
          width: 1px;
          height: 10px;
          background: var(--border-strong);
        }

        .aiuc .doc-stage {
          position: absolute;
          inset: 60px 22px 28px;
          display: grid;
          grid-template-columns: 0.8fr auto 1.3fr;
          gap: 14px;
          align-items: center;
        }
        .aiuc .doc-input {
          border: 1px solid var(--border);
          border-radius: 10px;
          background: #15151a;
          padding: 14px;
          height: 80%;
          display: flex;
          flex-direction: column;
          position: relative;
        }
        .aiuc .doc-input::before {
          content: "";
          position: absolute;
          top: 10px;
          right: 10px;
          width: 22px;
          height: 28px;
          border: 1px solid var(--border-strong);
          border-radius: 3px;
          background: linear-gradient(180deg, rgba(255, 255, 255, 0.04), transparent);
        }
        .aiuc .doc-input .ttl {
          font-family: var(--mono);
          font-size: 10.5px;
          color: var(--dim);
          letter-spacing: 0.05em;
          margin-bottom: 10px;
        }
        .aiuc .doc-input .ln {
          height: 4px;
          background: rgba(255, 255, 255, 0.08);
          border-radius: 2px;
          margin-bottom: 7px;
        }
        .aiuc .doc-input .ln.w1 {
          width: 92%;
        }
        .aiuc .doc-input .ln.w2 {
          width: 74%;
        }
        .aiuc .doc-input .ln.w3 {
          width: 86%;
        }
        .aiuc .doc-input .ln.w4 {
          width: 60%;
        }
        .aiuc .doc-input .ln.w5 {
          width: 80%;
        }
        .aiuc .doc-input .ln.w6 {
          width: 70%;
        }
        .aiuc .doc-input .ln.hi {
          background: rgba(77, 141, 255, 0.45);
          box-shadow: 0 0 8px rgba(77, 141, 255, 0.4);
        }
        .aiuc .doc-input .ln.hi2 {
          background: rgba(77, 141, 255, 0.3);
        }
        .aiuc .doc-input::after {
          content: "";
          position: absolute;
          left: 0;
          right: 0;
          top: 0;
          height: 30%;
          background: linear-gradient(180deg, transparent 0%, rgba(77, 141, 255, 0.2) 50%, transparent 100%);
          animation: aiuc-scan 3.6s ease-in-out infinite;
          pointer-events: none;
        }
        @keyframes aiuc-scan {
          0% {
            transform: translateY(-30%);
            opacity: 0;
          }
          10% {
            opacity: 1;
          }
          50% {
            transform: translateY(260%);
            opacity: 1;
          }
          60% {
            opacity: 0;
          }
          100% {
            transform: translateY(-30%);
            opacity: 0;
          }
        }
        .aiuc .arrow {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 6px;
          color: var(--dim);
        }
        .aiuc .arrow .line {
          width: 1px;
          height: 30px;
          background: var(--blue-line);
          position: relative;
        }
        .aiuc .arrow .line::after {
          content: "";
          position: absolute;
          bottom: -1px;
          left: -3px;
          width: 7px;
          height: 7px;
          border-right: 1px solid var(--blue-line);
          border-bottom: 1px solid var(--blue-line);
          transform: rotate(-45deg);
        }
        .aiuc .arrow .tag {
          font-family: var(--mono);
          font-size: 10px;
          color: var(--blue);
          letter-spacing: 0.06em;
          font-weight: 600;
        }
        .aiuc .doc-output {
          position: relative;
          border: 1px solid var(--blue-line);
          border-radius: 10px;
          background: linear-gradient(180deg, var(--blue-soft), transparent);
          padding: 10px 9px;
          font-family: var(--mono);
          font-size: 11px;
          line-height: 1.7;
          letter-spacing: -0.02em;
          height: 80%;
          overflow: hidden;
          white-space: pre;
        }
        .aiuc .doc-output::after {
          content: "";
          position: absolute;
          left: 0;
          right: 0;
          top: 0;
          height: 24%;
          background: linear-gradient(180deg, transparent, rgba(77, 141, 255, 0.1), transparent);
          animation: aiuc-scan 4.4s ease-in-out infinite;
          animation-delay: 0.4s;
          pointer-events: none;
        }
        .aiuc .doc-output .k {
          color: var(--muted);
        }
        .aiuc .doc-output .v {
          color: var(--text);
        }
        .aiuc .doc-output .s {
          color: var(--blue-bright);
        }
        .aiuc .doc-output .n {
          color: #bcd0ff;
        }

        .aiuc .frame.rag-image {
          padding: 0;
          aspect-ratio: 1/1;
        }
        .aiuc .frame.rag-image::before {
          display: none;
        }
        .aiuc .rag-image-wrap {
          position: absolute;
          inset: 0;
          overflow: hidden;
          background: radial-gradient(60% 50% at 50% 46%, rgba(255, 255, 255, 0.06), transparent 70%),
            radial-gradient(40% 30% at 50% 44%, rgba(77, 141, 255, 0.1), transparent 75%);
        }
        .aiuc .rag-image-wrap > img {
          object-fit: contain;
          object-position: center 46%;
          filter: saturate(0.92) brightness(1.02);
        }
        .aiuc .rag-image-wrap .ov {
          position: absolute;
          inset: 0;
          pointer-events: none;
          mix-blend-mode: screen;
          z-index: 2;
        }
        .aiuc .ov .glow {
          position: absolute;
          border-radius: 50%;
          transform: translate(-50%, -50%) scale(0.9);
          will-change: transform, opacity;
        }
        .aiuc .ov .glow.brain {
          left: 39%;
          top: 29%;
          width: 24%;
          aspect-ratio: 1;
          background: radial-gradient(circle, rgba(77, 141, 255, 0.32) 0%, rgba(77, 141, 255, 0) 65%);
          animation: aiuc-glowPulse 3.8s ease-in-out infinite;
        }
        .aiuc .ov .glow.chart {
          left: 41%;
          top: 57%;
          width: 14%;
          aspect-ratio: 1;
          background: radial-gradient(circle, rgba(106, 163, 255, 0.42) 0%, rgba(77, 141, 255, 0) 68%);
          animation: aiuc-glowPulse 2.6s ease-in-out infinite 0.4s;
        }
        .aiuc .ov .glow.db {
          left: 27%;
          top: 56%;
          width: 15%;
          aspect-ratio: 1;
          background: radial-gradient(circle, rgba(77, 141, 255, 0.26) 0%, rgba(77, 141, 255, 0) 68%);
          animation: aiuc-glowPulse 3.2s ease-in-out infinite 0.9s;
        }
        .aiuc .ov .glow.screen {
          left: 62%;
          top: 48%;
          width: 18%;
          aspect-ratio: 1;
          background: radial-gradient(circle, rgba(77, 141, 255, 0.22) 0%, rgba(77, 141, 255, 0) 68%);
          animation: aiuc-glowPulse 4.2s ease-in-out infinite 1.4s;
        }
        @keyframes aiuc-glowPulse {
          0%,
          100% {
            transform: translate(-50%, -50%) scale(0.85);
            opacity: 0.45;
          }
          50% {
            transform: translate(-50%, -50%) scale(1.12);
            opacity: 1;
          }
        }
        .aiuc .ov .spark {
          position: absolute;
          left: 39%;
          top: 34%;
          width: 4px;
          height: 4px;
          border-radius: 50%;
          background: #cfe1ff;
          box-shadow: 0 0 6px rgba(106, 163, 255, 0.95), 0 0 12px rgba(77, 141, 255, 0.7);
          transform: translate(-50%, 0);
          animation: aiuc-spark 3.4s linear infinite;
          opacity: 0;
        }
        .aiuc .ov .spark.k1 {
          left: 37%;
          animation-delay: 0s;
        }
        .aiuc .ov .spark.k2 {
          left: 39.5%;
          animation-delay: 0.8s;
        }
        .aiuc .ov .spark.k3 {
          left: 41.5%;
          animation-delay: 1.6s;
        }
        .aiuc .ov .spark.k4 {
          left: 38.5%;
          animation-delay: 2.4s;
        }
        @keyframes aiuc-spark {
          0% {
            transform: translate(-50%, 0) scale(0.6);
            opacity: 0;
          }
          18% {
            opacity: 1;
          }
          82% {
            opacity: 0.85;
          }
          100% {
            transform: translate(-50%, -90px) scale(1);
            opacity: 0;
          }
        }
        .aiuc .ov .flow {
          position: absolute;
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: #9ec5ff;
          box-shadow: 0 0 8px #6aa3ff, 0 0 14px rgba(77, 141, 255, 0.7);
          animation: aiuc-flowUp 2.8s ease-in-out infinite;
          opacity: 0;
        }
        .aiuc .ov .flow.f2 {
          animation-delay: 1.4s;
        }
        @keyframes aiuc-flowUp {
          0% {
            left: 28%;
            top: 52%;
            opacity: 0;
            transform: scale(0.7);
          }
          15% {
            opacity: 1;
          }
          50% {
            left: 36%;
            top: 40%;
            opacity: 1;
            transform: scale(1);
          }
          85% {
            opacity: 0.8;
          }
          100% {
            left: 39%;
            top: 33%;
            opacity: 0;
            transform: scale(0.7);
          }
        }

        .aiuc .matrix {
          padding-top: 64px;
          padding-bottom: 24px;
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 16px;
        }
        .aiuc .mtile {
          border: 1px solid var(--border);
          border-radius: var(--radius);
          padding: 22px;
          background: linear-gradient(180deg, var(--surface), var(--bg-soft));
          display: flex;
          flex-direction: column;
          gap: 14px;
          transition: border-color 0.2s ease, transform 0.2s ease;
          position: relative;
          overflow: hidden;
        }
        .aiuc .mtile::before {
          content: "";
          position: absolute;
          left: 0;
          top: 0;
          bottom: 0;
          width: 2px;
          background: var(--blue);
          opacity: 0;
          transition: opacity 0.2s ease;
        }
        .aiuc .mtile:hover {
          border-color: var(--blue-line);
          transform: translateY(-2px);
        }
        .aiuc .mtile:hover::before {
          opacity: 1;
        }
        .aiuc .mtile .num {
          font-family: var(--mono);
          font-size: 11px;
          color: var(--dim);
          letter-spacing: 0.08em;
        }
        .aiuc .mtile h4 {
          margin: 0;
          font-size: 18px;
          letter-spacing: -0.005em;
          font-weight: 700;
          font-family: var(--display);
          color: var(--text);
        }
        .aiuc .mtile p {
          margin: 0;
          font-size: 13.5px;
          color: var(--muted);
          line-height: 1.5;
          font-weight: 500;
        }

        .aiuc .cta {
          margin-top: 48px;
          padding-bottom: 96px;
        }
        .aiuc .cta-card {
          border: 1px solid var(--blue-line);
          border-radius: 24px;
          padding: 48px;
          position: relative;
          overflow: hidden;
          background: radial-gradient(700px 350px at 100% 0%, rgba(77, 141, 255, 0.18), transparent 60%),
            radial-gradient(600px 300px at 0% 100%, rgba(77, 141, 255, 0.1), transparent 60%),
            linear-gradient(180deg, #131520, #0c0d11);
          display: grid;
          grid-template-columns: 1fr auto;
          gap: 24px;
          align-items: center;
        }
        .aiuc .cta-card h3 {
          font-size: 34px;
          letter-spacing: -0.02em;
          font-weight: 400;
          margin: 0;
          max-width: 540px;
          line-height: 1.12;
          font-family: var(--display);
        }
        .aiuc .cta-card p {
          margin: 12px 0 0;
          color: var(--muted);
          font-size: 15px;
          max-width: 480px;
          font-weight: 500;
        }
        .aiuc .cta-actions {
          display: flex;
          gap: 10px;
          flex-wrap: wrap;
        }

        /* Main bounding boxes are sharp, square-cornered rectangles (matches the
           home page). The boxes *inside* a demo frame (chat bubbles, code/doc
           panels, avatars) keep their own curved corners. */
        .aiuc .btn,
        .aiuc .eyebrow,
        .aiuc .feature-list .ico,
        .aiuc .pill,
        .aiuc .frame,
        .aiuc .icon-badge,
        .aiuc .mtile,
        .aiuc .cta-card {
          border-radius: 0;
        }

        @media (max-width: 920px) {
          .aiuc .hero {
            padding-top: 96px;
            padding-bottom: 40px;
          }
          .aiuc .hero-meta {
            grid-template-columns: repeat(2, 1fr);
            gap: 18px 0;
          }
          .aiuc .meta-cell {
            padding-right: 0;
          }
          .aiuc .section {
            padding-top: 64px;
            padding-bottom: 64px;
          }
          .aiuc .section-head {
            grid-template-columns: 1fr;
            gap: 0;
          }
          .aiuc .section-num {
            display: none;
          }
          .aiuc .split {
            grid-template-columns: 1fr;
            gap: 36px;
          }
          .aiuc .split.reverse > :first-child {
            order: 0;
          }
          .aiuc .split.reverse > :last-child {
            order: 0;
          }
          .aiuc .feature-list {
            grid-template-columns: 1fr;
          }
          .aiuc .matrix {
            grid-template-columns: repeat(2, 1fr);
          }
          .aiuc .cta-card {
            grid-template-columns: 1fr;
            padding: 32px;
          }
          .aiuc .cta-card h3 {
            font-size: 28px;
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .aiuc .doc-input::after,
          .aiuc .doc-output::after,
          .aiuc .ov .glow,
          .aiuc .ov .spark,
          .aiuc .ov .flow,
          .aiuc .typing i,
          .aiuc .cursor {
            animation: none !important;
          }
        }
      `}</style>
    </div>
  );
}
