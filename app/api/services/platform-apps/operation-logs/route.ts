import { NextRequest, NextResponse } from "next/server";
import { authenticateUser } from "@/lib/auth/server-auth";
import { limitByUser } from "@/lib/cooldown/userbased";
import { Platform_Apps } from "@/lib/supabase/queries";
import { AppDeploymentRepository, parseOperationDetails } from "@/lib/app-operations";
import { sanitizeError, logError } from "@/lib/api/error-sanitizer";
import { JenkinsService } from "@/lib/services/jenkins";

function synthesizeOperationLogs(params: {
  appName: string;
  operationId: string;
  trigger: string;
  details: ReturnType<typeof parseOperationDetails>;
}) {
  const lines = [
    `[OPERATION] ${params.details.type.toUpperCase()}`,
    `App: ${params.appName}`,
    `Operation ID: ${params.operationId}`,
    `Trigger: ${params.trigger}`,
  ];

  if (params.details.target?.build_number) {
    lines.push(`Target Build: #${params.details.target.build_number}`);
  }
  if (params.details.target?.image_ref) {
    lines.push(`Target Image: ${params.details.target.image_ref}`);
  }
  if (params.details.source?.size || params.details.target?.size) {
    lines.push(
      `Size: from ${params.details.source?.size ?? "unknown"} to ${params.details.target?.size ?? "unknown"}`
    );
  }

  lines.push("");

  for (const step of params.details.steps) {
    lines.push(`[STEP] ${step.label}`);
    lines.push(`Status: ${step.status.toUpperCase()}`);
    if (step.message) {
      lines.push(step.message);
    }
    if (step.started_at) {
      lines.push(`Started: ${step.started_at}`);
    }
    if (step.finished_at) {
      lines.push(`Finished: ${step.finished_at}`);
    }
    lines.push("");
  }

  if (params.details.verification) {
    lines.push("[VERIFICATION]");
    lines.push(`Status: ${params.details.verification.status.toUpperCase()}`);
    if (params.details.verification.message) {
      lines.push(params.details.verification.message);
    }
    if (params.details.verification.ready_replicas != null || params.details.verification.desired_replicas != null) {
      lines.push(
        `Replicas: ${params.details.verification.ready_replicas ?? "?"}/${params.details.verification.desired_replicas ?? "?"}`
      );
    }
    if (params.details.verification.observed_image) {
      lines.push(`Observed Image: ${params.details.verification.observed_image}`);
    }
  }

  if (params.details.warnings?.length) {
    lines.push("");
    lines.push("[WARNINGS]");
    for (const warning of params.details.warnings) {
      lines.push(warning);
    }
  }

  if (params.details.error) {
    lines.push("");
    lines.push("[ERROR]");
    lines.push(`${params.details.error.code}: ${params.details.error.message}`);
  }

  return lines.join("\n");
}

export async function GET(req: NextRequest) {
  const auth = await authenticateUser();
  if (!auth.authenticated) return auth.response;

  try {
    const rl = await limitByUser(auth.user!.id, {
      prefix: "rl:platform-app-operation-logs",
      limit: 30,
      windowMs: 60_000,
    });
    if (!rl.allowed) {
      return NextResponse.json(
        { error: "Too Many Requests", message: `Retry after ${rl.retryAfterSec}s` },
        { status: 429 }
      );
    }

    const { searchParams } = new URL(req.url);
    const appId = searchParams.get("app_id");
    const operationId = searchParams.get("operation_id");

    if (!appId || !operationId) {
      return NextResponse.json(
        { error: "Missing 'app_id' or 'operation_id' parameter" },
        { status: 400 }
      );
    }

    const appResult = await Platform_Apps.get(appId);
    if (!appResult.success || !appResult.data) {
      return NextResponse.json({ error: "App not found" }, { status: 404 });
    }
    if (appResult.data.user_id !== auth.user!.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const repository = new AppDeploymentRepository();
    const operation = await repository.findById(operationId);
    if (!operation || operation.app_id !== appId) {
      return NextResponse.json({ error: "Operation not found" }, { status: 404 });
    }

    const details = parseOperationDetails(operation.operation_details, {
      trigger: operation.trigger,
    });

    const resizeRunNumber =
      operation.trigger === "resize"
        ? (operation.build_number ??
          (typeof details.executor?.run_number === "number"
            ? details.executor.run_number
            : null))
        : null;

    let logs: string;
    if (operation.trigger === "resize" && resizeRunNumber) {
      try {
        logs = await JenkinsService.getResizeDeploymentLog(
          appResult.data.name,
          resizeRunNumber
        );
      } catch (jenkinsErr) {
        logError("services/platform-apps/operation-logs:resize-log", jenkinsErr);
        logs = synthesizeOperationLogs({
          appName: appResult.data.name,
          operationId: operation.id,
          trigger: operation.trigger,
          details,
        });
      }
    } else {
      logs = synthesizeOperationLogs({
        appName: appResult.data.name,
        operationId: operation.id,
        trigger: operation.trigger,
        details,
      });
    }

    return NextResponse.json({
      app_id: appId,
      app_name: appResult.data.name,
      operation_id: operation.id,
      operation_type: details.type,
      trigger: operation.trigger,
      status: operation.status,
      build_number: operation.build_number,
      executor_run_number:
        typeof details.executor?.run_number === "number"
          ? details.executor.run_number
          : null,
      rollback_target_build_number: operation.rollback_target_build_number,
      verification: details.verification ?? null,
      logs,
    });
  } catch (error) {
    logError("services/platform-apps/operation-logs", error);
    return NextResponse.json({ error: sanitizeError(error) }, { status: 500 });
  }
}
