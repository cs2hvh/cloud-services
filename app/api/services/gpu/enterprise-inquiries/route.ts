import { NextRequest, NextResponse } from "next/server";

import { limitByUser } from "@/lib/cooldown/userbased";
import { createClient } from "@/lib/supabase/server";
import { SupportTickets } from "@/lib/supabase/queries/support_tickets";
import { sendSupportTicketCreatedEmail } from "@/lib/support/email";
import { describeGpuInquiry, type GpuInquiryBody } from "@/lib/support/gpu-inquiry";

export const dynamic = "force-dynamic";

const ALLOWED_PLAN_TYPES = new Set([
    "reserved",
    "cluster",
    "savings-plan",
    "other",
]);

const ALLOWED_DURATIONS = new Set([
    "1-week",
    "1-month",
    "3-months",
    "6-months",
    "1-year",
]);

const ALLOWED_CONTACT_PREFS = new Set(["email", "call", "slack"]);

function clamp(n: unknown, lo: number, hi: number): number {
    const v = Number(n);
    if (!Number.isFinite(v)) return lo;
    return Math.max(lo, Math.min(hi, Math.floor(v)));
}

function safeString(v: unknown, max = 4000): string {
    if (typeof v !== "string") return "";
    return v.slice(0, max);
}

/**
 * POST /api/services/gpu/enterprise-inquiries
 *
 * Records an enterprise GPU inquiry as a support ticket with topic="gpu" so
 * the existing support admin UI can triage it. No GPU resources are
 * provisioned by this flow.
 */
export async function POST(req: NextRequest) {
    const supabaseAuth = await createClient();
    const {
        data: { user },
        error: authErr,
    } = await supabaseAuth.auth.getUser();
    if (authErr || !user) {
        return NextResponse.json(
            { ok: false, error: "Authentication required" },
            { status: 401 }
        );
    }

    const rl = await limitByUser(user.id, {
        prefix: "rl:gpu-inquiry",
        limit: 5,
        windowMs: 3_600_000,
    });
    if (!rl.allowed) {
        return NextResponse.json(
            {
                ok: false,
                error: "Too many inquiries. Try again later.",
                retryAfterSec: rl.retryAfterSec,
            },
            { status: 429 }
        );
    }

    const raw = (await req.json().catch(() => ({}))) as GpuInquiryBody;
    const planType = safeString(raw.planType, 32);
    if (!ALLOWED_PLAN_TYPES.has(planType)) {
        return NextResponse.json(
            { ok: false, error: "Invalid plan type" },
            { status: 400 }
        );
    }
    const duration = safeString(raw.duration, 32);
    if (!ALLOWED_DURATIONS.has(duration)) {
        return NextResponse.json(
            { ok: false, error: "Invalid duration" },
            { status: 400 }
        );
    }
    // Contact preference was removed from the form; default to email and stay
    // tolerant of older clients that still send it.
    const contactPref = safeString(raw.contactPref, 16) || "email";
    if (!ALLOWED_CONTACT_PREFS.has(contactPref)) {
        return NextResponse.json(
            { ok: false, error: "Invalid contact preference" },
            { status: 400 }
        );
    }
    const gpusArr = Array.isArray(raw.gpus)
        ? raw.gpus
              .map((g) => safeString(g, 32))
              .filter((g) => g.length > 0)
              .slice(0, 10)
        : [];
    if (gpusArr.length === 0) {
        return NextResponse.json(
            { ok: false, error: "Select at least one GPU type" },
            { status: 400 }
        );
    }

    const sanitized: GpuInquiryBody = {
        planType,
        gpus: gpusArr,
        gpuCount: clamp(raw.gpuCount, 1, 4096),
        duration,
        workload: safeString(raw.workload, 4000).trim(),
        budget: raw.budget ? safeString(raw.budget, 200).trim() : null,
        region: raw.region ? safeString(raw.region, 200).trim() : null,
        contactPref,
        extra: raw.extra ? safeString(raw.extra, 2000).trim() : null,
    };

    if (!sanitized.workload || sanitized.workload.length < 10) {
        return NextResponse.json(
            { ok: false, error: "Workload description must be at least 10 characters" },
            { status: 400 }
        );
    }

    const description = describeGpuInquiry(sanitized, user.email ?? null);
    const subject = `GPU ${planType} inquiry — ${sanitized.gpuCount}× ${gpusArr[0]}`.slice(0, 200);

    try {
        const created = await SupportTickets.create({
            ownerId: user.id,
            topic: "gpu",
            subTopic: "enterprise",
            tertiaryTopic: planType,
            subject,
            description,
            affectedResourceType: "gpu_inquiry",
            affectedResourceId: null,
            affectedResourceName: null,
        });

        if (!created) {
            return NextResponse.json(
                { ok: false, error: "Failed to record inquiry" },
                { status: 500 }
            );
        }

        // Fire the confirmation email (best-effort — never block the inquiry).
        if (user.email) {
            try {
                const detail = await SupportTickets.getByIdForUser(user.id, created.ticket.id);
                const customerName =
                    (user.user_metadata?.username as string | undefined) ||
                    (user.user_metadata?.display_name as string | undefined) ||
                    user.email.split("@")[0] ||
                    "there";
                const emailResult = await sendSupportTicketCreatedEmail({
                    to: user.email,
                    customerName,
                    ticketId: created.ticket.id,
                    ticketNumber: created.ticket.ticket_number,
                    ticketSubject: created.ticket.subject,
                    ticketBody: description,
                    createdAt: created.ticket.created_at,
                    messages: detail?.messages || [],
                });
                if (!emailResult.success) {
                    console.error("[gpu-inquiry] confirmation email failed:", emailResult.error);
                }
            } catch (mailErr) {
                console.error("[gpu-inquiry] confirmation email threw:", mailErr);
            }
        }

        return NextResponse.json({
            ok: true,
            ticketId: created.ticket.id,
            ticketNumber: created.ticket.ticket_number,
        });
    } catch (e) {
        console.error("[gpu-inquiry] create failed:", e);
        return NextResponse.json(
            { ok: false, error: "Failed to record inquiry" },
            { status: 500 }
        );
    }
}
