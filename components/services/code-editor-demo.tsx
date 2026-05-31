"use client";

// Interactive code-editor demo for the AI Use Cases "Code generation" section.
// Tabs are clickable and swap the file + code. checkout.ts streams a looping
// "ghost" FIM completion (like an AI autocomplete); cart.ts / api.ts show their
// saved source. Relies on the `.aiuc .code*` styles defined in the page, so it
// must render inside the `.aiuc` wrapper.

import { Fragment, useEffect, useState } from "react";

// checkout.ts — highlighted head + a typed ghost completion.
const CHECKOUT_HEAD = [
  <>
    <span className="com">{"// apply discount, then tax"}</span>
  </>,
  <>
    <span className="kw">export function</span> <span className="fn">finalize</span>(
    <span className="var">cart</span>: <span className="var">Cart</span>) {"{"}
  </>,
  <>
    {"  "}
    <span className="kw">const</span> <span className="var">sub</span> ={" "}
    <span className="var">cart</span>.<span className="fn">subtotal</span>();
  </>,
  <>
    {"  "}
    <span className="kw">const</span> <span className="var">disc</span> ={" "}
    <span className="fn">applyDiscount</span>(<span className="var">sub</span>,{" "}
    <span className="var">cart</span>.<span className="var">code</span>);
  </>,
];
const CHECKOUT_COMPLETION = `  const tax  = computeTax(disc, cart.region);
  return { sub, disc, tax, total: disc + tax };
}`;

const CART_CODE = `import type { Item } from "./types";

export class Cart {
  items: Item[] = [];
  add(item: Item) { this.items.push(item); }
  subtotal() {
    return this.items.reduce((s, i) => s + i.price, 0);
  }
}`;

const API_CODE = `import { finalize } from "./checkout";
import { Cart } from "./cart";

export async function POST(req: Request) {
  const cart = await Cart.fromRequest(req);
  const total = finalize(cart);
  return Response.json({ total });
}`;

const FILES = [
  { name: "checkout.ts", start: 14, lines: CHECKOUT_HEAD.length + 3 },
  { name: "cart.ts", start: 1, lines: CART_CODE.split("\n").length },
  { name: "api.ts", start: 1, lines: API_CODE.split("\n").length },
];

export default function CodeEditorDemo() {
  const [tab, setTab] = useState(0);
  const [typed, setTyped] = useState(0);
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    setReduced(window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  }, []);

  // Restart the ghost-completion typing whenever checkout.ts becomes active.
  useEffect(() => {
    if (tab === 0) setTyped(0);
  }, [tab]);

  // Type the completion, hold, then loop — only while checkout.ts is active.
  useEffect(() => {
    if (tab !== 0 || reduced) return;
    if (typed >= CHECKOUT_COMPLETION.length) {
      const id = window.setTimeout(() => setTyped(0), 4200);
      return () => window.clearTimeout(id);
    }
    const id = window.setTimeout(() => setTyped((c) => c + 1), 28);
    return () => window.clearTimeout(id);
  }, [tab, typed, reduced]);

  const file = FILES[tab];
  const lineNos = Array.from({ length: file.lines }, (_, i) => file.start + i);
  const completionShown = reduced ? CHECKOUT_COMPLETION : CHECKOUT_COMPLETION.slice(0, typed);
  const typing = tab === 0 && !reduced && typed < CHECKOUT_COMPLETION.length;

  return (
    <div className="code-stage">
      <div className="code-tabs">
        {FILES.map((f, i) => (
          <button
            type="button"
            key={f.name}
            className={`code-tab${i === tab ? " on" : ""}`}
            onClick={() => setTab(i)}
          >
            {f.name}
          </button>
        ))}
      </div>

      <div className="code-body">
        <div className="gutter">
          {lineNos.map((n) => (
            <div key={n}>{n}</div>
          ))}
        </div>

        {tab === 0 ? (
          <pre className="code">
            {CHECKOUT_HEAD.map((node, i) => (
              <Fragment key={i}>
                {node}
                {"\n"}
              </Fragment>
            ))}
            <span className="ghost">{completionShown}</span>
            {typing && <span className="cursor" />}
          </pre>
        ) : (
          <pre className="code">{tab === 1 ? CART_CODE : API_CODE}</pre>
        )}
      </div>

      <div className="code-status">
        <span className="ok">
          {tab === 0 ? (typing ? "● generating" : "● accepted") : "● saved"}
        </span>
        <span className="sep" />
        <span>{tab === 0 ? "fim · 142 tok · 86 ms" : `${file.lines} lines`}</span>
        <span className="sep" />
        <span>{tab === 0 ? "↹ tab to accept" : file.name}</span>
      </div>
    </div>
  );
}
