// Clipboard helpers that work in INSECURE contexts (http://<ip>:port), where
// `navigator.clipboard` is undefined — the browser only exposes the async
// Clipboard API on HTTPS / localhost. We try the modern API first, then fall
// back to a hidden <textarea> + document.execCommand('copy'), which works over
// plain http. Mirrors lib/utils/safe-uuid.ts (same insecure-context problem).

/** Copy `text` to the clipboard. Resolves true on success, false otherwise. */
export async function copyToClipboard(text: string): Promise<boolean> {
    // Modern API — secure contexts only.
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        try {
            await navigator.clipboard.writeText(text);
            return true;
        } catch {
            // Permission denied / not focused — fall through to the legacy path.
        }
    }

    // Legacy fallback — works over http://<ip>.
    if (typeof document === "undefined") return false;
    try {
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.setAttribute("readonly", "");
        ta.style.position = "fixed";
        ta.style.top = "-9999px";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        ta.setSelectionRange(0, text.length);
        const ok = document.execCommand("copy");
        document.body.removeChild(ta);
        return ok;
    } catch {
        return false;
    }
}

/** Read text from the clipboard, or null when unavailable (insecure context). */
export async function readFromClipboard(): Promise<string | null> {
    if (typeof navigator !== "undefined" && navigator.clipboard?.readText) {
        try {
            return await navigator.clipboard.readText();
        } catch {
            return null;
        }
    }
    return null;
}
