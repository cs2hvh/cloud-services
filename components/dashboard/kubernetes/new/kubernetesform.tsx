"use client";
import { useState } from "react";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import {
  CheckCircle2,
  ChevronRight,
  Cpu,
  //   Database,
  HardDrive,
  Loader2,
  //   MapPin,
  Server,
} from "lucide-react";
import Image from "next/image";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import Link from "next/link";
import { toast } from "sonner";
import { formatPrice } from "@/lib/utils";
import { Tables } from "@/lib/supabase/types";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
// import { Progress } from "@/components/ui/progress";
// import { Icons } from "@/components/ui/icons";
import api from "@/lib/axios/axios";
import { useRouter } from "next/navigation";
import axios from "axios";
import { headers } from "next/headers";
import { Json } from "@/lib/supabase/types";
import { stat } from "fs";

interface PageProps {
  locations: Tables<"locations">[];
  projects: Tables<"projects">[];
  userId: string;
}

type NodeInfo = {
  host: string;
  role: "control-plane" | "worker"; // Add more roles if needed
  hostname: string;
  cpu: number;
  memory_mb: number;
  storage: number;
};

type SendPayload = {
  provider: string;
  cluster: {
    name: string;
    location: string;
    pod_cidr: string;
    k8s_minor: string;
  };
  auth: {
    method: string;
    user: string;
    password: string;
  };
  nodes: NodeInfo[];
  ips: string[];
};

// interface Project{
//     id: string;
//     name: string;
//     description: string | null;
//     owner: string;
//     users: string[];
//     created_at: string;
//     updated_at: string | null;
//     }

// const databaseVersions = {
//   mysql: ["5.7", "8.0", "8.1"],
//   postgresql: ["12", "13", "14", "15", "16"],
//   mongodb: ["4.4", "5.0", "6.0", "7.0"],
//   redis: ["6.2", "7.0", "7.2"],
//   mariadb: ["10.6", "10.7", "10.8", "10.11"],
//   kafka: ["3.4", "3.5", "3.6"],
// };

// const databaseInfo = {
//   mysql: {
//     name: "MySQL",
//     description: "Popular open-source relational database",
//     icon: "https://cdn.jsdelivr.net/gh/devicons/devicon/icons/mysql/mysql-original.svg"
//   },
//   postgresql: {
//     name: "PostgreSQL",
//     description: "Advanced open-source database",
//     icon: "https://cdn.jsdelivr.net/gh/devicons/devicon/icons/postgresql/postgresql-original.svg"
//   },
//   mongodb: {
//     name: "MongoDB",
//     description: "NoSQL document database",
//     icon: "https://cdn.jsdelivr.net/gh/devicons/devicon/icons/mongodb/mongodb-original.svg"
//   },
//   redis: {
//     name: "Redis",
//     description: "In-memory data structure store",
//     icon: "/redis.png"
//   },
//   mariadb: {
//     name: "MariaDB",
//     description: "MySQL-compatible database",
//     icon: "https://cdn.jsdelivr.net/gh/devicons/devicon/icons/mariadb/mariadb-original.svg"
//   },
//   kafka: {
//     name: "Apache Kafka",
//     description: "Distributed event streaming",
//     icon: "/kafka.png"
//   },
// };

// Sample database plans if products are empty
// const sampleDatabasePlans = {
//   mysql: [
//     { id: 'mysql-starter', name: 'Starter', sub: 'mysql', type: 'database', price: 15, resources: { cpu: 1, ram: 2, storage: 20 }, discount: null },
//     { id: 'mysql-basic', name: 'Basic', sub: 'mysql', type: 'database', price: 35, resources: { cpu: 2, ram: 4, storage: 50 }, discount: null },
//     { id: 'mysql-pro', name: 'Professional', sub: 'mysql', type: 'database', price: 75, resources: { cpu: 4, ram: 8, storage: 100 }, discount: 10 },
//     { id: 'mysql-business', name: 'Business', sub: 'mysql', type: 'database', price: 150, resources: { cpu: 8, ram: 16, storage: 250 }, discount: 15 },
//   ],
//   postgresql: [
//     { id: 'pg-starter', name: 'Starter', sub: 'postgresql', type: 'database', price: 20, resources: { cpu: 1, ram: 2, storage: 25 }, discount: null },
//     { id: 'pg-basic', name: 'Basic', sub: 'postgresql', type: 'database', price: 45, resources: { cpu: 2, ram: 4, storage: 60 }, discount: null },
//     { id: 'pg-pro', name: 'Professional', sub: 'postgresql', type: 'database', price: 95, resources: { cpu: 4, ram: 8, storage: 150 }, discount: 10 },
//     { id: 'pg-enterprise', name: 'Enterprise', sub: 'postgresql', type: 'database', price: 250, resources: { cpu: 16, ram: 32, storage: 500 }, discount: 20 },
//   ],
//   mongodb: [
//     { id: 'mongo-free', name: 'Free Tier', sub: 'mongodb', type: 'database', price: 0, resources: { cpu: 0.5, ram: 1, storage: 5 }, discount: null },
//     { id: 'mongo-starter', name: 'Starter', sub: 'mongodb', type: 'database', price: 25, resources: { cpu: 1, ram: 2, storage: 30 }, discount: null },
//     { id: 'mongo-pro', name: 'Professional', sub: 'mongodb', type: 'database', price: 85, resources: { cpu: 4, ram: 8, storage: 120 }, discount: 15 },
//     { id: 'mongo-scale', name: 'Scale', sub: 'mongodb', type: 'database', price: 199, resources: { cpu: 8, ram: 16, storage: 300 }, discount: 20 },
//   ],
//   redis: [
//     { id: 'redis-cache', name: 'Cache', sub: 'redis', type: 'database', price: 10, resources: { cpu: 0.5, ram: 1, storage: 5 }, discount: null },
//     { id: 'redis-standard', name: 'Standard', sub: 'redis', type: 'database', price: 30, resources: { cpu: 1, ram: 4, storage: 10 }, discount: null },
//     { id: 'redis-pro', name: 'Professional', sub: 'redis', type: 'database', price: 60, resources: { cpu: 2, ram: 8, storage: 25 }, discount: 10 },
//     { id: 'redis-enterprise', name: 'Enterprise', sub: 'redis', type: 'database', price: 120, resources: { cpu: 4, ram: 16, storage: 50 }, discount: 15 },
//   ],
//   mariadb: [
//     { id: 'maria-starter', name: 'Starter', sub: 'mariadb', type: 'database', price: 15, resources: { cpu: 1, ram: 2, storage: 20 }, discount: null },
//     { id: 'maria-standard', name: 'Standard', sub: 'mariadb', type: 'database', price: 40, resources: { cpu: 2, ram: 4, storage: 60 }, discount: null },
//     { id: 'maria-pro', name: 'Professional', sub: 'mariadb', type: 'database', price: 80, resources: { cpu: 4, ram: 8, storage: 120 }, discount: 10 },
//   ],
//   kafka: [
//     { id: 'kafka-basic', name: 'Basic', sub: 'kafka', type: 'database', price: 50, resources: { cpu: 2, ram: 4, storage: 50 }, discount: null },
//     { id: 'kafka-standard', name: 'Standard', sub: 'kafka', type: 'database', price: 120, resources: { cpu: 4, ram: 8, storage: 100 }, discount: 10 },
//     { id: 'kafka-pro', name: 'Professional', sub: 'kafka', type: 'database', price: 250, resources: { cpu: 8, ram: 16, storage: 250 }, discount: 15 },
//   ],
// };

const NewClusterPage = ({ locations, projects, userId }: PageProps) => {
  const router = useRouter();
  const planValue: string = "";
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [currentStep, setCurrentStep] = useState<number>(1);
  const [termsAccepted, setTermsAccepted] = useState<boolean>(false);
  //we need to make plan dynamic
  const [availablePlans] = useState([
    {
      planId: "Shared",
      label: "s-1vcpu-1gb-amd",
      ram: 1,
      cpu: 1,
      storage: 25,
      processor: "amd",
    },
    {
      planId: "Shared",
      label: "s-2vcpu-2gb-amd",
      ram: 2,
      cpu: 1,
      storage: 25,
    },
    {
      planId: "Shared",
      label: "s-2vcpu-4gb-amd",
      ram: 4,
      cpu: 2,
      storage: 25,
    },
  ]);

  const [state, setState] = useState({
    selectedPlan: "", // Selected database product
    selectedName: "", // Cluster name
    selectedNode: 0, // Number of nodes
    selectedVersion: "", // Selected version
    selectedLocation: "", // Selected location
    selectedDbType: "", // Selected database type (mysql, mongodb, etc.)
    selectedProject: "", // Selected project (if applicable)
    versions: ["1.31.1"] as string[], // Available versions
  });

  const handleNextStep = () => {
    if (currentStep === 1 && !state.selectedName) {
      toast.error("Please enter a database cluster name");
      return;
    }

    if (currentStep === 2 && !state.selectedLocation) {
      toast.error("Please select a location");
      return;
    }

    if (currentStep === 3 && !state.selectedNode) {
      toast.error("Please select  node count");
      return;
    }

    if (currentStep === 4 && !state.selectedPlan) {
      toast.error("Please select a cluster plan");
      return;
    }

    if (currentStep === 5 && !state.selectedVersion) {
      toast.error("Please select a database version");
      return;
    }

    if (currentStep < 7) {
      setCurrentStep(currentStep + 1);
    }
  };

  const handlePrevStep = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };

  const onSubmit = async () => {
    debugger;
    if (!termsAccepted) {
      toast.error("Please accept the terms of service and privacy policy");
      return;
    }

    try {
      setIsLoading(true);
      if (
        !state.selectedNode ||
        !state.selectedName ||
        !state.selectedVersion ||
        !state.selectedLocation ||
        !state.selectedProject
      ) {
        toast.error("Please fill in all the required fields");
        return;
      }

      // const response = await api.post("/services/kubernetes/manageip/read", {
      //   name: state.selectedName,
      //   nodes: state.selectedNode,
      //   planDetails: state.selectedPlan,
      //   version: state.selectedVersion,
      //   location: state.selectedLocation,
      //  // project: state.selectedProject,
      //  // ownerId: userId,
      // });

      //  if (response.data.success === false) {
      //   toast.error(response.data.error || "An error occurred. Please try again.");
      //   return;
      //  }

      //make nodes name array
      let nodeNames = makeNodeKeys(state.selectedNode);
      console.log(nodeNames, ".....nodeNames.....262");

      //generate password for vms
      // const generateStrongPassword = () => {
      //   const chars =
      //     "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
      //   let password = "";

      //   for (let i = 0; i < 12; i++) {
      //     const randomIndex = Math.floor(Math.random() * chars.length);
      //     password += chars[randomIndex];
      //   }

      //   return password;
      // };
      // const vmPassword = generateStrongPassword();
     // console.log(vmPassword, ".........................278");

      //generate vms from digitalOcean apis
      const payload = {
        names: nodeNames,
        region: state.selectedLocation, //form-dependent
        size: state.selectedPlan, //form-dependent
        image: "ubuntu-25-04-x64",
        backups: true,
        ipv6: true,
        monitoring: true,
        tags: ["env:prod", "web", "ssh-allowed"],
       // user_data: `#cloud-config\npassword: ${vmPassword}!\nchpasswd:\n  list: |\n    root:${vmPassword}\n  expire: false\nssh_pwauth: true`,
      };

      console.log(payload, "...............298");

     

      const createDroplet = await api.post(
        "/services/kubernetes/manageip/createdroplet",
        payload,
        // {
        //   headers: {
        //     Authorization:
        //       "Bearer dop_v1_d8c411020fc7d2d41f5f30f35b1e8d8a0b06fffd4de117c28b93a5a461be5e8a",
        //     "Content-Type": "application/json",
        //   },
        // }
      );


       let sendPayload: SendPayload = {
        provider: "existing",
        cluster: {
          name: state.selectedName,
          location: state.selectedLocation,
          pod_cidr: "10.244.0.0/16",
          k8s_minor: "1.31.1",
        },
        auth: { method: "password", user: "root", password: createDroplet.data.vmPassword },
        nodes: [],
        // "cp-1": { "host": "172.104.206.68", "role": "control-plane", "hostname": "cp-1", "cpu": 2, "memory_mb": 512 }

        ips: [],
      };

      //one more idea clicked my mind , instead check status , call get droplet and see status =active or not.

      if (createDroplet.status === 202) {
        let counter = 0;
        while (counter != state.selectedNode + 1) {
          const checkStatus = await api.post(
            // `https://api.digitalocean.com/v2/actions/${createDroplet.data.links.actions[counter].id}`,
            // {
            //   headers: {
            //     Authorization:
            //       "Bearer dop_v1_d8c411020fc7d2d41f5f30f35b1e8d8a0b06fffd4de117c28b93a5a461be5e8a",
            //     "Content-Type": "application/json",
            //   },
            // }
            "/services/kubernetes/manageip/dropletstatus",
             {
              id:createDroplet.data.data.links.actions[counter].id
             }
          );
          if (checkStatus.status === 200) {
            if (checkStatus.data.data.action.status === "completed") {
              // https://api.digitalocean.com/v2/actions/2831633833
              const vmData = await api.post(
                `/services/kubernetes/manageip/readdroplet`,
                 {id:checkStatus.data.data.action.resource_id}
              );
              if (vmData.status === 200) {
                const vmDetails: {
                  host: string;
                  memory_mb: number;
                  name: string;
                  cpu: number;
                  storage: number;
                } = {
                  host: vmData.data.data.droplet.networks.v4.find(
                    (item: { type: string; ip_address: string }) =>
                      item.type === "public"
                  ).ip_address,
                  memory_mb: vmData.data.data.droplet.memory,
                  name: vmData.data.data.droplet.name,
                  cpu: vmData.data.data.droplet.vcpus,
                  storage: vmData.data.data.droplet.disk,
                };
                sendPayload.ips.push(vmDetails.host);
                sendPayload.nodes.push({
                  host: vmDetails.host,
                  role: counter === 0 ? "control-plane" : "worker",
                  hostname: vmDetails.name,
                  cpu: vmDetails.cpu,
                  memory_mb: vmDetails.memory_mb,
                  storage: vmDetails.storage,
                });
                counter++;
              }
            }
          } else {
            continue;
          }
        }
      }

      

      await sleep(120000);

      //console.log({...response.data.payload,ownerId:userId,projectId:state.selectedProject},"{...response.data.payload,ownerId:userId,projectId:state.selectedProject}")
      const response4 = await api.post("/services/kubernetes/clusters", {
        ...sendPayload,
        ownerId: userId,
        projectId: state.selectedProject,
      });
      if (response4.status == 200) {
        alert(
          "your cluster is being created. please wait for some time......."
        );
        //debugger
        toast.success("Cluster request captured");
        //navigate to status page.
        // window.location.href=`/dashboard/${response.data.clusterId}/status`;
        router.push(
          `/dashboard/services/kubernetes/clusters/${encodeURIComponent(response4.data.clusterId)}`
        );
      }

      // toast.success(response.data);
      // Redirect to success page or dashboard
    } catch (error: any) {
      console.log(error);
      if (error.message) {
        console.log(
          error.message,
          ".......error.message...................404"
        );
      }
      toast.error("Failed to create database. Please try again later.");
    } finally {
      setIsLoading(false);
    }
  };

  //   const handleDbTypeChange = (dbType: string) => {
  //     setState((prevState) => ({
  //       ...prevState,
  //       selectedDbType: dbType,
  //       selectedDb: "", // Reset selected plan when changing DB type
  //       selectedVersion:
  //         databaseVersions[dbType as keyof typeof databaseVersions]?.[0] || "",
  //     }));
  //   };

  // const handleKcPlanChange = (dbId: string) => {
  //   //debugger
  //   setState((prevState) => ({
  //     ...prevState,
  //     selectedPlan: availablePlans.find((plan) => plan.planId === dbId) || {},
  //   }));
  // };

  const {
    selectedName,
    selectedNode,
    selectedVersion,
    selectedLocation,
    selectedDbType,
    versions,
    selectedProject,
  } = state;

  //const selectedDatabase = products?.find((db) => db.id === selectedDb);
  const selectedLocationData = locations?.find(
    (location) => location.short === selectedLocation
  );

  const steps = [
    { id: 1, name: "Name" },
    { id: 2, name: "Location" },
    { id: 3, name: "Number" },
    { id: 4, name: "Plan" },
    { id: 5, name: "Version" },
    { id: 6, name: "Project" },
    { id: 7, name: "Payment" },
  ];

  function makeNodeKeys(workers: number): string[] {
    const n = Math.max(0, Math.floor(workers)); // sanitize
    const keys = ["cp-1"];
    for (let i = 1; i <= n; i++) keys.push(`wp-${i}`);
    return keys;
  }

  const sleep = (ms: number) =>
    new Promise<void>((resolve) => setTimeout(resolve, ms));

  // Use predefined database types
  //   const dbTypes = Object.keys(databaseInfo);

  return (
    <div className="py-4">
      <div className="mb-8">
        <div className="flex justify-between mb-2">
          {steps.map((step, index) => (
            <div key={step.id} className="flex-1 flex flex-col items-center">
              <div className="flex items-center w-full">
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors duration-300 ${
                    currentStep > step.id
                      ? "bg-blue-600 text-white"
                      : currentStep === step.id
                        ? "bg-blue-500 text-white"
                        : "bg-white/10 text-white/50"
                  }`}
                >
                  {currentStep > step.id ? <CheckCircle2 size={16} /> : step.id}
                </div>
                {index < steps.length - 1 && (
                  <div
                    className={`flex-1 h-0.5 transition-colors duration-300 ${
                      currentStep > step.id ? "bg-blue-600" : "bg-white/10"
                    }`}
                  ></div>
                )}
              </div>
              <p
                className={`mt-2 text-xs ${currentStep >= step.id ? "text-white" : "text-white/50"}`}
              >
                {step.name}
              </p>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-6">
          {currentStep === 1 && (
            <Card className="bg-white/5 border-white/10">
              <CardHeader>
                <CardTitle className="text-white">
                  Kubernetes Cluster Name
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Input
                  value={selectedName}
                  onChange={(e) =>
                    setState({ ...state, selectedName: e.target.value })
                  }
                  type="text"
                  placeholder="my-production-db"
                  className="bg-white/10 border-white/20 rounded-md text-white placeholder:text-white/50"
                />
              </CardContent>
              <CardFooter className="flex justify-end">
                <Button
                  onClick={handleNextStep}
                  className="bg-white text-black rounded-md hover:bg-gray-200"
                >
                  Next <ChevronRight size={16} className="ml-2" />
                </Button>
              </CardFooter>
            </Card>
          )}

          {currentStep === 2 && (
            <Card className="bg-white/5 border-white/10">
              <CardHeader>
                <CardTitle className="text-white">Location</CardTitle>
              </CardHeader>
              <CardContent>
                <RadioGroup
                  value={selectedLocation}
                  onValueChange={(value) =>
                    setState({ ...state, selectedLocation: value })
                  }
                  className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4"
                >
                  {locations.map((region) => (
                    <div key={region.id}>
                      <RadioGroupItem
                        value={region.short}
                        id={region.city}
                        className="peer sr-only"
                        disabled={!region.available}
                      />
                      <Label
                        htmlFor={region.city}
                        className="flex items-center gap-3 rounded-md bg-white/10 border-2 border-transparent cursor-pointer p-4 transition-all peer-data-[state=checked]:border-blue-500"
                      >
                        <Image
                          src={`https://flagsapi.com/${region.country_code}/flat/64.png`}
                          alt={region.city}
                          width={32}
                          height={24}
                          className="rounded-sm"
                        />
                        <div>
                          <div className="font-medium text-white">
                            {region.city}
                          </div>
                          <div className="text-xs text-white/60">
                            {region.country}
                          </div>
                        </div>
                        {!region.available && (
                          <Badge
                            variant="outline"
                            className="text-xs ml-auto text-white/70 border-white/30"
                          >
                            Coming soon
                          </Badge>
                        )}
                      </Label>
                    </div>
                  ))}
                </RadioGroup>
              </CardContent>
              <CardFooter className="flex justify-between">
                <Button
                  variant="outline"
                  onClick={handlePrevStep}
                  className="rounded-md border-white/20 text-white hover:bg-white/10"
                >
                  Back
                </Button>
                <Button
                  onClick={handleNextStep}
                  className="bg-white text-black rounded-md hover:bg-gray-200"
                >
                  Next <ChevronRight size={16} className="ml-2" />
                </Button>
              </CardFooter>
            </Card>
          )}

          {currentStep === 3 && (
            <Card className="bg-white/5 border-white/10">
              <CardHeader>
                <CardTitle className="text-white">Number of Nodes</CardTitle>
              </CardHeader>
              <CardContent>
                <Input
                  value={selectedNode}
                  onChange={(e) =>
                    setState({ ...state, selectedNode: Number(e.target.value) })
                  }
                  type="number"
                  placeholder="number of nodes (e.g., 3)"
                  className="bg-white/10 border-white/20 rounded-md text-white placeholder:text-white/50"
                />
              </CardContent>
              <CardFooter className="flex justify-between">
                <Button
                  variant="outline"
                  onClick={handlePrevStep}
                  className="rounded-md border-white/20 text-white hover:bg-white/10"
                >
                  Back
                </Button>
                <Button
                  onClick={handleNextStep}
                  className="bg-white text-black rounded-md hover:bg-gray-200"
                >
                  Next <ChevronRight size={16} className="ml-2" />
                </Button>
              </CardFooter>
            </Card>
          )}

          {currentStep === 4 && (
            <Card className="bg-white/5 border-white/10">
              <CardHeader>
                <CardTitle className="text-white">Cluster Plan</CardTitle>
              </CardHeader>
              <CardContent>
                <RadioGroup
                  value={state.selectedPlan}
                  onValueChange={(value) =>
                    setState({ ...state, selectedPlan: value })
                  }
                  className="grid grid-cols-1 gap-4"
                >
                  {availablePlans.map((plan) => (
                    <div key={plan.label}>
                      <RadioGroupItem
                        value={plan.label}
                        id={plan.label}
                        className="peer sr-only"
                      />
                      <Label
                        htmlFor={plan.label}
                        className="block bg-white/10 rounded-lg border-2 border-transparent cursor-pointer p-5 transition-all peer-data-[state=checked]:border-blue-500 hover:bg-white/15"
                      >
                        {/* <div className="flex justify-between items-start mb-4">
                          <div>
                            <p className="font-bold text-lg text-white">{database.name}</p>
                            {database.discount && Number(database.discount) > 0 && (
                              <Badge variant="outline" className="text-green-400 bg-green-500/10 border-green-500/30 mt-2">
                                Save {database.discount}%
                              </Badge>
                            )}
                          </div>
                          <div className="text-right">
                            {database.price === 0 || database.price === null ? (
                              <div>
                                <span className="text-2xl font-bold text-white">Free</span>
                              </div>
                            ) : database.discount ? (
                              <div>
                                <span className="line-through text-sm text-white/40">${database.price}</span>
                                <div className="text-2xl font-bold text-white">
                                  ${(database.price! * (1 - Number(database.discount) / 100)).toFixed(0)}
                                  <span className="text-sm font-normal text-white/60">/mo</span>
                                </div>
                              </div>
                            ) : (
                              <div className="text-2xl font-bold text-white">
                                ${database.price}
                                <span className="text-sm font-normal text-white/60">/mo</span>
                              </div>
                            )}
                          </div>
                        </div> */}
                        {plan.label && (
                          <div className="grid grid-cols-3 gap-3 pt-4 border-t border-white/10">
                            <div>
                              <div className="flex items-center gap-2 mb-1">
                                <Cpu className="w-4 h-4 text-blue-400" />
                                <span className="text-xs text-white/60">
                                  CPU
                                </span>
                              </div>
                              <p className="font-semibold text-white">
                                {plan.cpu} vCPU
                              </p>
                            </div>
                            <div>
                              <div className="flex items-center gap-2 mb-1">
                                <Server className="w-4 h-4 text-green-400" />
                                <span className="text-xs text-white/60">
                                  RAM
                                </span>
                              </div>
                              <p className="font-semibold text-white">
                                {plan.ram} GB
                              </p>
                            </div>
                            <div>
                              <div className="flex items-center gap-2 mb-1">
                                <HardDrive className="w-4 h-4 text-purple-400" />
                                <span className="text-xs text-white/60">
                                  Storage
                                </span>
                              </div>
                              <p className="font-semibold text-white">
                                {plan.storage} GB
                              </p>
                            </div>
                          </div>
                        )}
                      </Label>
                    </div>
                  ))}
                </RadioGroup>
              </CardContent>
              <CardFooter className="flex justify-between">
                <Button
                  variant="outline"
                  onClick={handlePrevStep}
                  className="rounded-md border-white/20 text-white hover:bg-white/10"
                >
                  Back
                </Button>
                <Button
                  onClick={handleNextStep}
                  className="bg-white text-black rounded-md hover:bg-gray-200"
                >
                  Next <ChevronRight size={16} className="ml-2" />
                </Button>
              </CardFooter>
            </Card>
          )}

          {currentStep === 5 && (
            <Card className="bg-white/5 border-white/10">
              <CardHeader>
                <CardTitle className="text-white">Configuration</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div>
                  <Label htmlFor="version" className="mb-2 block text-white">
                    Kubernetes Version
                  </Label>
                  <Select
                    value={selectedVersion}
                    onValueChange={(value) =>
                      setState({ ...state, selectedVersion: value })
                    }
                  >
                    <SelectTrigger
                      id="version"
                      className="w-full bg-white/10 border-white/20 rounded-md text-white"
                    >
                      <SelectValue placeholder="Select version" />
                    </SelectTrigger>
                    <SelectContent className="bg-black border-white/20 text-white">
                      {versions.map((version) => (
                        <SelectItem key={version} value={version}>
                          v{version}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
              <CardFooter className="flex justify-between">
                <Button
                  variant="outline"
                  onClick={handlePrevStep}
                  className="rounded-md border-white/20 text-white hover:bg-white/10"
                >
                  Back
                </Button>
                <Button
                  onClick={handleNextStep}
                  className="bg-white text-black rounded-md hover:bg-gray-200"
                >
                  Next <ChevronRight size={16} className="ml-2" />
                </Button>
              </CardFooter>
            </Card>
          )}

          {currentStep === 6 && (
            <Card className="bg-white/5 border-white/10">
              <CardHeader>
                <CardTitle className="text-white">Select Project</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div>
                  <Label htmlFor="version" className="mb-2 block text-white">
                    Project
                  </Label>
                  <Select
                    value={selectedProject}
                    onValueChange={(value) =>
                      setState({ ...state, selectedProject: value })
                    }
                  >
                    <SelectTrigger
                      id="version"
                      className="w-full bg-white/10 border-white/20 rounded-md text-white"
                    >
                      <SelectValue placeholder="Select version" />
                    </SelectTrigger>
                    <SelectContent className="bg-black border-white/20 text-white">
                      {projects.map((item) => (
                        <SelectItem key={item.id} value={item.id}>
                          {item.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
              <CardFooter className="flex justify-between">
                <Button
                  variant="outline"
                  onClick={handlePrevStep}
                  className="rounded-md border-white/20 text-white hover:bg-white/10"
                >
                  Back
                </Button>
                <Button
                  onClick={handleNextStep}
                  className="bg-white text-black rounded-md hover:bg-gray-200"
                >
                  Next <ChevronRight size={16} className="ml-2" />
                </Button>
              </CardFooter>
            </Card>
          )}

          {currentStep === 7 && (
            <Card className="bg-white/5 border-white/10">
              <CardHeader>
                <CardTitle className="text-white">Review & Payment</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="terms"
                    checked={termsAccepted}
                    onCheckedChange={(checked) =>
                      setTermsAccepted(checked === true)
                    }
                    className="rounded-sm"
                  />
                  <label
                    htmlFor="terms"
                    className="text-sm leading-none text-white"
                  >
                    I accept the{" "}
                    <Link
                      href="/terms"
                      className="text-blue-400 hover:underline"
                    >
                      Terms of Service
                    </Link>{" "}
                    and{" "}
                    <Link
                      href="/privacy"
                      className="text-blue-400 hover:underline"
                    >
                      Privacy Policy
                    </Link>
                  </label>
                </div>
              </CardContent>
              <CardFooter className="flex justify-between">
                <Button
                  variant="outline"
                  onClick={handlePrevStep}
                  disabled={isLoading}
                  className="rounded-md border-white/20 text-white hover:bg-white/10"
                >
                  Back
                </Button>
                <Button
                  onClick={onSubmit}
                  size="lg"
                  disabled={isLoading || !termsAccepted}
                  className="bg-white text-black rounded-md hover:bg-gray-200 w-full sm:w-auto"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin mr-2" />
                      Processing...
                    </>
                  ) : (
                    <>Pay and Deploy</>
                  )}
                </Button>
              </CardFooter>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
};

export default NewClusterPage;
