import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tables } from "@/lib/supabase/types";
import ProjectResourcesPage from "./tabs/resources/page";

interface PageProps {
  project: Tables<"projects">;
}

const ProjectUniquePage = ({ project }: PageProps) => {
  return (
    <Tabs defaultValue="resources">
      <TabsList>
        <TabsTrigger value="resources">Resources</TabsTrigger>
        <TabsTrigger value="activity">Activity</TabsTrigger>
        <TabsTrigger value="settings">Settings</TabsTrigger>
      </TabsList>
      <TabsContent value="resources">
        <ProjectResourcesPage projectId={project.id} />
      </TabsContent>
      {/* <TabsContent value="activity">
                <ProjectActivityPage projectId={project.id} />
            </TabsContent>
            <TabsContent value="settings">
                <ProjectSettingsPage project={project} />
            </TabsContent> */}
    </Tabs>
  );
};

export default ProjectUniquePage;
