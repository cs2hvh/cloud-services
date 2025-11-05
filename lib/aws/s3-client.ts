import { S3Client, S3ClientConfig } from '@aws-sdk/client-s3';
import { Encryption, EncryptedData } from '@/config/functions';

/**
 * Create an S3 client configured for DigitalOcean Spaces
 * @param region - DO Spaces region (e.g., 'nyc3', 'sfo2')
 * @param accessKeyId - DO Spaces access key ID
 * @param secretAccessKey - DO Spaces secret key (will be decrypted if encrypted)
 * @returns Configured S3Client instance
 */
export function createS3Client(
  region: string,
  accessKeyId: string,
  secretAccessKey: string | EncryptedData
): S3Client {
  // Decrypt secret key if it's encrypted
  let decryptedSecretKey = secretAccessKey;
  if (typeof secretAccessKey === 'object' && 'encrypted' in secretAccessKey) {
    const encryptionKey = process.env.ENCRYPTION_KEY;
    if (!encryptionKey) {
      throw new Error('ENCRYPTION_KEY environment variable is not set');
    }
    decryptedSecretKey = Encryption.decrypt(secretAccessKey as EncryptedData, encryptionKey);
  }

  const config: S3ClientConfig = {
    region: region,
    endpoint: `https://${region}.digitaloceanspaces.com`,
    credentials: {
      accessKeyId,
      secretAccessKey: decryptedSecretKey as string,
    },
    forcePathStyle: false, // Use virtual-hosted-style URLs (bucket.region.digitaloceanspaces.com)
  };

  //console.log(`S3 Client configured for region: ${region}, endpoint: https://${region}.digitaloceanspaces.com`);

  return new S3Client(config);
}













/**
 * Create an S3 client using environment credentials
 * @param region - DO Spaces region (e.g., 'nyc3', 'sfo2', 'blr1')
 * @returns Configured S3Client instance
 */
export function createS3ClientFromAccessKey(region: string): S3Client {
  const accessKeyId = process.env.SPACES_ACCESS_KEY;
  const secretAccessKey = process.env.SPACES_SECRET_KEY;

  if (!accessKeyId || !secretAccessKey) {
    throw new Error('SPACES_ACCESS_KEY or SPACES_SECRET_KEY environment variables are not configured');
  }

  return createS3Client(region, accessKeyId, secretAccessKey);
}

/**
 * Get the bucket endpoint URL
 * @param bucketName - Name of the bucket
 * @param region - DO Spaces region
 * @returns Full bucket endpoint URL
 */
export function getBucketEndpoint(bucketName: string, region: string): string {
  return `https://${bucketName}.${region}.digitaloceanspaces.com`;
}

/**
 * Get the region endpoint (without bucket name)
 * @param region - DO Spaces region
 * @returns Region endpoint URL
 */
export function getRegionEndpoint(region: string): string {
  return `https://${region}.digitaloceanspaces.com`;
}

/**
 * Validate S3 client credentials by attempting a simple operation
 * @param client - S3Client instance to validate
 * @returns Promise<boolean> indicating if credentials are valid
 */
export async function validateS3Client(client: S3Client): Promise<boolean> {
  try {
    // Import ListBucketsCommand here to avoid circular dependencies
    const { ListBucketsCommand } = await import('@aws-sdk/client-s3');
    await client.send(new ListBucketsCommand({}));
    return true;
  } catch (error) {
    console.error('S3 Client validation failed:', error);
    return false;
  }
}
