// Re-export all query modules
export { Users } from "./users";
export { Billing } from "./billing";
export { Projects } from "./projects";
export { GameServers } from "./gameservers";
export { Products } from "./products";
export { Locations } from "./locations";
export { OTPs } from "./otps";
export { Clusters } from "./clusters";
export { Database_Clusters } from "./database_clusters";
export { Database_Integrations } from "./database_integrations"; // Database-App integration tracking
export { ObjectStorage_Integrations } from "./object_storage_integrations"; // Object Storage-App integration tracking
export { Activities } from "./activities";
export { ObjectSpaces } from "./object_spaces";
export { Spectrum_Apps } from "./spectrum_apps";
export { Promocodes } from "./promocodes";
export { Platform_Apps, Platform_App_Webhooks } from "./platform_apps";
export { storeFile } from "./utils";

// AI Agents
export {
  AIAgents,
  AgentKnowledgeBases,
  AgentKBDocuments,
  AgentKBChunks,
  AgentModelKeys,
  AgentConversations,
  AgentMessages,
  AgentUsage,
} from "./ai_agents";
// Platform app deployments re-export removed (not exported from platform_apps)

// For backward compatibility - default export
import { Users } from "./users";
import { Projects } from "./projects";
import { GameServers } from "./gameservers";
import { Products } from "./products";
import { Locations } from "./locations";
import { OTPs } from "./otps";
import { Clusters } from "./clusters";
import { Database_Clusters } from "./database_clusters";
import { Activities } from "./activities";
import { ObjectSpaces } from "./object_spaces";

const api = {
  users: Users,
  projects: Projects,
  gameservers: GameServers,
  products: Products,
  locations: Locations,
  otps: OTPs,
  // vms:Vms,
  clusters: Clusters,
  database_clusters: Database_Clusters,
  activities: Activities,
  object_spaces: ObjectSpaces,
};

export default api;
