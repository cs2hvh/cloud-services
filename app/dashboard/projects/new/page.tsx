import { SidebarLayout } from "@/components/dashboard/sidebar/layout";
import ProjectCreateForm from "@/components/dashboard/projects/create-form";

const NewProjectPage = () => {
  return (
    <SidebarLayout>
      <div className="p-8">
        <div className="max-w-2xl">
          <h1 className="text-2xl font-semibold text-white mb-8">Create New Project</h1>
          <ProjectCreateForm />
        </div>
      </div>
    </SidebarLayout>
  );
};

export default NewProjectPage;