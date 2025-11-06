# DigitalOcean Spaces Object Storage - Implementation Guide

## Overview

This implementation creates DigitalOcean Spaces buckets with dedicated access keys per bucket for enhanced security and access control.

## Architecture

### Flow

1. **Create Access Key**: Generate a DigitalOcean Spaces access key via the `/v2/spaces/keys` API endpoint
   - Access key name: bucket name
   - Grants: Full access to the specific bucket only
   
2. **Create Bucket**: Use the newly created access key credentials to create the bucket in DigitalOcean Spaces

3. **Encrypt & Store**: Encrypt the access key and secret key, then store them in the database alongside the bucket information

## Files Created/Modified

### New Files

1. **`lib/digitalocean/client.ts`**
   - DigitalOcean API client for interacting with DO API
   - Methods: `createSpacesKey()`, `deleteSpacesKey()`, `listSpacesKeys()`

2. **`lib/digitalocean/spaces-operations.ts`**
   - High-level operations for Spaces management
   - Methods: 
     - `createSpacesAccessKey()` - Create access key via DO API
     - `createSpacesBucket()` - Create bucket with credentials
     - `encryptCredentials()` - Encrypt keys for storage
     - `decryptCredentials()` - Decrypt keys for use
     - `deleteSpacesAccessKey()` - Delete access key

3. **`lib/digitalocean/index.ts`**
   - Barrel export for easier imports

4. **`supabase/migrations/20251106_update_object_spaces_for_bucket_keys.sql`**
   - Database migration to allow buckets to store encrypted access keys

### Modified Files

1. **`lib/supabase/types.ts`**
   - Updated `ObjectSpaceBucket` interface to include optional `key_id` and `secret_key` fields

2. **`app/api/services/object-storage/buckets/create/route.ts`**
   - Completely refactored to use the new flow:
     1. Create access key via DO API
     2. Create bucket with new credentials
     3. Encrypt credentials
     4. Store bucket with encrypted credentials

## Environment Variables Required

```env
# DigitalOcean API Token (for creating access keys)
DIGITALOCEAN_TOKEN=dop_v1_xxxxxxxxxxxxxxxxxxxxx

# Encryption key for storing credentials
ENCRYPTION_KEY=your-32-character-encryption-key

# No longer needed (keys are created per bucket):
# SPACES_ACCESS_KEY=
# SPACES_SECRET_KEY=
```

## Database Schema

The `object_spaces` table now supports storing encrypted credentials with buckets:

```sql
CREATE TABLE object_spaces (
  id UUID PRIMARY KEY,
  type TEXT NOT NULL, -- 'bucket' or 'access_key'
  name TEXT NOT NULL,
  owner_id UUID NOT NULL,
  project_id UUID,
  region TEXT NOT NULL,
  status TEXT NOT NULL,
  
  -- Bucket-specific fields
  bucket_id TEXT,
  endpoint TEXT,
  acl TEXT,
  cors_enabled BOOLEAN,
  versioning_enabled BOOLEAN,
  size_bytes BIGINT,
  object_count INTEGER,
  
  -- Optional: Encrypted credentials stored with bucket
  key_id TEXT, -- Encrypted access key
  secret_key TEXT, -- Encrypted secret key
  
  -- Optional: Reference to separate access key
  parent_access_key_id UUID,
  
  created_at TIMESTAMP,
  updated_at TIMESTAMP
);
```

## API Usage

### Create Bucket

**Endpoint**: `POST /api/services/object-storage/buckets/create`

**Request Body**:
```json
{
  "name": "my-bucket",
  "region": "nyc3",
  "owner_id": "user-uuid",
  "project_id": "project-uuid",
  "acl": "private",
  "cors_enabled": false,
  "versioning_enabled": false
}
```

**Response**:
```json
{
  "success": true,
  "data": {
    "id": "bucket-uuid",
    "name": "my-bucket",
    "bucket_id": "my-bucket",
    "region": "nyc3",
    "endpoint": "{encrypted-endpoint}",
    "acl": "private",
    "status": "active",
    "key_id": "{encrypted-access-key}",
    "secret_key": "{encrypted-secret-key}",
    ...
  },
  "message": "Bucket created successfully with dedicated access keys"
}
```

## Security Features

1. **Dedicated Access Keys**: Each bucket has its own access key with restricted permissions
2. **Encryption**: All credentials are encrypted using AES-256-GCM before storage
3. **Scoped Permissions**: Access keys only have full access to their specific bucket
4. **No Shared Credentials**: No longer relying on shared environment credentials

## Migration Steps

1. **Run the database migration**:
   ```bash
   # Apply the new migration
   supabase migration up
   ```

2. **Set environment variables**:
   - Add `DIGITALOCEAN_TOKEN` to your `.env` file
   - Ensure `ENCRYPTION_KEY` is set

3. **Update existing code** (if needed):
   - Any code that fetches buckets and expects to use env credentials should be updated to decrypt and use the stored credentials

## Usage Examples

### Creating a Bucket
```typescript
import { createSpacesAccessKey, createSpacesBucket, encryptCredentials } from "@/lib/digitalocean/spaces-operations";

// 1. Create access key
const keyResult = await createSpacesAccessKey("my-bucket", "nyc3");
const { accessKeyId, secretAccessKey } = keyResult.data;

// 2. Create bucket
await createSpacesBucket("my-bucket", "nyc3", accessKeyId, secretAccessKey, "private");

// 3. Encrypt and store
const { encryptedAccessKey, encryptedSecretKey } = encryptCredentials(
  accessKeyId,
  secretAccessKey,
  process.env.ENCRYPTION_KEY
);
```

### Using Stored Credentials
```typescript
import { decryptCredentials } from "@/lib/digitalocean/spaces-operations";

// Fetch bucket from database
const bucket = await ObjectSpaces.get_bucket_by_id(bucketId);

// Decrypt credentials
const { accessKey, secretKey } = decryptCredentials(
  bucket.key_id,
  bucket.secret_key,
  process.env.ENCRYPTION_KEY
);

// Use credentials with S3 client
const s3Client = createS3Client(bucket.region, accessKey, secretKey);
```

## Benefits

1. **Better Security**: Each bucket has isolated credentials
2. **Fine-grained Access**: Keys are scoped to specific buckets
3. **Easier Management**: Credentials stored with bucket, no need to manage separately
4. **Auditability**: Can track which keys are used for which buckets
5. **Revocation**: Can revoke access to a specific bucket without affecting others

## Notes

- The old schema with `parent_access_key_id` is still supported for backward compatibility
- Existing buckets using shared credentials will continue to work
- New buckets will automatically use dedicated access keys
- Consider implementing cleanup logic to delete access keys when buckets are deleted

## TODO / Future Improvements

1. Add cleanup logic to delete DO access keys when buckets are deleted
2. Add rollback logic if any step fails (delete created keys/buckets)
3. Add API endpoints to rotate access keys for existing buckets
4. Add monitoring for access key usage
5. Consider implementing access key caching to reduce decryption operations
