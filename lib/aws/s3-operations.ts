import {
  S3Client,
  CreateBucketCommand,
  DeleteBucketCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
  CopyObjectCommand,
  PutBucketCorsCommand,
  DeleteBucketCorsCommand,
  PutBucketVersioningCommand,
  PutBucketAclCommand,
  ListObjectsV2CommandOutput,
  _Object,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Readable } from 'stream';

export interface S3Object {
  key: string;
  size: number;
  lastModified: Date;
  etag?: string;
  storageClass?: string;
}

export interface ListObjectsResult {
  objects: S3Object[];
  folders: string[];
  isTruncated: boolean;
  nextContinuationToken?: string;
  totalSize: number;
  totalCount: number;
}

/**
 * Create a new bucket
 */
export async function createBucket(
  client: S3Client,
  bucketName: string,
  acl: 'private' | 'public-read' = 'private'
): Promise<{ success: boolean; error?: string; errorCode?: string }> {
  try {
   // console.log(S3Client,"......................S3Client");
    await client.send(
      new CreateBucketCommand({
        Bucket: bucketName,
        ACL: acl,
      })
    );
    return { success: true };
  }catch (error: any) {
    console.error('Error creating bucket:', error);

    let message = 'Unknown error';
    let errorCode = error.name || 'UnknownError';

    if (error instanceof Error) {
      message = error.message;
    }

    // Check for specific bucket already exists errors
    if (errorCode === 'BucketAlreadyExists' || errorCode === 'BucketAlreadyOwnedByYou') {
      message = 'Bucket with this name already exists in the cloud provider';
    }

    return { success: false, error: message, errorCode };
  }
}

/**
 * Delete a bucket (bucket must be empty)
 */
export async function deleteBucket(
  client: S3Client,
  bucketName: string
): Promise<{ success: boolean; error?: string }> {
  try {
    await client.send(
      new DeleteBucketCommand({
        Bucket: bucketName,
      })
    );
    return { success: true };
  } catch (error: unknown) {
  console.error('Error emptying bucket:', error);

  let message = 'Unknown error';

  if (error instanceof Error) {
    message = error.message;
  }
    return { success: false, error: message };
  }
}

/**
 * List objects in a bucket with optional prefix (folder)
 */
export async function listObjects(
  client: S3Client,
  bucketName: string,
  prefix: string = '',
  maxKeys: number = 1000,
  continuationToken?: string,
  delimiter?: string
): Promise<ListObjectsResult> {
  try {
    const command: any = {
      Bucket: bucketName,
      Prefix: prefix,
      MaxKeys: maxKeys,
      ContinuationToken: continuationToken,
    };

    // Only add delimiter if explicitly provided
    if (delimiter !== undefined) {
      command.Delimiter = delimiter;
    }

    const response: ListObjectsV2CommandOutput = await client.send(
      new ListObjectsV2Command(command)
    );

    // Process objects
    const objects: S3Object[] = (response.Contents || []).map((obj: _Object) => ({
      key: obj.Key || '',
      size: obj.Size || 0,
      lastModified: obj.LastModified || new Date(),
      etag: obj.ETag,
      storageClass: obj.StorageClass,
    }));

    // Process folders (common prefixes)
    const folders = (response.CommonPrefixes || []).map((prefix) => prefix.Prefix || '');

    // Calculate total size
    const totalSize = objects.reduce((sum, obj) => sum + obj.size, 0);

    return {
      objects,
      folders,
      isTruncated: response.IsTruncated || false,
      nextContinuationToken: response.NextContinuationToken,
      totalSize,
      totalCount: objects.length,
    };
  } catch (error: unknown) {
  console.error('Error emptying bucket:', error);

  let message = 'Unknown error';

  if (error instanceof Error) {
    message = error.message;
  }
    throw new Error(`Failed to list objects: ${message}`);
  }
}

/**
 * Upload a file to bucket
 */
export async function uploadFile(
  client: S3Client,
  bucketName: string,
  key: string,
  body: Buffer | Readable | string,
  contentType?: string
): Promise<{ success: boolean; etag?: string; error?: string }> {
  try {
    const response = await client.send(
      new PutObjectCommand({
        Bucket: bucketName,
        Key: key,
        Body: body,
        ContentType: contentType,
      })
    );
    return { success: true, etag: response.ETag };
  } catch (error: unknown) {
  console.error('Error emptying bucket:', error);

  let message = 'Unknown error';

  if (error instanceof Error) {
    message = error.message;
  }
    return { success: false, error: message };
  }
}

/**
 * Download a file from bucket
 */
export async function downloadFile(
  client: S3Client,
  bucketName: string,
  key: string
): Promise<{ success: boolean; data?: Readable; contentType?: string; error?: string }> {
  try {
    const response = await client.send(
      new GetObjectCommand({
        Bucket: bucketName,
        Key: key,
      })
    );
    return {
      success: true,
      data: response.Body as Readable,
      contentType: response.ContentType,
    };
  } catch (error: unknown) {
  console.error('Error emptying bucket:', error);

  let message = 'Unknown error';

  if (error instanceof Error) {
    message = error.message;
  }
    return { success: false, error: message };
  }
}

/**
 * Delete a file from bucket
 */
export async function deleteFile(
  client: S3Client,
  bucketName: string,
  key: string
): Promise<{ success: boolean; error?: string }> {
  try {
    await client.send(
      new DeleteObjectCommand({
        Bucket: bucketName,
        Key: key,
      })
    );
    return { success: true };
  }catch (error: unknown) {
  console.error('Error emptying bucket:', error);

  let message = 'Unknown error';

  if (error instanceof Error) {
    message = error.message;
  }
    return { success: false, error: message };
  }
}

/**
 * Get file metadata
 */
export async function getFileMetadata(
  client: S3Client,
  bucketName: string,
  key: string
): Promise<{ success: boolean; size?: number; lastModified?: Date; contentType?: string; error?: string }> {
  try {
    const response = await client.send(
      new HeadObjectCommand({
        Bucket: bucketName,
        Key: key,
      })
    );
    return {
      success: true,
      size: response.ContentLength,
      lastModified: response.LastModified,
      contentType: response.ContentType,
    };
  } catch (error: unknown) {
  console.error('Error emptying bucket:', error);

  let message = 'Unknown error';

  if (error instanceof Error) {
    message = error.message;
  }
    return { success: false, error: message };
  }
}

/**
 * Generate a presigned URL for temporary access
 */
export async function generatePresignedUrl(
  client: S3Client,
  bucketName: string,
  key: string,
  expiresIn: number = 3600, // Default 1 hour
  operation: 'getObject' | 'putObject' = 'getObject'
): Promise<{ success: boolean; url?: string; error?: string }> {
  try {
    const command =
      operation === 'getObject'
        ? new GetObjectCommand({ Bucket: bucketName, Key: key })
        : new PutObjectCommand({ Bucket: bucketName, Key: key });

    const url = await getSignedUrl(client, command, { expiresIn });
    return { success: true, url };
  } catch (error: unknown) {
  console.error('Error emptying bucket:', error);

  let message = 'Unknown error';

  if (error instanceof Error) {
    message = error.message;
  }
    return { success: false, error: message };
  }
}

/**
 * Copy a file within bucket or between buckets
 */
export async function copyFile(
  client: S3Client,
  sourceBucket: string,
  sourceKey: string,
  destinationBucket: string,
  destinationKey: string
): Promise<{ success: boolean; error?: string }> {
  try {
    await client.send(
      new CopyObjectCommand({
        CopySource: `${sourceBucket}/${sourceKey}`,
        Bucket: destinationBucket,
        Key: destinationKey,
      })
    );
    return { success: true };
  } catch (error: unknown) {
  console.error('Error emptying bucket:', error);

  let message = 'Unknown error';

  if (error instanceof Error) {
    message = error.message;
  }
    return { success: false, error: message };
  }
}

/**
 * Update bucket CORS configuration
 */
export async function updateBucketCORS(
  client: S3Client,
  bucketName: string,
  enabled: boolean
): Promise<{ success: boolean; error?: string }> {
  try {
    if (enabled) {
      await client.send(
        new PutBucketCorsCommand({
          Bucket: bucketName,
          CORSConfiguration: {
            CORSRules: [
              {
                AllowedHeaders: ['*'],
                AllowedMethods: ['GET', 'PUT', 'POST', 'DELETE', 'HEAD'],
                AllowedOrigins: ['*'],
                ExposeHeaders: ['ETag'],
                MaxAgeSeconds: 3000,
              },
            ],
          },
        })
      );
    } else {
      await client.send(
        new DeleteBucketCorsCommand({
          Bucket: bucketName,
        })
      );
    }
    return { success: true };
  }catch (error: unknown) {
  console.error('Error emptying bucket:', error);

  let message = 'Unknown error';

  if (error instanceof Error) {
    message = error.message;
  }
    return { success: false, error: message };
  }
}

/**
 * Update bucket versioning
 */
export async function updateBucketVersioning(
  client: S3Client,
  bucketName: string,
  enabled: boolean
): Promise<{ success: boolean; error?: string }> {
  try {
    await client.send(
      new PutBucketVersioningCommand({
        Bucket: bucketName,
        VersioningConfiguration: {
          Status: enabled ? 'Enabled' : 'Suspended',
        },
      })
    );
    return { success: true };
  } catch (error: unknown) {
  console.error('Error emptying bucket:', error);

  let message = 'Unknown error';

  if (error instanceof Error) {
    message = error.message;
  }
    return { success: false, error: message };
  }
}

/**
 * Update bucket ACL
 */
export async function updateBucketACL(
  client: S3Client,
  bucketName: string,
  acl: 'private' | 'public-read'
): Promise<{ success: boolean; error?: string }> {
  try {
    await client.send(
      new PutBucketAclCommand({
        Bucket: bucketName,
        ACL: acl,
      })
    );
    return { success: true };
  } catch (error: unknown) {
  console.error('Error emptying bucket:', error);

  let message = 'Unknown error';

  if (error instanceof Error) {
    message = error.message;
  }
    return { success: false, error: message };
  }
}

/**
 * Get total bucket size and object count
 */
export async function getBucketStats(
  client: S3Client,
  bucketName: string
): Promise<{ success: boolean; size: number; count: number; error?: string }> {
  try {
    let totalSize = 0;
    let totalCount = 0;
    let continuationToken: string | undefined;

    do {
      const result = await listObjects(client, bucketName, '', 1000, continuationToken);
      totalSize += result.totalSize;
      totalCount += result.totalCount;
      continuationToken = result.nextContinuationToken;
    } while (continuationToken);

    return { success: true, size: totalSize, count: totalCount };
  } catch (error: unknown) {
  console.error('Error emptying bucket:', error);

  let message = 'Unknown error';

  if (error instanceof Error) {
    message = error.message;
  }
    return { success: false, size: 0, count: 0, error: message };
  }
}

/**
 * Delete all objects in a bucket (for bucket deletion)
 */
export async function emptyBucket(
  client: S3Client,
  bucketName: string
): Promise<{ success: boolean; deletedCount: number; error?: string }> {
  try {
    let deletedCount = 0;
    let continuationToken: string | undefined;

    do {
      const result = await listObjects(client, bucketName, '', 1000, continuationToken);
      
      // Delete all objects in this batch
      for (const obj of result.objects) {
        await deleteFile(client, bucketName, obj.key);
        deletedCount++;
      }

      continuationToken = result.nextContinuationToken;
    } while (continuationToken);

    return { success: true, deletedCount };
  } catch (error: unknown) {
  console.error('Error emptying bucket:', error);

  let message = 'Unknown error';

  if (error instanceof Error) {
    message = error.message;
  }
    return { success: false, deletedCount: 0, error: message };
  }
}
