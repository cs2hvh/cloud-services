import api from "@/lib/axios/axios";
import { AdminDatabaseState } from "@/lib/types/admin-database";
import { createDatabaseSchema, validateEngineVersion, type CreateDatabasePayload } from "@/lib/validation/database";
import { z } from "zod";
import { Tables } from "@/lib/supabase/types";

const resolvePlanSize = (plan: Tables<"products">): CreateDatabasePayload["size"] => {
  const cpu = plan.resources?.cpu || 1;
  const ram = plan.resources?.ram || 1;
  const computedSize = `db-s-${cpu}vcpu-${ram}gb`;

  return computedSize as CreateDatabasePayload["size"];
};

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
  const unvalidatedPayload = {
    name: state.selectedName,
    engine: state.selectedDbType,
    version: state.selectedVersion,
    num_nodes: 1,
    size: resolvePlanSize(selectedPlan),
    region: state.selectedLocation,
    project_id: state.selectedProject,
    owner_id: state.selectedUser,
    plan_id: selectedPlan.id,
  };

  // Validate payload with Zod schema
  let payload: CreateDatabasePayload;
  try {
    payload = createDatabaseSchema.parse(unvalidatedPayload);
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