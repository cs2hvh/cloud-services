"use client";

import * as React from "react";
import { CheckCircle2, Loader2, Send } from "lucide-react";

const ACCENT = "#0095FF";

const TOPICS: Array<{ value: string; label: string }> = [
  { value: "reserved-gpu", label: "Reserved GPU clusters (B300 / B200 / H200)" },
  { value: "on-demand-gpu", label: "On-demand GPUs" },
  { value: "ai", label: "AI inference / fine-tuning / serving" },
  { value: "enterprise", label: "Enterprise / sovereign deployment" },
  { value: "general", label: "General enquiry" },
];

const FIELD =
  "w-full rounded-[8px] border border-white/[0.1] bg-[#0d0e11] px-3.5 h-11 text-[14px] text-white placeholder:text-white/30 outline-none transition-colors focus:border-[#0095FF]/55 focus:shadow-[0_0_0_3px_rgba(0,149,255,0.12)] disabled:opacity-50";
const LABEL = "block text-[12.5px] font-medium text-white/75 mb-1.5";

export function ContactForm({ initialTopic }: { initialTopic?: string }) {
  const validTopic = TOPICS.some((t) => t.value === initialTopic)
    ? (initialTopic as string)
    : "reserved-gpu";

  const [form, setForm] = React.useState({
    name: "",
    email: "",
    company: "",
    phone: "",
    topic: validTopic,
    message: "",
    website: "", // honeypot
  });
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [done, setDone] = React.useState(false);

  const set = (k: keyof typeof form) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>,
  ) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (form.name.trim().length < 2) return setError("Please enter your name.");
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(form.email.trim()))
      return setError("Please enter a valid email.");
    if (form.message.trim().length < 10)
      return setError("Tell us a little more about what you need.");

    setLoading(true);
    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        throw new Error(data.error || "Something went wrong. Please try again.");
      }
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  if (done) {
    return (
      <div className="rounded-[16px] border border-white/[0.08] bg-[#101116]/95 p-8 text-center shadow-[0_40px_120px_-30px_rgba(0,0,0,0.9)]">
        <div
          className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-full"
          style={{ background: "rgba(0,149,255,0.12)", color: ACCENT }}
        >
          <CheckCircle2 className="h-6 w-6" />
        </div>
        <h3 className="text-[20px] font-semibold text-white">Thanks — we&apos;ve got it.</h3>
        <p className="mt-2 text-[14px] leading-relaxed text-white/55">
          Our team will get back to you within one business day at{" "}
          <span className="text-white/80">{form.email}</span>. For urgent
          procurement timelines, mention it in your message and we&apos;ll prioritise.
        </p>
      </div>
    );
  }

  return (
    <div className="relative overflow-hidden rounded-[16px] border border-white/[0.08] bg-[#101116]/95 p-6 shadow-[0_40px_120px_-30px_rgba(0,0,0,0.9),inset_0_1px_0_rgba(255,255,255,0.05)] sm:p-8">
      <div
        aria-hidden
        className="pointer-events-none absolute -top-28 left-1/2 h-56 w-[150%] -translate-x-1/2 blur-3xl"
        style={{ background: "radial-gradient(closest-side, rgba(0,149,255,0.16), transparent)" }}
      />
      <form onSubmit={onSubmit} className="relative z-10 space-y-4">
        {/* Honeypot — visually hidden, off-screen, not announced */}
        <input
          type="text"
          name="website"
          tabIndex={-1}
          autoComplete="off"
          value={form.website}
          onChange={set("website")}
          className="absolute left-[-9999px] top-0 h-0 w-0 opacity-0"
          aria-hidden
        />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="c-name" className={LABEL}>Full name</label>
            <input id="c-name" className={FIELD} value={form.name} onChange={set("name")} disabled={loading} placeholder="Your name" autoComplete="name" />
          </div>
          <div>
            <label htmlFor="c-email" className={LABEL}>Work email</label>
            <input id="c-email" type="email" className={FIELD} value={form.email} onChange={set("email")} disabled={loading} placeholder="you@company.com" autoComplete="email" />
          </div>
          <div>
            <label htmlFor="c-company" className={LABEL}>Company <span className="text-white/30">(optional)</span></label>
            <input id="c-company" className={FIELD} value={form.company} onChange={set("company")} disabled={loading} placeholder="Company name" autoComplete="organization" />
          </div>
          <div>
            <label htmlFor="c-phone" className={LABEL}>Phone <span className="text-white/30">(optional)</span></label>
            <input id="c-phone" className={FIELD} value={form.phone} onChange={set("phone")} disabled={loading} placeholder="+91 …" autoComplete="tel" />
          </div>
        </div>

        <div>
          <label htmlFor="c-topic" className={LABEL}>What are you interested in?</label>
          <select id="c-topic" className={`${FIELD} appearance-none`} value={form.topic} onChange={set("topic")} disabled={loading}>
            {TOPICS.map((t) => (
              <option key={t.value} value={t.value} className="bg-[#0d0e11] text-white">
                {t.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="c-message" className={LABEL}>How can we help?</label>
          <textarea
            id="c-message"
            value={form.message}
            onChange={set("message")}
            disabled={loading}
            rows={5}
            placeholder="Tell us about your workload, GPU/cluster needs, timeline, and scale…"
            className="w-full rounded-[8px] border border-white/[0.1] bg-[#0d0e11] px-3.5 py-3 text-[14px] leading-relaxed text-white placeholder:text-white/30 outline-none transition-colors focus:border-[#0095FF]/55 focus:shadow-[0_0_0_3px_rgba(0,149,255,0.12)] disabled:opacity-50 resize-y"
          />
        </div>

        {error && (
          <p className="rounded-[8px] border border-red-500/30 bg-red-500/10 px-3 py-2.5 text-[12.5px] text-red-300">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={loading}
          className="relative flex h-11 w-full items-center justify-center gap-2 rounded-[10px] text-[15px] font-semibold text-white transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-60"
          style={{
            background: "linear-gradient(135deg, #1f9dff, #0061c4)",
            boxShadow: "0 12px 34px -10px rgba(0,149,255,0.6), inset 0 1px 0 rgba(255,255,255,0.28)",
          }}
          onMouseEnter={(e) => {
            if (e.currentTarget.disabled) return;
            e.currentTarget.style.filter = "brightness(1.08)";
            e.currentTarget.style.transform = "translateY(-1px)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.filter = "none";
            e.currentTarget.style.transform = "none";
          }}
        >
          {loading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" /> Sending…
            </>
          ) : (
            <>
              <Send className="h-4 w-4" /> Send message
            </>
          )}
        </button>

        <p className="text-center text-[11.5px] text-white/35">
          We&apos;ll only use your details to respond to this enquiry.
        </p>
      </form>
    </div>
  );
}
