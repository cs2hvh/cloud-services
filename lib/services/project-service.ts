import { createServiceClient } from "@/lib/supabase/server";
import { Projects } from "@/lib/supabase/queries/projects";
import type { CreateProjectPayload, UpdateProjectPayload } from "@/lib/validation/projects";

type ProjectRow = {
  id: string;
  name: string;
  description: string | null;
  owner: string | null;
  users: unknown;
  created_at: string | null;
  default_project: boolean | null;
};

type ProjectApiModel = {
  id: string;
  name: string;
  description: string | null;
  owner_id: string | null;
  users: string[];
  created_at: string | null;
  default_project: boolean | null;
};

type ServiceSuccess<T> = { success: true; data: T };
type ServiceFailure = { success: false; error: string; errorCode: string };

type ServiceResult<T> = ServiceSuccess<T> | ServiceFailure;

function normalizeUsers(users: unknown): string[] {
  if (Array.isArray(users)) {
    return users.filter((u): u is string => typeof u === "string");
  }

  if (typeof users === "string") {
    try {
      const parsed = JSON.parse(users);
      if (Array.isArray(parsed)) {
        return parsed.filter((u): u is string => typeof u === "string");
      }
    } catch {
      return [];
    }
  }

  return [];
}

function toProjectApiModel(project: ProjectRow): ProjectApiModel {
  return {
    id: project.id,
    name: project.name,
    description: project.description,
    owner_id: project.owner,
    users: normalizeUsers(project.users),
    created_at: project.created_at,
    default_project: project.default_project,
  };
}

function canAccessProject(project: ProjectRow, userId: string): boolean {
  if (project.owner === userId) {
    return true;
  }

  const users = normalizeUsers(project.users);
  return users.includes(userId);
}

function mapSupabaseError(error: { code?: string; message: string }): ServiceFailure {
  if (error.code === "23505") {
    return { success: false, error: "Project already exists", errorCode: "ALREADY_EXISTS" };
  }

  return { success: false, error: error.message, errorCode: "DB_ERROR" };
}

export class ProjectService {
  static async ensureProjectOwnedByUser(input: {
    projectId: string;
    userId: string;
  }): Promise<ServiceResult<{ id: string }>> {
    const project = await Projects.get_by_id(input.projectId);
    if (!project) {
      return { success: false, error: "Project not found", errorCode: "NOT_FOUND" };
    }

    if (project.owner !== input.userId) {
      return {
        success: false,
        error: "You do not have permission to create resources in this project",
        errorCode: "FORBIDDEN",
      };
    }

    return { success: true, data: { id: project.id } };
  }

  static async listProjects(userId: string): Promise<ServiceResult<ProjectApiModel[]>> {
    const supabase = await createServiceClient();
    const { data, error } = await supabase
      .from("projects")
      .select("id, name, description, owner, users, created_at, default_project")
      .or(`owner.eq.${userId},users.cs.["${userId}"]`)
      .order("created_at", { ascending: false });

    if (error) {
      return mapSupabaseError(error);
    }

    const projects = (data || []).map((row) => toProjectApiModel(row as ProjectRow));
    return { success: true, data: projects };
  }

  static async createProject(input: {
    userId: string;
    payload: CreateProjectPayload;
    addLog?: boolean;
  }): Promise<ServiceResult<ProjectApiModel>> {
    const supabase = await createServiceClient();
    const { data, error } = await supabase
      .from("projects")
      .insert({
        name: input.payload.name,
        description: input.payload.description ?? null,
        owner: input.userId,
        users: [input.userId],
      })
      .select("id, name, description, owner, users, created_at, default_project")
      .single();

    if (error) {
      return mapSupabaseError(error);
    }

    if (input.addLog !== false) {
      try {
        await Projects.add_log(
          {
            project_id: data.id,
            event: "Project Created",
            text: `Created project "${data.name}"`,
          },
          "admin"
        );
      } catch {
        // Do not fail create flow on log errors.
      }
    }

    return { success: true, data: toProjectApiModel(data as ProjectRow) };
  }

  static async getProject(input: {
    projectId: string;
    userId: string;
  }): Promise<ServiceResult<ProjectApiModel>> {
    const supabase = await createServiceClient();
    const { data, error } = await supabase
      .from("projects")
      .select("id, name, description, owner, users, created_at, default_project")
      .eq("id", input.projectId)
      .maybeSingle();

    if (error) {
      return mapSupabaseError(error);
    }
    if (!data) {
      return { success: false, error: "Project not found", errorCode: "NOT_FOUND" };
    }

    const project = data as ProjectRow;
    if (!canAccessProject(project, input.userId)) {
      return { success: false, error: "You do not have permission to access this project", errorCode: "FORBIDDEN" };
    }

    return { success: true, data: toProjectApiModel(project) };
  }

  static async updateProject(input: {
    projectId: string;
    userId: string;
    payload: UpdateProjectPayload;
  }): Promise<ServiceResult<ProjectApiModel>> {
    const existing = await this.getProject({ projectId: input.projectId, userId: input.userId });
    if (!existing.success) {
      return existing;
    }

    if (existing.data.owner_id !== input.userId) {
      return { success: false, error: "You do not have permission to modify this project", errorCode: "FORBIDDEN" };
    }

    const updates: { name?: string; description?: string | null } = {};
    if (input.payload.name !== undefined) {
      updates.name = input.payload.name;
    }
    if (input.payload.description !== undefined) {
      updates.description = input.payload.description;
    }

    const supabase = await createServiceClient();
    const { data, error } = await supabase
      .from("projects")
      .update(updates)
      .eq("id", input.projectId)
      .select("id, name, description, owner, users, created_at, default_project")
      .single();

    if (error) {
      return mapSupabaseError(error);
    }

    try {
      await Projects.add_log(
        {
          project_id: input.projectId,
          event: "Settings",
          text: `Updated fields: ${Object.keys(updates).join(", ")}`,
        },
        "admin"
      );
    } catch {
      // Do not fail update flow on log errors.
    }

    return { success: true, data: toProjectApiModel(data as ProjectRow) };
  }

  static async deleteProject(input: {
    projectId: string;
    userId: string;
  }): Promise<ServiceResult<{ id: string; name: string; deleted: boolean }>> {
    const existing = await this.getProject({ projectId: input.projectId, userId: input.userId });
    if (!existing.success) {
      return existing;
    }

    if (existing.data.owner_id !== input.userId) {
      return { success: false, error: "You do not have permission to delete this project", errorCode: "FORBIDDEN" };
    }

    const supabase = await createServiceClient();
    const { count: ownedCount, error: countError } = await supabase
      .from("projects")
      .select("id", { count: "exact", head: true })
      .eq("owner", input.userId);

    if (countError) {
      return mapSupabaseError(countError);
    }

    if ((ownedCount ?? 0) <= 1) {
      return {
        success: false,
        error: "You must keep at least one project. Create another project before deleting this one.",
        errorCode: "LAST_PROJECT",
      };
    }

    const { error } = await supabase.from("projects").delete().eq("id", input.projectId);

    if (error) {
      return mapSupabaseError(error);
    }

    return {
      success: true,
      data: {
        id: existing.data.id,
        name: existing.data.name,
        deleted: true,
      },
    };
  }

  // Legacy-compatible update used by internal /api/projects routes.
  // Preserves existing behavior: no ownership/access guard here.
  static async updateProjectLegacy(input: {
    projectId: string;
    payload: UpdateProjectPayload;
  }): Promise<ServiceResult<null>> {
    const updated = await Projects.update(input.projectId, input.payload);
    if (!updated) {
      return { success: false, error: "Failed to update project", errorCode: "DB_ERROR" };
    }

    try {
      await Projects.add_log(
        {
          project_id: input.projectId,
          event: "Settings",
          text: `Updated fields: ${Object.keys(input.payload).join(", ")}`,
        },
        "admin"
      );
    } catch {
      // Keep legacy behavior: do not fail route on log write failure.
    }

    return { success: true, data: null };
  }

  // Legacy-compatible member update used by internal /api/projects/[id] PUT route.
  // Preserves existing behavior: auth required, but no project ownership check.
  static async updateProjectUsers(input: {
    projectId: string;
    event: "add" | "remove";
    users: string[];
  }): Promise<ServiceResult<string[]>> {
    const project = await Projects.get_by_id(input.projectId);
    if (!project) {
      return { success: false, error: "Project not found", errorCode: "NOT_FOUND" };
    }

    let currentUsers: string[] = [];
    try {
      currentUsers = normalizeUsers(project.users);
    } catch {
      currentUsers = [];
    }

    const updatedUsers =
      input.event === "add"
        ? Array.from(new Set([...currentUsers, ...input.users]))
        : currentUsers.filter((u) => !input.users.includes(u));

    const updated = await Projects.update(input.projectId, { users: updatedUsers });
    if (!updated) {
      return { success: false, error: "Failed to update project users", errorCode: "DB_ERROR" };
    }

    return { success: true, data: updatedUsers };
  }
}
