# Notification System Architecture

> **Created**: January 21, 2026  
> **Status**: Proposed  
> **Scope**: Dashboard notifications for all service CRUD operations

---

## Table of Contents

1. [Overview](#overview)
2. [Current Implementation Analysis](#current-implementation-analysis)
3. [Database Schema](#database-schema)
4. [File Structure](#file-structure)
5. [Core Types](#core-types)
6. [Server-Side Service](#server-side-service)
7. [API Routes](#api-routes)
8. [UI Components](#ui-components)
9. [Integration Points](#integration-points)
10. [Future Extensibility](#future-extensibility)

---

## Overview

### Goal

Whenever a user creates, updates, or deletes any service (Apps, Database, Kubernetes, Object Storage, etc.), a notification must be generated and displayed in the dashboard top bar.

### Requirements

Each notification should include:
- **type**: `success` | `info` | `warning` | `error`
- **message**: Human-readable description of the action
- **timestamp**: When the notification was created
- **read/unread state**: Track whether user has seen the notification

The notification icon in the top bar should:
- Show a badge/count when there are unread notifications
- Visually indicate new activity (number, dot, or alert)

### Design Principles

1. **Centralized notification service** - All notifications flow through `NotificationService.create()`
2. **Helper function for consistency** - `createServiceNotification()` ensures uniform message formatting
3. **Database-backed persistence** - Notifications stored in Supabase with RLS for security
4. **Polling with real-time upgrade path** - Start with 30-second polling, easy to add Supabase Realtime later
5. **Pagination-ready** - API supports `limit/offset` from day one
6. **Type-safe** - Full TypeScript types for notifications, service types, and actions

---

## Current Implementation Analysis

### Services under `app/dashboard/services/`

| Service | Pages | Components | API Routes |
|---------|-------|------------|------------|
| **Apps (Platform Apps)** | `apps/page.tsx`, `apps/[id]/page.tsx`, `apps/new/page.tsx` | `components/dashboard/apps/*` | `/api/services/platform-apps/create`, `/delete`, `/update`, etc. |
| **Database** | `database/page.tsx` | `components/dashboard/database/*` | `/api/services/database/create`, `/delete`, `/update`, etc. |
| **Kubernetes** | `kubernetes/page.tsx` | `components/dashboard/kubernetes/*` | `/api/services/kubernetes/clusters/*` |
| **Object Storage** | `object-storage/page.tsx` | `components/dashboard/object-storage/*` | `/api/services/object-storage/buckets/*` |
| **Network DDoS** | `network-ddos/page.tsx` | `components/dashboard/network-ddos/*` | `/api/ddos/*` |
| **Game Servers** | `game/page.tsx` | `components/dashboard/game/*` | `/api/services/game/*` |
| **Compute (VPS/Bare Metal)** | `compute/vps/*`, `compute/bare-metal/*` | `components/dashboard/compute/*` | `/api/services/compute/*` |

### Existing Infrastructure

- **Activities table** exists in Supabase (`activities`) with fields: `id`, `cluster_name`, `cluster_type`, `action`, `owner_id`, `project_id`, `created_at`
- **Dashboard Provider** (`app/dashboard/provider.tsx`) manages user session and projects state
- **Toast notifications** (via `sonner`) used for immediate feedback
- **Sidebar** has `Bell` icon in user menu but no notification system implemented

---

## Database Schema

### New `notifications` Table

```sql
-- Create notifications table
CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('success', 'info', 'warning', 'error')),
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  service_type TEXT NOT NULL, -- 'platform_app', 'database', 'kubernetes', 'object_storage', etc.
  service_id UUID, -- Optional reference to the affected service
  action TEXT NOT NULL, -- 'created', 'updated', 'deleted', 'deployed', 'failed', etc.
  is_read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  read_at TIMESTAMPTZ,
  metadata JSONB -- Additional context (e.g., app name, error details)
);

-- Indexes for performance
CREATE INDEX idx_notifications_user_unread ON notifications(user_id, is_read) WHERE is_read = FALSE;
CREATE INDEX idx_notifications_user_created ON notifications(user_id, created_at DESC);

-- Enable Row Level Security
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view own notifications" ON notifications
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can update own notifications" ON notifications
  FOR UPDATE USING (auth.uid() = user_id);

-- Service role can insert (for server-side creation)
CREATE POLICY "Service role can insert notifications" ON notifications
  FOR INSERT WITH CHECK (true);
```

### Migration File

Create: `supabase/migrations/YYYYMMDDHHMMSS_create_notifications_table.sql`

---

## File Structure

```
lib/
├── notifications/
│   ├── index.ts              # Barrel export
│   ├── types.ts              # Notification types
│   ├── service.ts            # Server-side notification creation
│   └── hooks.ts              # Client-side hooks (useNotifications)

components/
├── dashboard/
│   ├── notifications/
│   │   ├── index.tsx                  # Barrel export
│   │   ├── notification-bell.tsx      # Bell icon with badge
│   │   ├── notification-dropdown.tsx  # Dropdown panel
│   │   ├── notification-item.tsx      # Individual notification
│   │   └── notification-provider.tsx  # Context provider (optional)

app/
├── api/
│   ├── notifications/
│   │   ├── route.ts            # GET (list) notifications
│   │   ├── mark-read/
│   │   │   └── route.ts        # POST mark as read
│   │   └── count/
│   │       └── route.ts        # GET unread count
```

---

## Core Types

### `lib/notifications/types.ts`

```typescript
export type NotificationType = 'success' | 'info' | 'warning' | 'error';

export type ServiceType = 
  | 'platform_app' 
  | 'database' 
  | 'kubernetes' 
  | 'object_storage'
  | 'network_ddos'
  | 'compute'
  | 'game_server'
  | 'firewall'
  | 'spectrum';

export type ActionType = 
  | 'created' 
  | 'updated' 
  | 'deleted' 
  | 'deployed'
  | 'failed'
  | 'scaled'
  | 'restarted'
  | 'migrated'
  | 'resized';

export interface Notification {
  id: string;
  user_id: string;
  type: NotificationType;
  title: string;
  message: string;
  service_type: ServiceType;
  service_id?: string;
  action: ActionType;
  is_read: boolean;
  created_at: string;
  read_at?: string;
  metadata?: Record<string, unknown>;
}

export interface CreateNotificationParams {
  user_id: string;
  type: NotificationType;
  title: string;
  message: string;
  service_type: ServiceType;
  service_id?: string;
  action: ActionType;
  metadata?: Record<string, unknown>;
}
```

---

## Server-Side Service

### `lib/notifications/service.ts`

```typescript
import { createServiceClient } from "@/lib/supabase/server";
import { CreateNotificationParams, Notification, ServiceType, ActionType, NotificationType } from "./types";

export const NotificationService = {
  /**
   * Create a new notification
   */
  async create(params: CreateNotificationParams): Promise<{ success: boolean; id?: string; error?: string }> {
    try {
      const supabase = await createServiceClient();
      const { data, error } = await supabase
        .from("notifications")
        .insert(params)
        .select("id")
        .single();

      if (error) {
        console.error(`[NotificationService.create] Error: ${error.message}`);
        return { success: false, error: error.message };
      }
      return { success: true, id: data.id };
    } catch (err) {
      console.error(`[NotificationService.create] Error: ${err}`);
      return { success: false, error: String(err) };
    }
  },

  /**
   * Get notifications for a user with pagination
   */
  async getByUserId(userId: string, options?: { 
    limit?: number; 
    offset?: number; 
    unreadOnly?: boolean 
  }): Promise<Notification[]> {
    const { limit = 20, offset = 0, unreadOnly = false } = options || {};
    try {
      const supabase = await createServiceClient();
      let query = supabase
        .from("notifications")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .range(offset, offset + limit - 1);

      if (unreadOnly) {
        query = query.eq("is_read", false);
      }

      const { data, error } = await query;
      if (error) {
        console.error(`[NotificationService.getByUserId] Error: ${error.message}`);
        return [];
      }
      return data || [];
    } catch (err) {
      console.error(`[NotificationService.getByUserId] Error: ${err}`);
      return [];
    }
  },

  /**
   * Get count of unread notifications
   */
  async getUnreadCount(userId: string): Promise<number> {
    try {
      const supabase = await createServiceClient();
      const { count, error } = await supabase
        .from("notifications")
        .select("*", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("is_read", false);

      if (error) return 0;
      return count || 0;
    } catch {
      return 0;
    }
  },

  /**
   * Mark a single notification as read
   */
  async markAsRead(notificationId: string, userId: string): Promise<boolean> {
    try {
      const supabase = await createServiceClient();
      const { error } = await supabase
        .from("notifications")
        .update({ is_read: true, read_at: new Date().toISOString() })
        .eq("id", notificationId)
        .eq("user_id", userId);

      return !error;
    } catch {
      return false;
    }
  },

  /**
   * Mark all notifications as read for a user
   */
  async markAllAsRead(userId: string): Promise<boolean> {
    try {
      const supabase = await createServiceClient();
      const { error } = await supabase
        .from("notifications")
        .update({ is_read: true, read_at: new Date().toISOString() })
        .eq("user_id", userId)
        .eq("is_read", false);

      return !error;
    } catch {
      return false;
    }
  },

  /**
   * Delete old notifications (cleanup job)
   */
  async deleteOlderThan(days: number = 30): Promise<number> {
    try {
      const supabase = await createServiceClient();
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - days);

      const { data, error } = await supabase
        .from("notifications")
        .delete()
        .lt("created_at", cutoffDate.toISOString())
        .select("id");

      if (error) return 0;
      return data?.length || 0;
    } catch {
      return 0;
    }
  }
};

/**
 * Helper function for creating consistent service notifications
 */
export function createServiceNotification(
  userId: string,
  serviceType: ServiceType,
  action: ActionType,
  serviceName: string,
  options?: { 
    serviceId?: string; 
    error?: string;
    metadata?: Record<string, unknown>;
  }
): CreateNotificationParams {
  const { serviceId, error, metadata } = options || {};
  
  const actionMessages: Record<ActionType, { type: NotificationType; verb: string }> = {
    created: { type: 'success', verb: 'created' },
    updated: { type: 'info', verb: 'updated' },
    deleted: { type: 'warning', verb: 'deleted' },
    deployed: { type: 'success', verb: 'deployed' },
    failed: { type: 'error', verb: 'failed' },
    scaled: { type: 'info', verb: 'scaled' },
    restarted: { type: 'info', verb: 'restarted' },
    migrated: { type: 'success', verb: 'migrated' },
    resized: { type: 'info', verb: 'resized' },
  };

  const serviceLabels: Record<ServiceType, string> = {
    platform_app: 'Application',
    database: 'Database',
    kubernetes: 'Kubernetes Cluster',
    object_storage: 'Storage Bucket',
    network_ddos: 'DDoS Protection',
    compute: 'Compute Instance',
    game_server: 'Game Server',
    firewall: 'Firewall Rule',
    spectrum: 'Spectrum App',
  };

  const { type, verb } = actionMessages[action];
  const serviceLabel = serviceLabels[serviceType];

  return {
    user_id: userId,
    type: error ? 'error' : type,
    title: `${serviceLabel} ${verb.charAt(0).toUpperCase() + verb.slice(1)}`,
    message: error 
      ? `Failed to ${verb} ${serviceLabel.toLowerCase()} "${serviceName}": ${error}`
      : `${serviceLabel} "${serviceName}" has been ${verb} successfully.`,
    service_type: serviceType,
    service_id: serviceId,
    action,
    metadata: { ...metadata, serviceName, error },
  };
}
```

---

## API Routes

### `app/api/notifications/route.ts` - List Notifications

```typescript
import { NextResponse } from "next/server";
import { authenticateUser } from "@/lib/auth/server-auth";
import { NotificationService } from "@/lib/notifications/service";

export async function GET(req: Request) {
  const auth = await authenticateUser();
  if (!auth.authenticated) return auth.response;

  const { searchParams } = new URL(req.url);
  const limit = parseInt(searchParams.get("limit") || "20");
  const offset = parseInt(searchParams.get("offset") || "0");
  const unreadOnly = searchParams.get("unread") === "true";

  const notifications = await NotificationService.getByUserId(auth.user!.id, {
    limit: Math.min(limit, 100), // Cap at 100
    offset,
    unreadOnly,
  });

  return NextResponse.json({ notifications });
}
```

### `app/api/notifications/count/route.ts` - Unread Count

```typescript
import { NextResponse } from "next/server";
import { authenticateUser } from "@/lib/auth/server-auth";
import { NotificationService } from "@/lib/notifications/service";

export async function GET() {
  const auth = await authenticateUser();
  if (!auth.authenticated) return auth.response;

  const count = await NotificationService.getUnreadCount(auth.user!.id);
  return NextResponse.json({ count });
}
```

### `app/api/notifications/mark-read/route.ts` - Mark as Read

```typescript
import { NextRequest, NextResponse } from "next/server";
import { authenticateUser } from "@/lib/auth/server-auth";
import { NotificationService } from "@/lib/notifications/service";
import { z } from "zod";

const markReadSchema = z.object({
  id: z.string().uuid().optional(),
  all: z.boolean().optional(),
}).refine(data => data.id || data.all, {
  message: "Either 'id' or 'all' must be provided"
});

export async function POST(req: NextRequest) {
  const auth = await authenticateUser();
  if (!auth.authenticated) return auth.response;

  try {
    const body = await req.json();
    const parsed = markReadSchema.safeParse(body);
    
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { id, all } = parsed.data;

    if (all) {
      const success = await NotificationService.markAllAsRead(auth.user!.id);
      return NextResponse.json({ success });
    } else if (id) {
      const success = await NotificationService.markAsRead(id, auth.user!.id);
      return NextResponse.json({ success });
    }

    return NextResponse.json({ success: false, error: "No action taken" });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to mark notification as read" },
      { status: 500 }
    );
  }
}
```

---

## UI Components

### `components/dashboard/notifications/notification-bell.tsx`

```typescript
'use client';

import { Bell } from 'lucide-react';
import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { NotificationDropdown } from './notification-dropdown';
import api from '@/lib/axios/axios';

export function NotificationBell() {
  const [unreadCount, setUnreadCount] = useState(0);
  const [isOpen, setIsOpen] = useState(false);

  const fetchUnreadCount = useCallback(async () => {
    try {
      const res = await api.get('/notifications/count');
      setUnreadCount(res.data.count || 0);
    } catch (error) {
      console.error('[NotificationBell] Failed to fetch count:', error);
    }
  }, []);

  useEffect(() => {
    fetchUnreadCount();
    // Poll every 30 seconds for new notifications
    const interval = setInterval(fetchUnreadCount, 30000);
    return () => clearInterval(interval);
  }, [fetchUnreadCount]);

  // Refresh count when dropdown closes
  const handleOpenChange = (open: boolean) => {
    setIsOpen(open);
    if (!open) {
      fetchUnreadCount();
    }
  };

  return (
    <DropdownMenu open={isOpen} onOpenChange={handleOpenChange}>
      <DropdownMenuTrigger asChild>
        <Button 
          variant="ghost" 
          size="icon" 
          className="relative text-slate-400 hover:text-white hover:bg-slate-800/50"
        >
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-xs font-bold text-white animate-pulse">
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent 
        align="end" 
        className="w-80 max-h-[500px] overflow-hidden p-0 bg-slate-900 border-slate-700"
      >
        <NotificationDropdown 
          onClose={() => setIsOpen(false)} 
          onRead={fetchUnreadCount}
        />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
```

### `components/dashboard/notifications/notification-dropdown.tsx`

```typescript
'use client';

import { useState, useEffect } from 'react';
import { Check, CheckCheck, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { NotificationItem } from './notification-item';
import { Notification } from '@/lib/notifications/types';
import api from '@/lib/axios/axios';

interface NotificationDropdownProps {
  onClose: () => void;
  onRead: () => void;
}

export function NotificationDropdown({ onClose, onRead }: NotificationDropdownProps) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [markingAll, setMarkingAll] = useState(false);

  useEffect(() => {
    const fetchNotifications = async () => {
      try {
        const res = await api.get('/notifications?limit=20');
        setNotifications(res.data.notifications || []);
      } catch (error) {
        console.error('[NotificationDropdown] Failed to fetch:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchNotifications();
  }, []);

  const handleMarkAsRead = async (id: string) => {
    try {
      await api.post('/notifications/mark-read', { id });
      setNotifications(prev => 
        prev.map(n => n.id === id ? { ...n, is_read: true } : n)
      );
      onRead();
    } catch (error) {
      console.error('[NotificationDropdown] Failed to mark as read:', error);
    }
  };

  const handleMarkAllAsRead = async () => {
    setMarkingAll(true);
    try {
      await api.post('/notifications/mark-read', { all: true });
      setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
      onRead();
    } catch (error) {
      console.error('[NotificationDropdown] Failed to mark all as read:', error);
    } finally {
      setMarkingAll(false);
    }
  };

  const unreadCount = notifications.filter(n => !n.is_read).length;

  return (
    <div className="flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-slate-700">
        <h3 className="font-semibold text-white">Notifications</h3>
        {unreadCount > 0 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={handleMarkAllAsRead}
            disabled={markingAll}
            className="text-xs text-slate-400 hover:text-white"
          >
            {markingAll ? (
              <Loader2 className="h-3 w-3 mr-1 animate-spin" />
            ) : (
              <CheckCheck className="h-3 w-3 mr-1" />
            )}
            Mark all read
          </Button>
        )}
      </div>

      {/* Content */}
      <ScrollArea className="max-h-[400px]">
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
          </div>
        ) : notifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-slate-400">
            <Check className="h-8 w-8 mb-2" />
            <p className="text-sm">No notifications</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-800">
            {notifications.map((notification) => (
              <NotificationItem
                key={notification.id}
                notification={notification}
                onMarkAsRead={handleMarkAsRead}
              />
            ))}
          </div>
        )}
      </ScrollArea>

      {/* Footer */}
      {notifications.length > 0 && (
        <div className="p-2 border-t border-slate-700">
          <Button
            variant="ghost"
            size="sm"
            className="w-full text-slate-400 hover:text-white"
            onClick={onClose}
          >
            View all notifications
          </Button>
        </div>
      )}
    </div>
  );
}
```

### `components/dashboard/notifications/notification-item.tsx`

```typescript
'use client';

import { formatDistanceToNow } from 'date-fns';
import { 
  CheckCircle2, 
  Info, 
  AlertTriangle, 
  XCircle,
  Circle 
} from 'lucide-react';
import { Notification, NotificationType } from '@/lib/notifications/types';
import { cn } from '@/lib/utils';

interface NotificationItemProps {
  notification: Notification;
  onMarkAsRead: (id: string) => void;
}

const iconMap: Record<NotificationType, React.ElementType> = {
  success: CheckCircle2,
  info: Info,
  warning: AlertTriangle,
  error: XCircle,
};

const colorMap: Record<NotificationType, string> = {
  success: 'text-green-400',
  info: 'text-blue-400',
  warning: 'text-yellow-400',
  error: 'text-red-400',
};

export function NotificationItem({ notification, onMarkAsRead }: NotificationItemProps) {
  const Icon = iconMap[notification.type];
  const iconColor = colorMap[notification.type];

  const handleClick = () => {
    if (!notification.is_read) {
      onMarkAsRead(notification.id);
    }
  };

  return (
    <div
      onClick={handleClick}
      className={cn(
        "flex items-start gap-3 p-4 cursor-pointer transition-colors",
        notification.is_read 
          ? "bg-transparent hover:bg-slate-800/30" 
          : "bg-slate-800/50 hover:bg-slate-800/70"
      )}
    >
      {/* Unread indicator */}
      <div className="flex-shrink-0 mt-1">
        {!notification.is_read ? (
          <Circle className="h-2 w-2 fill-blue-500 text-blue-500" />
        ) : (
          <div className="h-2 w-2" />
        )}
      </div>

      {/* Icon */}
      <div className={cn("flex-shrink-0 mt-0.5", iconColor)}>
        <Icon className="h-5 w-5" />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <p className={cn(
          "text-sm",
          notification.is_read ? "text-slate-300" : "text-white font-medium"
        )}>
          {notification.title}
        </p>
        <p className="text-xs text-slate-400 mt-0.5 line-clamp-2">
          {notification.message}
        </p>
        <p className="text-xs text-slate-500 mt-1">
          {formatDistanceToNow(new Date(notification.created_at), { addSuffix: true })}
        </p>
      </div>
    </div>
  );
}
```

### `components/dashboard/notifications/index.tsx` - Barrel Export

```typescript
export { NotificationBell } from './notification-bell';
export { NotificationDropdown } from './notification-dropdown';
export { NotificationItem } from './notification-item';
```

---

## Integration Points

### Update Dashboard Layout

**File: `app/dashboard/layout.tsx`**

```typescript
import { AppSidebar } from "@/components/dashboard/sidebar";
import { requireAuthProfile } from "@/lib/supabase/auth";
import { SessionProvider } from "./provider";
import { Projects } from "@/lib/supabase/queries/projects";
import { NotificationBell } from "@/components/dashboard/notifications";

interface DashboardLayoutProps {
  children: React.ReactNode;
}

export default async function DashboardLayout({
  children,
}: DashboardLayoutProps) {
  const user = await requireAuthProfile();
  const projects = await Projects.get_all_by_user(user.id);

  return (
    <SessionProvider initialUser={user} initialProjects={projects}>
      <div className="flex h-screen bg-black">
        <AppSidebar projects={projects} user={user} />
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Dashboard Header with Notifications */}
          <header className="h-14 border-b border-slate-800/50 flex items-center justify-end px-4 sm:px-6 bg-black/50 backdrop-blur-sm">
            <NotificationBell />
          </header>
          <main className="flex-1 overflow-y-auto">
            {children}
          </main>
        </div>
      </div>
    </SessionProvider>
  );
}
```

### Integrate with Service API Routes

Add notification creation to each service's create/update/delete routes:

#### Platform Apps - Create (`app/api/services/platform-apps/create/route.ts`)

```typescript
// Add import at top
import { NotificationService, createServiceNotification } from "@/lib/notifications/service";

// After successful creation (around line ~180, after billing):
await NotificationService.create(
  createServiceNotification(
    auth.user!.id,
    'platform_app',
    'created',
    appData.name,
    { serviceId: data.id, metadata: { framework: appData.framework } }
  )
);

// On failure (in catch block):
await NotificationService.create(
  createServiceNotification(
    auth.user!.id,
    'platform_app',
    'failed',
    appData.name,
    { error: errorMessage }
  )
);
```

#### Platform Apps - Delete (`app/api/services/platform-apps/delete/route.ts`)

```typescript
// Add import at top
import { NotificationService, createServiceNotification } from "@/lib/notifications/service";

// After successful deletion:
await NotificationService.create(
  createServiceNotification(
    auth.user!.id,
    'platform_app',
    'deleted',
    appName,
    { serviceId: app_id }
  )
);
```

#### Database - Create (`app/api/services/database/create/route.ts`)

```typescript
// Add import at top
import { NotificationService, createServiceNotification } from "@/lib/notifications/service";

// After successful creation:
await NotificationService.create(
  createServiceNotification(
    validatedData.owner_id,
    'database',
    'created',
    validatedData.name,
    { 
      serviceId: database.data.database.id,
      metadata: { engine: validatedData.engine, region: validatedData.region }
    }
  )
);
```

#### Kubernetes - Create (`app/api/services/kubernetes/clusters/route.ts`)

```typescript
// Add import at top
import { NotificationService, createServiceNotification } from "@/lib/notifications/service";

// After successful creation:
await NotificationService.create(
  createServiceNotification(
    parsed.data.ownerId,
    'kubernetes',
    'created',
    parsed.data.cluster.name,
    { 
      serviceId: clusterId,
      metadata: { k8s_version: parsed.data.cluster.k8s_minor }
    }
  )
);
```

#### Object Storage - Create (`app/api/services/object-storage/buckets/create/route.ts`)

```typescript
// Add import at top
import { NotificationService, createServiceNotification } from "@/lib/notifications/service";

// After successful creation:
await NotificationService.create(
  createServiceNotification(
    targetOwnerId,
    'object_storage',
    'created',
    validatedData.name,
    { 
      serviceId: result.data.id,
      metadata: { region: validatedData.region }
    }
  )
);
```

---

## Future Extensibility

| Feature | Implementation Approach |
|---------|------------------------|
| **Real-time updates** | Add Supabase Realtime subscription in `NotificationBell` component using `supabase.channel('notifications').on('postgres_changes', ...)` |
| **Pagination** | Already supported via `limit/offset` in API. Add "Load more" button in dropdown. |
| **Notification preferences** | Create `notification_preferences` table with columns: `user_id`, `email_enabled`, `push_enabled`, `types_enabled[]` |
| **Email notifications** | In `NotificationService.create()`, check preferences and trigger email via Resend for critical notifications |
| **Push notifications** | Integrate Web Push API, store push subscriptions in `push_subscriptions` table |
| **Notification grouping** | Add `group_key` column, aggregate similar notifications in UI |
| **Auto-cleanup** | Create scheduled Supabase Edge Function to run `NotificationService.deleteOlderThan(30)` daily |
| **Notification center page** | Create `app/dashboard/notifications/page.tsx` with full list, filters, and search |

### Real-time Subscription Example

```typescript
// In notification-bell.tsx, add Supabase Realtime:
useEffect(() => {
  const supabase = createClient();
  
  const channel = supabase
    .channel('notifications')
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'notifications',
        filter: `user_id=eq.${userId}`,
      },
      (payload) => {
        setUnreadCount(prev => prev + 1);
        // Optionally show toast for new notification
        toast.info(payload.new.title);
      }
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}, [userId]);
```

---

## Implementation Checklist

- [ ] Create Supabase migration for `notifications` table
- [ ] Run migration in development/production
- [ ] Create `lib/notifications/types.ts`
- [ ] Create `lib/notifications/service.ts`
- [ ] Create `lib/notifications/index.ts`
- [ ] Create `app/api/notifications/route.ts`
- [ ] Create `app/api/notifications/count/route.ts`
- [ ] Create `app/api/notifications/mark-read/route.ts`
- [ ] Create `components/dashboard/notifications/notification-item.tsx`
- [ ] Create `components/dashboard/notifications/notification-dropdown.tsx`
- [ ] Create `components/dashboard/notifications/notification-bell.tsx`
- [ ] Create `components/dashboard/notifications/index.tsx`
- [ ] Update `app/dashboard/layout.tsx` to include header with `NotificationBell`
- [ ] Integrate notification creation in Platform Apps routes
- [ ] Integrate notification creation in Database routes
- [ ] Integrate notification creation in Kubernetes routes
- [ ] Integrate notification creation in Object Storage routes
- [ ] Test notification flow end-to-end
- [ ] Add real-time subscription (optional phase 2)

---

## Dependencies

The following packages should already be installed:

- `date-fns` - For relative time formatting
- `lucide-react` - For icons
- `sonner` - For toast notifications (existing)
- `zod` - For request validation

If `date-fns` is not installed:

```bash
npm install date-fns
```

---

## Security Considerations

1. **Row Level Security (RLS)** - Users can only view/update their own notifications
2. **Service Role for Inserts** - Only server-side code can create notifications
3. **Rate Limiting** - Apply rate limits to notification API routes
4. **Input Validation** - All API inputs validated with Zod schemas
5. **No Sensitive Data** - Avoid storing sensitive information in `metadata` field
