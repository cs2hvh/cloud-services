# Login & Logout Audit Log Implementation

## Overview
Successfully integrated login and logout tracking into the existing Admin Audit Log system. Admins can now monitor all authentication activities including email/password logins, OAuth logins (GitHub, GitLab, Bitbucket), and user logouts.

## Changes Made

### 1. Database Schema Updates
**File**: `supabase/migrations/20260122_create_audit_logs.sql`

- ✅ Added `'login'` and `'logout'` to action CHECK constraint
- ✅ Added `'auth'` to service_type CHECK constraint
- ✅ Made `service_type` and `service_id` nullable (auth actions don't always map to specific services)

```sql
-- Updated constraints
action TEXT NOT NULL CHECK (action IN ('create', 'update', 'delete', 'login', 'logout'))
service_type TEXT CHECK (service_type IN (..., 'auth'))
service_id TEXT  -- No longer NOT NULL
```

### 2. TypeScript Type Definitions
**File**: `lib/audit/types.ts`

- ✅ Updated `AuditAction` type: `'create' | 'update' | 'delete' | 'login' | 'logout'`
- ✅ Updated `AuditServiceType` to include `'auth'`
- ✅ Made `service_id` optional in `CreateAuditLogParams`

### 3. Authentication Endpoints Integration

#### Email/Password Login
**File**: `app/api/auth/signin/email/route.ts`

- ✅ Logs successful email/password logins
- ✅ Captures user info, IP address, user agent
- ✅ Records MFA status in metadata
- ✅ Non-blocking: Auth continues even if audit logging fails

```typescript
await AuditLogService.create({
  user_id: data.user.id,
  user_role: 'user',
  user_email: data.user.email,
  user_username: profile?.username,
  action: 'login',
  service_type: 'auth',
  service_id: data.user.id,
  service_name: 'Email/Password Login',
  metadata: {
    login_method: 'email',
    mfa_enabled: twofastatus,
  },
  ...context,
});
```

#### OAuth Login (GitHub, GitLab, Bitbucket)
**File**: `app/api/auth/callback/route.ts`

- ✅ Logs OAuth authentication after code exchange
- ✅ Detects provider (github, gitlab, bitbucket)
- ✅ Captures username from user_profiles
- ✅ Records provider in metadata

```typescript
await AuditLogService.create({
  user_id: user.id,
  user_role: 'user',
  user_email: user.email,
  user_username: username,
  action: 'login',
  service_type: 'auth',
  service_id: user.id,
  service_name: `OAuth Login - ${provider}`,
  metadata: {
    login_method: 'oauth',
    provider: provider,
  },
  ...context,
});
```

#### User Logout
**File**: `app/api/auth/signout/route.ts`

- ✅ Captures user info before session terminates
- ✅ Logs logout action with context
- ✅ Records logout method in metadata

```typescript
await AuditLogService.create({
  user_id: userId,
  user_role: 'user',
  user_email: userEmail,
  user_username: username,
  action: 'logout',
  service_type: 'auth',
  service_id: userId,
  service_name: 'User Logout',
  metadata: {
    logout_method: 'manual',
  },
  ...context,
});
```

### 4. Admin UI Updates
**File**: `components/admin/audit-log-filters.tsx`

- ✅ Added "Authentication" to service type filter dropdown
- ✅ Added "Login" and "Logout" to action filter dropdown
- ✅ Positioned at top of lists for visibility

**Service Type Filter:**
```tsx
<SelectItem value="auth">Authentication</SelectItem>
<SelectItem value="database">Database</SelectItem>
<SelectItem value="kubernetes">Kubernetes</SelectItem>
...
```

**Action Filter:**
```tsx
<SelectItem value="login">Login</SelectItem>
<SelectItem value="logout">Logout</SelectItem>
<SelectItem value="create">Create</SelectItem>
<SelectItem value="update">Update</SelectItem>
<SelectItem value="delete">Delete</SelectItem>
```

## Data Captured for Auth Events

### Login Events
| Field | Description | Example |
|-------|-------------|---------|
| `user_id` | Supabase user UUID | `550e8400-e29b-41d4-a716-446655440000` |
| `user_email` | User's email address | `user@example.com` |
| `user_username` | Username from profile | `johndoe` |
| `action` | Always `'login'` | `login` |
| `service_type` | Always `'auth'` | `auth` |
| `service_name` | Login method description | `Email/Password Login`, `OAuth Login - github` |
| `ip_address` | Client IP (handles proxies) | `192.168.1.100` |
| `user_agent` | Browser/client info | `Mozilla/5.0...` |
| `metadata.login_method` | Email or OAuth | `email`, `oauth` |
| `metadata.provider` | OAuth provider (if applicable) | `github`, `gitlab`, `bitbucket` |
| `metadata.mfa_enabled` | MFA status (email login) | `true`, `false` |

### Logout Events
| Field | Description | Example |
|-------|-------------|---------|
| `user_id` | Supabase user UUID | `550e8400-e29b-41d4-a716-446655440000` |
| `user_email` | User's email address | `user@example.com` |
| `user_username` | Username from profile | `johndoe` |
| `action` | Always `'logout'` | `logout` |
| `service_type` | Always `'auth'` | `auth` |
| `service_name` | Always `'User Logout'` | `User Logout` |
| `ip_address` | Client IP | `192.168.1.100` |
| `user_agent` | Browser/client info | `Mozilla/5.0...` |
| `metadata.logout_method` | How logout occurred | `manual` |

## Admin Usage

### Viewing Login/Logout Activity

1. **Navigate to Admin Audit Logs**
   - Go to `/dashboard/admin/audit-logs`

2. **Filter by Authentication Events**
   - **Service Type**: Select "Authentication"
   - **Action**: Choose "Login" or "Logout" or "All actions"

3. **View Specific User Activity**
   - Enter User ID to see all login/logout events for that user

4. **Time-based Filtering**
   - Use Start Date/End Date to view activity in specific timeframes

### Common Admin Queries

**Recent Logins (Last 24 hours):**
- Service Type: Authentication
- Action: Login
- Start Date: Yesterday
- End Date: Now

**User Login History:**
- Enter specific User ID
- Service Type: Authentication
- Action: Login

**Failed Login Attempts:**
- Currently, only successful logins are logged
- Failed attempts don't reach the audit log (authentication fails before logging)

**OAuth vs Email Logins:**
- Check the detail modal → Metadata → `login_method`
- `email` = Email/password login
- `oauth` = OAuth login (check `provider` field for GitHub/GitLab/Bitbucket)

**MFA-Enabled Users:**
- Filter: Action = Login
- Check detail modal → Metadata → `mfa_enabled`

## Security Features

✅ **Immutability**: Login/logout logs cannot be modified or deleted (trigger protection)  
✅ **Tamper Detection**: SHA-256 checksum computed for integrity verification  
✅ **IP Tracking**: Captures real client IP even behind proxies/load balancers  
✅ **Request Correlation**: Includes request_id for tracing related events  
✅ **Non-Blocking**: Auth continues even if audit logging fails (logged to console)  
✅ **RLS Protection**: Only admins can read audit logs via Row Level Security  

## Database Migration

**To deploy these changes:**

```bash
# Push the updated migration to Supabase
supabase db push

# Or manually apply the migration
supabase db reset  # Development only - destructive!
```

The migration will:
1. Alter the `action` CHECK constraint to include `login` and `logout`
2. Alter the `service_type` CHECK constraint to include `auth`
3. Remove NOT NULL constraints from `service_type` and `service_id`

**Note**: If the table already exists with data, you may need to create an additional migration file to ALTER the constraints rather than CREATE the table fresh.

## Testing Checklist

### Manual Testing

- [ ] **Email Login**: Sign in with email/password → Check audit log created
- [ ] **GitHub Login**: Sign in with GitHub → Check audit log with provider='github'
- [ ] **GitLab Login**: Sign in with GitLab → Check audit log with provider='gitlab'
- [ ] **Bitbucket Login**: Sign in with Bitbucket → Check audit log with provider='bitbucket'
- [ ] **Logout**: Sign out → Check logout audit log created
- [ ] **Admin Filter**: Filter by "Authentication" service type → See login/logout events
- [ ] **Action Filter**: Filter by "Login" → See only login events
- [ ] **Action Filter**: Filter by "Logout" → See only logout events
- [ ] **User Timeline**: Enter your user ID → See your login/logout history
- [ ] **Metadata**: Check detail modal shows login_method, provider, mfa_enabled
- [ ] **IP Capture**: Verify ip_address is captured correctly
- [ ] **User Agent**: Verify browser info is captured

### SQL Verification

```sql
-- Check login logs
SELECT 
  user_email, 
  action, 
  service_name, 
  metadata->>'login_method' as method,
  metadata->>'provider' as provider,
  ip_address,
  created_at 
FROM public.audit_logs 
WHERE action = 'login' 
ORDER BY created_at DESC 
LIMIT 10;

-- Check logout logs
SELECT 
  user_email, 
  action, 
  service_name, 
  ip_address,
  created_at 
FROM public.audit_logs 
WHERE action = 'logout' 
ORDER BY created_at DESC 
LIMIT 10;

-- User login timeline
SELECT 
  action, 
  service_name, 
  metadata,
  created_at 
FROM public.audit_logs 
WHERE user_id = 'YOUR_USER_ID' 
  AND service_type = 'auth'
ORDER BY created_at DESC;
```

## Future Enhancements

**Potential additions:**

1. **Failed Login Attempts**: Log authentication failures (requires middleware changes)
2. **Session Duration**: Track login→logout duration for each session
3. **Concurrent Sessions**: Detect multiple active sessions from different IPs
4. **Anomaly Detection**: Alert on unusual login patterns (new IP, new location, etc.)
5. **Password Changes**: Log when users change passwords
6. **MFA Events**: Track MFA enrollment, verification, and failures
7. **Token Refresh**: Log OAuth token refresh events
8. **Account Linking**: Log when users link/unlink OAuth providers

## Architecture Notes

- **Non-Blocking Design**: All audit logging is wrapped in try-catch to prevent auth flow interruption
- **Service Role Required**: Audit log INSERTs use Supabase service role (bypasses RLS)
- **Context Extraction**: Reuses existing `getAuditContext()` helper for IP/user-agent capture
- **Consistent Patterns**: Follows same structure as service audit logs (create/update/delete)
- **Backward Compatible**: Existing service logs unaffected by auth additions

## Files Modified

1. `supabase/migrations/20260122_create_audit_logs.sql` - Database schema
2. `lib/audit/types.ts` - TypeScript types
3. `app/api/auth/signin/email/route.ts` - Email login logging
4. `app/api/auth/callback/route.ts` - OAuth login logging
5. `app/api/auth/signout/route.ts` - Logout logging
6. `components/admin/audit-log-filters.tsx` - Admin UI filters

## Summary

✅ **Login Tracking**: All authentication methods (email, GitHub, GitLab, Bitbucket) logged  
✅ **Logout Tracking**: User logouts captured with context  
✅ **Admin Visibility**: Admins can filter and view all auth activity  
✅ **Security**: Immutable logs with tamper detection  
✅ **Performance**: Non-blocking implementation, won't slow down auth  
✅ **Metadata**: Rich context including login method, OAuth provider, MFA status  

**Result**: Comprehensive authentication audit trail for security monitoring, compliance, and user behavior analysis.
