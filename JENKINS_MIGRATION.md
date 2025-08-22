# Jenkins API Migration to Supabase

## Migration Completed

The Jenkins API route has been successfully migrated from MySQL/Lucia Auth to Supabase.

## Changes Made

### 1. Database Schema

Created new `apps` table in Supabase for Jenkins deployments:

```sql
CREATE TABLE apps (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    github_url TEXT NOT NULL,
    port INTEGER NOT NULL UNIQUE,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
    status TEXT DEFAULT 'building',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

### 2. Row Level Security

Added RLS policies for the apps table:
- Users can only view, create, update, and delete their own apps
- Apps are automatically filtered by `user_id`

### 3. API Route Updates

**File:** `/app/api/jenkins/route.ts`

#### Authentication Changes
- **Old:** `import { validateRequest } from '@/lib/auth'`
- **New:** `import { getUser } from '@/lib/supabase/auth'`

#### Database Queries
- **Old:** `query.apps.getUsedPorts()` and `query.apps.create()`
- **New:** Supabase client queries with proper error handling

#### ID Generation
- **Old:** `generateIdFromEntropySize(10)` from Lucia
- **New:** `uuid.v4().substring(0, 10)`

### 4. New Features Added

- **GET endpoint**: List all user's apps
- **DELETE endpoint**: Delete an app (removes Jenkins job and database record)
- **Project integration**: Apps can be associated with projects
- **Activity logging**: All app operations are logged to project_logs

### 5. Dependencies

- Removed: `lucia` (ID generation)
- Added: `uuid` package (already installed)
- Kept: `jenkins` package for Jenkins API operations

## Environment Variables Required

Ensure these are set in your `.env` file:

```env
# Jenkins Configuration
JENKINS_URL=your_jenkins_url
JENKINS_USER=your_jenkins_user
JENKINS_TOKEN=your_jenkins_api_token

# Kubernetes/Infrastructure
KUBE_IP=your_kubernetes_cluster_ip

# Cloudflare
CLOUDFLARE_ZONE_ID=your_cloudflare_zone_id
CLOUDFLARE_API_TOKEN=your_cloudflare_api_token
```

## Testing the Migration

### 1. Apply Database Migration

Run the migration in your Supabase SQL editor:

```sql
-- Run the contents of /supabase/migrations/add_apps_table.sql
```

Or if you've already updated the main schema:

```sql
-- Run the apps table creation from /supabase/schema.sql
```

### 2. Test API Endpoints

#### Create an App
```bash
curl -X POST http://localhost:3000/api/jenkins \
  -H "Content-Type: application/json" \
  -H "Cookie: your-auth-cookie" \
  -d '{
    "name": "test-app",
    "github": "https://github.com/user/repo",
    "branch": "main",
    "buildCommand": "npm run build",
    "projectId": "optional-project-uuid"
  }'
```

#### List User's Apps
```bash
curl http://localhost:3000/api/jenkins \
  -H "Cookie: your-auth-cookie"
```

#### Delete an App
```bash
curl -X DELETE "http://localhost:3000/api/jenkins?id=app-id" \
  -H "Cookie: your-auth-cookie"
```

## Benefits of Migration

1. **Consistent Authentication**: Uses same Supabase auth as rest of application
2. **Row Level Security**: Automatic user isolation at database level
3. **Better Type Safety**: TypeScript types generated from Supabase schema
4. **Activity Tracking**: Integration with project logs
5. **Simplified Code**: No need for custom query builders or session management

## Rollback Instructions

If you need to rollback:

1. Restore the old `/app/api/jenkins/route.ts` from version control
2. Drop the apps table: `DROP TABLE IF EXISTS apps CASCADE;`
3. Remove apps type definitions from `/lib/supabase/types.ts`

## Next Steps

1. Update any frontend components that interact with Jenkins API
2. Add real-time subscriptions for build status updates (optional)
3. Implement Cloudflare DNS record cleanup on app deletion
4. Add webhook support for Jenkins build notifications