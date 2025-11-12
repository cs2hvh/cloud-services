import { ObjectSpaces } from "@/lib/supabase/queries";
import { getBucketUrl } from "@/lib/validation/object-storage";
import { resolveHost } from "@/config/hosttoip";
import { Encryption } from "@/config/functions";
import { createSpacesKey } from "@/lib/digitalocean/api/bucket";
import { createS3Client } from "@/lib/aws/s3-client";
import { createBucket as s3CreateBucket } from "@/lib/aws/s3-operations";

// Types for better type safety
export type BucketACL = 'private' | 'public-read';

export interface CreateBucketConfig {
  name: string;
  region: string;
  acl?: BucketACL;
  cors_enabled?: boolean;
  versioning_enabled?: boolean;
  owner_id: string;
  project_id: string;
}

export interface CreateBucketResult {
  success: boolean;
  data?: any;
  error?: string;
  message?: string;
}

export interface EnvironmentConfig {
  encryptionKey: string;
  spacesAccessKey: string;
  spacesSecretKey: string;
}

/**
 * Validates and retrieves required environment variables
 * @returns Environment config or error details
 */
function getEnvironmentConfig(): { success: true; config: EnvironmentConfig } | { success: false; error: string } {
  const encryptionKey = process.env.ENCRYPTION_KEY;
  const envAccessKey = process.env.SPACES_ACCESS_KEY;
  const envSecretKey = process.env.SPACES_SECRET_KEY;

  if (!encryptionKey) {
    return { 
      success: false, 
      error: "Encryption configuration is missing" 
    };
  }

  if (!envAccessKey || !envSecretKey) {
    return { 
      success: false, 
      error: "Cloud storage credentials are not configured" 
    };
  }

  return {
    success: true,
    config: {
      encryptionKey,
      spacesAccessKey: envAccessKey,
      spacesSecretKey: envSecretKey,
    }
  };
}

/**
 * Creates a bucket in DigitalOcean Spaces
 * @param config Bucket configuration
 * @param envConfig Environment configuration
 * @returns Creation result
 */
async function createSpacesBucket(
  config: CreateBucketConfig, 
  envConfig: EnvironmentConfig
): Promise<{ success: boolean; error?: string }> {
  try {
    const s3Client = createS3Client(config.region, envConfig.spacesAccessKey, envConfig.spacesSecretKey);
    const bucketResult = await s3CreateBucket(s3Client, config.name, config.acl || 'private');

    if (!bucketResult.success) {
      return { success: false, error: bucketResult.error };
    }

    return { success: true };
  } catch (error) {
    return { 
      success: false, 
      error: error instanceof Error ? error.message : "Failed to create storage bucket" 
    };
  }
}

/**
 * Creates dedicated access credentials for the bucket
 * @param bucketName Name of the bucket
 * @returns Access credentials or error
 */
async function createBucketCredentials(bucketName: string): Promise<{
  success: boolean;
  credentials?: { accessKeyId: string; secretAccessKey: string };
  error?: string;
}> {
  try {
    const keyResult = await createSpacesKey(bucketName, [
      {
        bucket: bucketName,
        permission: "readwrite",
      },
    ]);

    if (!keyResult.success || !keyResult.data) {
      return { success: false, error: keyResult.error || "Failed to create access credentials" };
    }

    const { access_key: accessKeyId, secret_key: secretAccessKey } = keyResult.data;
    
    if (!accessKeyId || !secretAccessKey) {
      return { success: false, error: "Invalid credentials received from provider" };
    }

    return {
      success: true,
      credentials: { accessKeyId, secretAccessKey }
    };
  } catch (error) {
    return { 
      success: false, 
      error: error instanceof Error ? error.message : "Failed to create access credentials" 
    };
  }
}

/**
 * Processes and encrypts the bucket endpoint with DNS resolution
 * @param bucketName Name of the bucket
 * @param region Region of the bucket
 * @param encryptionKey Key for encryption
 * @returns Encrypted endpoint
 */
async function processAndEncryptEndpoint(
  bucketName: string, 
  region: string, 
  encryptionKey: string
): Promise<string> {
  const originalEndpoint = getBucketUrl(bucketName, region as any);
  let endpointToEncrypt = originalEndpoint;

  try {
    const doSpacesDomain = `${bucketName}.${region}.digitaloceanspaces.com`;
    const resolveResult = await resolveHost(doSpacesDomain);

    if (resolveResult.records.length > 0) {
      const aRecord = resolveResult.records.find((r) => r.type === "A");
      if (aRecord && aRecord.records.length > 0) {
        const ip = aRecord.records[0] as string;
        endpointToEncrypt = originalEndpoint.replace(doSpacesDomain, ip);
      }
    }
  } catch (error) {
    // Fallback to original endpoint if DNS resolution fails
    console.warn("DNS resolution failed, using original endpoint");
  }

  return JSON.stringify(Encryption.encrypt(endpointToEncrypt, encryptionKey));
}

/**
 * Encrypts access credentials
 * @param accessKeyId Access key ID
 * @param secretAccessKey Secret access key
 * @param encryptionKey Encryption key
 * @returns Encrypted credentials
 */
function encryptCredentials(
  accessKeyId: string, 
  secretAccessKey: string, 
  encryptionKey: string
): { encryptedAccessKey: string; encryptedSecretKey: string } {
  const encryptedAccessKey = JSON.stringify(Encryption.encrypt(accessKeyId, encryptionKey));
  const encryptedSecretKey = JSON.stringify(Encryption.encrypt(secretAccessKey, encryptionKey));

  return { encryptedAccessKey, encryptedSecretKey };
}

/**
 * Stores the bucket information in the database
 * @param config Bucket configuration
 * @param encryptedEndpoint Encrypted endpoint URL
 * @param encryptedCredentials Encrypted access credentials
 * @returns Database operation result
 */
async function storeBucketInDatabase(
  config: CreateBucketConfig,
  encryptedEndpoint: string,
  encryptedCredentials: { encryptedAccessKey: string; encryptedSecretKey: string }
): Promise<{ success: boolean; data?: any; error?: string }> {
  try {
    const dbResult = await ObjectSpaces.create_bucket({
      type: "bucket",
      name: config.name,
      bucket_id: config.name,
      region: config.region,
      endpoint: encryptedEndpoint,
      acl: config.acl || "private",
      cors_enabled: config.cors_enabled || false,
      versioning_enabled: config.versioning_enabled || false,
      owner_id: config.owner_id,
      project_id: config.project_id,
      status: "active",
      size_bytes: 0,
      object_count: 0,
      key_id: encryptedCredentials.encryptedAccessKey,
      secret_key: encryptedCredentials.encryptedSecretKey,
      //parent_access_key_id: null,
    });

    if (!dbResult.success) {
      return { success: false, error: dbResult.error };
    }

    return { success: true, data: dbResult.data };
  } catch (error) {
    return { 
      success: false, 
      error: error instanceof Error ? error.message : "Failed to save bucket information" 
    };
  }
}

/**
 * Main function to handle bucket creation with all security measures
 * @param config Bucket configuration from validated request
 * @returns Complete bucket creation result
 */
export async function handleCreateBucket(config: CreateBucketConfig): Promise<CreateBucketResult> {
  // Step 1: Get and validate environment configuration
  const envResult = getEnvironmentConfig();
  if (!envResult.success) {
    return {
      success: false,
      error: "Server configuration error",
      message: envResult.error
    };
  }

  const envConfig = envResult.config;

  // Step 2: Create bucket in DigitalOcean Spaces
  const bucketResult = await createSpacesBucket(config, envConfig);
  if (!bucketResult.success) {
    return {
      success: false,
      error: "Failed to create storage bucket",
      message: bucketResult.error
    };
  }

  // Step 3: Create dedicated access credentials
  const credentialsResult = await createBucketCredentials(config.name);
  if (!credentialsResult.success) {
    return {
      success: false,
      error: "Failed to create access credentials",
      message: credentialsResult.error
    };
  }

  // Step 4: Process and encrypt endpoint
  const encryptedEndpoint = await processAndEncryptEndpoint(
    config.name, 
    config.region, 
    envConfig.encryptionKey
  );

  // Step 5: Encrypt credentials
  const encryptedCredentials = encryptCredentials(
    credentialsResult.credentials!.accessKeyId,
    credentialsResult.credentials!.secretAccessKey,
    envConfig.encryptionKey
  );

  // Step 6: Store in database
  const dbResult = await storeBucketInDatabase(config, encryptedEndpoint, encryptedCredentials);
  if (!dbResult.success) {
    return {
      success: false,
      error: "Failed to save bucket information",
      message: dbResult.error
    };
  }

  return {
    success: true,
    data: dbResult.data,
    message: "Bucket created successfully with secure access credentials"
  };
}

// Additional imports for read and delete operations
import { getBucketStats } from "@/lib/aws/s3-operations";
import { emptyBucket, deleteBucket as s3DeleteBucket } from "@/lib/aws/s3-operations";
import { deleteSpacesKey } from "@/lib/digitalocean/api/bucket";

// Types for read operation
export interface ReadBucketConfig {
  bucket_id: string;
  user_id: string;
  is_admin?: boolean;
}

export interface ReadBucketResult {
  success: boolean;
  data?: any;
  error?: string;
  message?: string;
}

// Types for delete operation
export interface DeleteBucketConfig {
  bucket_id: string;
  user_id: string;
  force?: boolean;
  is_admin?: boolean;
}

export interface DeleteBucketResult {
  success: boolean;
  error?: string;
  message?: string;
}

/**
 * Decrypts bucket credentials and endpoint
 * @param bucket Bucket data from database
 * @param encryptionKey Encryption key
 * @returns Decrypted bucket data
 */
function decryptBucketData(bucket: any, encryptionKey: string): any {
  let decryptedBucket = { ...bucket };
  
  if (bucket.endpoint && bucket.endpoint.startsWith('{')) {
    try {
      // Decrypt endpoint, access key, and secret key
      const encryptedEndpoint = JSON.parse(bucket.endpoint);
      const encryptedAccessKey = JSON.parse(bucket.key_id);
      const encryptedSecretKey = JSON.parse(bucket.secret_key);
      
      decryptedBucket.endpoint = Encryption.decrypt(encryptedEndpoint, encryptionKey);
      decryptedBucket.key_id = Encryption.decrypt(encryptedAccessKey, encryptionKey);
      decryptedBucket.secret_key = Encryption.decrypt(encryptedSecretKey, encryptionKey);
    } catch (error) {
      console.warn("Failed to decrypt bucket data, using original values");
    }
  }
  
  return decryptedBucket;
}

/**
 * Fetches live bucket statistics from storage provider
 * @param bucket Bucket information
 * @param envConfig Environment configuration
 * @returns Updated bucket with live stats
 */
async function fetchLiveBucketStats(bucket: any, envConfig: EnvironmentConfig): Promise<any> {
  try {
    const s3Client = createS3Client(bucket.region, envConfig.spacesAccessKey, envConfig.spacesSecretKey);
    const stats = await getBucketStats(s3Client, bucket.name);
    
    if (stats.success) {
      return {
        ...bucket,
        size_bytes: stats.size,
        object_count: stats.count
      };
    }
  } catch (error) {
    console.warn("Failed to fetch live stats, using database values");
  }
  
  return bucket;
}

/**
 * Handles reading a bucket with secure credential decryption and live stats
 * @param config Read bucket configuration
 * @returns Bucket data with decrypted credentials and live stats
 */
export async function handleReadBucket(config: ReadBucketConfig): Promise<ReadBucketResult> {
  // Get environment configuration
  const envResult = getEnvironmentConfig();
  if (!envResult.success) {
    return {
      success: false,
      error: "Server configuration error",
      message: envResult.error
    };
  }

  try {
    // Get bucket from database
    const bucket = await ObjectSpaces.get_bucket_by_bucket_id(config.bucket_id, config.is_admin);

    if (!bucket) {
      return { success: false, error: "Bucket not found" };
    }

    // Verify ownership (skip for admin users)
    if (!config.is_admin && bucket.owner_id !== config.user_id) {
      return { 
        success: false, 
        error: "Unauthorized", 
        message: "Access denied to this bucket" 
      };
    }

    // Decrypt bucket credentials
    const decryptedBucket = decryptBucketData(bucket, envResult.config.encryptionKey);

    // Fetch live stats
    const bucketWithStats = await fetchLiveBucketStats(decryptedBucket, envResult.config);

    return {
      success: true,
      data: bucketWithStats
    };
  } catch (error) {
    return {
      success: false,
      error: "Failed to retrieve bucket",
      message: error instanceof Error ? error.message : "Unknown error occurred"
    };
  }
}

/**
 * Empties and deletes a bucket from storage provider
 * @param bucket Bucket information
 * @param envConfig Environment configuration
 * @param force Whether to force delete by emptying first
 * @returns Deletion result
 */
async function deleteBucketFromProvider(
  bucket: { name: string; region: string }, 
  envConfig: EnvironmentConfig, 
  force: boolean
): Promise<{ success: boolean; error?: string }> {
  try {
    const s3Client = createS3Client(bucket.region, envConfig.spacesAccessKey, envConfig.spacesSecretKey);

    // If force=true, empty the bucket first
    if (force) {
      const emptyResult = await emptyBucket(s3Client, bucket.name);
      if (!emptyResult.success) {
        return { success: false, error: emptyResult.error };
      }
    }

    // Delete bucket from storage provider
    const deleteResult = await s3DeleteBucket(s3Client, bucket.name);
    if (!deleteResult.success) {
      return { 
        success: false, 
        error: deleteResult.error || "Failed to delete bucket from storage provider"
      };
    }

    return { success: true };
  } catch (error) {
    return { 
      success: false, 
      error: error instanceof Error ? error.message : "Failed to delete bucket from storage provider" 
    };
  }
}

async function deleteBucketAccessKey(bucket: any, encryptionKey: string): Promise<void> {
  if (!bucket.key_id) {
    return; // No key to delete
  }

  try {
    const decryptedKeyId = Encryption.decrypt(JSON.parse(bucket.key_id), encryptionKey);
    await deleteSpacesKey(decryptedKeyId);
  } catch (error) {
    console.warn("Failed to delete access key, continuing with bucket deletion");
  }
}

/**
 * Handles secure bucket deletion with cleanup
 * @param config Delete bucket configuration
 * @returns Deletion result
 */
export async function handleDeleteBucket(config: DeleteBucketConfig): Promise<DeleteBucketResult> {
  // Get environment configuration
  const envResult = getEnvironmentConfig();
  if (!envResult.success) {
    return {
      success: false,
      error: "Server configuration error",
      message: envResult.error
    };
  }

  try {
    // Get bucket from database
    console.log("Fetching bucket for deletion:", config.bucket_id);
    const bucket = await ObjectSpaces.get_bucket_by_bucket_id(config.bucket_id, config.is_admin);

    if (!bucket) {
      return { success: false, error: "Bucket not found" };
    }

    // Verify ownership (skip for admin users)
    if (!config.is_admin && bucket.owner_id !== config.user_id) {
      return { 
        success: false, 
        error: "Unauthorized", 
        message: "Access denied to this bucket" 
      };
    }

    // Delete bucket from storage provider
    const providerResult = await deleteBucketFromProvider(
      bucket, 
      envResult.config, 
      config.force || true
    );
    
    if (!providerResult.success) {
      return {
        success: false,
        error: "Failed to delete bucket",
        message: providerResult.error
      };
    }

    // Delete access key from provider
    await deleteBucketAccessKey(bucket, envResult.config.encryptionKey);

    // Delete from database
    if (!bucket.id) {
      return {
        success: false,
        error: "Invalid bucket data",
        message: "Bucket ID is missing"
      };
    }

    const dbResult = await ObjectSpaces.delete(bucket.id);
    if (!dbResult.success) {
      return {
        success: false,
        error: "Failed to remove bucket from database",
        message: dbResult.error
      };
    }

    return {
      success: true,
      message: "Bucket deleted successfully"
    };
  } catch (error) {
    return {
      success: false,
      error: "Failed to delete bucket",
      message: error instanceof Error ? error.message : "Unknown error occurred"
    };
  }
}

/**
 * Object Storage Functions Export
 * Provides secure, centralized functions for object storage operations
 */
export const ObjectStorageFunctions = {
  createBucket: handleCreateBucket,
  readBucket: handleReadBucket,
  deleteBucket: handleDeleteBucket,
  // Add more functions as needed for other operations
} as const;