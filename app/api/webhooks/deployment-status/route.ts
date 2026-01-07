import { NextRequest, NextResponse } from "next/server";
import { Platform_Apps, Platform_App_Deployments } from "@/lib/supabase/queries";

/**
 * Webhook endpoint for Jenkins to update deployment status
 * Called by Jenkins post-build hooks
 * 
 * Expected payload:
 * {
 *   app_name: string,      // App name (or job name like "myapp-job")
 *   status: string,        // "running" | "failed" | "building"
 *   build_number: number,  // Jenkins build number
 *   failure_reason?: string, // Optional: why the build failed
 *   commit_sha?: string,   // Optional: git commit SHA
 *   image_tag?: string,    // Optional: Docker image tag
 *   trigger?: string,      // Optional: "manual" | "webhook" | "rollback"
 * }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { 
      app_name, 
      status, 
      build_number,
      failure_reason,
      commit_sha,
      image_tag,
      trigger = 'webhook',
    } = body;

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

    // Build the update payload
    const updatePayload: {
      status: "pending" | "building" | "running" | "failed" | "stopped";
      last_failure_reason?: string | null;
    } = {
      status: status as "pending" | "building" | "running" | "failed" | "stopped",
    };

    // If failed, store the failure reason
    if (status === 'failed' && failure_reason) {
      updatePayload.last_failure_reason = failure_reason;
    } else if (status === 'running') {
      // Clear failure reason on successful deployment
      updatePayload.last_failure_reason = null;
    }

    await Platform_Apps.update(app.id, updatePayload);

    // Record deployment in history (for rollback capability)
    if (status === 'running' || status === 'failed') {
      const deploymentStatus = status === 'running' ? 'success' : 'failed';
      const validTrigger = ['manual', 'webhook', 'rollback', 'resize'].includes(trigger) 
        ? trigger as 'manual' | 'webhook' | 'rollback' | 'resize'
        : 'webhook';

      const deploymentResult = await Platform_App_Deployments.create({
        app_id: app.id,
        build_number: build_number || null,
        commit_sha: commit_sha || null,
        image_tag: image_tag || null,
        status: deploymentStatus,
        trigger: validTrigger,
        failure_reason: status === 'failed' ? failure_reason : null,
      });

      if (deploymentResult.success && deploymentStatus === 'success') {
        // Set as active deployment
        await Platform_App_Deployments.set_active_for_app(app.id, deploymentResult.data.id);
      }

      console.log(`[Webhook] 📝 Recorded deployment: ${deploymentStatus}${failure_reason ? ` (${failure_reason})` : ''}`);
    }

    console.log(`[Webhook] ✅ Updated ${appName} status to: ${status}`);

    return NextResponse.json({
      success: true,
      app_id: app.id,
      app_name: appName,
      status,
      build_number,
      failure_reason: status === 'failed' ? failure_reason : undefined,
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
