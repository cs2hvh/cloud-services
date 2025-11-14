# Spectrum Apps Schema Update

## Summary
Updated the `spectrum_apps` table schema to match new requirements with encrypted DNS names, simplified structure, and improved field organization.

## Changes Made

### 1. Database Schema (`types.ts`)
**File:** `lib/supabase/types.ts`

**Old Structure:**
- `zone_id`: string
- `name`: string (hostname)
- `dns_type`: "A" | "CNAME"
- `cf_app`: Json (full Cloudflare config)
- `hostname_enc`: Json (encrypted IP)

**New Structure:**
- `id`: UUID (surrogate primary key)
- `spectrum_id`: string (Cloudflare ID)
- `dns`: Json - `{name: encrypted string, type: "A" | "CNAME"}`
- `tls`: "off" | "full"
- `edge_ips`: Json - `{type: string, connectivity: string}`
- `ip_firewall`: boolean
- `traffic_type`: string
- `origin_direct`: string[] (array of origins)
- `proxy_protocol`: string
- `protocol`: string
- `owner_id`: string
- `project_id`: string | null
- `status`: string | null
- `created_at`: string | null
- `updated_at`: string | null

### 2. Validation Schema (`spectrum.ts`)
**File:** `lib/validation/spectrum.ts`

**Changes:**
- Simplified `createSpectrumAppSchema` to require only `origin_direct` (removed `origin_dns` and `origin_port` options)
- Updated `edge_ips` schema to use flexible string types instead of enums
- Changed `tls` enum from `["off", "passthrough", "offload"]` to `["off", "full"]`
- Removed `origin_dns` and `origin_port` validation
- Added `proxy_protocol` field

### 3. API Routes

#### Create Route (`apps/create/route.ts`)
**Changes:**
- Encrypts DNS name instead of resolved IP
- Stores encrypted DNS name in `dns.name` field
- Removed DNS resolution logic
- Updated payload structure to match new schema
- Removed `zone_id`, `cf_app`, and `hostname_enc` fields

#### Update Route (`apps/update/route.ts`)
**Changes:**
- Updated to encrypt DNS name on updates
- Removed DNS resolution and IP encryption
- Simplified update payload structure
- Removed `origin_dns` and `origin_port` handling

#### List Route (`apps/list/route.ts`)
**Changes:**
- Decrypts `dns.name` field instead of `hostname_enc`
- Returns DNS name in response instead of IP address

### 4. Frontend Types (`components/dashboard/network-ddos/`)
**File:** `components/dashboard/network-ddos/steps/types.ts`

**Added Fields:**
- `edgeIpType`: string
- `edgeIpConnectivity`: string
- `trafficType`: string

**Updated:** `components/dashboard/network-ddos/new.tsx`
- Initialized new form fields with default values

### 5. Database Migration
**File:** `supabase/migrations/20251114_update_spectrum_apps.sql`

**New Migration:**
- Drops existing `spectrum_apps` table
- Creates new table with updated schema:
  - UUID primary key
  - JSONB for `dns` and `edge_ips`
  - TEXT[] array for `origin_direct`
  - Proper constraints and defaults
- Recreates indexes and RLS policies
- Adds table and column comments

## Key Features

### Security
- DNS names are now encrypted at rest using the application's encryption key
- Maintains Row Level Security (RLS) policies for user data isolation

### Data Structure
- **dns**: JSONB storing `{name: encrypted, type: "A"/"CNAME"}`
- **edge_ips**: JSONB storing `{type: string, connectivity: string}`
- **origin_direct**: Array of origin addresses (e.g., `["192.168.1.1:22"]`)

### Simplified Schema
- Removed redundant fields (`zone_id`, `cf_app`, `hostname_enc`)
- Consolidated DNS information into single JSONB field
- Removed dual origin support (now only `origin_direct`)

## Migration Notes

⚠️ **WARNING:** The migration will DROP the existing `spectrum_apps` table, which will delete all existing data.

**Before running migration:**
1. Backup existing `spectrum_apps` data if needed
2. Ensure no active Spectrum apps are in use
3. Update application code to handle new schema

**To apply migration:**
```bash
# Using Supabase CLI
supabase db push

# Or manually apply the SQL file
psql -f supabase/migrations/20251114_update_spectrum_apps.sql
```

## API Usage Example

### Creating a Spectrum App
```typescript
POST /api/services/spectrum/apps/create
{
  "project_id": "uuid",
  "owner_id": "uuid",
  "dns": {
    "name": "myapp",
    "type": "A"
  },
  "protocol": "tcp/22",
  "origin_direct": ["192.168.1.1:22"],
  "tls": "off",
  "edge_ips": {
    "type": "dynamic",
    "connectivity": "all"
  },
  "ip_firewall": false,
  "traffic_type": "direct",
  "proxy_protocol": "off"
}
```

### Response
```typescript
{
  "app": {
    "id": "uuid",
    "spectrum_id": "cloudflare-id",
    "dns": {
      "name": "encrypted-string",
      "type": "A"
    },
    "protocol": "tcp/22",
    // ... other fields
  },
  "cf": {
    // Cloudflare API response
  }
}
```

## Files Modified

1. `lib/supabase/types.ts` - Updated TypeScript types
2. `lib/validation/spectrum.ts` - Updated Zod schemas
3. `app/api/services/spectrum/apps/create/route.ts` - Updated create endpoint
4. `app/api/services/spectrum/apps/update/route.ts` - Updated update endpoint
5. `app/api/services/spectrum/apps/list/route.ts` - Updated list endpoint
6. `components/dashboard/network-ddos/steps/types.ts` - Updated form types
7. `components/dashboard/network-ddos/new.tsx` - Updated form initialization
8. `supabase/migrations/20251114_update_spectrum_apps.sql` - New migration file

## Testing Checklist

- [ ] Verify migration applies successfully
- [ ] Test creating new Spectrum apps
- [ ] Test updating existing apps
- [ ] Test listing apps with decrypted DNS names
- [ ] Verify encryption/decryption of DNS names
- [ ] Test RLS policies are working
- [ ] Verify frontend form submits correct data
- [ ] Check all API validation works correctly
