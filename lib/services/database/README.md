# Database Service Centralization Map

This folder centralizes business logic previously implemented inside `app/api/services/database/**` routes.

## Route to service mapping

- `create/route.ts` -> `DatabaseService.createCluster`
- `read/route.ts` -> `DatabaseService.getClusterInternal` (legacy decrypted response compatibility)
- `read_all_owner/route.ts` -> `DatabaseService.readAllOwnerInternal` (legacy decrypted response compatibility)
- `update_status/route.ts` -> `DatabaseService.updateStatus`
- `update/route.ts` -> `DatabaseService.updateClusterProject`
- `delete/route.ts` -> `DatabaseService.deleteCluster`
- `dbs/create/route.ts` -> `DatabaseService.createDatabase`
- `dbs/delete/route.ts` -> `DatabaseService.deleteDatabase`
- `dbs/list/route.ts` -> `DatabaseService.listDatabases`
- `dbs/retrieve/route.ts` -> `DatabaseService.retrieveDatabase`
- `users/create/route.ts` -> `DatabaseService.createDatabaseUser`
- `users/delete/route.ts` -> `DatabaseService.deleteDatabaseUser`
- `users/list/route.ts` -> `DatabaseService.listDatabaseUsers`
- `users/reset/route.ts` -> `DatabaseService.resetDatabaseUserPassword`
- `network/update/route.ts` -> `DatabaseService.addFirewallRule`
- `network/delete/route.ts` -> `DatabaseService.deleteFirewallRule`
- `network/read/route.ts` -> `DatabaseService.readNetworkRules`
- `maintenance/route.ts` -> `DatabaseService.updateMaintenanceWindow`
- `maintenance/read/route.ts` -> `DatabaseService.readMaintenanceWindow`
- `region/route.ts` -> `DatabaseService.updateRegion`
- `storage/route.ts` -> `DatabaseService.updateStorageInternal` (legacy fixed resize payload compatibility)
- `upsize-storage/route.ts` -> `DatabaseService.upsizeStorage`
- `readForMigrate/route.ts` -> `DatabaseService.readMigrationStatus`
