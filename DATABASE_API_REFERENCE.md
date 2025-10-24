# Database Management API Reference

**Date:** October 24, 2025  
**Status:** ✅ Implemented  
**Pattern:** Mirrors User Management Implementation

---

## 📋 Overview

This document describes the database instance management APIs for DigitalOcean database clusters. The implementation follows the same pattern as the user management APIs, providing CRUD operations for databases within clusters.

---

## 🗄️ Database Schema

### Migration File
**Location:** `supabase/migrations/add_dbs_column.sql`

```sql
ALTER TABLE database_cluster 
ADD COLUMN IF NOT EXISTS dbs JSONB DEFAULT '[]'::jsonb;
```

### Database Structure
```typescript
interface DatabaseInstance {
  id: string;           // Database name (unique identifier)
  name: string;         // Database name
  created_at: string;   // ISO timestamp
}
```

Stored in `database_cluster.dbs` as JSONB array with GIN index for efficient queries.

---

## 🔧 Supabase Query Functions

**Location:** `lib/supabase/queries.ts`

| Function | Purpose | Parameters |
|----------|---------|------------|
| `Database_Clusters.add_db()` | Add database to array | `cluster_id`, `database` |
| `Database_Clusters.remove_db()` | Remove database from array | `cluster_id`, `db_name` |
| `Database_Clusters.update_dbs()` | Replace entire databases array | `cluster_id`, `databases[]` |
| `Database_Clusters.get_dbs()` | Get databases for cluster | `cluster_id` |

### Function Details

#### `add_db(cluster_id: string, database: DatabaseInstance)`
Adds a new database to the cluster's database array.

**Returns:**
```typescript
{ success: boolean, data?: any, error?: string }
```

#### `remove_db(cluster_id: string, db_name: string)`
Removes a database from the cluster by name.

**Returns:**
```typescript
{ success: boolean, data?: any, error?: string }
```

#### `update_dbs(cluster_id: string, databases: DatabaseInstance[])`
Replaces the entire databases array (used for syncing from DigitalOcean).

**Returns:**
```typescript
{ success: boolean, data?: any, error?: string }
```

#### `get_dbs(cluster_id: string)`
Retrieves all databases for a specific cluster.

**Returns:**
```typescript
{ success: boolean, data: DatabaseInstance[], error?: string }
```

---

## 🌐 API Endpoints

### 1. Create Database

**Endpoint:** `POST /api/services/database/dbs/create`

**Request Body:**
```json
{
  "cluster_id": "database-cluster-id",
  "name": "my_new_database"
}
```

**Success Response (200):**
```json
{
  "data": {
    "name": "my_new_database"
  },
  "message": "Database created successfully"
}
```

**Error Response (400/500):**
```json
{
  "error": "Error message",
  "details": "Additional details if available"
}
```

**Process Flow:**
1. Validates `cluster_id` and `name`
2. Calls DigitalOcean API: `POST /v2/databases/{cluster_id}/dbs`
3. On success (201), formats database data
4. Syncs to Supabase via `Database_Clusters.add_db()`
5. Returns success response

---

### 2. Delete Database

**Endpoint:** `POST /api/services/database/dbs/delete`

**Request Body:**
```json
{
  "cluster_id": "database-cluster-id",
  "db_name": "database_to_delete"
}
```

**Success Response (200):**
```json
{
  "message": "Database deleted successfully"
}
```

**Error Response (400/500):**
```json
{
  "error": "Error message",
  "details": "Additional details if available"
}
```

**Process Flow:**
1. Validates `cluster_id` and `db_name`
2. Calls DigitalOcean API: `DELETE /v2/databases/{cluster_id}/dbs/{db_name}`
3. On success (204), removes from Supabase via `Database_Clusters.remove_db()`
4. Returns success response

---

### 3. List All Databases

**Endpoint:** `POST /api/services/database/dbs/list`

**Request Body:**
```json
{
  "cluster_id": "database-cluster-id"
}
```

**Success Response (200):**
```json
{
  "data": [
    {
      "name": "defaultdb"
    },
    {
      "name": "my_database"
    }
  ],
  "message": "Databases fetched and synced successfully"
}
```

**Error Response (400):**
```json
{
  "error": "Error message"
}
```

**Process Flow:**
1. Validates `cluster_id`
2. Calls DigitalOcean API: `GET /v2/databases/{cluster_id}/dbs`
3. Formats databases data
4. Syncs with Supabase via `Database_Clusters.update_dbs()`
5. Returns databases list (even if sync fails, with warning)

---

### 4. Retrieve Specific Database

**Endpoint:** `POST /api/services/database/dbs/retrieve`

**Request Body:**
```json
{
  "cluster_id": "database-cluster-id",
  "db_name": "my_database"
}
```

**Success Response (200):**
```json
{
  "data": {
    "name": "my_database"
  },
  "message": "Database retrieved successfully"
}
```

**Error Response (400):**
```json
{
  "error": "Error message"
}
```

**Process Flow:**
1. Validates `cluster_id` and `db_name`
2. Calls DigitalOcean API: `GET /v2/databases/{cluster_id}/dbs/{db_name}`
3. Returns database details directly from DigitalOcean

**Note:** This endpoint fetches directly from DigitalOcean and does not sync to Supabase.

---

## 🔑 DigitalOcean API Reference

### Base URL
```
https://api.digitalocean.com/v2
```

### Authentication
All requests require the `Authorization` header:
```
Authorization: Bearer ${DIGITAL_OCEAN_TOKEN}
```

### Endpoints Used

| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `/databases/{cluster_id}/dbs` | Create new database |
| DELETE | `/databases/{cluster_id}/dbs/{db_name}` | Delete database |
| GET | `/databases/{cluster_id}/dbs` | List all databases |
| GET | `/databases/{cluster_id}/dbs/{db_name}` | Get specific database |

---

## 📝 Usage Examples

### Example 1: Create Database
```typescript
const response = await fetch('/api/services/database/dbs/create', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    cluster_id: 'abc-123-xyz',
    name: 'production_db'
  })
});

const result = await response.json();
```

### Example 2: List Databases
```typescript
const response = await fetch('/api/services/database/dbs/list', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    cluster_id: 'abc-123-xyz'
  })
});

const result = await response.json();
console.log(result.data); // Array of databases
```

### Example 3: Delete Database
```typescript
const response = await fetch('/api/services/database/dbs/delete', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    cluster_id: 'abc-123-xyz',
    db_name: 'old_database'
  })
});

const result = await response.json();
```

### Example 4: Direct Supabase Query
```typescript
import { Database_Clusters } from '@/lib/supabase/queries';

// Get databases for a cluster
const result = await Database_Clusters.get_dbs('cluster-id');
if (result.success) {
  console.log(result.data); // Array of DatabaseInstance
}

// Add a database
await Database_Clusters.add_db('cluster-id', {
  id: 'new_db',
  name: 'new_db',
  created_at: new Date().toISOString()
});
```

---

## 🏗️ Architecture

### Data Flow

```
Client Request
    ↓
API Route Handler
    ↓
DigitalOcean API Call
    ↓
Success? → Supabase Sync → Response
    ↓
Error? → Error Response
```

### Sync Strategy

1. **Create/Delete**: Immediate sync to Supabase after DigitalOcean operation
2. **List**: Fetches from DigitalOcean and replaces entire Supabase array
3. **Retrieve**: Direct fetch from DigitalOcean (no Supabase sync)

---

## ✅ Implementation Checklist

- [x] Created migration file: `add_dbs_column.sql`
- [x] Updated TypeScript types: `DatabaseInstance` interface
- [x] Added `dbs` field to `database_clusters` Row and Insert types
- [x] Implemented `add_db()` in Database_Clusters
- [x] Implemented `remove_db()` in Database_Clusters
- [x] Implemented `update_dbs()` in Database_Clusters
- [x] Implemented `get_dbs()` in Database_Clusters
- [x] Created `/api/services/database/dbs/create` route
- [x] Created `/api/services/database/dbs/delete` route
- [x] Created `/api/services/database/dbs/list` route
- [x] Created `/api/services/database/dbs/retrieve` route

---

## 🔒 Security Considerations

1. **Environment Variables**: `DIGITAL_OCEAN_TOKEN` must be secured
2. **Authentication**: Add authentication middleware to protect routes
3. **Authorization**: Verify user owns the cluster before operations
4. **Validation**: Input validation prevents injection attacks
5. **Rate Limiting**: Consider implementing rate limits for API calls

---

## 🐛 Error Handling

All routes implement consistent error handling:

- **400 Bad Request**: Missing or invalid parameters
- **500 Internal Server Error**: Supabase sync failure
- **DigitalOcean Errors**: Passed through with original message

---

## 📊 Monitoring & Logging

All operations log to console:
- `[createDatabase]` - Database creation logs
- `[deleteDatabase]` - Database deletion logs
- `[listDatabases]` - List operation logs
- `[retrieveDatabase]` - Retrieve operation logs
- `[addDatabase]` - Supabase add logs
- `[removeDatabase]` - Supabase remove logs
- `[updateDatabases]` - Supabase update logs
- `[getDatabases]` - Supabase get logs

---

## 🔄 Comparison with User Management

| Feature | User Management | Database Management |
|---------|----------------|---------------------|
| Storage Field | `users` | `dbs` |
| Create Route | `/users/create` | `/dbs/create` |
| Delete Route | `/users/delete` | `/dbs/delete` |
| List Route | `/users/list` | `/dbs/list` |
| Extra Route | `/users/reset` | `/dbs/retrieve` |
| Supabase Functions | 4 (add, remove, update, get) | 4 (add, remove, update, get) |
| Data Type | `DatabaseUser[]` | `DatabaseInstance[]` |

---

## 📚 Related Documentation

- [Database User Management](./DATABASE_USER_MANAGEMENT.md)
- [Database User API Reference](./DATABASE_USER_API_REFERENCE.md)
- [Database Integration Summary](./DATABASE_INTEGRATION_SUMMARY.md)

---

**Implementation Complete!** ✅
