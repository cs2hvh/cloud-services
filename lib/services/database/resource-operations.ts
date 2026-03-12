import { databaseResourceOperations } from "./operations/database-resource-operations";
import { maintenanceResourceOperations } from "./operations/maintenance-resource-operations";
import { networkResourceOperations } from "./operations/network-resource-operations";
import { scalingResourceOperations } from "./operations/scaling-resource-operations";
import { userResourceOperations } from "./operations/user-resource-operations";

export const resourceOperations = {
  ...databaseResourceOperations,
  ...userResourceOperations,
  ...networkResourceOperations,
  ...maintenanceResourceOperations,
  ...scalingResourceOperations,
};
