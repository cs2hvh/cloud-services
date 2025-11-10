import { NAMING_RULES } from "@/lib/validation/constants";
import { validateEngineVersion } from "@/lib/validation/database";

export const validateUser = (userId: string): string => {
  if (!userId) {
    return "User selection is required";
  }
  return "";
};

export const validateClusterName = (name: string): string => {
  if (!name) {
    return "Cluster name is required";
  }
  if (name.length < NAMING_RULES.MIN_CLUSTER_NAME_LENGTH) {
    return `Cluster name must be at least ${NAMING_RULES.MIN_CLUSTER_NAME_LENGTH} characters`;
  }
  if (name.length > NAMING_RULES.MAX_CLUSTER_NAME_LENGTH) {
    return `Cluster name must be at most ${NAMING_RULES.MAX_CLUSTER_NAME_LENGTH} characters`;
  }
  if (!NAMING_RULES.CLUSTER_NAME_PATTERN.test(name)) {
    return "Cluster name must start and end with alphanumeric, contain only lowercase letters, numbers, and hyphens";
  }
  return "";
};

export const validateLocation = (location: string): string => {
  if (!location) {
    return "Location is required";
  }
  return "";
};

export const validateDbType = (dbType: string): string => {
  if (!dbType) {
    return "Database type is required";
  }
  return "";
};

export const validatePlan = (planId: string): string => {
  if (!planId) {
    return "Database plan is required";
  }
  return "";
};

export const validateVersion = (version: string, dbType: string): string => {
  if (!version) {
    return "Version is required";
  }
  if (dbType && !validateEngineVersion(dbType, version)) {
    return "Invalid version for selected database engine";
  }
  return "";
};

export const validateProject = (projectId: string): string => {
  if (!projectId) {
    return "Project is required";
  }
  return "";
};