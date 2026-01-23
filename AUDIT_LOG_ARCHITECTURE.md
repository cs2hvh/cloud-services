# Admin Audit Log Architecture Plan


## Implementation Plan

### Phase 1: Database Setup (2 hours)

1. Create `audit` schema
2. Create `audit.logs` table with partitions
3. Create integrity trigger (prevent UPDATE/DELETE)
4. Apply RLS policies
5. Create indexes

### Phase 2: Core Library (4 hours)

1. Create `lib/audit/` directory structure
2. Implement `AuditLogService`
3. Implement state sanitization (redact passwords)
4. Implement before/after diff computation
5. Create request context helper (IP, user-agent)

### Phase 3: API Route Integration (6 hours)

Integrate audit logging into all service routes:

| Service | Routes to Modify |
|---------|-----------------|
| **Database** | create, update, delete, network, users, dbs, storage |
| **Kubernetes** | clusters (create), delete, update_project |
| **Platform Apps** | create, update, delete, env-vars, domains |
| **Object Storage** | buckets/create, delete, settings |
| **Network/DDoS** | spectrum/apps (create, update, delete) |

### Phase 4: Admin API (2 hours)

1. Create `/api/admin/audit-logs` endpoint
2. Implement filtering (user, service, action, date)
3. Implement pagination
4. Create detail endpoint with before/after diff

### Phase 5: Admin UI (6 hours)

1. Create audit logs listing page
2. Build filter components
3. Implement before/after diff viewer
4. Add export functionality (CSV/JSON)

### Phase 6: Testing & Hardening (4 hours)

1. Unit tests for audit service
2. Integration tests for API routes
3. Security review (RLS, triggers)
4. Performance testing with sample data

**Total: ~24 hours**

---

## Database Schema

### Schema and Table Creation

```sql
-- ============================================
-- AUDIT LOG SCHEMA
-- ============================================

-- Create separate schema for audit logs
CREATE SCHEMA IF NOT EXISTS audit;

-- Main audit log table (partitioned by date)
CREATE TABLE audit.logs (
  -- Primary Key
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- ====== ACTOR INFORMATION ======
  user_id UUID NOT NULL,
  user_role TEXT NOT NULL CHECK (user_role IN ('user', 'admin', 'system')),
  user_email TEXT,
  user_username TEXT,
  
  -- ====== ACTION INFORMATION ======
  action TEXT NOT NULL CHECK (action IN ('create', 'update', 'delete')),
  service_type TEXT NOT NULL CHECK (service_type IN (
    'kubernetes', 
    'database', 
    'network_ddos', 
    'platform_apps', 
    'object_storage'
  )),
  service_id TEXT NOT NULL,
  service_name TEXT,
  
  -- ====== STATE CAPTURE ======
  before_state JSONB,           -- State before action (update/delete)
  after_state JSONB,            -- State after action (create/update)
  changes JSONB,                -- Computed diff for updates
  
  -- ====== REQUEST CONTEXT ======
  ip_address INET,
  user_agent TEXT,
  request_id UUID,              -- Correlation ID for tracing
  
  -- ====== METADATA ======
  metadata JSONB,               -- Additional context
  
  -- ====== TIMESTAMPS ======
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  -- ====== INTEGRITY ======
  checksum TEXT GENERATED ALWAYS AS (
    encode(sha256(
      (id::text || user_id::text || action || service_type || 
       service_id || created_at::text)::bytea
    ), 'hex')
  ) STORED,
  
  -- ====== PARTITION KEY ======
  created_date DATE NOT NULL DEFAULT CURRENT_DATE
  
) PARTITION BY RANGE (created_date);

-- ============================================
-- MONTHLY PARTITIONS (Create for each month)
-- ============================================

CREATE TABLE audit.logs_2026_01 PARTITION OF audit.logs
  FOR VALUES FROM ('2026-01-01') TO ('2026-02-01');

CREATE TABLE audit.logs_2026_02 PARTITION OF audit.logs
  FOR VALUES FROM ('2026-02-01') TO ('2026-03-01');

CREATE TABLE audit.logs_2026_03 PARTITION OF audit.logs
  FOR VALUES FROM ('2026-03-01') TO ('2026-04-01');

CREATE TABLE audit.logs_2026_04 PARTITION OF audit.logs
  FOR VALUES FROM ('2026-04-01') TO ('2026-05-01');

CREATE TABLE audit.logs_2026_05 PARTITION OF audit.logs
  FOR VALUES FROM ('2026-05-01') TO ('2026-06-01');

CREATE TABLE audit.logs_2026_06 PARTITION OF audit.logs
  FOR VALUES FROM ('2026-06-01') TO ('2026-07-01');

CREATE TABLE audit.logs_2026_07 PARTITION OF audit.logs
  FOR VALUES FROM ('2026-07-01') TO ('2026-08-01');

CREATE TABLE audit.logs_2026_08 PARTITION OF audit.logs
  FOR VALUES FROM ('2026-08-01') TO ('2026-09-01');

CREATE TABLE audit.logs_2026_09 PARTITION OF audit.logs
  FOR VALUES FROM ('2026-09-01') TO ('2026-10-01');

CREATE TABLE audit.logs_2026_10 PARTITION OF audit.logs
  FOR VALUES FROM ('2026-10-01') TO ('2026-11-01');

CREATE TABLE audit.logs_2026_11 PARTITION OF audit.logs
  FOR VALUES FROM ('2026-11-01') TO ('2026-12-01');

CREATE TABLE audit.logs_2026_12 PARTITION OF audit.logs
  FOR VALUES FROM ('2026-12-01') TO ('2027-01-01');

-- ============================================
-- INDEXES
-- ============================================

-- Primary query patterns
CREATE INDEX idx_audit_user_id ON audit.logs(user_id);
CREATE INDEX idx_audit_service_type ON audit.logs(service_type);
CREATE INDEX idx_audit_action ON audit.logs(action);
CREATE INDEX idx_audit_created_at ON audit.logs(created_at DESC);
CREATE INDEX idx_audit_service_id ON audit.logs(service_id);

-- Composite indexes for common admin queries
CREATE INDEX idx_audit_admin_query 
  ON audit.logs(service_type, action, created_at DESC);

CREATE INDEX idx_audit_user_timeline 
  ON audit.logs(user_id, created_at DESC);

-- Full-text search on changes (optional)
CREATE INDEX idx_audit_changes_gin ON audit.logs USING GIN(changes);
CREATE INDEX idx_audit_metadata_gin ON audit.logs USING GIN(metadata);

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================

ALTER TABLE audit.logs ENABLE ROW LEVEL SECURITY;

-- Admins can read all audit logs
CREATE POLICY "Admins can read audit logs" ON audit.logs
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_profiles
      WHERE id = auth.uid() AND 'admin' = ANY(roles)
    )
  );

-- Service role can insert (server-side only)
CREATE POLICY "Service role can insert audit logs" ON audit.logs
  FOR INSERT
  TO service_role
  WITH CHECK (true);

-- NO UPDATE POLICY (prevents any updates)
-- NO DELETE POLICY (prevents any deletes)

-- ============================================
-- TAMPER PREVENTION TRIGGER
-- ============================================

CREATE OR REPLACE FUNCTION audit.prevent_modification()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'Audit logs are immutable. Modifications are not allowed.';
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER audit_logs_immutable
  BEFORE UPDATE OR DELETE ON audit.logs
  FOR EACH ROW
  EXECUTE FUNCTION audit.prevent_modification();

-- ============================================
-- HELPER FUNCTION: Auto-create future partitions
-- ============================================

CREATE OR REPLACE FUNCTION audit.create_monthly_partition(target_date DATE)
RETURNS TEXT AS $$
DECLARE
  partition_name TEXT;
  start_date DATE;
  end_date DATE;
BEGIN
  start_date := date_trunc('month', target_date);
  end_date := start_date + INTERVAL '1 month';
  partition_name := 'logs_' || to_char(start_date, 'YYYY_MM');
  
  EXECUTE format(
    'CREATE TABLE IF NOT EXISTS audit.%I PARTITION OF audit.logs
     FOR VALUES FROM (%L) TO (%L)',
    partition_name, start_date, end_date
  );
  
  RETURN partition_name;
END;
$$ LANGUAGE plpgsql;
```

---

## Backend Implementation

### File Structure

```
lib/
├── audit/
│   ├── index.ts           # Barrel export
│   ├── types.ts           # TypeScript interfaces
│   ├── service.ts         # Core AuditLogService
│   ├── context.ts         # Request context extraction
│   ├── sanitize.ts        # Sensitive data redaction
│   └── diff.ts            # Before/after diff computation

app/api/admin/
├── audit-logs/
│   ├── route.ts           # GET: List with filters
│   └── [logId]/
│       └── route.ts       # GET: Single log detail
```

### Core Types (`lib/audit/types.ts`)

```typescript
export type AuditAction = 'create' | 'update' | 'delete';

export type AuditServiceType = 
  | 'kubernetes' 
  | 'database' 
  | 'network_ddos' 
  | 'platform_apps' 
  | 'object_storage';

export type AuditUserRole = 'user' | 'admin' | 'system';

export interface AuditLogEntry {
  id: string;
  user_id: string;
  user_role: AuditUserRole;
  user_email?: string;
  user_username?: string;
  
  action: AuditAction;
  service_type: AuditServiceType;
  service_id: string;
  service_name?: string;
  
  before_state?: Record<string, unknown> | null;
  after_state?: Record<string, unknown> | null;
  changes?: Record<string, { old: unknown; new: unknown }> | null;
  
  ip_address?: string;
  user_agent?: string;
  request_id?: string;
  
  metadata?: Record<string, unknown>;
  checksum?: string;
  created_at: string;
}

export interface AuditLogFilters {
  user_id?: string;
  service_type?: AuditServiceType;
  action?: AuditAction;
  service_id?: string;
  date_from?: string;
  date_to?: string;
  search?: string;
}

export interface CreateAuditLogParams {
  user_id: string;
  user_role: AuditUserRole;
  user_email?: string;
  user_username?: string;
  
  action: AuditAction;
  service_type: AuditServiceType;
  service_id: string;
  service_name?: string;
  
  before_state?: Record<string, unknown>;
  after_state?: Record<string, unknown>;
  
  ip_address?: string;
  user_agent?: string;
  request_id?: string;
  
  metadata?: Record<string, unknown>;
}
```

### Audit Service (`lib/audit/service.ts`)

```typescript
import { createServiceClient } from "@/lib/supabase/server";
import { CreateAuditLogParams, AuditLogEntry, AuditLogFilters } from "./types";
import { sanitizeState } from "./sanitize";
import { computeChanges } from "./diff";

export const AuditLogService = {
  /**
   * Create a new audit log entry
   */
  async create(params: CreateAuditLogParams): Promise<{ success: boolean; id?: string; error?: string }> {
    try {
      const supabase = await createServiceClient();
      
      // Sanitize state objects (remove passwords, tokens, etc.)
      const sanitizedBefore = params.before_state ? sanitizeState(params.before_state) : null;
      const sanitizedAfter = params.after_state ? sanitizeState(params.after_state) : null;
      
      // Compute changes for updates
      const changes = params.action === 'update' && sanitizedBefore && sanitizedAfter
        ? computeChanges(sanitizedBefore, sanitizedAfter)
        : null;
      
      const { data, error } = await supabase
        .from("audit.logs")
        .insert({
          ...params,
          before_state: sanitizedBefore,
          after_state: sanitizedAfter,
          changes,
          created_date: new Date().toISOString().split('T')[0],
        })
        .select("id")
        .single();

      if (error) {
        console.error(`[AuditLogService.create] Error: ${error.message}`);
        return { success: false, error: error.message };
      }
      
      return { success: true, id: data.id };
    } catch (err) {
      console.error(`[AuditLogService.create] Error: ${err}`);
      return { success: false, error: String(err) };
    }
  },

  /**
   * Query audit logs with filters and pagination
   */
  async query(
    filters: AuditLogFilters,
    pagination: { page: number; limit: number }
  ): Promise<{ data: AuditLogEntry[]; total: number }> {
    try {
      const supabase = await createServiceClient();
      const { page, limit } = pagination;
      const offset = (page - 1) * limit;

      let query = supabase
        .from("audit.logs")
        .select("*", { count: "exact" });

      // Apply filters
      if (filters.user_id) {
        query = query.eq("user_id", filters.user_id);
      }
      if (filters.service_type) {
        query = query.eq("service_type", filters.service_type);
      }
      if (filters.action) {
        query = query.eq("action", filters.action);
      }
      if (filters.service_id) {
        query = query.eq("service_id", filters.service_id);
      }
      if (filters.date_from) {
        query = query.gte("created_at", filters.date_from);
      }
      if (filters.date_to) {
        query = query.lte("created_at", filters.date_to);
      }
      if (filters.search) {
        query = query.or(
          `service_name.ilike.%${filters.search}%,` +
          `user_email.ilike.%${filters.search}%`
        );
      }

      // Order and paginate
      query = query
        .order("created_at", { ascending: false })
        .range(offset, offset + limit - 1);

      const { data, error, count } = await query;

      if (error) {
        console.error(`[AuditLogService.query] Error: ${error.message}`);
        return { data: [], total: 0 };
      }

      return { data: data || [], total: count || 0 };
    } catch (err) {
      console.error(`[AuditLogService.query] Error: ${err}`);
      return { data: [], total: 0 };
    }
  },

  /**
   * Get a single audit log entry by ID
   */
  async getById(id: string): Promise<AuditLogEntry | null> {
    try {
      const supabase = await createServiceClient();
      
      const { data, error } = await supabase
        .from("audit.logs")
        .select("*")
        .eq("id", id)
        .single();

      if (error) {
        console.error(`[AuditLogService.getById] Error: ${error.message}`);
        return null;
      }

      return data;
    } catch (err) {
      console.error(`[AuditLogService.getById] Error: ${err}`);
      return null;
    }
  },

  /**
   * Verify integrity of an audit log entry
   */
  async verifyIntegrity(id: string): Promise<{ valid: boolean; expected?: string; actual?: string }> {
    try {
      const log = await this.getById(id);
      if (!log) return { valid: false };

      // Recompute checksum
      const expectedChecksum = await this.computeChecksum(log);
      const valid = expectedChecksum === log.checksum;

      return {
        valid,
        expected: expectedChecksum,
        actual: log.checksum,
      };
    } catch {
      return { valid: false };
    }
  },

  /**
   * Compute checksum for verification
   */
  async computeChecksum(log: AuditLogEntry): Promise<string> {
    const data = `${log.id}${log.user_id}${log.action}${log.service_type}${log.service_id}${log.created_at}`;
    const encoder = new TextEncoder();
    const dataBuffer = encoder.encode(data);
    const hashBuffer = await crypto.subtle.digest('SHA-256', dataBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }
};
```

### Request Context Helper (`lib/audit/context.ts`)

```typescript
import { NextRequest } from "next/server";

export interface AuditContext {
  ipAddress: string;
  userAgent: string;
  requestId: string;
}

export function getAuditContext(req: NextRequest): AuditContext {
  return {
    ipAddress: 
      req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      req.headers.get('x-real-ip') ||
      'unknown',
    userAgent: req.headers.get('user-agent') || 'unknown',
    requestId: req.headers.get('x-request-id') || crypto.randomUUID(),
  };
}
```

### Sensitive Data Sanitization (`lib/audit/sanitize.ts`)

```typescript
const SENSITIVE_FIELDS = [
  'password',
  'secret_key',
  'key_id',
  'access_key',
  'kubeconfig',
  'kube_config',
  'token',
  'access_token',
  'refresh_token',
  'ca_certificate',
  'private_connection.password',
  'public_connection.password',
  'credentials',
  'api_key',
  'secret',
];

const REDACTED = '[REDACTED]';

export function sanitizeState(
  state: Record<string, unknown>
): Record<string, unknown> {
  if (!state || typeof state !== 'object') return state;

  const sanitized: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(state)) {
    const lowerKey = key.toLowerCase();

    // Check if field should be redacted
    if (SENSITIVE_FIELDS.some(field => lowerKey.includes(field))) {
      sanitized[key] = REDACTED;
    } else if (value && typeof value === 'object' && !Array.isArray(value)) {
      // Recursively sanitize nested objects
      sanitized[key] = sanitizeState(value as Record<string, unknown>);
    } else if (Array.isArray(value)) {
      // Handle arrays
      sanitized[key] = value.map(item =>
        typeof item === 'object' && item !== null
          ? sanitizeState(item as Record<string, unknown>)
          : item
      );
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized;
}
```

### Before/After Diff (`lib/audit/diff.ts`)

```typescript
export interface FieldChange {
  old: unknown;
  new: unknown;
}

export function computeChanges(
  before: Record<string, unknown>,
  after: Record<string, unknown>
): Record<string, FieldChange> {
  const changes: Record<string, FieldChange> = {};

  // Get all unique keys
  const allKeys = new Set([...Object.keys(before), ...Object.keys(after)]);

  for (const key of allKeys) {
    // Skip timestamp fields
    if (key === 'updated_at' || key === 'created_at') continue;

    const oldValue = before[key];
    const newValue = after[key];

    // Check if values are different
    if (JSON.stringify(oldValue) !== JSON.stringify(newValue)) {
      changes[key] = { old: oldValue, new: newValue };
    }
  }

  return changes;
}
```

---

## Admin UI Design

### Page Structure

```
app/dashboard/admin/
├── audit-logs/
│   ├── page.tsx              # Main listing page
│   └── [logId]/
│       └── page.tsx          # Detail view with diff
```

### Components

```
components/admin/audit-logs/
├── AuditLogTable.tsx         # Paginated data table
├── AuditLogFilters.tsx       # Filter panel
├── AuditLogDetail.tsx        # Full log view
├── StateDiff.tsx             # Before/after diff viewer
└── AuditLogExport.tsx        # CSV/JSON export
```

### UI Features

1. **Listing Page**
   - Paginated table with columns: Time, User, Action, Service, Resource
   - Inline badge colors for actions (green=create, blue=update, red=delete)
   - Click to view details

2. **Filters**
   - User dropdown (searchable)
   - Service type multi-select
   - Action type buttons (create/update/delete)
   - Date range picker
   - Text search

3. **Detail View**
   - Full metadata display
   - Side-by-side or inline diff view for changes
   - Checksum verification status
   - Request context (IP, user agent)

---

## File Changes

### New Files to Create

| File | Purpose |
|------|---------|
| `lib/audit/types.ts` | TypeScript interfaces |
| `lib/audit/service.ts` | Core AuditLogService |
| `lib/audit/context.ts` | Request context extraction |
| `lib/audit/sanitize.ts` | Sensitive data redaction |
| `lib/audit/diff.ts` | State diff computation |
| `lib/audit/index.ts` | Barrel exports |
| `app/api/admin/audit-logs/route.ts` | List API |
| `app/api/admin/audit-logs/[logId]/route.ts` | Detail API |
| `app/dashboard/admin/audit-logs/page.tsx` | Admin UI |
| `components/admin/audit-logs/*.tsx` | UI components |

### Files to Modify

| File | Change |
|------|--------|
| `lib/supabase/types.ts` | Add audit log types |
| `components/admin/admin.tsx` | Add Audit Logs navigation |
| `app/api/services/database/create/route.ts` | Add audit logging |
| `app/api/services/database/update/route.ts` | Add audit logging |
| `app/api/services/database/delete/route.ts` | Add audit logging |
| `app/api/services/kubernetes/clusters/route.ts` | Add audit logging |
| `app/api/services/kubernetes/clusters/delete/route.ts` | Add audit logging |
| `app/api/services/platform-apps/create/route.ts` | Add audit logging |
| `app/api/services/platform-apps/update/route.ts` | Add audit logging |
| `app/api/services/platform-apps/delete/route.ts` | Add audit logging |
| `app/api/services/spectrum/apps/create/route.ts` | Add audit logging |
| `app/api/services/spectrum/apps/delete/route.ts` | Add audit logging |
| `app/api/services/object-storage/buckets/create/route.ts` | Add audit logging |
| `app/api/services/object-storage/buckets/delete/route.ts` | Add audit logging |

---

## Security Hardening

### 1. Database-Level Protection

```sql
-- Prevent direct table access (force through views/functions)
REVOKE ALL ON audit.logs FROM PUBLIC;
GRANT SELECT ON audit.logs TO authenticated;
GRANT INSERT ON audit.logs TO service_role;

-- Audit the audit table access (meta-auditing)
CREATE TABLE audit.access_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  accessed_by UUID,
  query_type TEXT,
  accessed_at TIMESTAMPTZ DEFAULT now()
);
```

### 2. Application-Level Protection

- All audit writes go through `AuditLogService.create()` only
- Service uses `createServiceClient()` (service role)
- No client-side audit mutations exposed

### 3. Integrity Verification

- SHA-256 checksum stored with each entry
- `verifyIntegrity()` method for periodic verification
- Admin UI shows verification status

### 4. Retention Policy

```sql
-- Create function for automated partition archival
CREATE OR REPLACE FUNCTION audit.archive_old_partitions(months_to_keep INTEGER)
RETURNS TEXT AS $$
DECLARE
  partition_to_archive TEXT;
  cutoff_date DATE;
BEGIN
  cutoff_date := CURRENT_DATE - (months_to_keep * INTERVAL '1 month');
  -- Logic to detach and archive partitions older than cutoff
  RETURN 'Archived partitions older than ' || cutoff_date;
END;
$$ LANGUAGE plpgsql;
```

---

## Conclusion

The **Separate Audit Table** approach is the clear choice for a production-grade audit logging system. While it requires more implementation effort, it provides:

- ✅ **True append-only immutability**
- ✅ **Complete separation from user data**
- ✅ **Tamper detection via checksums**
- ✅ **Flexible retention policies**
- ✅ **Forensic-grade integrity**
- ✅ **Scalable partitioned storage**

The existing notifications system should remain focused on user-facing ephemeral messages, while the audit system provides a permanent, immutable record for administrative and compliance purposes.

---

## Next Steps

1. **Confirm this architecture** ✓
2. **Run database migration** in Supabase
3. **Implement `lib/audit/` library**
4. **Integrate into API routes**
5. **Build Admin UI**
6. **Test and deploy**

---

*Document Version: 1.0*  
*Last Updated: January 22, 2026*
