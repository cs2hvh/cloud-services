/**
 * Object Storage Service
 * Centralized business logic for object storage bucket operations
 * Used by both internal service endpoints and public v1 API
 * 
 * @module lib/services/object-storage-service
 */
import { ObjectStorageFunctions } from "@/config/object-storage-functions";
import { ObjectSpaces } from "@/lib/supabase/queries/object_spaces";
import { Billing } from "@/lib/supabase/queries/billing";
import { NotificationService, createServiceNotification } from "@/lib/notifications/service";
import { AuditLogService } from "@/lib/audit";
import { getRatesForObjectStorage } from "@/config/pricing";
import { ensureBalance, postProvisionBilling } from "@/config/billing-flow";
import { Encryption } from "@/config/functions";
import { createS3ClientFromAccessKey } from "@/lib/aws/s3-client";
import { updateBucketACL, updateBucketCORS, updateBucketVersioning } from "@/lib/aws/s3-operations";

// ====================================
// TYPE DEFINITIONS
// ====================================

export interface CreateBucketOptions {
  name: string;
  region: string;
  acl: 'private' | 'public-read';
  cors_enabled: boolean;
  versioning_enabled: boolean;
  owner_id: string;
  project_id?: string | null;
  audit_context?: {
    ip_address?: string;
    user_agent?: string;
    request_id?: string;
    user_email?: string;
    user_role?: 'user' | 'admin';
  };
}

export interface CreateBucketResult {
  success: boolean;
  bucket?: Record<string, unknown>;
  error?: string;
  code?: string;
}

export interface DeleteBucketOptions {
  bucket_id: string;
  user_id: string;
  force?: boolean;
  is_admin?: boolean;
  audit_context?: {
    ip_address?: string;
    user_agent?: string;
    request_id?: string;
    user_email?: string;
    user_role?: 'user' | 'admin';
  };
}

export interface DeleteBucketResult {
  success: boolean;
  bucket_name?: string;
  error?: string;
  code?: string;
}

export interface GetBucketOptions {
  bucket_id: string;
  user_id: string;
  decrypt_credentials?: boolean;  // Decrypt sensitive fields
}

export interface ListBucketsOptions {
  owner_id: string;
  decrypt_credentials?: boolean;  // Decrypt sensitive fields for all buckets
}

export interface UpdateBucketSettingsOptions {
  bucket_id: string;
  user_id: string;
  settings: {
    acl?: 'private' | 'public-read';
    cors_enabled?: boolean;
    versioning_enabled?: boolean;
    project_id?: string | null;
  };
  audit_context?: {
    ip_address?: string;
    user_agent?: string;
    request_id?: string;
    user_email?: string;
    user_role?: 'user' | 'admin';
  };
}

export interface UpdateBucketSettingsResult {
  success: boolean;
  updated_fields?: string[];
  error?: string;
  code?: string;
}

// ====================================
// SERVICE CLASS
// ====================================

export class ObjectStorageService {
  /**
   * Helper to decrypt a JSON-stringified encrypted field
   */
  private static decryptJsonField(field: string | null | undefined): string {
    if (!field) return "";
    
    const encryptionKey = process.env.ENCRYPTION_KEY;
    if (!encryptionKey) return field;
    
    try {
      const parsed = JSON.parse(field);
      if (parsed && typeof parsed === 'object' && 'encrypted' in parsed) {
        return Encryption.decrypt(parsed, encryptionKey);
      }
      return field;
    } catch {
      return field;
    }
  }

  /**
   * Create a new object storage bucket
   * - Validates uniqueness
   * - Checks user balance
   * - Creates infrastructure
   * - Sets up billing
   * - Creates audit log and notification
   * 
   * @throws Error if creation fails
   */
  static async createBucket(options: CreateBucketOptions): Promise<CreateBucketResult> {
    const {
      name,
      region,
      acl,
      cors_enabled,
      versioning_enabled,
      owner_id,
      project_id,
      audit_context,
    } = options;

    console.log(`[ObjectStorageService.createBucket] Creating bucket ${name} for user ${owner_id}`);

    try {
      // 0. Duplicate check (keep user-facing 409 behavior)
      const existing = await ObjectSpaces.get_bucket_by_name(name);
      if (existing) {
        const error = new Error('Bucket name already exists') as Error & { code?: string };
        error.code = 'BUCKET_EXISTS';
        throw error;
      }

      // 1. Get pricing
      const { initialCost, hourlyRate } = await getRatesForObjectStorage();

      // 2. Check user balance
      const balCheck = await ensureBalance(owner_id, initialCost);
      if (!balCheck.ok) {
        const error = new Error('Insufficient credits') as Error & { code?: string; balance?: number };
        error.code = 'INSUFFICIENT_BALANCE';
        error.balance = balCheck.balance;
        throw error;
      }

      // 3. Create bucket infrastructure
      const result = await ObjectStorageFunctions.createBucket({
        name,
        region,
        acl,
        cors_enabled,
        versioning_enabled,
        owner_id,
        project_id: project_id ?? null,
      });

      if (!result.success) {
        const message = `${result.error || ""} ${result.message || ""}`.toLowerCase();
        const error = new Error(result.error || 'Bucket creation failed') as Error & { code?: string };
        error.code = message.includes("already exists") ? 'BUCKET_EXISTS' : 'CREATION_FAILED';
        throw error;
      }

      // 4. Set up billing
      const serviceId = result.data?.id ?? name;
      try {
        await postProvisionBilling({
          userId: owner_id,
          initialCost,
          hourlyRate,
          serviceId,
          addActive: Billing.add_active_objectspace,
        });
        console.log(`[ObjectStorageService.createBucket] Billing setup complete`);
      } catch (billingErr) {
        console.error(`[ObjectStorageService.createBucket] Billing setup failed:`, billingErr);
        const error = new Error('Post provision billing failed') as Error & { code?: string };
        error.code = 'BILLING_FAILED';
        throw error;
      }

      // 5. Create audit log
      if (audit_context) {
        try {
          await AuditLogService.create({
            user_id: owner_id,
            user_role: audit_context.user_role || 'user',
            user_email: audit_context.user_email,
            action: 'create',
            service_type: 'object_storage',
            service_id: serviceId,
            service_name: name,
            after_state: result.data,
            ip_address: audit_context.ip_address,
            user_agent: audit_context.user_agent,
            request_id: audit_context.request_id,
            metadata: {
              region,
              acl,
              initial_cost: initialCost,
              hourly_rate: hourlyRate,
            },
          });
        } catch (auditErr) {
          console.warn(`[ObjectStorageService.createBucket] Audit log failed:`, auditErr);
        }
      }

      // 6. Create success notification
      try {
        await NotificationService.create(
          createServiceNotification({
            userId: owner_id,
            type: 'success',
            action: 'created',
            serviceType: 'object_storage',
            serviceName: name,
            serviceId,
          })
        );
      } catch (notifErr) {
        console.error(`[ObjectStorageService.createBucket] Notification failed:`, notifErr);
      }

      return {
        success: true,
        // Preserve legacy internal API behavior by returning the full stored row.
        bucket: (result.data as Record<string, unknown>) || {
          id: serviceId,
          name,
          region,
          status: 'active',
          endpoint: undefined,
        },
      };

    } catch (error: unknown) {
      // Create error notification
      try {
        await NotificationService.create(
          createServiceNotification({
            userId: owner_id,
            type: 'error',
            action: 'created',
            serviceType: 'object_storage',
            serviceName: name,
            error: error instanceof Error ? error.message : 'Unknown error',
          })
        );
      } catch (notifErr) {
        console.error(`[ObjectStorageService.createBucket] Error notification failed:`, notifErr);
      }

      throw error; // Re-throw for caller to handle
    }
  }

  /**
   * Delete an object storage bucket
   * - Closes billing (prorated)
   * - Creates audit log
   * - Deletes infrastructure
   * - Creates notification
   * 
   * @throws Error if deletion fails
   */
  static async deleteBucket(options: DeleteBucketOptions): Promise<DeleteBucketResult> {
    const { bucket_id, user_id, force = true, is_admin = false, audit_context } = options;

    console.log(`[ObjectStorageService.deleteBucket] Deleting bucket ${bucket_id}`);

    try {
      // 1. Best-effort fetch for metadata/audit context (don't block deletion on lookup errors)
      let bucket: Awaited<ReturnType<typeof ObjectSpaces.get_bucket_by_bucket_id>> | null = null;
      try {
        bucket = await ObjectSpaces.get_bucket_by_bucket_id(bucket_id, is_admin);
      } catch {
        bucket = null;
      }

      const bucketName = bucket?.name || bucket_id;

      // 2. Close billing (prorated)
      try {
        const billingResult = await Billing.close_active_service("objectspace", {
          userId: user_id,
          serviceId: bucket_id,
          failOnInsufficient: false,
        });
        console.log(`[ObjectStorageService.deleteBucket] Billing closed:`, billingResult);
      } catch (billErr) {
        console.warn(`[ObjectStorageService.deleteBucket] Billing close failed:`, billErr);
        // Don't block deletion on billing failure
      }

      // 3. Create audit log before deletion
      if (audit_context && bucket) {
        try {
          await AuditLogService.create({
            user_id,
            user_role: audit_context.user_role || (is_admin ? 'admin' : 'user'),
            user_email: audit_context.user_email,
            action: 'delete',
            service_type: 'object_storage',
            service_id: bucket_id,
            service_name: bucketName,
            before_state: bucket as unknown as Record<string, unknown>,
            ip_address: audit_context.ip_address,
            user_agent: audit_context.user_agent,
            request_id: audit_context.request_id,
            metadata: { force },
          });
        } catch (auditErr) {
          console.warn(`[ObjectStorageService.deleteBucket] Audit log failed:`, auditErr);
        }
      }

      // 4. Delete bucket infrastructure
      const result = await ObjectStorageFunctions.deleteBucket({
        bucket_id,
        user_id,
        force,
        is_admin,
      });

      if (!result.success) {
        const error = new Error(result.error || 'Bucket deletion failed') as Error & { code?: string };
        error.code = result.error === "Bucket not found" ? 'NOT_FOUND' :
                    result.error === "Unauthorized" ? 'FORBIDDEN' : 'DELETION_FAILED';
        throw error;
      }

      // 5. Create success notification
      try {
        await NotificationService.create(
          createServiceNotification({
            userId: user_id,
            type: 'success',
            action: 'deleted',
            serviceType: 'object_storage',
            serviceName: bucketName,
            serviceId: bucket_id,
          })
        );
      } catch (notifErr) {
        console.error(`[ObjectStorageService.deleteBucket] Notification failed:`, notifErr);
      }

      return {
        success: true,
        bucket_name: bucketName,
      };

    } catch (error: unknown) {
      // Create error notification
      try {
        await NotificationService.create(
          createServiceNotification({
            userId: user_id,
            type: 'error',
            action: 'deleted',
            serviceType: 'object_storage',
            serviceName: bucket_id,
            error: error instanceof Error ? error.message : 'Unknown error',
          })
        );
      } catch (notifErr) {
        console.error(`[ObjectStorageService.deleteBucket] Error notification failed:`, notifErr);
      }

      throw error; // Re-throw for caller to handle
    }
  }

  /**
   * Get a single bucket by ID
   * - Verifies ownership
   * - Optionally decrypts credentials
   * 
   * @throws Error if bucket not found or unauthorized
   */
  static async getBucket(options: GetBucketOptions) {
    const { bucket_id, user_id, decrypt_credentials = false } = options;

    if (decrypt_credentials) {
      const result = await ObjectStorageFunctions.readBucket({
        bucket_id,
        user_id,
      });

      if (!result.success) {
        const error = new Error(result.message || result.error || 'Failed to retrieve bucket') as Error & { code?: string };
        error.code = result.error === "Bucket not found" ? 'NOT_FOUND' :
                    result.error === "Unauthorized" ? 'FORBIDDEN' : 'READ_FAILED';
        throw error;
      }

      return result.data;
    }

    const bucket = await ObjectSpaces.get_bucket_by_bucket_id(bucket_id);
    if (!bucket) {
      const error = new Error('Bucket not found') as Error & { code?: string };
      error.code = 'NOT_FOUND';
      throw error;
    }

    // Verify ownership
    if (bucket.owner_id !== user_id) {
      const error = new Error('Unauthorized') as Error & { code?: string };
      error.code = 'FORBIDDEN';
      throw error;
    }

    // Decrypt credentials if requested
    if (decrypt_credentials) {
      return {
        ...bucket,
        endpoint: this.decryptJsonField(bucket.endpoint),
        key_id: this.decryptJsonField(bucket.key_id),
        secret_key: this.decryptJsonField(bucket.secret_key),
      };
    }

    return bucket;
  }

  /**
   * List all buckets for a user
   * - Optionally decrypts credentials for all buckets
   */
  static async listBuckets(options: ListBucketsOptions) {
    const { owner_id, decrypt_credentials = false } = options;

    const buckets = await ObjectSpaces.get_buckets(owner_id);

    if (!decrypt_credentials) {
      return buckets;
    }

    // Keep internal read_all behavior: decrypt endpoint only
    return buckets.map(bucket => ({
      ...bucket,
      endpoint: this.decryptJsonField(bucket.endpoint),
    }));
  }

  /**
   * Update bucket settings (ACL, CORS, versioning, project)
   * - Updates both S3 provider and database
   * - Creates audit log and notification
   * 
   * @throws Error if update fails
   */
  static async updateBucketSettings(options: UpdateBucketSettingsOptions): Promise<UpdateBucketSettingsResult> {
    const { bucket_id, user_id, settings, audit_context } = options;
    const updatedFields: string[] = [];

    console.log(`[ObjectStorageService.updateBucketSettings] Updating bucket ${bucket_id}`);

    try {
      // 1. Get bucket and verify ownership
      const bucket = await ObjectSpaces.get_bucket_by_bucket_id(bucket_id);
      if (!bucket) {
        const error = new Error('Bucket not found') as Error & { code?: string };
        error.code = 'NOT_FOUND';
        throw error;
      }

      if (bucket.owner_id !== user_id) {
        const error = new Error('Unauthorized') as Error & { code?: string };
        error.code = 'FORBIDDEN';
        throw error;
      }

      const s3Client = createS3ClientFromAccessKey(bucket.region);
      const beforeState: Record<string, unknown> = {};
      const afterState: Record<string, unknown> = {};

      // 2. Update ACL if provided
      if (settings.acl !== undefined) {
        beforeState.acl = bucket.acl;
        afterState.acl = settings.acl;

        const validAcl = settings.acl as 'private' | 'public-read';
        const aclResult = await updateBucketACL(s3Client, bucket.name, validAcl);
        if (!aclResult.success) {
          throw new Error(`Failed to update ACL: ${aclResult.error}`);
        }

        const dbResult = await ObjectSpaces.update_bucket_settings(bucket.id as string, { acl: validAcl });
        if (!dbResult.success) {
          console.warn(`[ObjectStorageService.updateBucketSettings] DB update for ACL failed:`, dbResult.error);
        }

        updatedFields.push('acl');
      }

      // 3. Update CORS if provided
      if (settings.cors_enabled !== undefined) {
        beforeState.cors_enabled = bucket.cors_enabled;
        afterState.cors_enabled = settings.cors_enabled;

        const corsResult = await updateBucketCORS(s3Client, bucket.name, settings.cors_enabled);
        if (!corsResult.success) {
          throw new Error(`Failed to update CORS: ${corsResult.error}`);
        }

        const dbResult = await ObjectSpaces.update_bucket_settings(bucket.id as string, { cors_enabled: settings.cors_enabled });
        if (!dbResult.success) {
          console.warn(`[ObjectStorageService.updateBucketSettings] DB update for CORS failed:`, dbResult.error);
        }

        updatedFields.push('cors_enabled');
      }

      // 4. Update versioning if provided
      if (settings.versioning_enabled !== undefined) {
        beforeState.versioning_enabled = bucket.versioning_enabled;
        afterState.versioning_enabled = settings.versioning_enabled;

        const versionResult = await updateBucketVersioning(s3Client, bucket.name, settings.versioning_enabled);
        if (!versionResult.success) {
          throw new Error(`Failed to update versioning: ${versionResult.error}`);
        }

        const dbResult = await ObjectSpaces.update_bucket_settings(bucket.id as string, { versioning_enabled: settings.versioning_enabled });
        if (!dbResult.success) {
          console.warn(`[ObjectStorageService.updateBucketSettings] DB update for versioning failed:`, dbResult.error);
        }

        updatedFields.push('versioning_enabled');
      }

      // 5. Update project_id if provided (DB only)
      if ('project_id' in settings) {
        beforeState.project_id = bucket.project_id;
        afterState.project_id = settings.project_id;

        const dbResult = await ObjectSpaces.update_bucket_settings(bucket.id as string, { project_id: settings.project_id });
        if (!dbResult.success) {
          throw new Error(`Failed to update project: ${dbResult.error}`);
        }

        updatedFields.push('project_id');
      }

      // 6. Create audit log
      if (audit_context && updatedFields.length > 0) {
        try {
          await AuditLogService.create({
            user_id,
            user_role: audit_context.user_role || 'user',
            user_email: audit_context.user_email,
            action: 'update',
            service_type: 'object_storage',
            service_id: bucket_id,
            service_name: bucket.name,
            before_state: beforeState,
            after_state: afterState,
            ip_address: audit_context.ip_address,
            user_agent: audit_context.user_agent,
            request_id: audit_context.request_id,
            metadata: {
              updated_fields: updatedFields,
            },
          });
        } catch (auditErr) {
          console.warn(`[ObjectStorageService.updateBucketSettings] Audit log failed:`, auditErr);
        }
      }

      // 7. Create success notification
      if (updatedFields.length > 0) {
        try {
          await NotificationService.create(
            createServiceNotification({
              userId: user_id,
              type: 'success',
              action: 'updated',
              serviceType: 'object_storage',
              serviceName: bucket.name,
              serviceId: bucket_id,
            })
          );
        } catch (notifErr) {
          console.error(`[ObjectStorageService.updateBucketSettings] Notification failed:`, notifErr);
        }
      }

      return {
        success: true,
        updated_fields: updatedFields,
      };

    } catch (error: unknown) {
      // Create error notification
      try {
        await NotificationService.create(
          createServiceNotification({
            userId: user_id,
            type: 'error',
            action: 'updated',
            serviceType: 'object_storage',
            serviceName: bucket_id,
            error: error instanceof Error ? error.message : 'Unknown error',
          })
        );
      } catch (notifErr) {
        console.error(`[ObjectStorageService.updateBucketSettings] Error notification failed:`, notifErr);
      }

      throw error; // Re-throw for caller to handle
    }
  }
}
