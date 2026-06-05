import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { resend } from "@/lib/resend";
import { getEmailConfig } from "@/lib/email/config";
import { rateLimit } from "@/lib/rate-limit";

// Public, unauthenticated sales-enquiry endpoint backing the /contact page.
// IP rate-limited, validated, honeypot-guarded, and delivered to the sales
// inbox via Resend with the submitter set as Reply-To.

export const dynamic = "force-dynamic";

const contactSchema = z.object({
  name: z.string().trim().min(2, "Please enter your name").max(100),
  email: z.string().trim().email("Enter a valid email").max(200),
  company: z.string().trim().max(150).optional().or(z.literal("")),
  phone: z.string().trim().max(40).optional().or(z.literal("")),
  topic: z.string().trim().max(80).optional().or(z.literal("")),
  message: z
    .string()
    .trim()
    .min(10, "Tell us a little more (10+ characters)")
    .max(4000),
  // Honeypot — real users never fill this; bots do.
  website: z.string().max(0).optional().or(z.literal("")),
});

const TOPIC_LABELS: Record<string, string> = {
  "reserved-gpu": "Reserved GPU clusters (B300 / B200 / H200)",
  "on-demand-gpu": "On-demand GPUs",
  ai: "AI inference / fine-tuning / serving",
  enterprise: "Enterprise / sovereign deployment",
  general: "General enquiry",
};

const limiter = rateLimit({ interval: 60_000, uniqueTokenPerInterval: 1000 });

function esc(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export async function POST(req: NextRequest) {
  // Rate limit by client IP — 5 submissions / minute.
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "anonymous";
  try {
    await limiter.check(req, 5, `contact:${ip}`);
  } catch {
    return NextResponse.json(
      { ok: false, error: "Too many requests. Please try again in a minute." },
      { status: 429 },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 400 });
  }

  const parsed = contactSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        ok: false,
        error: parsed.error.issues[0]?.message || "Please check the form and try again.",
      },
      { status: 400 },
    );
  }

  const { name, email, company, phone, topic, message, website } = parsed.data;

  // Honeypot tripped — accept silently so bots get no signal, but send nothing.
  if (website && website.length > 0) {
    return NextResponse.json({ ok: true });
  }

  const config = getEmailConfig();
  const salesTo =
    process.env.CONTACT_SALES_EMAIL ||
    process.env.SALES_EMAIL ||
    process.env.RESEND_REPLY_TO ||
    process.env.NEXT_PUBLIC_SUPPORT_EMAIL ||
    "sales@ahurasense.com";

  const topicLabel = topic ? TOPIC_LABELS[topic] || topic : "General enquiry";

  const rows: Array<[string, string]> = [
    ["Name", name],
    ["Email", email],
    ["Company", company || "—"],
    ["Phone", phone || "—"],
    ["Interested in", topicLabel],
  ];

  const html = `
    <div style="font-family:ui-sans-serif,system-ui,sans-serif;color:#0b0c10;max-width:560px">
      <h2 style="margin:0 0 4px;font-size:18px">New sales enquiry</h2>
      <p style="margin:0 0 16px;color:#6b7280;font-size:13px">Submitted via the AhuraSense Cloud contact page.</p>
      <table style="border-collapse:collapse;width:100%;font-size:14px">
        ${rows
          .map(
            ([k, v]) =>
              `<tr><td style="padding:6px 12px 6px 0;color:#6b7280;white-space:nowrap;vertical-align:top">${esc(
                k,
              )}</td><td style="padding:6px 0;color:#111827">${esc(v)}</td></tr>`,
          )
          .join("")}
      </table>
      <div style="margin-top:16px;padding-top:16px;border-top:1px solid #e5e7eb">
        <p style="margin:0 0 6px;color:#6b7280;font-size:13px">Message</p>
        <p style="margin:0;white-space:pre-wrap;font-size:14px;color:#111827">${esc(message)}</p>
      </div>
    </div>
  `;

  const text =
    `New sales enquiry (AhuraSense Cloud contact page)\n\n` +
    rows.map(([k, v]) => `${k}: ${v}`).join("\n") +
    `\n\nMessage:\n${message}\n`;

  try {
    const response = await resend.emails.send({
      from: config.from,
      to: salesTo,
      replyTo: email,
      subject: `New sales enquiry — ${name}${company ? ` @ ${company}` : ""}`,
      html,
      text,
    });

    if (response.error) {
      console.error("[contact] Resend rejected send", response.error);
      return NextResponse.json(
        { ok: false, error: "We couldn't send your message right now. Please email us directly." },
        { status: 502 },
      );
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[contact] send failure", err);
    return NextResponse.json(
      { ok: false, error: "We couldn't send your message right now. Please email us directly." },
      { status: 500 },
    );
  }
}
