// GET /api/v1/storage/buckets/[id] — get a single bucket by ID
// DELETE /api/v1/storage/buckets/[id] — delete bucket and all infrastructure
import { withV1Auth, v1Ok, v1Error } from "@/lib/api/v1-middleware";
import { ObjectStorageService } from "@/lib/services/object-storage-service";

// Helper to extract and validate bucket ID
async function getValidatedBucketId(context: { params: Promise<{ [key: string]: string | string[] }> } | undefined) {
  if (!context?.params) {
    return { error: v1Error("INTERNAL_ERROR", 500, "Missing route context"), id: null };
  }
  const rawParams = await context.params;
  const id = Array.isArray(rawParams.id) ? rawParams.id[0] : rawParams.id;

  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!id || !uuidRegex.test(id)) {
    return { error: v1Error("INVALID_ID", 400, "Invalid bucket ID format", { field: "id" }), id: null };
  }

  return { error: null, id };
}

export const GET = withV1Auth("storage:get", async (_req, auth, context) => {
  const { error, id } = await getValidatedBucketId(context);
  if (error) return error;

  try {
    // Use shared service without credential decryption
    const bucket = await ObjectStorageService.getBucket({
      bucket_id: id!,
      user_id: auth.userId,
      decrypt_credentials: false, // v1 API doesn't expose credentials
    });

    return v1Ok({
      data: {
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
      },
    });
  } catch (getError: unknown) {
    const error = getError as Error & { code?: string };
    
    if (error.code === 'NOT_FOUND') {
      return v1Error("NOT_FOUND", 404, "Bucket not found");
    }
    if (error.code === 'FORBIDDEN') {
      return v1Error("FORBIDDEN", 403, "Access denied");
    }

    console.error(`[GET /api/v1/storage/buckets/{id}] Failed:`, error);
    return v1Error("INTERNAL_ERROR", 500, "Failed to fetch bucket");
  }
});

export const DELETE = withV1Auth("storage:delete", async (req, auth, context) => {
  const { error, id } = await getValidatedBucketId(context);
  if (error) return error;

  try {
    // Get bucket details before deletion (for response)
    const bucket = await ObjectStorageService.getBucket({
      bucket_id: id!,
      user_id: auth.userId,
      decrypt_credentials: false,
    });

    // Delete using shared service (handles infrastructure, billing, logs, notifications)
    await ObjectStorageService.deleteBucket({
      bucket_id: id!,
      user_id: auth.userId,
      audit_context: {
        ip_address: req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "unknown",
        user_agent: req.headers.get("user-agent") || "unknown",
        request_id: crypto.randomUUID(),
        user_email: auth.kind === 'session' ? auth.email : undefined,
        user_role: "user", // v1 API users are always "user" role
      },
    });

    return v1Ok({
      data: {
        id: bucket.id,
        name: bucket.name,
        deleted: true,
        deleted_at: new Date().toISOString(),
      },
    });
  } catch (deleteError: unknown) {
    const error = deleteError as Error & { code?: string };
    
    if (error.code === 'NOT_FOUND') {
      return v1Error("NOT_FOUND", 404, "Bucket not found");
    }
    if (error.code === 'FORBIDDEN') {
      return v1Error("FORBIDDEN", 403, "Access denied");
    }

    console.error(`[DELETE /api/v1/storage/buckets/{id}] Failed:`, error);
    return v1Error("INTERNAL_ERROR", 500, "Failed to delete bucket");
  }
});
