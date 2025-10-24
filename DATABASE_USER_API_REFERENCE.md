# Database User Management - Quick Reference

## API Endpoints

| Endpoint | Method | Purpose | Required Fields |
|----------|--------|---------|----------------|
| `/api/services/database/users/create` | POST | Create new user | `cluster_id`, `name` |
| `/api/services/database/users/delete` | POST | Delete user | `cluster_id`, `username` |
| `/api/services/database/users/reset` | POST | Reset password | `cluster_id`, `username` |
| `/api/services/database/users/list` | POST | List all users | `cluster_id` |

## Supabase Query Functions

| Function | Purpose | Parameters |
|----------|---------|------------|
| `Database_Clusters.add_user()` | Add user to array | `cluster_id`, `user` |
| `Database_Clusters.remove_user()` | Remove user from array | `cluster_id`, `username` |
| `Database_Clusters.update_users()` | Replace entire users array | `cluster_id`, `users[]` |
| `Database_Clusters.get_users()` | Get users for cluster | `cluster_id` |

## Database Schema Addition

```sql
-- Add this column to your database_cluster table
ALTER TABLE database_cluster 
ADD COLUMN users JSONB DEFAULT '[]'::jsonb;
```

## Example Requests

### Create User
```bash
curl -X POST http://localhost:3000/api/services/database/users/create \
  -H "Content-Type: application/json" \
  -d '{"cluster_id": "abc123", "name": "myuser"}'
```

### List Users
```bash
curl -X POST http://localhost:3000/api/services/database/users/list \
  -H "Content-Type: application/json" \
  -d '{"cluster_id": "abc123"}'
```

### Reset Password
```bash
curl -X POST http://localhost:3000/api/services/database/users/reset \
  -H "Content-Type: application/json" \
  -d '{"cluster_id": "abc123", "username": "myuser"}'
```

### Delete User
```bash
curl -X POST http://localhost:3000/api/services/database/users/delete \
  -H "Content-Type: application/json" \
  -d '{"cluster_id": "abc123", "username": "myuser"}'
```

## Files Modified/Created

### Modified
- ✅ `lib/supabase/types.ts` - Added DatabaseUser interface and users field
- ✅ `lib/supabase/queries.ts` - Added 4 user management functions

### Created
- ✅ `app/api/services/database/users/create/route.ts`
- ✅ `app/api/services/database/users/delete/route.ts`
- ✅ `app/api/services/database/users/reset/route.ts`
- ✅ `app/api/services/database/users/list/route.ts`

## Integration Pattern

```typescript
// 1. Frontend calls API
const response = await fetch('/api/services/database/users/create', {...});

// 2. API calls DigitalOcean
axios.post('https://api.digitalocean.com/v2/databases/{id}/users', {...});

// 3. API syncs with Supabase
Database_Clusters.add_user(cluster_id, userData);

// 4. Return response to frontend
return NextResponse.json({ data, message });
```

## Error Responses

All APIs return consistent error format:
```json
{
  "error": "Error message here"
}
```

Status codes:
- `200` - Success
- `400` - Bad request / Validation error
- `500` - Server error / Sync failure
