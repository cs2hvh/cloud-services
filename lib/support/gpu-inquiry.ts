// Ticket body for enterprise GPU inquiries.
//
// Lives here rather than in the route because a Next.js route file may only
// export its handlers and route config — exporting a helper from one fails the
// production build ("is not a valid Route export field"), which `tsc --noEmit`
// does not flag. It also wants testing directly.

export interface GpuInquiryBody {
  planType?: string;
  gpus?: unknown;
  gpuCount?: number;
  duration?: string;
  workload?: string;
  budget?: string | null;
  region?: string | null;
  contactPref?: string;
  extra?: string | null;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function field(label: string, value: string | number | null | undefined): string {
  // Every field is optional; the original template literals rendered a missing
  // one as the literal text "undefined".
  const text = value === null || value === undefined || value === "" ? "—" : String(value);
  return `<p><strong>${escapeHtml(label)}:</strong> ${escapeHtml(text)}</p>`;
}

function block(label: string, value: string): string {
  // User-authored prose: keep the author's line breaks, escape everything else.
  const body = escapeHtml(value).replaceAll("\n", "<br>");
  return `<p><strong>${escapeHtml(label)}:</strong></p><p>${body}</p>`;
}

/**
 * Support ticket bodies are rendered as sanitized HTML, not Markdown — see
 * sanitizeSupportRichText, whose allowlist covers <p>/<strong>/<hr>/<br> and which
 * otherwise escapes the text as-is. Emitting `**bold**` here therefore reached
 * the reader (and the notification email, which shares the sanitizer) with the
 * asterisks intact. Build the markup the renderer actually understands.
 *
 * The sanitizer treats this body as trusted markup and will not re-escape text
 * content, so escaping the customer's own words is this function's job.
 */
export function describeGpuInquiry(body: GpuInquiryBody, userEmail: string | null): string {
  const parts = [
    field("Plan type", body.planType),
    field("GPUs of interest", Array.isArray(body.gpus) ? body.gpus.join(", ") : "—"),
    field("Target GPU count", body.gpuCount),
    field("Duration", body.duration),
    body.region ? field("Region preference", body.region) : null,
    body.budget ? field("Budget", body.budget) : null,
    field("Submitted by", userEmail || "unknown"),
    "<hr>",
    block("Workload", body.workload || "—"),
    body.extra ? block("Additional notes", body.extra) : null,
  ].filter(Boolean);
  return parts.join("");
}
