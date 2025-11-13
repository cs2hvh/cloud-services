# Database Settings Updates & Migration Tracking

## Summary
This document outlines the updates made to synchronize database changes with Supabase and implement migration status tracking.

## Changes Implemented

### 1. **Supabase Query Methods** (`lib/supabase/queries.ts`)
Added three new methods to the `Database_Clusters` object:

- **`update_project(cluster_id, project_id)`**
  - Updates the project assignment for a database cluster
  - Stores project_id in the database_clusters table

- **`update_region(cluster_id, region, status)`**
  - Updates both the region and status fields
  - Used to set status to "migrating" when migration starts
  - Sets status to "online" when migration completes

- **`update_maintenance_window(cluster_id, window)`**
  - Stores maintenance window configuration (day and hour)
  - Window follows GMT timezone

### 2. **TypeScript Type Updates** (`lib/supabase/types.ts`)
Updated `database_clusters.Row` type definition:

- Added `"migrating"` to the status union type
- Added optional `window?: { day: string; hour: string }` field

### 3. **API Endpoints**

#### **Project Update API** (`/api/services/database/update`)
- **Method**: PUT
- **Purpose**: Assign database cluster to a project
- **Body**: `{ cluster_id, project_id }`
- **Action**: Calls `Database_Clusters.update_project()` to persist in Supabase

#### **Region Migration API** (`/api/services/database/region`)
- **Method**: PUT
- **Updated**: Now calls `Database_Clusters.update_region()` after successful DigitalOcean API call
- **Action**: Sets status to "migrating" in Supabase when migration starts

#### **Migration Status Check API** (`/api/services/database/readForMigrate`)
- **Method**: GET
- **Purpose**: Poll DigitalOcean API to check if migration is complete
- **Query Params**: `database_id`, `target_region`
- **Logic**: 
  - Fetches cluster from DigitalOcean API
  - Checks if `cluster.region === target_region` AND `cluster.status === "online"`
  - If complete, updates Supabase status to "online"
- **Returns**: `{ migration_complete, current_region, current_status, target_region }`

#### **Maintenance Window Read API** (`/api/services/database/maintenance/read`)
- **Method**: GET
- **Purpose**: Fetch current maintenance window from DigitalOcean
- **Query Params**: `database_id`
- **Returns**: `{ maintenance_window: { day, hour } | null }`

#### **Maintenance Window Update API** (`/api/services/database/maintenance`)
- **Method**: PUT
- **Updated**: Now calls `Database_Clusters.update_maintenance_window()` after successful DigitalOcean API call
- **Action**: Persists maintenance window to Supabase

### 4. **Settings Tab UI Updates** (`components/dashboard/database/tabs/settings-tab.tsx`)

#### **Project Section**
- Integrated with new `/api/services/database/update` endpoint
- Updates reflect immediately in Supabase database

#### **Maintenance Window Section**
- **On Mount**: Fetches current maintenance window from DigitalOcean API
- **Display**: Shows current maintenance window in blue info box with Clock icon
- **Time Zone**: Changed from UTC to GMT (as per requirement)
- **Visual Indicators**: Shows tick marks (✓) next to current day and hour in dropdowns
- **Persistence**: Updates saved to both DigitalOcean and Supabase

#### **Region Migration Section**
- **Migration Status Tracking**: 
  - Shows "Migration In Progress" banner with animated spinner when migrating
  - Displays target region and estimated time (10-30 minutes)
  - Disables region selector during migration
- **Polling Mechanism**:
  - Polls `/api/services/database/readForMigrate` every 60 seconds when status is "migrating"
  - Automatically updates UI when migration completes
  - Shows success toast notification on completion
- **Status Updates**: Sets status to "migrating" in Supabase when migration starts

### 5. **Database List Page Updates** (`app/dashboard/services/database/page.tsx`)

- **Status Badge**: Added orange color for "migrating" status
- **View Cluster Button**:
  - Disabled when `status === "migrating"`
  - Shows tooltip: "Cluster is currently migrating"
  - Button appears grayed out with cursor-not-allowed

## Data Flow

### Project Update Flow
1. User selects project in Settings tab
2. Frontend calls `PUT /api/services/database/update`
3. API updates Supabase via `Database_Clusters.update_project()`
4. Success toast shown, UI refreshed

### Region Migration Flow
1. User selects new region in Settings tab
2. Frontend calls `PUT /api/services/database/region`
3. API calls DigitalOcean API to initiate migration
4. On success, API calls `Database_Clusters.update_region()` with status="migrating"
5. UI starts polling every 60 seconds via `readForMigrate` API
6. When migration completes (region matches and status is online):
   - `readForMigrate` API updates Supabase status to "online"
   - Polling stops
   - Success notification shown
   - UI refreshed

### Maintenance Window Flow
1. **On Load**: Frontend calls `GET /api/services/database/maintenance/read`
2. Current values displayed with tick marks in dropdowns
3. User modifies day/hour
4. Frontend calls `PUT /api/services/database/maintenance`
5. API updates DigitalOcean maintenance window
6. On success, API calls `Database_Clusters.update_maintenance_window()`
7. Maintenance window persisted in Supabase

## Key Features

✅ **Database Synchronization**: All changes to DigitalOcean clusters are reflected in Supabase
✅ **Migration Tracking**: Real-time status updates with automatic polling
✅ **User Feedback**: Visual indicators, loading states, and toast notifications
✅ **GMT Timezone**: Maintenance windows follow GMT standard
✅ **Disabled States**: View cluster button disabled during migration
✅ **Error Handling**: Comprehensive error messages and fallbacks
✅ **Type Safety**: Full TypeScript support with updated type definitions

## Testing Checklist

- [ ] Test project assignment updates
- [ ] Test maintenance window configuration
- [ ] Test region migration initiation
- [ ] Verify migration polling (wait 1 minute to see polling)
- [ ] Test migration completion (may take 10-30 minutes)
- [ ] Verify "View Cluster" button is disabled during migration
- [ ] Check tooltip appears on hover
- [ ] Verify tick marks appear in maintenance window dropdowns
- [ ] Test cancel buttons reset to original values
- [ ] Verify all changes persist in Supabase database

## Notes

- Migration polling interval: 60 seconds (1 minute)
- Expected migration time: 10-30 minutes
- All APIs include proper error handling
- Supabase updates gracefully handle failures (DigitalOcean update still succeeds)
- Current maintenance window fetched from DigitalOcean API on component mount
