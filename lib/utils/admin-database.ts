import { AdminDatabaseState } from "@/lib/types/admin-database";
import { createDatabaseSchema, validateEngineVersion } from "@/lib/validation/database";
import { z } from "zod";
import api from "@/lib/axios/axios";
import { Tables } from "../supabase/types";

export const submitDatabaseAssignment = async (
  state: AdminDatabaseState,
  availablePlans: Tables<"products">[],
  termsAccepted: boolean
) => {
  if (!termsAccepted) {
    throw new Error("Please accept the terms of service and privacy policy");
  }

  // Validate all required fields
  if (
    !state.selectedUser ||
    !state.selectedDb ||
    !state.selectedName ||
    !state.selectedVersion ||
    !state.selectedLocation ||
    !state.selectedDbType ||
    !state.selectedProject
  ) {
    throw new Error("Please fill in all the required fields");
  }

  // Get the selected plan resources
  const selectedPlan = availablePlans.find(plan => plan.id === state.selectedDb);
  if (!selectedPlan) {
    throw new Error("Invalid plan selected");
  }

  // Prepare payload matching the schema
  const payload = {
    name: state.selectedName,
    engine: state.selectedDbType,
    version: state.selectedVersion,
    num_nodes: 1,
    size: `db-s-${selectedPlan.resources?.cpu || 1}vcpu-${selectedPlan.resources?.ram || 1}gb`,
    region: state.selectedLocation,
    project_id: state.selectedProject,
    owner_id: state.selectedUser,
  };

  // Validate payload with Zod schema
  try {
    createDatabaseSchema.parse(payload);
  } catch (validationError) {
    if (validationError instanceof z.ZodError) {
      const firstError = validationError.errors[0];
      throw new Error(firstError.message);
    }
    throw validationError;
  }

  // Validate engine version compatibility
  if (!validateEngineVersion(payload.engine, payload.version)) {
    throw new Error(`Version ${payload.version} is not valid for ${payload.engine}`);
  }

  const response = await api.post("/admin/database/assign", payload);
  return response;
};