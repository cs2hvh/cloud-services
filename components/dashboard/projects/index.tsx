import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tables } from "@/lib/supabase/types";
import ProjectResourcesPage from "./tabs/resources/page";
import ProjectActivityPage from "./tabs/activity";
import ProjectSettingsPage from "./tabs/settings";

interface PageProps {
  project: Tables<"projects">;
}

const ProjectUniquePage = ({ project }: PageProps) => {
  return (
  <div className="px-4">
     <Tabs defaultValue="resources" className="w-full">
      <TabsList className="w-full justify-start border-b rounded-none h-auto p-0 bg-transparent gap-1">
        <TabsTrigger
          value="resources"
          className="data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:bg-muted/50 rounded-none rounded-t-md px-4 py-2.5 font-medium transition-all"
        >
          Resources
        </TabsTrigger>
        <TabsTrigger
          value="activity"
          className="data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:bg-muted/50 rounded-none rounded-t-md px-4 py-2.5 font-medium transition-all"
        >
          Activity
        </TabsTrigger>
        {/* <TabsTrigger
          value="settings"
          className="data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:bg-muted/50 rounded-none rounded-t-md px-4 py-2.5 font-medium transition-all"
        >
          Settings
        </TabsTrigger> */}
      </TabsList>

      <TabsContent value="resources" className="mt-6">
        <ProjectResourcesPage projectId={project.id} />
      </TabsContent>

      <TabsContent value="activity" className="mt-6">
        <ProjectActivityPage projectId={project.id} />
      </TabsContent>

      {/* <TabsContent value="settings" className="mt-6">
        <ProjectSettingsPage project={project} />
      </TabsContent> */}
    </Tabs>
  </div>
  );
};

export default ProjectUniquePage;
