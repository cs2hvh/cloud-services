import { Tables } from "@/lib/supabase/types";
import axios from "axios";
import ProjectUsers from "./users";
import EditProjectForm from "./edit";

interface PageProps {
  project: Tables<"projects">;
}

const ProjectSettingsPage = async ({ project }: PageProps) => {
  let users = [];

  if (
    project.users &&
    Array.isArray(project.users) &&
    project.users.length > 0
  ) {
    const userIds = project.users.join(",");
    const response = await axios.get(
      `${process.env.DOMAIN}/api/users?ids=${userIds}`,
    );
    users = response.data;
  }

  return (
    <div className="space-y-4">
      <EditProjectForm project={project} />
      {users.length > 0 && (
        <ProjectUsers projectId={project.id} users={users} />
      )}
    </div>
  );
};

export default ProjectSettingsPage;
