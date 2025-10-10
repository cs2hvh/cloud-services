import { Clusters, GameServers } from "@/lib/supabase/queries";
import GameServerGrid from "./grid";
import KubernetesGrid from "./kubernetesgrid";
import { Suspense } from "react";
import { LoadingSpinner } from "@/components/dashboard/utils/loading";
// import cluster from "cluster";
import { Json } from "@/lib/supabase/types";

interface PageProps {
  projectId: string;
}

type TableTypes = 'clusters' | 'game_servers';
// interface GameServerGridProps {
//   // data: Tables<`${TableTypes}`>[];  // This will use the `Tables` type dynamically
//   data:{          cluster_id: string;
//           id: string;
//           clusterName: string;
//           project_id:string;
//           owner_id:string;
//            control_plane?: string | null; // e.g., API VIP or CP-1 IP
//           workers?: string[]; // list of worker IPs/hosts
//           createStatus?: boolean;
//           connectStatus?: boolean;
//           verifyStatus?: boolean;
//           kubeConfig?: string | null; // kubeconfig YAML
//           node_config?:  null; // {region, plan, cpu, ram, disk ...}
//           cniPlugin?: "flannel" | "calico" | "cilium" | string | null;
//            k8s_version?: string | null;
//           status?: string | null;
//                     allocation: number;
//                     created_at: string | null;
//                     ends_at: string | null;
//                     game_type: string;
//                     //id: number;
//                     identifier: string;
//                     ip: string;
//                     location_id: number | null;
//                     name: string;
//                     node: number;
//                     plan: string | null;
//                     port: number;
//                    // project_id: string | null;
//                     resources: Json;
//                     //status: string | null;
//                     user_id: string | null;
//         }[]
//   type: TableTypes;  // `type` can be 'server' | 'game', etc.
// }
const ProjectResourcesSuspense = async ({ projectId }: PageProps) => {
  const gameservers = await GameServers.get_by_project(projectId);
   const clusters = (await Clusters.get_by_project_id(projectId)).filter(item=>item.status==='ready');


   console.log(clusters,".......................16")

  return (
    <div className="space-y-4">
     
      <GameServerGrid data={gameservers } type="game_servers" />
      <KubernetesGrid data={clusters  } type="clusters" />
    </div>
  );
};

const ProjectResourcesPage = ({ projectId }: PageProps) => {
  return (
    <Suspense fallback={<LoadingSpinner />}>
      <ProjectResourcesSuspense projectId={projectId} />
    </Suspense>
  );
};

export default ProjectResourcesPage;
