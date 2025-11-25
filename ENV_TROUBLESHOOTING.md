# Environment Variables Troubleshooting Guide

## Error: "Invalid API key"

This error occurs when the Cloudflare API token is invalid, expired, or doesn't have the correct permissions.

### Solution for Cloudflare API Token

1. **Go to Cloudflare Dashboard**:
   - Visit https://dash.cloudflare.com/
   - Click on your profile (top right) → "My Profile" → "API Tokens"

2. **Create New Token** (or verify existing):
   ```
   Template: Edit zone DNS
   OR Custom Token with:
   
   Permissions:
   ├─ Zone → DNS → Edit
   └─ Zone → Zone → Read
   
   Zone Resources:
   └─ Include → Specific zone → uizb210.xyz
   ```

3. **Copy the token** and update `.env.local`:
   ```bash
   CLOUDFLARE_API_TOKEN=your_new_token_here
   ```

4. **Get Zone ID**:
   - Cloudflare Dashboard → Select "uizb210.xyz" domain
   - Scroll down on Overview page (right sidebar)
   - Copy "Zone ID"
   ```bash
   CLOUDFLARE_ZONE_ID=your_zone_id_here
   ```

## Error: Missing SUPABASE_SERVICE_ROLE_KEY

### Why It's Needed
The service role key is required for:
- Creating platform apps in the database (bypasses RLS)
- Listing all apps to check port allocation
- Updating app status during deployment

### How to Get It
1. **Supabase Dashboard**: https://supabase.com/dashboard
2. **Your Project** → Settings → API
3. Copy **"service_role"** key (the secret one, NOT the anon key)
4. Update `.env.local`:
   ```bash
   SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
   ```

⚠️ **Warning**: Never commit this key to git or expose it client-side!

## Error: Missing KUBE_CONFIG_STRING

### Why It's Needed
Kubernetes config is required to:
- Deploy applications to the cluster
- Create/delete Kubernetes resources (deployments, services, ingress)
- Manage SSL certificates via cert-manager

### How to Get It
```bash
# On your machine with kubectl access:
cat ~/.kube/config | base64
```

For multi-line output (macOS), copy everything and paste as one line in `.env.local`:
```bash
KUBE_CONFIG_STRING=YXBpVmVyc2lvbjogdjEKY2x1c3RlcnM6Ci0gY2x1c3RlcjoK...
```

## Error: JENKINS_URL authentication failed

### Format
```bash
JENKINS_URL=http://username:api_token@jenkins.hav0k.dev
```

### Get Jenkins API Token
1. Login to Jenkins: http://jenkins.hav0k.dev
2. Click your username (top right) → Configure
3. Section: "API Token" → Add new Token
4. Copy token and format as:
   ```bash
   JENKINS_URL=http://admin:11abc123def456@jenkins.hav0k.dev
   ```

## Complete .env.local Template

```bash
# Supabase Configuration (REQUIRED)
NEXT_PUBLIC_SUPABASE_URL=https://xafjjpgazdxhktpfeuri.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...  # Get from Supabase Dashboard
NEXT_PUBLIC_CLIENT_SECRET='ahurasense_client_secret'

# Jenkins Configuration (REQUIRED for deployment)
JENKINS_URL=http://username:api_token@jenkins.hav0k.dev

# Cloudflare Configuration (REQUIRED for DNS)
CLOUDFLARE_API_TOKEN=your_cloudflare_api_token_here
CLOUDFLARE_ZONE_ID=your_zone_id_here

# Kubernetes Configuration (REQUIRED for deployment)
KUBE_IP=143.198.174.204
KUBE_CONFIG_STRING=base64_encoded_kubeconfig_here

# Application
NODE_ENV=development
```

## Validation Script

Run this to check your configuration:
```bash
./scripts/setup-platform-deployment.sh
```

The script will show:
- ✅ Green checkmarks for configured variables
- ❌ Red X for missing/placeholder variables
- Instructions for each missing variable

## Common Issues

### Issue: "Server configuration error"
**Cause**: One or more required environment variables are missing
**Solution**: Check console logs for specific missing variables, then update `.env.local`

### Issue: DNS creation fails silently
**Cause**: Cloudflare token doesn't have DNS edit permissions
**Solution**: Recreate token with "Zone → DNS → Edit" permission

### Issue: Port allocation fails
**Cause**: SUPABASE_SERVICE_ROLE_KEY missing or invalid
**Solution**: Verify the service role key is correct (it's different from anon key)

### Issue: Jenkins job creation fails
**Cause**: 
- Invalid credentials in JENKINS_URL
- Jenkins server unreachable
- Missing credentials in Jenkins (kubeconfig_file, dockerhublogin)

**Solution**:
1. Test Jenkins URL in browser
2. Verify API token is still valid
3. Check Jenkins has required credentials configured

## Testing Environment Setup

1. **Check all variables**:
   ```bash
   ./scripts/setup-platform-deployment.sh
   ```

2. **Test Cloudflare API**:
   ```bash
   curl -X GET "https://api.cloudflare.com/client/v4/zones/${CLOUDFLARE_ZONE_ID}/dns_records" \
     -H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" \
     -H "Content-Type: application/json"
   ```

3. **Test Jenkins connection**:
   ```bash
   curl "${JENKINS_URL}/api/json"
   ```

4. **Apply database migration**:
   - Supabase Dashboard → SQL Editor
   - Run: `supabase/migrations/20251120000002_add_ip_port_to_platform_apps.sql`

5. **Start dev server**:
   ```bash
   npm run dev
   ```

6. **Deploy test app**:
   - Visit: http://localhost:3000/dashboard/services/apps/new
   - Watch terminal for detailed logs
   - Check browser console for any client errors

## Debugging Tips

### Enable Verbose Logging
The deployment helpers now include detailed logging. Watch your terminal for:

```
[allocateNodePort] Finding available port...
[allocateNodePort] ✅ Allocated port: 31500

[createDNSRecord] Creating DNS: myapp.uizb210.xyz -> 143.198.174.204
[createDNSRecord] ✅ Created DNS record for myapp

[createJenkinsJob] Creating Jenkins job for myapp
[createJenkinsJob] Framework: express, Branch: main, Port: 31500
[createJenkinsJob] ✅ Created Jenkins job: myapp-job
[createJenkinsJob] ✅ Build triggered for: myapp-job
```

### Check Server Logs
Errors will show detailed information:
```
[createDNSRecord] ❌ Error creating DNS record:
[createDNSRecord] Error message: Invalid API key
[createDNSRecord] Cloudflare API token is invalid or expired
[createDNSRecord] Please verify CLOUDFLARE_API_TOKEN in .env.local
```

### Browser Console
API errors will show:
```json
{
  "error": "Server configuration error",
  "message": "Missing required environment variables: SUPABASE_SERVICE_ROLE_KEY, KUBE_CONFIG_STRING",
  "details": "Please configure all required environment variables in .env.local"
}
```

## Need Help?

If you're still having issues:
1. Check all checkboxes in the Testing Checklist (PLATFORM_DEPLOYMENT_SUMMARY.md)
2. Verify each environment variable individually using the tests above
3. Review terminal logs for specific error messages
4. Check Supabase Dashboard → Logs for database errors
5. Check Jenkins → Job Console Output for build errors
