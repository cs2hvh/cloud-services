// GET /api/v1/storage/buckets — list all buckets owned by the authenticated user
import { withV1Auth, v1Ok, v1Error } from "@/lib/api/v1-middleware";
import { ObjectStorageService } from "@/lib/services/object-storage-service";

export const GET = withV1Auth("storage:list", async (_req, auth) => {
  try {
    const buckets = await ObjectStorageService.listBuckets({
      owner_id: auth.userId,
      decrypt_credentials: false, // v1 API doesn't expose credentials
    });

    return v1Ok({
      data: buckets.map((bucket) => ({
        id: bucket.id,
        name: bucket.name,
        region: bucket.region,
        acl: bucket.acl,
        cors_enabled: bucket.cors_enabled,
        versioning_enabled: bucket.versioning_enabled,
        project_id: bucket.project_id,
        status: bucket.status,
        created_at: bucket.created_at,
        updated_at: bucket.updated_at,
      })),
      meta: {
        total: buckets.length,
      },
    });
  } catch {
    return v1Error("INTERNAL_ERROR", 500, "Failed to fetch buckets");
  }
});
