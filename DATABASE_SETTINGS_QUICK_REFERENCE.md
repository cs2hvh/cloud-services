# Database Settings Tab - Quick Reference

## API Endpoints

### 1. Configure Maintenance Window
```bash
PUT /api/services/database/maintenance
Content-Type: application/json

{
  "database_id": "9cc10173-e9ea-4176-9dbc-a4cee4c4ff30",
  "day": "tuesday",
  "hour": "14:00"
}

Response: 200 OK
{
  "message": "Maintenance window configured successfully"
}
```

### 2. Migrate Database Region
```bash
PUT /api/services/database/region
Content-Type: application/json

{
  "database_id": "9cc10173-e9ea-4176-9dbc-a4cee4c4ff30",
  "region": "sgp1"
}

Response: 200 OK
{
  "message": "Database migration initiated successfully..."
}
```

## Component Usage

```tsx
import { SettingsTab } from "./tabs/settings-tab";

<SettingsTab 
  database={databaseObject}
  onDatabaseUpdate={fetchDatabaseCluster}
/>
```

## Available Days
- monday
- tuesday
- wednesday
- thursday
- friday
- saturday
- sunday

## Available Times
- 00:00 to 23:00 (24-hour format, hourly intervals)

## Available Regions
| Slug | Location |
|------|----------|
| ams3 | Amsterdam 3 |
| blr1 | Bangalore 1 |
| fra1 | Frankfurt 1 |
| lon1 | London 1 |
| nyc1 | New York 1 |
| nyc2 | New York 2 |
| nyc3 | New York 3 |
| sfo2 | San Francisco 2 |
| sfo3 | San Francisco 3 |
| sgp1 | Singapore 1 |
| syd1 | Sydney 1 |
| tor1 | Toronto 1 |

## Features by Section

### 1. Update Project ⚙️
- Select project from dropdown
- Save/Cancel buttons
- Loading indicator

### 2. Configure Maintenance Window 📅
- Select day of week
- Select time (UTC)
- Current day/time highlighted
- Save/Cancel buttons

### 3. Update Database Region 📍
- Select from 12 regions
- Warning for region change
- Current region marked
- Migrate/Cancel buttons

### 4. Delete Cluster 🗑️
- Two-step confirmation
- Destructive action warning
- Permanent deletion notice
- Delete/Cancel buttons

## Error Handling

All API calls include:
- Try-catch error handling
- Axios error response parsing
- User-friendly toast notifications
- Console error logging
- Loading state management

## Design Tokens

```css
/* Colors */
--blue-500: #3b82f6    /* Project */
--purple-500: #a855f7  /* Maintenance */
--green-500: #22c55e   /* Region */
--red-500: #ef4444     /* Delete */

/* Backgrounds */
--bg-card: rgba(255, 255, 255, 0.05)
--bg-hover: rgba(255, 255, 255, 0.1)

/* Borders */
--border-card: rgba(255, 255, 255, 0.1)

/* Spacing */
--gap-section: 1.5rem
--padding-card: 1.5rem
```

## Testing Checklist

- [ ] Maintenance window updates successfully
- [ ] Region migration initiates correctly
- [ ] Delete cluster confirmation works
- [ ] Loading states display properly
- [ ] Cancel buttons reset forms
- [ ] Toast notifications appear
- [ ] Error handling works
- [ ] Responsive on mobile
- [ ] Accessible form elements
- [ ] Current values highlighted

## Common Issues & Solutions

**Issue**: Maintenance window not updating
- Check if database_id is correct
- Verify day/hour format
- Check network request in DevTools

**Issue**: Region migration fails
- Ensure region is different from current
- Check if cluster is online (not migrating)
- Verify region slug is valid

**Issue**: Delete not working
- Confirm two-step process completed
- Check if user has permissions
- Verify cluster_id in request

## Next Steps

To further enhance the settings tab:
1. Add project assignment API endpoint
2. Implement real-time status polling
3. Add cost estimation for region changes
4. Create backup before delete option
5. Add settings change history log
