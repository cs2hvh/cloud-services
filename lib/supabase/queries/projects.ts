import { createClient, createServiceClient } from "../server";
import { handleQueryError } from "@/lib/utils/error-handler";
import { Tables, TablesInsert } from "../types";

type Project = Tables<"projects">;
type ProjectLog = Tables<"project_logs">;

const DEFAULT_PROJECT_NAME = "My First Project";
const DEFAULT_PROJECT_DESCRIPTION = "Default project created automatically.";

async function ensureDefaultProjectForUser(userId: string): Promise<void> {
  try {
    const supabase = await createServiceClient();
    const { count, error } = await supabase
      .from("projects")
      .select("id", { count: "exact", head: true })
      .eq("owner", userId);

    if (error || (count ?? 0) > 0) {
      return;
    }

    const { error: insertError } = await supabase.from("projects").insert({
      name: DEFAULT_PROJECT_NAME,
      description: DEFAULT_PROJECT_DESCRIPTION,
      default_project: true,
      owner: userId,
      users: [userId],
    });

    if (insertError) {
      handleQueryError("creating default project", insertError, "Projects");
    }
  } catch (err) {
    handleQueryError("ensuring default project", err, "Projects");
  }
}

export const Projects = {
  // Get a project by ID
  get_by_id: async (id: string): Promise<Project | null> => {
    try {
      console.log("Fetching project with ID:", id);
      const supabase = await createServiceClient();
      const { data, error } = await supabase
        .from("projects")
        .select("*")
        .eq("id", id)
        .single();

      if (error) {
        console.log(
          `[Supabase] Error while getting project by id: ${error.message}`
        );
        return null;
      }
      return data;
    } catch (err) {
      console.log(`[Supabase] Error while getting project by id: ${err}`);
      return null;
    }
  },

  // Get all projects where user is involved
  get_all_by_user: async (userId: string): Promise<Project[]> => {
    try {
      const supabase = await createClient();
      const { data, error } = await supabase
        .from("projects")
        .select("*")
        .eq("owner", userId);

      if (error) {
        console.log(
          `[Supabase] Error............. while getting projects by userId: ${error.message}`
        );
        return [];
      }

      if (data && data.length > 0) {
        return data;
      }

      await ensureDefaultProjectForUser(userId);

      const { data: refreshedData, error: refreshError } = await supabase
        .from("projects")
        .select("*")
        .eq("owner", userId);

      if (refreshError) {
        handleQueryError("refreshing projects by userId", refreshError, "Projects");
        return [];
      }

      return refreshedData || [];
    } catch (err) {
      handleQueryError("getting projects by userId", err, "Projects");
      return [];
    }
  },
  // Get all projects where user is involved
  get_all_for_admin: async (): Promise<Project[]> => {
    try {
      const supabase = await createServiceClient();
      const { data, error } = await supabase.from("projects").select("*");

      if (error) {
        handleQueryError("getting all projects for admin", error, "Projects");
        return [];
      }
      return data || [];
    } catch (err) {
      handleQueryError("getting all projects for admin", err, "Projects");
      return [];
    }
  },

  create: async (props: TablesInsert<"projects">): Promise<string | null> => {
    try {
      const supabase = await createClient();
      const { data, error } = await supabase
        .from("projects")
        .insert(props)
        .select("id")
        .single();

      if (error) {
        handleQueryError("creating project", error, "Projects");
        return null;
      }
      return data.id;
    } catch (err) {
      handleQueryError("creating project", err, "Projects");
      return null;
    }
  },

  // Update an existing project
  update: async (id: string, props: TablesInsert<"projects"> | Record<string, unknown>): Promise<boolean> => {
    try {
      const supabase = await createClient();
      const { error } = await supabase
        .from("projects")
        .update(props)
        .eq("id", id);

      if (error) {
        handleQueryError("updating project", error, "Projects");
        return false;
      }
      return true;
    } catch (err) {
      handleQueryError("updating project", err, "Projects");
      return false;
    }
  },

  // Delete a project
  delete: async (id: string): Promise<boolean> => {
    try {
      const supabase = await createClient();
      const { error } = await supabase.from("projects").delete().eq("id", id);

      if (error) {
        handleQueryError("deleting project", error, "Projects");
        return false;
      }
      return true;
    } catch (err) {
      handleQueryError("deleting project", err, "Projects");
      return false;
    }
  },

  get_logs: async (projectId: string): Promise<ProjectLog[] | null> => {
    try {
      const supabase = await createClient();
      const { data, error } = await supabase
        .from("project_logs")
        .select("*")
        .eq("project_id", projectId)
        .order("created_at", { ascending: false });

      if (error) {
        handleQueryError("getting project logs", error, "Projects");
        return null;
      }
      return data;
    } catch (err) {
      handleQueryError("getting project logs", err, "Projects");
      return null;
    }
  },

  get_logs_by_user: async (userId: string): Promise<ProjectLog[] | null> => {
    try {
      const supabase = await createClient();
      const { data, error } = await supabase
        .from("project_logs")
        .select("* ,projects!inner(*)")
        .eq("projects.owner", userId)
        .order("created_at", { ascending: false });

      if (error) {
        handleQueryError("getting project logs by user", error, "Projects");
        return [];
      }
      return data;
    } catch (err) {
      handleQueryError("getting project logs by user", err, "Projects");
      return [];
    }
  },

  add_log: async (
    props: TablesInsert<"project_logs">,
    role?: string
  ): Promise<boolean> => {
    try {
      const supabase =
        role === "admin" ? await createServiceClient() : await createClient();
      const { error } = await supabase.from("project_logs").insert(props);

      if (error) {
        handleQueryError("creating project log", error, "Projects");
        return false;
      }
      return true;
    } catch (err) {
      handleQueryError("creating project log", err, "Projects");
      return false;
    }
  },

  // Count all projects
  count_all: async (): Promise<number> => {
    try {
      const supabase = await createClient();
      const { count, error } = await supabase
        .from("projects")
        .select("*", { count: "exact", head: true });

      if (error) {
        handleQueryError("counting projects", error, "Projects");
        return 0;
      }
      return count || 0;
    } catch (err) {
      handleQueryError("counting projects", err, "Projects");
      return 0;
    }
  },
};
