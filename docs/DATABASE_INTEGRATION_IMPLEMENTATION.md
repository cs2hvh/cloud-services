# Database Integration - Implementation Guide

> **Status**: Implementation Ready  
> **Created**: 2026-01-08  
> **Prerequisite**: [DATABASE_INTEGRATION_DESIGN.md](./DATABASE_INTEGRATION_DESIGN.md)

---

## Implementation Philosophy

```
┌────────────────────────────────────────────────────────────────┐
│                    MODULAR ARCHITECTURE                        │
├────────────────────────────────────────────────────────────────┤
│                                                                │
│   Layer 1: DATABASE (Schema + Migrations)                      │
│      └── supabase/migrations/                                  │
│                                                                │
│   Layer 2: TYPES (TypeScript Definitions)                      │
│      └── lib/supabase/types.ts                                 │
│                                                                │
│   Layer 3: QUERIES (Data Access)                               │
│      └── lib/supabase/queries/database_integrations.ts         │
│                                                                │
│   Layer 4: SERVICES (Business Logic)                           │
│      └── lib/services/database-integration.ts                  │
│                                                                │
│   Layer 5: API (HTTP Endpoints)                                │
│      └── app/api/services/platform-apps/integrations/          │
│                                                                │
│   Layer 6: UI (Frontend Components) - Future                   │
│      └── components/dashboard/                                 │
│                                                                │
└────────────────────────────────────────────────────────────────┘
```

**Key Principles:**
1. Each layer only depends on layers below it
2. No circular dependencies
3. Each file has a single responsibility
4. Test each layer before building the next

---

## File Creation Order

```
STEP 1: Database Migration
└── supabase/migrations/20260108_create_database_integrations.sql

STEP 2: Types (add to existing)
└── lib/supabase/types.ts (ADD DatabaseIntegration interface)

STEP 3: Query Module
└── lib/supabase/queries/database_integrations.ts (NEW)
└── lib/supabase/queries/index.ts (UPDATE exports)

STEP 4: Service Layer
└── lib/services/database-integration.ts (NEW)
└── lib/services/index.ts (UPDATE exports)

STEP 5: API Endpoints
└── app/api/services/platform-apps/integrations/link/route.ts
└── app/api/services/platform-apps/integrations/unlink/route.ts
└── app/api/services/platform-apps/integrations/linked/route.ts
```

---

## PHASE 1: Database Migration

### File: `supabase/migrations/20260108_create_database_integrations.sql`

```sql
-- Migration: Create database_integrations table
-- Purpose: Track links between databases and platform apps
-- Date: 2026-01-08

-- ============================================
-- TABLE: database_integrations
-- ============================================
CREATE TABLE IF NOT EXISTS database_integrations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- Core relationships (NOT FK to allow flexibility)
    database_cluster_id TEXT NOT NULL,  -- References database_cluster.cluster_id
    platform_app_id UUID NOT NULL REFERENCES platform_apps(id) ON DELETE CASCADE,
    
    -- Ownership (for RLS)
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
    
    -- Status tracking
    status TEXT NOT NULL DEFAULT 'pending' 
        CHECK (status IN ('pending', 'linked', 'failed', 'unlinked')),
    
    -- What was injected (for cleanup)
    injected_env_keys TEXT[] DEFAULT '{}',
    env_prefix TEXT DEFAULT 'DATABASE',
    
    -- Audit fields
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    unlinked_at TIMESTAMP WITH TIME ZONE,
    unlinked_by UUID REFERENCES auth.users(id),
    
    -- Error tracking
    error_message TEXT,
    
    -- Prevent duplicate active links
    CONSTRAINT unique_active_integration 
        UNIQUE NULLS NOT DISTINCT (database_cluster_id, platform_app_id, 
            CASE WHEN status IN ('pending', 'linked') THEN status END)
);

-- ============================================
-- INDEXES
-- ============================================
CREATE INDEX idx_db_integrations_app ON database_integrations(platform_app_id);
CREATE INDEX idx_db_integrations_db ON database_integrations(database_cluster_id);
CREATE INDEX idx_db_integrations_user ON database_integrations(user_id);
CREATE INDEX idx_db_integrations_status ON database_integrations(status);
CREATE INDEX idx_db_integrations_project ON database_integrations(project_id);

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================
ALTER TABLE database_integrations ENABLE ROW LEVEL SECURITY;

-- Users can view integrations they created
CREATE POLICY "Users can view their integrations" ON database_integrations
    FOR SELECT USING (auth.uid() = user_id);

-- Users can create integrations (ownership verified in application layer)
CREATE POLICY "Users can create integrations" ON database_integrations
    FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Users can update integrations they own OR if they own the app/database
-- (This allows both app owner and database owner to manage)
CREATE POLICY "Users can update their integrations" ON database_integrations
    FOR UPDATE USING (
        auth.uid() = user_id 
        OR EXISTS (
            SELECT 1 FROM platform_apps 
            WHERE id = platform_app_id AND user_id = auth.uid()
        )
    );

-- Users can delete integrations they own
CREATE POLICY "Users can delete their integrations" ON database_integrations
    FOR DELETE USING (auth.uid() = user_id);

-- ============================================
-- TRIGGER: Auto-update updated_at
-- ============================================
CREATE TRIGGER update_database_integrations_updated_at
    BEFORE UPDATE ON database_integrations
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- VERIFICATION
-- ============================================
DO $$
BEGIN
    RAISE NOTICE 'Migration completed: database_integrations table created';
END $$;
```

### How to Apply:
```bash
# Option 1: Via Supabase CLI
supabase db push

# Option 2: Direct SQL execution
psql $DATABASE_URL -f supabase/migrations/20260108_create_database_integrations.sql
```

---

## PHASE 2: Type Definitions

### Add to: `lib/supabase/types.ts`

```typescript
// ============================================
// DATABASE INTEGRATION TYPES
// ============================================

export type IntegrationStatus = 'pending' | 'linked' | 'failed' | 'unlinked';

export interface DatabaseIntegration {
  id: string;
  database_cluster_id: string;
  platform_app_id: string;
  user_id: string;
  project_id: string | null;
  status: IntegrationStatus;
  injected_env_keys: string[];
  env_prefix: string;
  created_at: string;
  updated_at: string;
  unlinked_at: string | null;
  unlinked_by: string | null;
  error_message: string | null;
}

export interface DatabaseIntegrationInsert {
  database_cluster_id: string;
  platform_app_id: string;
  user_id: string;
  project_id?: string | null;
  status?: IntegrationStatus;
  injected_env_keys?: string[];
  env_prefix?: string;
}

export interface DatabaseIntegrationUpdate {
  status?: IntegrationStatus;
  injected_env_keys?: string[];
  unlinked_at?: string | null;
  unlinked_by?: string | null;
  error_message?: string | null;
}

// Environment variable generation result
export interface GeneratedEnvVars {
  vars: Array<{ key: string; value: string }>;
  keys: string[];
}
```

---

## PHASE 3: Query Module

### File: `lib/supabase/queries/database_integrations.ts`

```typescript
/**
 * Database Integrations Query Module
 * 
 * Handles all database operations for the database_integrations table.
 * This module is ONLY responsible for data access - no business logic.
 */

import { createServiceClient, createSSRClient } from "../server";
import type { 
  DatabaseIntegration, 
  DatabaseIntegrationInsert, 
  DatabaseIntegrationUpdate 
} from "../types";

export const Database_Integrations = {
  /**
   * Create a new integration record
   */
  create: async (payload: DatabaseIntegrationInsert) => {
    try {
      const supabase = await createServiceClient();
      const { data, error } = await supabase
        .from("database_integrations")
        .insert(payload)
        .select()
        .single();

      if (error) {
        console.error("[Database_Integrations.create] Error:", error.message);
        return { success: false, error: error.message };
      }

      return { success: true, data: data as DatabaseIntegration };
    } catch (err) {
      console.error("[Database_Integrations.create] Exception:", err);
      return { success: false, error: String(err) };
    }
  },

  /**
   * Get integration by ID
   */
  get: async (id: string) => {
    try {
      const supabase = await createSSRClient();
      const { data, error } = await supabase
        .from("database_integrations")
        .select("*")
        .eq("id", id)
        .single();

      if (error) {
        return { success: false, error: error.message };
      }

      return { success: true, data: data as DatabaseIntegration };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  },

  /**
   * Get active integration for app + database combo
   * Returns the linked/pending record if exists
   */
  get_active: async (platform_app_id: string, database_cluster_id: string) => {
    try {
      const supabase = await createServiceClient();
      const { data, error } = await supabase
        .from("database_integrations")
        .select("*")
        .eq("platform_app_id", platform_app_id)
        .eq("database_cluster_id", database_cluster_id)
        .in("status", ["pending", "linked"])
        .maybeSingle();

      if (error) {
        return { success: false, error: error.message };
      }

      return { success: true, data: data as DatabaseIntegration | null };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  },

  /**
   * Get all integrations for an app
   */
  get_by_app: async (platform_app_id: string, include_unlinked = false) => {
    try {
      const supabase = await createSSRClient();
      let query = supabase
        .from("database_integrations")
        .select("*")
        .eq("platform_app_id", platform_app_id);

      if (!include_unlinked) {
        query = query.in("status", ["pending", "linked"]);
      }

      const { data, error } = await query.order("created_at", { ascending: false });

      if (error) {
        return { success: false, error: error.message };
      }

      return { success: true, data: (data || []) as DatabaseIntegration[] };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  },

  /**
   * Get all integrations for a database
   */
  get_by_database: async (database_cluster_id: string, include_unlinked = false) => {
    try {
      const supabase = await createServiceClient();
      let query = supabase
        .from("database_integrations")
        .select("*")
        .eq("database_cluster_id", database_cluster_id);

      if (!include_unlinked) {
        query = query.in("status", ["pending", "linked"]);
      }

      const { data, error } = await query.order("created_at", { ascending: false });

      if (error) {
        return { success: false, error: error.message };
      }

      return { success: true, data: (data || []) as DatabaseIntegration[] };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  },

  /**
   * Update an integration record
   */
  update: async (id: string, updates: DatabaseIntegrationUpdate) => {
    try {
      const supabase = await createServiceClient();
      const { data, error } = await supabase
        .from("database_integrations")
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq("id", id)
        .select()
        .single();

      if (error) {
        console.error("[Database_Integrations.update] Error:", error.message);
        return { success: false, error: error.message };
      }

      return { success: true, data: data as DatabaseIntegration };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  },

  /**
   * Mark integration as unlinked (soft delete)
   */
  mark_unlinked: async (id: string, unlinked_by: string) => {
    return Database_Integrations.update(id, {
      status: "unlinked",
      unlinked_at: new Date().toISOString(),
      unlinked_by,
    });
  },

  /**
   * Mark integration as failed with error message
   */
  mark_failed: async (id: string, error_message: string) => {
    return Database_Integrations.update(id, {
      status: "failed",
      error_message,
    });
  },

  /**
   * Hard delete an integration (use sparingly)
   */
  delete: async (id: string) => {
    try {
      const supabase = await createServiceClient();
      const { error } = await supabase
        .from("database_integrations")
        .delete()
        .eq("id", id);

      if (error) {
        return { success: false, error: error.message };
      }

      return { success: true };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  },

  /**
   * Count active integrations for a database
   * Used to check if database can be deleted
   */
  count_active_for_database: async (database_cluster_id: string) => {
    try {
      const supabase = await createServiceClient();
      const { count, error } = await supabase
        .from("database_integrations")
        .select("*", { count: "exact", head: true })
        .eq("database_cluster_id", database_cluster_id)
        .eq("status", "linked");

      if (error) {
        return { success: false, error: error.message };
      }

      return { success: true, count: count || 0 };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  },
};
```

### Update: `lib/supabase/queries/index.ts`

Add this export:
```typescript
export { Database_Integrations } from "./database_integrations";
```

---

## PHASE 4: Service Layer

### File: `lib/services/database-integration.ts`

```typescript
/**
 * Database Integration Service
 * 
 * Business logic for linking/unlinking databases to apps.
 * This is the ONLY place where integration logic lives.
 * 
 * Responsibilities:
 * - Validate ownership
 * - Generate environment variables
 * - Coordinate between Database_Clusters, Platform_Apps, and Database_Integrations
 * - Trigger redeployments when needed
 */

import { Database_Integrations, Platform_Apps, Database_Clusters, Projects } from "@/lib/supabase/queries";
import { JenkinsService } from "./jenkins";
import { BuildPollingService } from "./build-polling";
import { Encryption, type EncryptedData } from "@/config/functions";
import type { Database_Connection, GeneratedEnvVars } from "@/lib/supabase/types";

// ============================================
// TYPES
// ============================================

export interface LinkRequest {
  app_id: string;
  database_id: string;  // This is cluster_id, not UUID
  user_id: string;
  force?: boolean;      // Overwrite existing env vars
  env_prefix?: string;  // Custom prefix (default: DATABASE)
}

export interface LinkResult {
  success: boolean;
  integration_id?: string;
  injected_vars?: string[];
  redeploy_triggered?: boolean;
  conflicts?: string[];
  error?: string;
  code?: string;
}

export interface UnlinkRequest {
  app_id: string;
  database_id: string;
  user_id: string;
}

export interface UnlinkResult {
  success: boolean;
  removed_vars?: string[];
  redeploy_triggered?: boolean;
  error?: string;
  code?: string;
}

// ============================================
// SERVICE CLASS
// ============================================

export class DatabaseIntegrationService {
  
  /**
   * Get the encryption key from environment
   */
  private static getEncryptionKey(): string {
    const key = process.env.ENCRYPTION_KEY || process.env.DB_ENCRYPTION_KEY;
    if (!key) {
      throw new Error("Encryption key not configured");
    }
    return key;
  }

  /**
   * Decrypt a value if it's encrypted
   */
  private static decryptIfNeeded(value: string | EncryptedData | undefined): string {
    if (!value) return "";
    
    if (typeof value === "string") {
      return value;
    }
    
    // It's encrypted
    return Encryption.decrypt(value, this.getEncryptionKey());
  }

  /**
   * Generate environment variables from database connection
   */
  static generateEnvVars(
    connection: Database_Connection,
    engine: string,
    prefix: string = "DATABASE"
  ): GeneratedEnvVars {
    const vars: Array<{ key: string; value: string }> = [];
    
    // Decrypt sensitive fields
    const host = this.decryptIfNeeded(connection.host);
    const password = this.decryptIfNeeded(connection.password);
    const uri = connection.uri; // URI might already include decrypted parts
    
    // Build connection URL based on engine
    let connectionUrl = uri;
    if (!connectionUrl) {
      // Build it manually if URI not provided
      const protocol = engine === "mongodb" ? "mongodb" : 
                       engine === "mysql" ? "mysql" : 
                       engine === "pg" ? "postgresql" : engine;
      connectionUrl = `${protocol}://${connection.user}:${password}@${host}:${connection.port}/${connection.database}`;
      if (connection.ssl) {
        connectionUrl += "?sslmode=require";
      }
    }

    // Primary URL variable
    const urlKey = engine === "mongodb" ? `${prefix}_URI` : `${prefix}_URL`;
    vars.push({ key: urlKey, value: connectionUrl });

    // Individual components
    vars.push({ key: `${prefix}_HOST`, value: host });
    vars.push({ key: `${prefix}_PORT`, value: String(connection.port) });
    vars.push({ key: `${prefix}_USER`, value: connection.user });
    vars.push({ key: `${prefix}_PASSWORD`, value: password });
    vars.push({ key: `${prefix}_NAME`, value: connection.database });
    
    if (connection.ssl) {
      vars.push({ key: `${prefix}_SSL`, value: "true" });
    }

    return {
      vars,
      keys: vars.map(v => v.key),
    };
  }

  /**
   * Link a database to an application
   */
  static async link(request: LinkRequest): Promise<LinkResult> {
    const { app_id, database_id, user_id, force = false, env_prefix = "DATABASE" } = request;
    
    console.log(`[DatabaseIntegrationService] Linking database ${database_id} to app ${app_id}`);

    try {
      // ========================================
      // Step 1: Validate app exists and user owns it
      // ========================================
      const appResult = await Platform_Apps.get(app_id);
      if (!appResult.success || !appResult.data) {
        return { success: false, error: "App not found", code: "APP_NOT_FOUND" };
      }
      const app = appResult.data;
      
      if (app.user_id !== user_id) {
        return { success: false, error: "You don't own this app", code: "APP_NOT_OWNED" };
      }

      // ========================================
      // Step 2: Validate database exists and user owns it
      // ========================================
      const dbResult = await Database_Clusters.read(database_id);
      if (!dbResult.success || !dbResult.data) {
        return { success: false, error: "Database not found", code: "DATABASE_NOT_FOUND" };
      }
      const database = dbResult.data;
      
      if (database.owner_id !== user_id) {
        return { success: false, error: "You don't own this database", code: "DATABASE_NOT_OWNED" };
      }

      // ========================================
      // Step 3: Check database is online
      // ========================================
      if (database.status !== "online") {
        return { 
          success: false, 
          error: `Database is ${database.status}, must be online to link`,
          code: "DATABASE_NOT_READY" 
        };
      }

      // ========================================
      // Step 4: Check for existing integration
      // ========================================
      const existingResult = await Database_Integrations.get_active(app_id, database_id);
      if (existingResult.success && existingResult.data) {
        // Allow reusing a failed integration
        if (existingResult.data.status === "failed") {
          // Delete the failed record so we can create a new one
          await Database_Integrations.delete(existingResult.data.id);
        } else {
          return { 
            success: false, 
            error: "This database is already linked to this app",
            code: "ALREADY_LINKED" 
          };
        }
      }

      // ========================================
      // Step 5: Generate environment variables
      // ========================================
      const connection = database.public_connection;
      if (!connection) {
        return { 
          success: false, 
          error: "Database has no connection information",
          code: "NO_CONNECTION_INFO" 
        };
      }

      const generated = this.generateEnvVars(connection, database.engine, env_prefix);

      // ========================================
      // Step 6: Check for env var conflicts
      // ========================================
      const existingEnvVars = await Platform_Apps.get_env_vars(app_id);
      const existingKeys = new Set(existingEnvVars.map(ev => ev.key));
      const conflicts = generated.keys.filter(key => existingKeys.has(key));

      if (conflicts.length > 0 && !force) {
        return {
          success: false,
          error: "Environment variable conflict",
          code: "ENV_VAR_CONFLICT",
          conflicts,
        };
      }

      // ========================================
      // Step 7: Create integration record (status: pending)
      // ========================================
      const integrationResult = await Database_Integrations.create({
        database_cluster_id: database_id,
        platform_app_id: app_id,
        user_id,
        project_id: app.project_id || database.project_id || null,
        status: "pending",
        env_prefix,
      });

      if (!integrationResult.success) {
        return { 
          success: false, 
          error: integrationResult.error || "Failed to create integration record",
          code: "DB_ERROR" 
        };
      }

      const integration = integrationResult.data!;

      // ========================================
      // Step 8: Inject env vars into app
      // ========================================
      try {
        // Merge with existing (filter out conflicts if force=true)
        const mergedVars = force 
          ? [...existingEnvVars.filter(ev => !conflicts.includes(ev.key)), ...generated.vars]
          : [...existingEnvVars, ...generated.vars];

        const setResult = await Platform_Apps.set_env_vars(app_id, mergedVars);
        if (!setResult.success) {
          throw new Error(setResult.error || "Failed to set env vars");
        }
      } catch (envError) {
        // Rollback: mark integration as failed
        await Database_Integrations.mark_failed(
          integration.id, 
          `Failed to inject env vars: ${envError}`
        );
        return { 
          success: false, 
          error: `Failed to inject environment variables: ${envError}`,
          code: "ENV_INJECTION_FAILED" 
        };
      }

      // ========================================
      // Step 9: Update integration to linked
      // ========================================
      await Database_Integrations.update(integration.id, {
        status: "linked",
        injected_env_keys: generated.keys,
      });

      // ========================================
      // Step 10: Trigger redeploy if app is running
      // ========================================
      let redeployTriggered = false;
      if (app.status === "running") {
        try {
          const buildNumber = await JenkinsService.triggerBuild(app.name);
          BuildPollingService.startPolling({
            appId: app_id,
            appName: app.name,
            buildNumber,
            trigger: "integration",
          });
          redeployTriggered = true;
          console.log(`[DatabaseIntegrationService] Redeploy triggered: build #${buildNumber}`);
        } catch (deployError) {
          console.error(`[DatabaseIntegrationService] Redeploy failed:`, deployError);
          // Don't fail the link - env vars are saved
        }
      }

      // ========================================
      // Step 11: Log activity
      // ========================================
      if (app.project_id) {
        await Projects.add_log({
          project_id: app.project_id,
          event: "Database Linked",
          text: `Linked database "${database.name}" to app "${app.name}"`,
        });
      }

      console.log(`[DatabaseIntegrationService] ✅ Link successful: ${integration.id}`);

      return {
        success: true,
        integration_id: integration.id,
        injected_vars: generated.keys,
        redeploy_triggered: redeployTriggered,
      };

    } catch (error) {
      console.error("[DatabaseIntegrationService] Link error:", error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : "Unknown error",
        code: "INTERNAL_ERROR" 
      };
    }
  }

  /**
   * Unlink a database from an application
   */
  static async unlink(request: UnlinkRequest): Promise<UnlinkResult> {
    const { app_id, database_id, user_id } = request;
    
    console.log(`[DatabaseIntegrationService] Unlinking database ${database_id} from app ${app_id}`);

    try {
      // ========================================
      // Step 1: Find the active integration
      // ========================================
      const integrationResult = await Database_Integrations.get_active(app_id, database_id);
      if (!integrationResult.success || !integrationResult.data) {
        return { 
          success: false, 
          error: "No active integration found",
          code: "NOT_LINKED" 
        };
      }
      const integration = integrationResult.data;

      // ========================================
      // Step 2: Verify ownership
      // ========================================
      if (integration.user_id !== user_id) {
        // Also check if user owns the app
        const appResult = await Platform_Apps.get(app_id);
        if (!appResult.success || appResult.data?.user_id !== user_id) {
          return { 
            success: false, 
            error: "You don't have permission to unlink",
            code: "PERMISSION_DENIED" 
          };
        }
      }

      // ========================================
      // Step 3: Get current app env vars
      // ========================================
      const appResult = await Platform_Apps.get(app_id);
      if (!appResult.success || !appResult.data) {
        return { success: false, error: "App not found", code: "APP_NOT_FOUND" };
      }
      const app = appResult.data;

      // ========================================
      // Step 4: Remove injected env vars
      // ========================================
      const keysToRemove = new Set(integration.injected_env_keys || []);
      const existingEnvVars = await Platform_Apps.get_env_vars(app_id);
      const filteredVars = existingEnvVars.filter(ev => !keysToRemove.has(ev.key));

      const setResult = await Platform_Apps.set_env_vars(app_id, filteredVars);
      if (!setResult.success) {
        return { 
          success: false, 
          error: "Failed to remove environment variables",
          code: "ENV_REMOVAL_FAILED" 
        };
      }

      // ========================================
      // Step 5: Mark integration as unlinked
      // ========================================
      await Database_Integrations.mark_unlinked(integration.id, user_id);

      // ========================================
      // Step 6: Trigger redeploy if app is running
      // ========================================
      let redeployTriggered = false;
      if (app.status === "running") {
        try {
          const buildNumber = await JenkinsService.triggerBuild(app.name);
          BuildPollingService.startPolling({
            appId: app_id,
            appName: app.name,
            buildNumber,
            trigger: "integration",
          });
          redeployTriggered = true;
        } catch (deployError) {
          console.error(`[DatabaseIntegrationService] Redeploy failed:`, deployError);
        }
      }

      // ========================================
      // Step 7: Log activity
      // ========================================
      if (app.project_id) {
        await Projects.add_log({
          project_id: app.project_id,
          event: "Database Unlinked",
          text: `Unlinked database from app "${app.name}"`,
        });
      }

      console.log(`[DatabaseIntegrationService] ✅ Unlink successful`);

      return {
        success: true,
        removed_vars: integration.injected_env_keys || [],
        redeploy_triggered: redeployTriggered,
      };

    } catch (error) {
      console.error("[DatabaseIntegrationService] Unlink error:", error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : "Unknown error",
        code: "INTERNAL_ERROR" 
      };
    }
  }

  /**
   * Get all linked databases for an app
   */
  static async getLinkedDatabases(app_id: string) {
    return Database_Integrations.get_by_app(app_id, false);
  }

  /**
   * Get all apps linked to a database
   */
  static async getLinkedApps(database_id: string) {
    return Database_Integrations.get_by_database(database_id, false);
  }

  /**
   * Check if database can be deleted (no active links)
   */
  static async canDeleteDatabase(database_id: string): Promise<{
    canDelete: boolean;
    linkedApps: number;
  }> {
    const countResult = await Database_Integrations.count_active_for_database(database_id);
    return {
      canDelete: countResult.success && countResult.count === 0,
      linkedApps: countResult.count || 0,
    };
  }

  /**
   * Force unlink all apps from a database (for force delete)
   */
  static async unlinkAllFromDatabase(database_id: string, user_id: string): Promise<{
    success: boolean;
    unlinked_count: number;
  }> {
    const linkedResult = await Database_Integrations.get_by_database(database_id, false);
    if (!linkedResult.success) {
      return { success: false, unlinked_count: 0 };
    }

    let unlinkedCount = 0;
    for (const integration of linkedResult.data || []) {
      const result = await this.unlink({
        app_id: integration.platform_app_id,
        database_id,
        user_id,
      });
      if (result.success) unlinkedCount++;
    }

    return { success: true, unlinked_count: unlinkedCount };
  }
}
```

### Update: `lib/services/index.ts`

Add this export:
```typescript
export { DatabaseIntegrationService } from "./database-integration";
```

---

## PHASE 5: API Endpoints

### File: `app/api/services/platform-apps/integrations/link/route.ts`

```typescript
/**
 * POST /api/services/platform-apps/integrations/link
 * 
 * Link a database to a platform app
 */

import { NextRequest, NextResponse } from "next/server";
import { createSSRClient } from "@/lib/supabase/server";
import { DatabaseIntegrationService } from "@/lib/services/database-integration";

export async function POST(req: NextRequest) {
  try {
    // Authenticate
    const supabase = await createSSRClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    // Parse request body
    const body = await req.json();
    const { app_id, database_id, force, env_prefix } = body;

    // Validate required fields
    if (!app_id || !database_id) {
      return NextResponse.json(
        { success: false, error: "app_id and database_id are required" },
        { status: 400 }
      );
    }

    // Perform link
    const result = await DatabaseIntegrationService.link({
      app_id,
      database_id,
      user_id: user.id,
      force: force === true,
      env_prefix: env_prefix || "DATABASE",
    });

    if (!result.success) {
      // Determine appropriate status code
      const statusCode = 
        result.code === "ENV_VAR_CONFLICT" ? 409 :
        result.code?.includes("NOT_FOUND") ? 404 :
        result.code?.includes("NOT_OWNED") ? 403 :
        result.code === "ALREADY_LINKED" ? 409 :
        400;

      return NextResponse.json(result, { status: statusCode });
    }

    return NextResponse.json({
      success: true,
      integration_id: result.integration_id,
      injected_vars: result.injected_vars,
      redeploy_triggered: result.redeploy_triggered,
      message: result.redeploy_triggered 
        ? "Database linked and redeploy triggered"
        : "Database linked. Env vars will apply on next deploy.",
    });

  } catch (error) {
    console.error("[API] Link error:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
```

### File: `app/api/services/platform-apps/integrations/unlink/route.ts`

```typescript
/**
 * POST /api/services/platform-apps/integrations/unlink
 * 
 * Unlink a database from a platform app
 */

import { NextRequest, NextResponse } from "next/server";
import { createSSRClient } from "@/lib/supabase/server";
import { DatabaseIntegrationService } from "@/lib/services/database-integration";

export async function POST(req: NextRequest) {
  try {
    // Authenticate
    const supabase = await createSSRClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    // Parse request body
    const body = await req.json();
    const { app_id, database_id } = body;

    // Validate required fields
    if (!app_id || !database_id) {
      return NextResponse.json(
        { success: false, error: "app_id and database_id are required" },
        { status: 400 }
      );
    }

    // Perform unlink
    const result = await DatabaseIntegrationService.unlink({
      app_id,
      database_id,
      user_id: user.id,
    });

    if (!result.success) {
      const statusCode = 
        result.code === "NOT_LINKED" ? 404 :
        result.code === "PERMISSION_DENIED" ? 403 :
        400;

      return NextResponse.json(result, { status: statusCode });
    }

    return NextResponse.json({
      success: true,
      removed_vars: result.removed_vars,
      redeploy_triggered: result.redeploy_triggered,
      message: result.redeploy_triggered
        ? "Database unlinked and redeploy triggered"
        : "Database unlinked. Changes will apply on next deploy.",
    });

  } catch (error) {
    console.error("[API] Unlink error:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
```

### File: `app/api/services/platform-apps/integrations/linked/route.ts`

```typescript
/**
 * GET /api/services/platform-apps/integrations/linked?app_id=xxx
 * GET /api/services/platform-apps/integrations/linked?database_id=xxx
 * 
 * Get linked databases for an app, or linked apps for a database
 */

import { NextRequest, NextResponse } from "next/server";
import { createSSRClient } from "@/lib/supabase/server";
import { DatabaseIntegrationService } from "@/lib/services/database-integration";

export async function GET(req: NextRequest) {
  try {
    // Authenticate
    const supabase = await createSSRClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    // Parse query params
    const { searchParams } = new URL(req.url);
    const app_id = searchParams.get("app_id");
    const database_id = searchParams.get("database_id");

    if (!app_id && !database_id) {
      return NextResponse.json(
        { success: false, error: "Either app_id or database_id is required" },
        { status: 400 }
      );
    }

    // Fetch integrations
    if (app_id) {
      const result = await DatabaseIntegrationService.getLinkedDatabases(app_id);
      return NextResponse.json({
        success: true,
        type: "databases",
        app_id,
        integrations: result.data || [],
      });
    }

    if (database_id) {
      const result = await DatabaseIntegrationService.getLinkedApps(database_id);
      return NextResponse.json({
        success: true,
        type: "apps",
        database_id,
        integrations: result.data || [],
      });
    }

  } catch (error) {
    console.error("[API] Get linked error:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
```

---

## Testing Checklist

### Phase 1: Database
- [ ] Run migration successfully
- [ ] Verify table exists: `SELECT * FROM database_integrations LIMIT 1;`
- [ ] Verify RLS is enabled: `SELECT relrowsecurity FROM pg_class WHERE relname = 'database_integrations';`

### Phase 2: Types
- [ ] TypeScript compiles without errors
- [ ] Types are importable: `import type { DatabaseIntegration } from "@/lib/supabase/types"`

### Phase 3: Queries
- [ ] `Database_Integrations.create()` works
- [ ] `Database_Integrations.get()` works
- [ ] `Database_Integrations.get_active()` works
- [ ] `Database_Integrations.update()` works
- [ ] `Database_Integrations.mark_unlinked()` works

### Phase 4: Service
- [ ] `DatabaseIntegrationService.link()` creates integration and injects env vars
- [ ] `DatabaseIntegrationService.link()` handles conflicts correctly
- [ ] `DatabaseIntegrationService.unlink()` removes env vars
- [ ] `DatabaseIntegrationService.canDeleteDatabase()` returns correct count

### Phase 5: API
- [ ] `POST /api/services/platform-apps/integrations/link` returns 200 on success
- [ ] `POST /api/services/platform-apps/integrations/link` returns 409 on conflict
- [ ] `POST /api/services/platform-apps/integrations/unlink` returns 200 on success
- [ ] `GET /api/services/platform-apps/integrations/linked?app_id=xxx` returns list

---

## Dependency Graph

```
                    ┌─────────────────────┐
                    │   API Endpoints     │
                    │   (link/unlink/     │
                    │    linked routes)   │
                    └──────────┬──────────┘
                               │ depends on
                               ▼
              ┌────────────────────────────────┐
              │   DatabaseIntegrationService   │
              │   (lib/services/)              │
              └────────────────┬───────────────┘
                               │ depends on
            ┌──────────────────┼──────────────────┐
            │                  │                  │
            ▼                  ▼                  ▼
┌───────────────────┐ ┌───────────────┐ ┌────────────────────┐
│ Database_         │ │ Platform_Apps │ │ Database_Clusters  │
│ Integrations      │ │               │ │                    │
│ (queries/)        │ │ (queries/)    │ │ (queries/)         │
└─────────┬─────────┘ └───────┬───────┘ └──────────┬─────────┘
          │                   │                    │
          └───────────────────┼────────────────────┘
                              │ all depend on
                              ▼
                    ┌─────────────────────┐
                    │   Supabase Client   │
                    │   (lib/supabase/)   │
                    └─────────────────────┘
```

---

## Quick Start Commands

```bash
# 1. Create migration file
touch supabase/migrations/20260108_create_database_integrations.sql

# 2. Apply migration
supabase db push

# 3. Create query module
touch lib/supabase/queries/database_integrations.ts

# 4. Create service
touch lib/services/database-integration.ts

# 5. Create API endpoints
touch app/api/services/platform-apps/integrations/link/route.ts
touch app/api/services/platform-apps/integrations/unlink/route.ts
touch app/api/services/platform-apps/integrations/linked/route.ts

# 6. Test the API
curl -X POST http://localhost:3000/api/services/platform-apps/integrations/link \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{"app_id": "...", "database_id": "..."}'
```

---

## Next Steps After Core Implementation

1. **Update Database Delete API** - Check for active integrations before allowing delete
2. **Add Credential Rotation Support** - Listen for database credential changes
3. **Frontend Integration Panel** - UI to link/unlink databases
4. **Webhook for Auto-Rotation** - Event-driven credential updates
