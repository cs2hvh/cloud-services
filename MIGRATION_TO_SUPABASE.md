
# Supabase Migration Guide

## Overview
This project has been migrated from MySQL + Lucia Auth to Supabase for authentication and database management.

## Environment Setup

Add these environment variables to your `.env` file:

```env
# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key

# GitHub OAuth (for Supabase)
GITHUB_CLIENT_ID=your_github_client_id
GITHUB_CLIENT_SECRET=your_github_client_secret
```

## Database Setup

1. **Create a new Supabase project** at https://supabase.com

2. **Run the schema migration** in your Supabase SQL editor:
   ```sql
   -- Copy and paste the contents of supabase/schema.sql
   ```

3. **Configure Authentication Providers** in Supabase Dashboard:
   - Go to Authentication → Providers
   - Enable GitHub provider with your OAuth credentials
   - Set redirect URL to: `https://your-domain.com/api/auth/callback`

## Key Changes Made

### 1. Authentication System
- **Removed**: Lucia Auth, bcryptjs, MySQL sessions
- **Added**: Supabase Auth with built-in OAuth support
- **Benefits**: 
  - Built-in email verification
  - OAuth providers (GitHub, Discord, etc.)
  - Secure session management
  - Password reset functionality

### 2. Database Layer
- **Removed**: MySQL connection, custom query builders
- **Added**: Supabase client with Row Level Security (RLS)
- **Benefits**:
  - Automatic security policies
  - Real-time subscriptions
  - Built-in API generation
  - Type-safe database operations

### 3. File Structure Changes
```
lib/
├── supabase/
│   ├── client.ts          # Browser client
│   ├── server.ts          # Server client + service client
│   ├── middleware.ts      # Auth middleware
│   ├── auth.ts           # Auth helpers
│   ├── queries.ts        # Database query layer
│   └── types.ts          # Database types
└── (removed old mysql/ and lucia/ folders)
```

### 4. API Routes Updated
- `app/api/auth/signin/email/route.ts` - Supabase password auth
- `app/api/auth/signup/route.ts` - User registration
- `app/api/auth/signout/route.ts` - Sign out
- `app/api/auth/callback/route.ts` - OAuth callback
- `app/api/projects/route.ts` - Project creation with RLS
- `app/api/users/route.ts` - User queries
- `app/api/services/order/game/route.ts` - Game server creation

## Migration Steps for Existing Users

### 1. Data Migration (if needed)
If you have existing MySQL data, you'll need to migrate it:

```sql
-- Export existing users from MySQL
-- Import into Supabase user_profiles table
-- Note: Auth users will need to be created separately
```

### 2. Update Frontend Components
Replace authentication calls:

```typescript
// Old (Lucia)
import { validateRequest } from '@/lib/lucia/auth'

// New (Supabase)
import { getUser, getUserProfile } from '@/lib/supabase/auth'
```

### 3. OAuth Setup
1. **GitHub OAuth**:
   - Update redirect URI in GitHub App settings
   - Add credentials to Supabase Auth providers
   
2. **Discord OAuth** (if needed):
   - Same process as GitHub

## Row Level Security (RLS) Policies

The migration includes comprehensive RLS policies:

- **Projects**: Users can only access projects they own or are members of
- **Game Servers**: Users can only access their own servers
- **User Profiles**: Users can only edit their own profiles
- **Project Logs**: Access restricted to project members

## Testing the Migration

1. **Authentication Flow**:
   ```bash
   # Test email signup
   curl -X POST http://localhost:3000/api/auth/signup \
     -H "Content-Type: application/json" \
     -d '{"email":"test@example.com","password":"password","username":"testuser"}'
   
   # Test email signin
   curl -X POST http://localhost:3000/api/auth/signin/email \
     -H "Content-Type: application/json" \
     -d '{"email":"test@example.com","password":"password"}'
   ```

2. **GitHub OAuth**:
   - Visit `/signin` and test GitHub login button
   - Verify redirect to `/dashboard` after successful auth

3. **Database Operations**:
   - Create a project
   - Order a game server
   - Check user permissions

## Troubleshooting

### Common Issues:

1. **"Invalid JWT" errors**: Check your Supabase keys in `.env`
2. **RLS policy violations**: Ensure user is authenticated and has proper permissions
3. **OAuth redirect errors**: Verify callback URL in provider settings
4. **Type errors**: Run `npm run build` to check for TypeScript issues

### Debug Mode:
Enable Supabase debug mode:
```typescript
const supabase = createClient(url, key, { debug: true })
```

## Benefits of Migration

1. **Security**: Built-in RLS, secure authentication
2. **Performance**: Optimized queries, connection pooling
3. **Scalability**: Serverless database, global CDN
4. **Developer Experience**: Type-safe operations, real-time features
5. **Maintenance**: Reduced code complexity, managed infrastructure

## Next Steps

1. Remove old MySQL environment variables
2. Update any remaining MySQL references in components
3. Add real-time subscriptions where beneficial
4. Consider adding email templates in Supabase Auth
5. Set up database backups and monitoring