import { NextRequest, NextResponse } from "next/server";
import { Platform_Apps } from "@/lib/supabase/queries";

/**
 * Webhook endpoint for Jenkins to update deployment status
 * Called by Jenkins post-build hooks
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { app_name, status, build_number } = body;

    if (!app_name || !status) {
      return NextResponse.json(
        { error: "Missing required fields: app_name, status" },
        { status: 400 }
      );
    }

    console.log(`[Webhook] Received deployment status update:`, {
      app_name,
      status,
      build_number,
    });

    // Find app by name (extract from app_name-job format)
    const appName = app_name.replace(/-job$/, "");
    
    // Get all apps and find by name (since we don't have app_id from Jenkins)
    const apps = await Platform_Apps.list_by_owner("");
    const app = apps.find((a: { name: string }) => a.name === appName);

    if (!app) {
      console.warn(`[Webhook] App not found: ${appName}`);
      return NextResponse.json(
        { warning: "App not found", app_name: appName },
        { status: 404 }
      );
    }

    // Update app status
    const validStatuses = ["pending", "building", "running", "failed", "stopped"];
    if (!validStatuses.includes(status)) {
      return NextResponse.json(
        { error: `Invalid status: ${status}` },
        { status: 400 }
      );
    }

    await Platform_Apps.update(app.id, {
      status: status as "pending" | "building" | "running" | "failed" | "stopped",
    });

    console.log(`[Webhook] ✅ Updated ${appName} status to: ${status}`);

    return NextResponse.json({
      success: true,
      app_id: app.id,
      app_name: appName,
      status,
      build_number,
    });
  } catch (error: unknown) {
    console.error("[Webhook] Error updating deployment status:", error);
    const errorMessage = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}
