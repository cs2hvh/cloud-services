import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { DB_Project } from "@/lib/db/mysql/types"
import ProjectResourcesPage from "./tabs/resources/page"

interface PageProps {
    project: DB_Project
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
    )
}

export default ProjectUniquePage