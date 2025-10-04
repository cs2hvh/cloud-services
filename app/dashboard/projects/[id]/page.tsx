import ProjectUniquePage from "@/components/dashboard/projects";
import { SidebarLayout } from "@/components/dashboard/sidebar/layout";
import { ErrorMessage } from "@/components/dashboard/utils/error";
import { LoadingSpinner } from "@/components/dashboard/utils/loading";
import { Separator } from "@/components/ui/separator";
import { Clusters, Projects } from "@/lib/supabase/queries";
import { Suspense } from "react";

interface PageProps {
  params: Promise<{ id: string }>;
}

const ProjectSuspense = async ({ id }: { id: string }) => {
  try {
    const project = await Projects.get_by_id(id);
     //console.log(project);
     const clusters = await Clusters.get_by_project_id(id); 
     console.log(clusters,".......")
    if (!project) {
      return (
        <ErrorMessage message="Unable to load application forms. Please try again later." />
      );
    }

    return (
      <>
        <div className="flex justify-between pt-4">
          <div>
            <h2 className="text-2xl font-bold">{project.name}</h2>
            <p className="text-muted-foreground">{project.description}</p>
          </div>
        </div>
        <Separator className="my-4" />
        <ProjectUniquePage project={project} />
      </>
    );
  } catch (error) {
    console.error("Error in ApplicationForms component:", error);
    return (
      <ErrorMessage message="An unexpected error occurred. Please try again later." />
    );
  }
};

const ProjectPage = async ({ params }: PageProps) => {
  const { id } = await params;

  return (
    <SidebarLayout>
      <Suspense fallback={<LoadingSpinner />}>
        <ProjectSuspense id={id} />
      </Suspense>
    </SidebarLayout>
  );
};

export default ProjectPage;
