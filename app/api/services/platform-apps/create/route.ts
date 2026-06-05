import { NextRequest, NextResponse } from "next/server";
import { validateRequest } from "@/lib/middleware/validate-request";
import { createPlatformAppSchema, validateCustomSpec } from "@/lib/validation/platform-apps";
import { validateEnvVars } from "@/lib/validation/env-vars";
import { authenticateUser } from "@/lib/auth/server-auth";
import { sanitizeError, logError } from "@/lib/api/error-sanitizer";
import { limitByUser } from "@/lib/cooldown/userbased";
import { PlatformAppService } from "@/lib/services/platform-app-service";
import { getAuditContext } from "@/lib/audit";
import { requireAdmin } from "@/lib/supabase/auth";
import { getIdempotencyKey } from "@/lib/idempotency";

export async function POST(req: NextRequest) {
  const auth = await authenticateUser();
  if (!auth.authenticated) return auth.response;

  // Validate required environment variables
  const requiredEnvVars = [
    'JENKINS_URL',
    'CLOUDFLARE_API_TOKEN',
    'CLOUDFLARE_ZONE_ID',
    'KUBE_IP',
    'SUPABASE_SERVICE_ROLE_KEY'
  ];
  
  const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
  if (missingVars.length > 0) {
    console.error('[platform-apps/create] Missing environment variables:', missingVars);
    return NextResponse.json(
      { 
        error: 'Server configuration error',
        message: 'The server is not properly configured. Please contact support.',
      },
      { status: 500 }
    );
  }

  try {
    // Rate limit: 5 apps per minute per user
    const rl = await limitByUser(auth.user!.id, {
      prefix: "rl:platform-app-create",
      limit: 5,
      windowMs: 60_000,
    });
    if (!rl.allowed) {
      return NextResponse.json(
        {
          error: "Too Many Requests",
          message: `Retry after ${rl.retryAfterSec}s`,
        },
        { status: 429 }
      );
    }

    const body = await req.json();
    const validation = validateRequest(createPlatformAppSchema, body);
    if (!validation.success) return validation.response;

    const { env_vars, ...appData } = validation.data;

    // Validate environment variables (log warnings but allow deployment like Vercel)
    if (env_vars && env_vars.length > 0) {
      const envValidation = validateEnvVars(appData.framework, env_vars);
      if (envValidation.errors.length > 0) {
        console.warn('[platform-apps/create] Environment variable security warnings:', {
          framework: appData.framework,
          env_vars: env_vars.map(v => v.key),
          errors: envValidation.errors,
        });
      }
    }

    // Get audit context
    const auditContext = getAuditContext(req);
    const adminCheck = await requireAdmin();
    const isAdmin = !!adminCheck.ok;

    // Custom profile fields — admin-only
    const rawCustomSpec = body.custom_spec;
    const rawCustomRate = body.custom_hourly_rate;

    if (rawCustomSpec !== undefined && !isAdmin) {
      return NextResponse.json(
        { error: "Forbidden", message: "Custom deployment profiles can only be configured by an administrator." },
        { status: 403 }
      );
    }

    if (rawCustomSpec !== undefined) {
      const specError = validateCustomSpec(rawCustomSpec, rawCustomRate);
      if (specError) {
        return NextResponse.json({ error: "Invalid custom_spec", message: specError }, { status: 400 });
      }
    }

    const customSpec = isAdmin ? (rawCustomSpec ?? undefined) : undefined;
    const customHourlyRate = isAdmin && typeof rawCustomRate === 'number' ? rawCustomRate : undefined;
    const effectiveSize = customSpec ? 'custom' : appData.size;

    // Call service to handle all business logic
    const result = await PlatformAppService.createApp({
      name: appData.name,
      git_provider: appData.git_provider,
      repository_id: appData.repository_id,
      repository_name: appData.repository_name,
      repository_url: appData.repository_url,
      branch: appData.branch,
      framework: appData.framework,
      build_command: appData.build_command,
      output_directory: appData.output_directory,
      project_id: appData.project_id,
      env_vars,
      size: effectiveSize,
      auto_deploy: appData.auto_deploy,
      deploy_branch: appData.deploy_branch,
      container_port: appData.container_port,
      healthcheck_path: appData.healthcheck_path,
      userId: auth.user!.id,
      userEmail: auth.user?.email,
      auditContext: {
        ip_address: auditContext.ipAddress,
        user_agent: auditContext.userAgent,
        request_id: auditContext.requestId,
        user_role: isAdmin ? "admin" : "user",
      },
      idempotencyKey: getIdempotencyKey(req.headers),
      customSpec,
      customHourlyRate,
    });

    if (!result.success) {
      // Handle different error codes
      if (result.errorCode === 'INSUFFICIENT_BALANCE') {
        return NextResponse.json(
          {
            error: "Insufficient credits",
            balance: result.balance,
            required: result.required,
            message: `You need at least $${(result.required || 0).toFixed(2)} credits to deploy this app. Current balance: $${(result.balance || 0).toFixed(2)}`,
          },
          { status: 402 }
        );
      }

      if (result.errorCode === 'APP_LIMIT_EXCEEDED') {
        return NextResponse.json(
          {
            error: result.error || "App limit reached",
            message: `You have reached the maximum limit of ${result.maxLimit || 20} apps. Please delete an existing app to create a new one.`,
            current_count: result.currentCount,
            max_limit: result.maxLimit || 20,
          },
          { status: 429 }
        );
      }

      if (result.errorCode === 'NAME_EXISTS') {
        return NextResponse.json(
          {
            error: result.error || "App name already exists",
            message: "Please choose a different name. App names must be unique across all users.",
            field: "name",
          },
          { status: 409 }
        );
      }

      if (result.errorCode === 'NOT_FOUND') {
        return NextResponse.json(
          { error: result.error },
          { status: 404 }
        );
      }

      if (result.errorCode === 'FORBIDDEN') {
        return NextResponse.json(
          { error: result.error },
          { status: 403 }
        );
      }

      if (result.errorCode === 'GIT_TOKEN_MISSING') {
        return NextResponse.json(
          {
            error: result.error,
            code: 'GIT_TOKEN_MISSING',
            provider: appData.git_provider,
          },
          { status: 403 }
        );
      }

      if (result.errorCode === 'DEPLOYMENT_FAILED') {
        return NextResponse.json(
          { error: result.error || "Deployment failed" },
          { status: 502 }
        );
      }

      if (result.errorCode === 'OPERATION_IN_PROGRESS') {
        return NextResponse.json(
          { error: result.error || "App creation is already in progress" },
          { status: 409 }
        );
      }

      // Default error
      return NextResponse.json(
        { error: result.error || "Failed to create app" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      message: 'App created. Initial deployment in progress.',
      app_id: result.appId,
      deployment_url: result.deploymentUrl,
      port: result.port,
      auto_deploy: appData.auto_deploy || false,
      billing: {
        initial_cost: result.billingInfo?.initialCost,
        hourly_rate: result.billingInfo?.hourlyRate,
        instance_size: appData.size || 'small',
        activation: 'on_first_successful_deployment',
      },
    }, { status: 201 });
  } catch (err: unknown) {
    logError("services/platform-apps/create", err);
    return NextResponse.json({ error: sanitizeError(err) }, { status: 500 });
  }
}
