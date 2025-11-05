import { z } from 'zod';

// DigitalOcean Spaces regions
export const DO_SPACES_REGIONS = [
  'nyc3',
  'sfo2',
  'sfo3',
  'sgp1',
  'ams3',
  'fra1',
  'blr1'
] as const;

export type DOSpacesRegion = typeof DO_SPACES_REGIONS[number];

// Bucket naming rules (DNS-compliant)
export const BUCKET_NAME_RULES = {
  minLength: 3,
  maxLength: 63,
  pattern: /^[a-z0-9][a-z0-9-]*[a-z0-9]$/,
  description: 'Must be 3-63 characters, lowercase letters, numbers, and hyphens. Cannot start or end with hyphen. Must be globally unique.',
};

// Create Bucket Schema
export const createBucketSchema = z.object({
  type: z.literal('bucket'),
  name: z
    .string()
    .min(BUCKET_NAME_RULES.minLength, `Bucket name must be at least ${BUCKET_NAME_RULES.minLength} characters`)
    .max(BUCKET_NAME_RULES.maxLength, `Bucket name must be at most ${BUCKET_NAME_RULES.maxLength} characters`)
    .regex(BUCKET_NAME_RULES.pattern, BUCKET_NAME_RULES.description)
    .refine(
      (name) => !name.match(/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/),
      'Bucket name cannot be formatted as an IP address'
    )
    .refine(
      (name) => !name.startsWith('xn--'),
      'Bucket name cannot start with "xn--"'
    )
    .refine(
      (name) => !name.endsWith('-s3alias'),
      'Bucket name cannot end with "-s3alias"'
    ),
  region: z.enum(DO_SPACES_REGIONS, {
    errorMap: () => ({ message: 'Invalid region. Must be one of: ' + DO_SPACES_REGIONS.join(', ') })
  }),
  acl: z.enum(['private', 'public-read'], {
    errorMap: () => ({ message: 'ACL must be either "private" or "public-read"' })
  }).default('private'),
  cors_enabled: z.boolean().default(false),
  versioning_enabled: z.boolean().default(false),
  project_id: z.string().uuid('Invalid project ID'),
  owner_id: z.string().uuid('Invalid owner ID'),
  status: z.enum(['active', 'creating', 'deleting', 'revoked', 'failed']).default('creating'),
  size_bytes: z.number().nonnegative().default(0),
  object_count: z.number().int().nonnegative().default(0),
});

export type CreateBucketInput = z.infer<typeof createBucketSchema>;

// Update Bucket Settings Schema
export const updateBucketSettingsSchema = z.object({
  acl: z.enum(['private', 'public-read']).optional(),
  cors_enabled: z.boolean().optional(),
  versioning_enabled: z.boolean().optional(),
}).refine(
  (data) => Object.keys(data).length > 0,
  'At least one setting must be provided'
);

export type UpdateBucketSettingsInput = z.infer<typeof updateBucketSettingsSchema>;

// File upload validation
export const MAX_FILE_SIZE = 5 * 1024 * 1024 * 1024; // 5GB
export const ALLOWED_FILE_TYPES = [
  // Allow all types for now
  '*/*'
];

export const fileUploadSchema = z.object({
  bucket_id: z.string().min(1, 'Bucket ID is required'),
  file_name: z.string().min(1, 'File name is required'),
  file_size: z.number().max(MAX_FILE_SIZE, `File size must be less than ${MAX_FILE_SIZE / (1024 * 1024 * 1024)}GB`),
  content_type: z.string().optional(),
  folder_path: z.string().optional(),
});

export type FileUploadInput = z.infer<typeof fileUploadSchema>;

// Presigned URL generation schema
export const presignedUrlSchema = z.object({
  bucket_id: z.string().min(1, 'Bucket ID is required'),
  file_key: z.string().min(1, 'File key is required'),
  expires_in: z.number().int().positive().max(604800).default(3600), // Max 7 days, default 1 hour
  operation: z.enum(['getObject', 'putObject']).default('getObject'),
});

export type PresignedUrlInput = z.infer<typeof presignedUrlSchema>;

// Helper function to validate bucket name availability
export function validateBucketNameFormat(name: string): { valid: boolean; error?: string } {
  try {
    createBucketSchema.pick({ name: true }).parse({ name });
    return { valid: true };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { valid: false, error: error.errors[0]?.message };
    }
    return { valid: false, error: 'Invalid bucket name' };
  }
}

// Helper function to get region endpoint
export function getSpacesEndpoint(region: DOSpacesRegion): string {
  return `https://${region}.digitaloceanspaces.com`;
}

// Helper function to get bucket URL
export function getBucketUrl(bucketName: string, region: DOSpacesRegion): string {
  return `https://${bucketName}.${region}.digitaloceanspaces.com`;
}

// Helper function to format file size
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
}
