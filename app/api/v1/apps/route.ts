// GET /api/v1/apps — list all apps owned by the authenticated user
import { withV1Auth, v1Ok, v1Error } from "@/lib/api/v1-middleware";
import { PlatformAppService } from "@/lib/services/platform-app-service";
import type { PlatformApp } from "@/lib/supabase/types";

export const GET = withV1Auth("apps:list", async (_req, auth) => {
  try {
    const apps = await PlatformAppService.listApps({
      userId: auth.userId,
      includeRollbackInfo: false, // v1 API doesn't include this extra field
    }) as PlatformApp[]; // Cast since we know includeRollbackInfo is false

    return v1Ok({
      data: apps.map((app) => ({
        id:                app.id,
        name:              app.name,
        slug:              app.slug,
        framework:         app.framework,
        repository_name:   app.repository_name,
        repository_url:    app.repository_url,
        branch:            app.branch,
        status:            app.status,
        deployment_url:    `https://${app.slug}.apps.hostguardian.net`, // Computed from slug
        port:              app.port,
        ip:                app.ip,
        size:              app.size,
        auto_deploy:       app.auto_deploy,
        git_provider:      app.git_provider,
        build_command:     app.build_command,
        output_directory:  app.output_directory,
        created_at:        app.created_at,
        updated_at:        app.updated_at,
      })),
      meta: {
        total: apps.length,
      },
    });
  } catch {
    return v1Error("INTERNAL_ERROR", 500, "Failed to fetch apps");
  }
});
