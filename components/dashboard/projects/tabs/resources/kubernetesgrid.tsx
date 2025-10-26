"use client";
import React from "react";
import { Cpu, Database, HardDrive, ExternalLink, } from "lucide-react";
import {  Tables } from "@/lib/supabase/types";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
// import { useRouter } from "next/navigation";
import Link from "next/link";

const KubernetesGrid = ({ data,type }:{
  data: Tables<"clusters_get">[];
  type: string;
}) => {

    //console.log(data,"...................64");
  // const router=useRouter();
  if (!data || data.length === 0) {
    return (
      <>
       <h1 className="text-xs ms-2 text-white font-semibold mb-2 uppercase">
        {type} ({data.length})
      </h1> 
      <div className="text-center p-8 text-gray-500">No {type} found</div>
      </>
    );
  }


  return (
   <div className="mx-6">
    <div >
      <h1 className="text-xs text-white font-semibold mb-2 uppercase">
        {type} ({data.length})
      </h1> 
    </div>
    
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">   
      
        
          {data.map((server) => (
        <Card
          key={server?.cluster_id}
          className="overflow-hidden transition-all duration-300 hover:shadow-md"
        >
          <CardHeader>
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-2">
                <span className="text-xl">{server?.k8s_version}</span>
                <CardTitle>{server.cluster_name}</CardTitle>
              </div>
              {server.status ==="ready" ? (
                <div className="relative">
                  <Badge
                    variant="outline"
                    className="bg-green-100 text-green-800 border-green-300"
                  >
                    Ready
                  </Badge>
                </div>
              ) : (
                <Badge
                  variant="outline"
                  className="bg-gray-100 text-gray-800 border-gray-300"
                >
                  {server.status}
                </Badge>
              )}
            </div>
            <CardDescription className="capitalize">
              {server.k8s_version} version
            </CardDescription>
          </CardHeader>
          <Separator />
          <CardContent>
            {/* Resources */}
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-medium mb-2">Resources</h3>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div className="flex items-center">
                    <Cpu className="w-4 h-4 mr-2 text-blue-500" />
                    <span>
                      {
                        (
                          server.node_config as {
                            cpu: number;
                            ram: number;
                            storage: number;
                          } | null
                        )?.cpu
                      }{" "}
                      CPU
                    </span>
                  </div>
                  <div className="flex items-center">
                    <Database className="w-4 h-4 mr-2 text-green-500" />
                    <span>
                      {
                        (
                          server.node_config as {
                            cpu: number;
                            ram: number;
                            storage: number;
                          } | null
                        )?.ram
                      }{" "}
                      MB RAM
                    </span>
                  </div>
                  <div className="flex items-center">
                    <HardDrive className="w-4 h-4 mr-2 text-purple-500" />
                    <span>
                      {
                        (
                          server.node_config as {
                            cpu: number;
                            ram: number;
                            storage: number;
                          } | null
                        )?.storage
                      }{" "}
                      GB Storage
                    </span>
                  </div>
                  {/* <div className="flex items-center">
                    <Wifi className="w-4 h-4 mr-2 text-orange-500" />
                    <span>
                      {
                        (server.resources as { bandwith?: number } | null)
                          ?.bandwith
                      }{" "}
                      Mbps
                    </span>
                  </div> */}
                </div>
              </div>

              {/* Connection Info */}
              <div>
                <h3 className="text-sm font-medium mb-2">Connection Info</h3>
                <div className="bg-muted p-2 rounded-md font-mono text-sm">
                  {server.control_plane?.public_ip}:{6443}
                </div>
              </div>
            </div>
          </CardContent>

          <CardFooter className="pt-2 flex gap-2">
            <Link
              className="w-1/2"
               href={{
                            pathname: `/dashboard/services/kubernetes/clusters/${encodeURIComponent(server.cluster_id)}`,
                            query: { clusterStatus: server.status},
                          }}
            >
              Open Control Panel
            </Link>
            <Button
              className="w-1/2"
              onClick={() =>
                window.open(
                  `https://panel.hav0k.dev/server/${server.cluster_id}`,
                  "_blank",
                )
              }
            >
              Renew Subscription
              <ExternalLink className="h-4 w-4" />
            </Button>
          </CardFooter>
        </Card>
      ))}
        
      
    </div>
   </div>
  );
};

export default KubernetesGrid;
