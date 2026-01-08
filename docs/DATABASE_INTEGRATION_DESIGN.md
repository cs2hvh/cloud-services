# Database Integration Design Document

> **Author**: Platform Architecture Team  
> **Date**: January 2026  
> **Status**: Design Ready for Implementation

---

## 🏗️ Architecture Overview: Loose Coupling Design

### Core Principle: Physically and Operationally Independent, Logically Coordinated via Integration

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        ARCHITECTURE OVERVIEW                             │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌──────────────────────┐         ┌──────────────────────┐              │
│  │   DATABASE SERVICE   │         │   APP DEPLOYMENT     │              │
│  │   (Independent)      │         │   (Independent)      │              │
│  ├──────────────────────┤         ├──────────────────────┤              │
│  │ • Create database    │         │ • Deploy apps        │              │
│  │ • Delete database    │         │ • Manage env vars    │              │
│  │ • Manage users       │         │ • Redeploy           │              │
│  │ • Network rules      │         │ • Delete apps        │              │
│  │ • Backups            │         │ • Scaling            │              │
│  └──────────┬───────────┘         └──────────┬───────────┘              │
│             │                                 │                          │
│             │    ┌────────────────────────┐   │                          │
│             │    │  INTEGRATION LAYER     │   │                          │
│             └───►│  (Coordinator Only)    │◄──┘                          │
│                  ├────────────────────────┤                              │
│                  │ • Link DB ↔ App        │                              │
│                  │ • Generate env vars    │                              │
│                  │ • Track relationships  │                              │
│                  │ • Handle lifecycle     │                              │
│                  └────────────────────────┘                              │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

### Coupling Design Decisions

| Aspect | Design Choice | Rationale |
|--------|---------------|-----------|
| **Database knows nothing about apps** | ✅ Independent | Database service doesn't have app-related code |
| **App knows nothing about databases** | ✅ Independent | App deployment doesn't require database logic |
| **Integration layer coordinates both** | ✅ Thin coordinator | Only reads from both, writes to env vars |

### What Each Component Does

**Database Service (Unchanged)**
```typescript
// lib/supabase/queries/database_clusters.ts
// NO CHANGES NEEDED - stays exactly as is

Database_Clusters.create()      // Creates database
Database_Clusters.read()        // Gets connection info
Database_Clusters.delete()      // Deletes database
// Does NOT know about apps
```

**App Deployment (Unchanged)**
```typescript
// lib/services/deployment.ts
// NO CHANGES NEEDED - stays exactly as is

DeploymentService.deploy()      // Deploys app
Platform_Apps.set_env_vars()    // Sets env vars
// Does NOT know about databases
```

**Integration Layer (NEW - Coordinator Only)**
```typescript
// lib/services/database-integration.ts (NEW FILE)

class DatabaseIntegrationService {
  
  static async link(appId: string, databaseId: string) {
    // 1. READ from database service (no modifications)
    const db = await Database_Clusters.read(databaseId);
    
    // 2. GENERATE env vars from connection info
    const envVars = this.generateEnvVars(db.public_connection);
    
    // 3. WRITE to app env vars (uses existing API)
    await Platform_Apps.set_env_vars(appId, envVars);
    
    // 4. RECORD the integration (own table)
    await Database_Integrations.create({...});
  }
}
```

### Coupling Matrix

| Operation | Database Service | App Service | Integration Layer |
|-----------|-----------------|-------------|-------------------|
| Create database | ✅ Handles | ❌ Unaware | ❌ Unaware |
| Delete database | ✅ Handles | ❌ Unaware | ⚠️ Notified (to unlink) |
| Deploy app | ❌ Unaware | ✅ Handles | ❌ Unaware |
| Delete app | ❌ Unaware | ✅ Handles | ⚠️ Cascade delete integration |
| Link DB to app | ❌ Unaware | ❌ Unaware | ✅ Handles |
| Update DB credentials | ✅ Handles | ❌ Unaware | ⚠️ Notified (to re-inject) |

### The Only Coupling Points

**1. Integration reads connection info from database**
```typescript
// Integration READS from database (read-only dependency)
const connection = await Database_Clusters.read(databaseId);
// Uses: connection.public_connection.uri, host, port, etc.
```

**2. Integration writes env vars to app**
```typescript
// Integration WRITES to app via existing API (write dependency)
await Platform_Apps.set_env_vars(appId, generatedEnvVars);
```

**3. Lifecycle events (optional hooks)**
```typescript
// When database is deleted - integration layer cleans up
// This is an EVENT, not a direct call

// Option A: Database cascade (simple)
ON DELETE database → Integration records auto-deleted (FK cascade)

// Option B: Event hook (advanced)
Database_Clusters.delete() → emits "database.deleted" event
Integration layer → subscribes → unlinks apps
```

### Code Boundaries

```
lib/
├── supabase/queries/
│   ├── database_clusters.ts    # ← NEVER imports platform_apps
│   ├── platform_apps.ts        # ← NEVER imports database_clusters
│   └── database_integrations.ts # ← NEW: imports both (read-only)
│
├── services/
│   ├── deployment.ts           # ← NEVER imports database code
│   └── database-integration.ts # ← NEW: coordinates both
```

### Why This Works

| Benefit | How It's Achieved |
|---------|-------------------|
| **Database can exist without apps** | Database service is completely standalone |
| **Apps can exist without databases** | Deployment works with manual env vars |
| **Integration is optional** | Users can choose to link or not |
| **Easy to disable** | Remove integration layer, both services keep working |
| **Easy to test** | Each layer can be tested independently |

### Architecture FAQ

| Question | Answer |
|----------|--------|
| **Are database and app tightly coupled?** | ❌ No - completely independent |
| **Does database service know about apps?** | ❌ No |
| **Does app service know about databases?** | ❌ No |
| **What connects them?** | A thin **integration layer** that reads from both |
| **Can you disable integration?** | ✅ Yes - both services continue working |

> **Summary**: The integration layer is a "bridge" that coordinates two independent systems without modifying either one.

---

## 1️⃣ Analysis of Current Codebase

### What Exists

| Component | Location | Capability |
|-----------|----------|------------|
| **Database Management** | `lib/supabase/queries/database_clusters.ts` | Full CRUD for managed databases (DigitalOcean) |
| **Database Types** | `lib/supabase/types.ts` (lines 875-930) | `database_clusters` with connections, users, credentials |
| **App Deployment** | `lib/services/deployment.ts` | Full deployment pipeline with Jenkins/K8s |
| **App Records** | `lib/supabase/queries/platform_apps.ts` | CRUD for platform apps |
| **Environment Variables** | `platform_app_env_vars` table | Key-value env var storage per app |
| **Env Var API** | `app/api/services/platform-apps/env-vars/update/route.ts` | Update env vars for an app |
| **Connection Strings** | `Database_Connection` type | Stores `uri`, `host`, `port`, `user`, `password` |
| **Encrypted Credentials** | `EncryptedData` type | Encryption support for sensitive fields |
| **Jenkins Pipelines** | `lib/jenkins/pipelines/*.ts` | Accepts `envVars` array, injects into K8s deployments |

### What Partially Exists

| Component | Current State | Gap |
|-----------|---------------|-----|
| **Integrations API folder** | `app/api/services/platform-apps/integrations/` exists | Folders `link/`, `unlink/`, `linked/` are **empty** |
| **Project-level grouping** | Both apps and databases have `project_id` | No explicit relationship between them |
| **Connection string handling** | `public_connection` and `private_connection` stored | Not automatically injected into apps |

### What Does Not Exist (Required)

| Component | Why Needed |
|-----------|------------|
| **`database_integrations` table** | Track which databases are linked to which apps |
| **Link/Unlink API endpoints** | Perform the integration actions |
| **Credential injection logic** | Auto-generate env vars from database connection |
| **Integration status tracking** | Track state: `pending`, `linked`, `failed`, `unlinked` |
| **Multi-app support for databases** | Allow one database to serve multiple apps |
| **Unlinking safety rules** | Prevent accidental data loss |
| **Redeploy trigger on link/unlink** | Update running apps when integrations change |

---

## 2️⃣ Design Gaps Analysis

### Database ↔ Application Relationship

**Current State**: Both have `project_id` but no direct link.

**Gap**: No table or system tracks:
- Which database is connected to which app
- What credentials were injected
- When the integration was created
- Who performed the action

**Impact**: Cannot answer "Which databases does app X use?" or "Which apps use database Y?"

---

### Ownership and Lifecycle Responsibility

**Current State**:
- Database: `owner_id` → user who created it
- App: `user_id` → user who deployed it

**Gap**: 
- No validation that user owns both resources during linking
- No cascade rules when either resource is deleted
- No audit trail of integration changes

**Recommended Rule**:
```
Integration allowed only if:
  user owns database AND user owns app AND both are in same project
```

---

### Credential Storage and Injection

**Current State**:
- Database stores `public_connection.uri`, `public_connection.password`
- Password stored as `EncryptedData` (encrypted at rest)
- Apps have `platform_app_env_vars` table

**Gap**:
- No automatic creation of env vars like `DATABASE_URL`
- No system to track which env vars came from integrations vs manual entry
- No mechanism to update env vars when database credentials rotate

**Injection Pattern Needed**:
```typescript
// When linking a PostgreSQL database:
DATABASE_URL=postgresql://user:password@host:port/dbname
DATABASE_HOST=host
DATABASE_PORT=5432
DATABASE_USER=user
DATABASE_PASSWORD=password
DATABASE_NAME=dbname
```

---

### Multi-App Usage of a Single Database

**Current State**: Not supported explicitly.

**Gap**:
- Database has no `linked_apps` field
- No reference counting
- No way to prevent deletion of database used by multiple apps

**Recommended Behavior**:
- One database can link to many apps
- Each integration is a separate record
- Database cannot be deleted while linked (unless forced)

---

### Safe Unlinking and Deletion Rules

**Current State**: No rules exist.

**Gap**:
| Scenario | Current | Needed |
|----------|---------|--------|
| Unlink database from app | N/A | Remove env vars, trigger redeploy |
| Delete database while linked | Allowed (dangerous) | Block or force-unlink first |
| Delete app while linked | Allowed (leaves orphan record) | Auto-cleanup integration record |

---

### ⚠️ Forced Database Deletion Behavior (CRITICAL)

When a user attempts to delete a database that is linked to apps:

**Default Behavior: BLOCK**
```typescript
// DELETE /api/services/database/delete
// Check for active integrations first

const linkedApps = await Database_Integrations.get_by_database(database_id);
const activeLinks = linkedApps.filter(i => i.status === 'linked');

if (activeLinks.length > 0) {
  return {
    success: false,
    error: "Cannot delete database with active integrations",
    code: "DATABASE_HAS_ACTIVE_LINKS",
    linked_apps: activeLinks.map(i => ({
      app_id: i.platform_app_id,
      app_name: i.app_name
    })),
    hint: "Unlink all apps first, or use force=true"
  };
}
```

**Forced Deletion: AUTO-UNLINK ALL**
```typescript
// DELETE /api/services/database/delete?force=true

if (force === true && activeLinks.length > 0) {
  // 1. Warn user with confirmation requirement
  // UI must show: "This database is linked to 3 apps. They will lose access."
  
  // 2. Auto-unlink all integrations
  for (const integration of activeLinks) {
    await DatabaseIntegrationService.unlink(
      integration.platform_app_id,
      database_id,
      { reason: 'database_force_deleted', deleted_by: user_id }
    );
  }
  
  // 3. Log destructive action
  await AuditLog.create({
    action: 'database_force_deleted',
    database_id,
    user_id,
    affected_apps: activeLinks.map(i => i.platform_app_id),
    timestamp: new Date()
  });
  
  // 4. Proceed with database deletion
}
```

**UI Requirements for Force Delete:**
```
┌─────────────────────────────────────────────────────────────┐
│ ⚠️ WARNING: Database Has Active Connections                │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│ This database is linked to 3 applications:                  │
│   • my-api-app                                              │
│   • admin-dashboard                                         │
│   • worker-service                                          │
│                                                             │
│ Deleting this database will:                                │
│   ✗ Remove DATABASE_URL from all linked apps               │
│   ✗ Trigger redeployments (apps may fail without DB)       │
│   ✗ Permanently delete all database data                   │
│                                                             │
│ Type "delete my-postgres-db" to confirm:                    │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │                                                         │ │
│ └─────────────────────────────────────────────────────────┘ │
│                                                             │
│           [Cancel]                    [Delete Permanently]  │
└─────────────────────────────────────────────────────────────┘
```

---

## 3️⃣ Proposed Integration Architecture

### Design Decision: Integration as Separate Entity

**Recommendation**: ✅ **Create a separate `database_integrations` table**

**Why Not Store on App or Database?**

| Option | Pros | Cons |
|--------|------|------|
| Store `database_id` on app | Simple | One app = one database only |
| Store `app_ids[]` on database | Fewer tables | JSONB queries are slow, no audit trail |
| **Separate integrations table** | M:N support, audit trail, status tracking | Extra table |

**Chosen Approach**:
```
database_integrations
├── id (UUID)
├── database_cluster_id (FK → database_cluster)
├── platform_app_id (FK → platform_apps)
├── user_id (FK → auth.users) -- who created the integration
├── project_id (FK → projects) -- shared project context
├── status (pending | linked | failed | unlinked)
├── injected_env_keys (TEXT[]) -- which env vars were created
├── created_at
├── updated_at
├── unlinked_at (nullable)
└── unlinked_by (nullable, FK → auth.users)
```

**Benefits**:
1. **Scalability**: One database → many apps, one app → many databases
2. **Safety**: Clear record of what was linked, when, by whom
3. **Reversibility**: `unlinked` status preserves history without hard delete
4. **Auditability**: Full lifecycle tracking
5. **Credential tracking**: `injected_env_keys` shows exactly what was injected

---

## 4️⃣ Linking Flow (Step-by-Step)

### User Action: Link Database to App

```
POST /api/services/platform-apps/integrations/link
Body: { 
  app_id: UUID, 
  database_id: UUID,
  force?: boolean,        // Optional: overwrite existing env vars (default: false)
  env_prefix?: string     // Optional: custom prefix (default: "DATABASE")
}
```

### System Steps

```
┌─────────────────────────────────────────────────────────────────┐
│ Step 1: Authentication & Authorization                          │
├─────────────────────────────────────────────────────────────────┤
│ • Validate user is authenticated                                │
│ • Verify user owns the app (platform_apps.user_id = auth.uid)  │
│ • Verify user owns the database (database_cluster.owner_id)    │
│ • Verify both are in same project (optional but recommended)   │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ Step 2: Pre-flight Checks                                       │
├─────────────────────────────────────────────────────────────────┤
│ • Check database status = "online" (not creating/migrating)    │
│ • Check app status ≠ "deleting"                                │
│ • Check if integration already exists (no duplicates)          │
│ • Verify database network allows app access (if applicable)    │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ Step 3: Create Integration Record (status = "pending")          │
├─────────────────────────────────────────────────────────────────┤
│ INSERT INTO database_integrations (                             │
│   database_cluster_id, platform_app_id, user_id,               │
│   project_id, status, created_at                                │
│ )                                                               │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ Step 4: Generate Environment Variables                          │
├─────────────────────────────────────────────────────────────────┤
│ Fetch database connection details:                              │
│   • public_connection.uri (decrypt if encrypted)               │
│   • public_connection.host, port, user, database               │
│   • password (decrypt)                                          │
│                                                                 │
│ Generate env vars based on engine:                              │
│   PostgreSQL → DATABASE_URL=postgresql://...                   │
│   MySQL     → DATABASE_URL=mysql://...                         │
│   MongoDB   → MONGODB_URI=mongodb://...                        │
│   Redis     → REDIS_URL=redis://...                            │
│                                                                 │
│ Standard vars (all engines):                                    │
│   • {PREFIX}_HOST, {PREFIX}_PORT, {PREFIX}_USER                │
│   • {PREFIX}_PASSWORD, {PREFIX}_NAME                           │
│   • {PREFIX}_URL (full connection string)                      │
│                                                                 │
│ PREFIX = DATABASE (default) or DB_<INDEX> for multi-db apps   │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ Step 5: Inject Env Vars into App                                │
├─────────────────────────────────────────────────────────────────┤
│ ⚠️ STRICT OVERWRITE POLICY: Default = NO OVERWRITE             │
│                                                                 │
│ existing_vars = Platform_Apps.get_env_vars(app_id)             │
│ new_vars = generated_db_env_vars                                │
│ conflicts = []                                                  │
│                                                                 │
│ for var in new_vars:                                            │
│   if var.key not in existing_vars:                             │
│     add var ✅                                                  │
│   else:                                                         │
│     conflicts.push(var.key)                                     │
│                                                                 │
│ if conflicts.length > 0 AND NOT force=true:                     │
│   ABORT with error:                                             │
│   "Conflict: DATABASE_URL already exists. Use force=true"      │
│   Return { success: false, conflicts: [...] }                   │
│                                                                 │
│ if force=true:                                                  │
│   overwrite conflicting vars (with audit log)                   │
│                                                                 │
│ Platform_Apps.set_env_vars(app_id, merged_vars)                │
│                                                                 │
│ UI MUST SHOW: "DATABASE_URL already exists. Overwrite?"        │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ Step 6: Update Integration Record                               │
├─────────────────────────────────────────────────────────────────┤
│ UPDATE database_integrations SET                                │
│   status = "linked",                                            │
│   injected_env_keys = ['DATABASE_URL', 'DATABASE_HOST', ...],  │
│   updated_at = NOW()                                            │
│ WHERE id = integration_id                                       │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ Step 7: Trigger Redeploy (Required for Running Apps)            │
├─────────────────────────────────────────────────────────────────┤
│ ⚠️ ENV VARS NEVER APPLY WITHOUT A RESTART (K8s rule)           │
│                                                                 │
│ If app.status = "running":                                      │
│   • JenkinsService.triggerBuild(app.name)                      │
│   • BuildPollingService.startPolling(...)                      │
│   • Return { redeploy_triggered: true }                         │
│                                                                 │
│ If app.status ≠ "running" (stopped/failed/pending):            │
│   • Env vars saved, will apply on next deploy                  │
│   • Return { redeploy_triggered: false }                        │
│   • Message: "Env vars saved. Will apply on next deploy."      │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ Step 8: Log Activity                                            │
├─────────────────────────────────────────────────────────────────┤
│ Projects.add_log({                                              │
│   project_id,                                                   │
│   event: "Database Linked",                                     │
│   text: "Linked {db_name} to {app_name}"                       │
│ })                                                              │
└─────────────────────────────────────────────────────────────────┘
```

### API Response

```typescript
// Success - app was running, redeploy triggered
{
  success: true,
  integration_id: "uuid",
  injected_vars: ["DATABASE_URL", "DATABASE_HOST", "DATABASE_PORT", "DATABASE_USER", "DATABASE_PASSWORD", "DATABASE_NAME"],
  redeploy_triggered: true,
  message: "Database linked and redeploy triggered"
}

// Success - app not running, env vars saved for next deploy
{
  success: true,
  integration_id: "uuid",
  injected_vars: ["DATABASE_URL", "DATABASE_HOST", ...],
  redeploy_triggered: false,
  message: "Database linked. Env vars will apply on next deploy."
}

// Error - conflict without force flag
{
  success: false,
  error: "Environment variable conflict",
  code: "ENV_VAR_CONFLICT",
  conflicts: ["DATABASE_URL", "DATABASE_HOST"],
  hint: "Use force=true to overwrite existing variables"
}

// Error - database not ready
{
  success: false,
  error: "Database is not online",
  code: "DATABASE_NOT_READY"
}
```

---

## 5️⃣ Unlinking Flow (Step-by-Step)

### User Action: Unlink Database from App

```
POST /api/services/platform-apps/integrations/unlink
Body: { app_id: UUID, database_id: UUID }
```

### System Steps

```
┌─────────────────────────────────────────────────────────────────┐
│ Step 1: Authentication & Authorization                          │
├─────────────────────────────────────────────────────────────────┤
│ • Validate user is authenticated                                │
│ • Verify user owns the app OR user owns the database           │
│   (either owner can unlink)                                     │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ Step 2: Find Integration Record                                 │
├─────────────────────────────────────────────────────────────────┤
│ SELECT * FROM database_integrations                             │
│ WHERE database_cluster_id = ? AND platform_app_id = ?          │
│   AND status = "linked"                                         │
│                                                                 │
│ If not found → return "Integration not found"                  │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ Step 3: Remove Injected Env Vars                                │
├─────────────────────────────────────────────────────────────────┤
│ Get keys that were injected: integration.injected_env_keys      │
│                                                                 │
│ current_vars = Platform_Apps.get_env_vars(app_id)              │
│ filtered_vars = current_vars.filter(                            │
│   v => !injected_env_keys.includes(v.key)                      │
│ )                                                               │
│                                                                 │
│ Platform_Apps.set_env_vars(app_id, filtered_vars)              │
│                                                                 │
│ NOTE: Only removes vars that were injected by THIS integration │
│       Manual vars with same names are preserved                │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ Step 4: Update Integration Record (Soft Delete)                 │
├─────────────────────────────────────────────────────────────────┤
│ UPDATE database_integrations SET                                │
│   status = "unlinked",                                          │
│   unlinked_at = NOW(),                                          │
│   unlinked_by = auth.uid,                                       │
│   updated_at = NOW()                                            │
│ WHERE id = integration_id                                       │
│                                                                 │
│ NOTE: Record is NOT deleted - preserved for audit               │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ Step 5: Trigger Redeploy (Required for Running Apps)            │
├─────────────────────────────────────────────────────────────────┤
│ If app.status = "running":                                      │
│   • JenkinsService.triggerBuild(app.name)                      │
│   • App will restart without database env vars                 │
│                                                                 │
│ WARNING: App may fail if it requires database!                 │
│          UI should warn user before unlinking                  │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ Step 6: Log Activity                                            │
├─────────────────────────────────────────────────────────────────┤
│ Projects.add_log({                                              │
│   project_id,                                                   │
│   event: "Database Unlinked",                                   │
│   text: "Unlinked {db_name} from {app_name}"                   │
│ })                                                              │
└─────────────────────────────────────────────────────────────────┘
```

### What Is Preserved

| Resource | Preserved? | Notes |
|----------|------------|-------|
| Database | ✅ Yes | Completely untouched |
| Database data | ✅ Yes | No data deleted |
| Database credentials | ✅ Yes | Only removed from app env |
| App | ✅ Yes | Only env vars changed |
| App code | ✅ Yes | Untouched |
| Integration record | ✅ Yes | Marked as `unlinked` |
| Audit trail | ✅ Yes | `unlinked_at`, `unlinked_by` recorded |

### What Is Removed

| Item | Removed? | Notes |
|------|----------|-------|
| Injected env vars | ✅ Yes | `DATABASE_URL`, etc. |
| Active integration link | ✅ Yes | Status → `unlinked` |

### Guarantees Against Data Loss

1. **No database data is ever touched** by unlink
2. **Soft delete** preserves integration history
3. **App continues running** (may fail if it needs DB, but that's application logic)
4. **Re-linking** creates a new integration record (full history)

---

## 6️⃣ Storage Model (Database Schema)

### New Table: `database_integrations`

```sql
-- Migration: 20260108_create_database_integrations.sql

CREATE TABLE database_integrations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- Foreign Keys
    database_cluster_id UUID NOT NULL,
    platform_app_id UUID NOT NULL REFERENCES platform_apps(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,  -- Nullable: preserves record if user deleted
    project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
    
    -- Status Tracking
    status TEXT NOT NULL DEFAULT 'pending' 
        CHECK (status IN ('pending', 'linked', 'failed', 'unlinked')),
    
    -- Credential Tracking
    injected_env_keys TEXT[] DEFAULT '{}',
    env_prefix TEXT DEFAULT 'DATABASE', -- e.g., DATABASE, DB_PRIMARY, DB_REPLICA
    
    -- Audit Fields
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    unlinked_at TIMESTAMP WITH TIME ZONE,
    unlinked_by UUID REFERENCES auth.users(id),
    
    -- Error Tracking
    last_error TEXT,
    
    -- Prevent duplicate active integrations
    UNIQUE (database_cluster_id, platform_app_id) 
        WHERE status IN ('pending', 'linked')
);

-- NOTE: On retry after failure, the link API should:
--   1. Check for existing 'failed' record for this app+database pair
--   2. If found, reuse and update it (don't create new record)
--   3. This avoids clutter and maintains clean audit trail

-- Indexes
CREATE INDEX idx_db_integrations_app ON database_integrations(platform_app_id);
CREATE INDEX idx_db_integrations_database ON database_integrations(database_cluster_id);
CREATE INDEX idx_db_integrations_status ON database_integrations(status);
CREATE INDEX idx_db_integrations_user ON database_integrations(user_id);
CREATE INDEX idx_db_integrations_project ON database_integrations(project_id);

-- Trigger for updated_at
CREATE TRIGGER update_db_integrations_updated_at
    BEFORE UPDATE ON database_integrations
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- RLS
ALTER TABLE database_integrations ENABLE ROW LEVEL SECURITY;

-- Users can view integrations for their apps
CREATE POLICY "Users can view integrations for their apps" ON database_integrations
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM platform_apps 
            WHERE id = database_integrations.platform_app_id 
            AND user_id = auth.uid()
        )
        OR user_id = auth.uid()
    );

-- Users can create integrations for their apps
CREATE POLICY "Users can create integrations" ON database_integrations
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM platform_apps 
            WHERE id = platform_app_id 
            AND user_id = auth.uid()
        )
    );

-- Users can update integrations they own or control
CREATE POLICY "Users can update integrations they own or control" ON database_integrations
    FOR UPDATE USING (
        user_id = auth.uid()
        OR EXISTS (
            SELECT 1 FROM platform_apps 
            WHERE id = database_integrations.platform_app_id 
            AND user_id = auth.uid()
        )
    );

-- Service role bypass for backend operations
CREATE POLICY "Service role full access" ON database_integrations
    FOR ALL USING (auth.role() = 'service_role');
```

### Integration Record Fields Explained

| Field | Purpose |
|-------|---------|
| `id` | Unique identifier for the integration |
| `database_cluster_id` | Reference to the database (not FK due to different table design) |
| `platform_app_id` | Reference to the app |
| `user_id` | Who created the integration |
| `project_id` | Shared project (for organization) |
| `status` | Current state of integration |
| `injected_env_keys` | Array of env var keys that were injected |
| `env_prefix` | Prefix used for env vars (default: `DATABASE`) |
| `created_at` | When integration was created |
| `updated_at` | Last modification time |
| `unlinked_at` | When it was unlinked (null if active) |
| `unlinked_by` | Who unlinked it |
| `last_error` | Last error message if status=failed |

---

## 7️⃣ Implementation Guidance

### Backend Services (API Routes)

| Endpoint | File | Responsibility |
|----------|------|----------------|
| `POST /api/services/platform-apps/integrations/link` | `app/api/services/platform-apps/integrations/link/route.ts` | Create integration, inject env vars |
| `POST /api/services/platform-apps/integrations/unlink` | `app/api/services/platform-apps/integrations/unlink/route.ts` | Remove env vars, soft-delete integration |
| `GET /api/services/platform-apps/integrations/linked` | `app/api/services/platform-apps/integrations/linked/route.ts` | List integrations for an app |
| `GET /api/services/databases/[id]/apps` | `app/api/services/database/read/apps/route.ts` | List apps linked to a database |

### Query Layer

**File**: `lib/supabase/queries/database_integrations.ts`

```typescript
export const Database_Integrations = {
  create: async (payload) => {...},
  get_by_app: async (app_id) => {...},
  get_by_database: async (database_id) => {...},
  get_active_by_pair: async (app_id, database_id) => {...},
  update_status: async (id, status, extra) => {...},
  unlink: async (id, user_id) => {...},
  list_by_project: async (project_id) => {...},
};
```

### Deployment Pipeline Changes

**File**: `lib/services/deployment.ts`

⚠️ **NO CHANGES REQUIRED** - Deployment service remains stateless.

The correct approach:
1. Integration layer injects env vars **before** deploy (via `Platform_Apps.set_env_vars`)
2. Deploy reads env vars **as-is** from `platform_app_env_vars` table
3. Jenkins pipelines already support `envVars: EnvVar[]` - no changes needed

> **Why?** Injecting integration logic into deploy would re-couple the systems we deliberately separated.

**File**: `lib/jenkins/pipelines/*.ts`

Already supports `envVars: EnvVar[]` - no changes needed.

### UI/UX Components

| Component | Location | Purpose |
|-----------|----------|---------|
| Database Selector | `components/dashboard/apps/database-link.tsx` | Dropdown to select database |
| Linked Databases List | `components/dashboard/apps/linked-databases.tsx` | Show linked DBs in app detail |
| Linked Apps List | `components/dashboard/database/linked-apps.tsx` | Show linked apps in DB detail |
| Integration Status Badge | `components/ui/integration-badge.tsx` | Status indicator |

---

### Phased Implementation Plan

#### Phase 1: Minimal Viable Integration (Week 1-2)

**Goal**: Basic linking/unlinking with env var injection

| Task | Est. Hours | Owner |
|------|------------|-------|
| Create migration for `database_integrations` | 2h | Backend |
| Create `Database_Integrations` query module | 4h | Backend |
| Implement `link` API endpoint | 6h | Backend |
| Implement `unlink` API endpoint | 4h | Backend |
| Implement `linked` API endpoint | 2h | Backend |
| Create env var generation utils | 4h | Backend |
| Add "Link Database" button to app detail UI | 4h | Frontend |
| Add "Linked Databases" section to app detail | 4h | Frontend |
| **Total** | **30h** | |

**Deliverable**: User can link a database to an app, see injected env vars, and unlink.

#### Phase 2: Safety and Visibility (Week 3-4)

**Goal**: Prevent mistakes, add audit trail, handle edge cases

| Task | Est. Hours | Owner |
|------|------------|-------|
| Add pre-unlink confirmation modal | 2h | Frontend |
| Block database deletion if linked | 4h | Backend |
| Add "Linked Apps" section to database detail | 4h | Frontend |
| Add integration status to app card | 2h | Frontend |
| Add project activity logs for integration events | 4h | Backend |
| Handle app deletion cascade (auto-unlink) | 4h | Backend |
| Add integration history view | 4h | Frontend |
| **Total** | **24h** | |

**Deliverable**: Safe operations with clear feedback and audit trail.

#### Phase 3: Advanced Features (Week 5-6)

**Goal**: Multi-database apps, credential rotation, recommended databases

| Task | Est. Hours | Owner |
|------|------------|-------|
| Support multiple databases per app with custom prefixes | 6h | Backend |
| Auto-suggest platform databases for new apps | 4h | Frontend |
| Handle credential rotation (re-inject on password change) | 6h | Backend |
| Add network rule suggestions (allow app IP in DB firewall) | 6h | Backend |
| Integration health check (verify connectivity) | 8h | Backend |
| **Total** | **30h** | |

**Credential Rotation Contract:**
> When database credentials change, database service emits `database.credentials_rotated` event → integration layer subscribes → re-injects env vars for all linked apps → triggers redeploy for running apps.

**Deliverable**: Production-ready integration system.

---

## 8️⃣ UX and Mental Model

### How Users Should Think About This

```
┌────────────────────────────────────────────────────────────────┐
│                         PROJECT                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                       DATABASES                          │   │
│  │   [PostgreSQL-prod]    [MySQL-analytics]    [Redis]     │   │
│  └───────────┬─────────────────┬───────────────────────────┘   │
│              │ link            │ link                           │
│              ▼                 ▼                                │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                      APPLICATIONS                        │   │
│  │   [my-api-app]        [admin-dashboard]     [worker]    │   │
│  │   └─ linked to:       └─ linked to:         └─ no DB    │   │
│  │      PostgreSQL-prod     PostgreSQL-prod                 │   │
│  │      Redis               MySQL-analytics                 │   │
│  └─────────────────────────────────────────────────────────┘   │
└────────────────────────────────────────────────────────────────┘
```

### Key Concepts for Users

1. **Databases are standalone resources** - They exist independently of apps
2. **Linking is optional** - Apps don't require a platform database
3. **Linking is reversible** - Unlink anytime without losing data
4. **Credentials are injected automatically** - No manual copy-paste
5. **Redeploy applies changes** - Env vars update on next deploy

### Where Integration Actions Appear

| Location | Action Available |
|----------|------------------|
| App Detail Page → Settings Tab | "Link Database" button, "Linked Databases" list |
| App Detail Page → Env Vars Tab | Shows injected vars with "from: Database" badge |
| Database Detail Page → Overview | "Linked Apps" section |
| New App Creation Flow | "Connect a Database" optional step |
| Project Overview | Summary of integrations |

### Recommending Platform Databases Without Forcing

**In "New App" flow**:
```
┌─────────────────────────────────────────────────────────────┐
│ 🎯 Does your app need a database?                           │
│                                                             │
│ [○] No database needed                                      │
│ [○] Yes, connect an existing database  ──────────┐         │
│ [○] Yes, create a new database         ──────────┤         │
│                                                  ▼          │
│                                         [Select Database]   │
│                                         [+ Create New]      │
│                                                             │
│ ℹ️ You can also add a database later from app settings     │
└─────────────────────────────────────────────────────────────┘
```

**In App Settings**:
```
┌─────────────────────────────────────────────────────────────┐
│ 🔗 Database Connections                                     │
│                                                             │
│ No databases linked.                                        │
│                                                             │
│ [+ Link a Database]                                         │
│                                                             │
│ 💡 Tip: Link a platform database to automatically inject   │
│    connection credentials into your app.                    │
│                                                             │
│ Using an external database? Add DATABASE_URL manually in   │
│ Environment Variables below.                                │
└─────────────────────────────────────────────────────────────┘
```

---

## Summary: What to Build

### Minimum Deliverables

1. **Migration**: `database_integrations` table
2. **Query Module**: `lib/supabase/queries/database_integrations.ts`
3. **API Endpoints**:
   - `POST /api/services/platform-apps/integrations/link`
   - `POST /api/services/platform-apps/integrations/unlink`
   - `GET /api/services/platform-apps/integrations/linked`
4. **Env Var Generator**: `lib/services/database-integration.ts`
5. **UI Components**:
   - Database link selector
   - Linked databases list
   - Integration status badges

### Do Not Build (Out of Scope)

- ❌ Database schema management (migrations)
- ❌ Query builder / ORM integration
- ❌ Connection pooling at platform level
- ❌ Read replica routing
- ❌ Cross-project database sharing

---

## Appendix: Environment Variable Templates

### PostgreSQL
```
DATABASE_URL=postgresql://{user}:{password}@{host}:{port}/{database}?sslmode=require
DATABASE_HOST={host}
DATABASE_PORT={port}
DATABASE_USER={user}
DATABASE_PASSWORD={password}
DATABASE_NAME={database}
DATABASE_SSL=true
```

### MySQL
```
DATABASE_URL=mysql://{user}:{password}@{host}:{port}/{database}
DATABASE_HOST={host}
DATABASE_PORT={port}
DATABASE_USER={user}
DATABASE_PASSWORD={password}
DATABASE_NAME={database}
```

### MongoDB
```
MONGODB_URI=mongodb+srv://{user}:{password}@{host}/{database}?retryWrites=true
MONGODB_HOST={host}
MONGODB_USER={user}
MONGODB_PASSWORD={password}
MONGODB_DATABASE={database}
```

### Redis
```
REDIS_URL=redis://:{password}@{host}:{port}
REDIS_HOST={host}
REDIS_PORT={port}
REDIS_PASSWORD={password}
```
