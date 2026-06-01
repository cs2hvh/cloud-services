/**
 * Client-safe UUID generator.
 *
 * `crypto.randomUUID()` is only defined in a **secure context** (HTTPS or
 * `localhost`). On an insecure origin — e.g. hitting the app directly over
 * `http://<server-ip>:3000` — `window.crypto` exists but `randomUUID` is
 * `undefined`, so calling it throws "crypto.randomUUID is not a function".
 *
 * `crypto.getRandomValues()`, by contrast, IS available in insecure contexts,
 * so we fall back to a v4 UUID built from it, and finally to `Math.random()`
 * if no Web Crypto is present at all. Safe to use in both client and server
 * code (Node 20 has `crypto.randomUUID`).
 */
export function safeRandomUUID(): string {
  const c: Crypto | undefined =
    typeof globalThis !== "undefined"
      ? (globalThis.crypto as Crypto | undefined)
      : undefined;

  if (c && typeof c.randomUUID === "function") {
    return c.randomUUID();
  }

  if (c && typeof c.getRandomValues === "function") {
    const b = c.getRandomValues(new Uint8Array(16));
    b[6] = (b[6] & 0x0f) | 0x40; // version 4
    b[8] = (b[8] & 0x3f) | 0x80; // variant 10xx
    const h = Array.from(b, (x) => x.toString(16).padStart(2, "0"));
    return (
      h.slice(0, 4).join("") +
      "-" +
      h.slice(4, 6).join("") +
      "-" +
      h.slice(6, 8).join("") +
      "-" +
      h.slice(8, 10).join("") +
      "-" +
      h.slice(10, 16).join("")
    );
  }

  // Last-resort fallback (no Web Crypto at all). Not cryptographically strong,
  // but fine for idempotency keys / client-side message ids.
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (ch) => {
    const r = (Math.random() * 16) | 0;
    const v = ch === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
