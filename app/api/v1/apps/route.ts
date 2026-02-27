// GET /api/v1/apps — list all apps owned by the authenticated user
import { Platform_Apps } from "@/lib/supabase/queries";
import { withV1Auth, v1Ok } from "@/lib/api/v1-middleware";

export const GET = withV1Auth("apps:list", async (_req, auth) => {
  const apps = await Platform_Apps.list_by_owner(auth.userId);

  return v1Ok({
    data: apps.map((app) => ({
      id:              app.id,
      name:            app.name,
      slug:            app.slug,
      framework:       app.framework,
      repository_name: app.repository_name,
      branch:          app.branch,
      status:          app.status,
      port:            app.port,
      ip:              app.ip,
      size:            app.size,
      auto_deploy:     app.auto_deploy,
      created_at:      app.created_at,
      updated_at:      app.updated_at,
    })),
    meta: {
      total: apps.length,
    },
  });
});
