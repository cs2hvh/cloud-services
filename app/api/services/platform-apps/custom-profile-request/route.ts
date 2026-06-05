import { NextRequest, NextResponse } from "next/server";
import { authenticateUser } from "@/lib/auth/server-auth";
import { createServiceClient } from "@/lib/supabase/server";
import { limitByUser } from "@/lib/cooldown/userbased";
import { logError } from "@/lib/api/error-sanitizer";

/**
 * POST /api/services/platform-apps/custom-profile-request
 * User submits a request for custom deployment resources on one of their apps.
 *
 * GET /api/services/platform-apps/custom-profile-request?app_id=xxx
 * User checks status of their request for a given app.
 */

export async function POST(req: NextRequest) {
  const auth = await authenticateUser();
  if (!auth.authenticated) return auth.response;

  const rl = await limitByUser(auth.user!.id, {
    prefix: "rl:custom-profile-request",
    limit: 3,
    windowMs: 60_000 * 60, // 3 requests per hour
  });
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too Many Requests", message: `Retry after ${rl.retryAfterSec}s` },
      { status: 429 }
    );
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { app_id, reason, requested_cpu, requested_memory, requested_replicas } = body as Record<string, unknown>;

  if (!app_id || typeof app_id !== "string") {
    return NextResponse.json({ error: "app_id is required" }, { status: 400 });
  }
  if (!reason || typeof reason !== "string" || reason.trim().length < 10) {
    return NextResponse.json(
      { error: "reason is required and must be at least 10 characters" },
      { status: 400 }
    );
  }

  try {
    const supabase = await createServiceClient();

    // Verify app belongs to user
    const { data: app, error: appErr } = await supabase
      .from("platform_apps")
      .select("id, name, size, status, pending_custom_profile_request_id")
      .eq("id", app_id)
      .eq("user_id", auth.user!.id)
      .single();

    if (appErr || !app) {
      return NextResponse.json({ error: "App not found" }, { status: 404 });
    }
    if (app.size !== "xxlarge") {
      return NextResponse.json(
        { error: "Custom profiles can only be requested for XXLarge apps" },
        { status: 409 }
      );
    }
    if (app.pending_custom_profile_request_id) {
      return NextResponse.json(
        { error: "An approved custom profile is already waiting for activation" },
        { status: 409 }
      );
    }

    // Block if already has a pending request for this app
    const { data: existing } = await supabase
      .from("platform_custom_profile_requests")
      .select("id, status, created_at")
      .eq("app_id", app_id)
      .eq("user_id", auth.user!.id)
      .eq("status", "pending")
      .maybeSingle();

    if (existing) {
      return NextResponse.json(
        {
          error: "Pending request already exists",
          message: "You already have a pending custom profile request for this app. Please wait for admin review.",
          existing_request_id: existing.id,
        },
        { status: 409 }
      );
    }

    const { data: request, error: insertErr } = await supabase
      .from("platform_custom_profile_requests")
      .insert({
        app_id,
        user_id: auth.user!.id,
        user_email: auth.user!.email ?? null,
        reason: reason.trim(),
        requested_cpu: typeof requested_cpu === "string" ? requested_cpu.trim() : null,
        requested_memory: typeof requested_memory === "string" ? requested_memory.trim() : null,
        requested_replicas: typeof requested_replicas === "number" ? Math.floor(requested_replicas) : null,
        status: "pending",
      })
      .select("id, status, created_at")
      .single();

    if (insertErr || !request) {
      if (insertErr?.code === "23505") {
        return NextResponse.json(
          {
            error: "Pending request already exists",
            message: "You already have a pending custom profile request for this app. Please wait for admin review.",
          },
          { status: 409 }
        );
      }
      logError("POST /api/services/platform-apps/custom-profile-request", insertErr);
      return NextResponse.json({ error: "Failed to submit request" }, { status: 500 });
    }

    return NextResponse.json(
      {
        success: true,
        message: "Your custom resource request has been submitted. Our team will review it and contact you.",
        request_id: request.id,
        status: "pending",
      },
      { status: 201 }
    );
  } catch (err) {
    logError("POST /api/services/platform-apps/custom-profile-request", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  const auth = await authenticateUser();
  if (!auth.authenticated) return auth.response;

  const app_id = req.nextUrl.searchParams.get("app_id");
  if (!app_id) {
    return NextResponse.json({ error: "app_id query param required" }, { status: 400 });
  }

  try {
    const supabase = await createServiceClient();

    const { data, error } = await supabase
      .from("platform_custom_profile_requests")
      .select("id, status, reason, requested_cpu, requested_memory, requested_replicas, approved_spec, approved_hourly_rate, admin_notes, created_at, reviewed_at")
      .eq("app_id", app_id)
      .eq("user_id", auth.user!.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      logError("GET /api/services/platform-apps/custom-profile-request", error);
      return NextResponse.json({ error: "Failed to fetch request" }, { status: 500 });
    }

    return NextResponse.json({ request: data ?? null });
  } catch (err) {
    logError("GET /api/services/platform-apps/custom-profile-request", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
