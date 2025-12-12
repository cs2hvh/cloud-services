"use client";
import { kubernetesClusterSchema } from "@/lib/validation/kubernetes";
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
  ArrowLeft,
  CheckCircle2,
  ChevronRight,
  Cpu,
  //   Database,
  HardDrive,
  Loader2,
  //   MapPin,
  Server,
  Box,
} from "lucide-react";
import Image from "next/image";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import Link from "next/link";
import { toast } from "sonner";
// import { formatPrice } from "@/lib/utils";
import { Tables } from "@/lib/supabase/types";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
// import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
// import { Progress } from "@/components/ui/progress";
// import { Icons } from "@/components/ui/icons";
import api from "@/lib/axios/axios";
import { useRouter } from "next/navigation";
// import axios from "axios";
// import { headers } from "next/headers";
// import { Json } from "@/lib/supabase/types";
// import { stat } from "fs";
import z from "zod";
import { Separator } from "@/components/ui/separator";
// import { Clusters } from "@/lib/supabase/queries";
// import { send } from "process";

interface PageProps {
  locations: Tables<"locations">[];
  projects: Tables<"projects">[];
  userId: string;
  clusters: Tables<"clusters_get">[];
  products: Tables<"products">[];
  role?: "user" | "admin";
  allUsers?: Array<{
    id: string;
    email: string;
    username?: string;
  }>;
}

interface EncryptedData {
  encrypted: string;
  iv: string;
  tag: string;
  salt: string;
}

type NodeInfo = {
  host: string;
  role: "control-plane" | "worker"; // Add more roles if needed
  hostname: string;
  cpu: number;
  memory_mb: number;
  storage: number;
  private_ip?: string;
  droplet_id?: number;
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
    password: EncryptedData;
  };
  nodes: NodeInfo[];
  ips: string[];
  planId?: string;
};

const NewClusterPage = ({
  locations,
  projects,
  userId,
  clusters,
  products,
  role = "user",
  allUsers = [],
}: PageProps) => {
  const router = useRouter();
  // const planValue: string = "";
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [currentStep, setCurrentStep] = useState<number>(role === "admin" ? 0 : 1);
  const [termsAccepted, setTermsAccepted] = useState<boolean>(false);
  const [validationErrors, setValidationErrors] = useState<{
    name?: string;
    nodes?: string;
    user?: string;
  }>({
    name: undefined,
    nodes: undefined,
    user: undefined,
  });
  //we need to make plan dynamic
  // const [availablePlans] = useState([
  //   {
  //     planId: "Shared",
  //     label: "s-1vcpu-1gb-amd",
  //     ram: 1,
  //     cpu: 1,
  //     storage: 25,
  //     processor: "amd",
  //   },
  //   {
  //     planId: "Shared",
  //     label: "s-2vcpu-2gb-amd",
  //     ram: 2,
  //     cpu: 1,
  //     storage: 25,
  //   },
  //   {
  //     planId: "Shared",
  //     label: "s-2vcpu-4gb-amd",
  //     ram: 4,
  //     cpu: 2,
  //     storage: 25,
  //   },
  // ]);

  const [state, setState] = useState({
    selectedUser: role === "admin" ? "" : userId,
    userSearchQuery: "",
    selectedPlan: "", // Selected database product
    selectedName: "", // Cluster name
    selectedNode: 0, // Number of nodes
    selectedVersion: "", // Selected version
    selectedLocation: "", // Selected location
    selectedDbType: "", // Selected database type (mysql, mongodb, etc.)
    selectedProject: "", // Selected project (if applicable)
    versions: ["1.31.1"] as string[], // Available versions
  });

  // Filter users based on search query
  const filteredUsers = allUsers.filter(
    (user) =>
      !state.userSearchQuery ||
      user.email.toLowerCase().includes(state.userSearchQuery.toLowerCase()) ||
      (user.username &&
        user.username.toLowerCase().includes(state.userSearchQuery.toLowerCase())) ||
      user.id.toLowerCase().includes(state.userSearchQuery.toLowerCase())
  );

  // Handle user selection
  const handleUserSelect = (selectedUserId: string) => {
    setState((prev) => ({
      ...prev,
      selectedUser: selectedUserId,
    }));
    if (validationErrors.user) {
      setValidationErrors({ ...validationErrors, user: "" });
    }
  };

  const validateUser = (selectedUser: string): string => {
    if (role === "admin" && !selectedUser) {
      return "User selection is required";
    }
    return "";
  };

  const handleNextStep = () => {
    // Validate user on step 0 (admin only)
    if (currentStep === 0 && role === "admin") {
      const userError = validateUser(state.selectedUser || "");
      if (userError) {
        setValidationErrors({ ...validationErrors, user: userError });
        toast.error(userError);
        return;
      } else {
        setValidationErrors({ ...validationErrors, user: "" });
      }
    }

    if (currentStep === 1) {
      try {
        // debugger
        //check if cluster name already exists
        //const clusters = await Clusters.get_by_owner(userId);
        const clusterExists = clusters?.some(
          (cluster) => cluster.cluster_name === state.selectedName
        );
        if (clusterExists) {
          setValidationErrors((prev) => ({
            ...prev,
            name: "Cluster name already exists",
          }));
          return;
        }

        kubernetesClusterSchema.shape.name.parse(state.selectedName);
        setValidationErrors((prev) => ({ ...prev, name: undefined }));
      } catch (error) {
        if (error instanceof z.ZodError) {
          setValidationErrors((prev) => ({
            ...prev,
            name: error.errors[0].message,
          }));
          return;
        }
      }
    }

    if (currentStep === 2) {
      if (!state.selectedLocation) {
        toast.error("Please select a location");
        return;
      }
    }

    if (currentStep === 3) {
      try {
        kubernetesClusterSchema.shape.nodes.parse(state.selectedNode);
        setValidationErrors((prev) => ({ ...prev, nodes: undefined }));
      } catch (error) {
        if (error instanceof z.ZodError) {
          setValidationErrors((prev) => ({
            ...prev,
            nodes: error.errors[0].message,
          }));
          return;
        }
      }
    }

    // Continue with existing step logic
    if (currentStep < 7) {
      setCurrentStep(currentStep + 1);
    }
  };

  const handlePrevStep = () => {
    const minStep = role === "admin" ? 0 : 1;
    if (currentStep > minStep) {
      setCurrentStep(currentStep - 1);
    }
  };

  const onSubmit = async () => {
    if (!termsAccepted) {
      toast.error("Please accept the terms of service and privacy policy");
      return;
    }

    const targetUserId = role === "admin" ? state.selectedUser : userId;
    if (!targetUserId) {
      toast.error("Invalid user selection");
      return;
    }

    try {
     // debugger;
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

      const nodeNames = makeNodeKeys(state.selectedNode, state.selectedName);
      console.log(nodeNames, ".....nodeNames.....262");

      const selectedProduct = products.find(
        (product) => product.name === state.selectedPlan
      );

      //generate vms from digitalOcean apis
      const payload = {
        names: nodeNames,
        region: state.selectedLocation, //form-dependent
        size: selectedProduct?.slug, //form-dependent
        image: "ubuntu-25-04-x64",
        backups: false,
        ipv6: true,
        monitoring: true,
        tags: ["env:prod", "web", "ssh-allowed"],
        // Pass ownerId to allow server-side credit checks
        ownerId: targetUserId,
        // Optional: allow overriding initial upfront cost; default handled server-side
        initial_cost: 5.0,
      };

      console.log(payload, "...............298");

      const createDroplet = await api.post(
        "/services/kubernetes/manageip/createdroplet",
        payload
      );
      //console.log(createDroplet.data, "...........createDroplet.............");

      const sendPayload: SendPayload = {
        provider: "existing",
        cluster: {
          name: state.selectedName,
          location: state.selectedLocation,
          pod_cidr: "10.244.0.0/16",
          k8s_minor: "1.31.1",
        },
        auth: {
          method: "password",
          user: "root",
          password: createDroplet.data.vmPassword,
        },
        planId:selectedProduct?.id,
        nodes: [],
        // "cp-1": { "host": "172.104.206.68", "role": "control-plane", "hostname": "cp-1", "cpu": 2, "memory_mb": 512 }

        ips: [],
      };

      //one more idea clicked my mind , instead check status , call get droplet and see status =active or not.

      if (createDroplet.status === 202) {
        let counter = 0;
        while (counter != state.selectedNode + 1) {
          const checkStatus = await api.post(
            "/services/kubernetes/manageip/dropletstatus",
            {
              id: createDroplet.data.data.links.actions[counter].id,
            }
          );
          if (checkStatus.status === 200) {
            if (checkStatus.data.data.action.status === "completed") {
              // https://api.digitalocean.com/v2/actions/2831633833
              const vmData = await api.post(
                `/services/kubernetes/manageip/readdroplet`,
                { id: checkStatus.data.data.action.resource_id }
              );
              if (vmData.status === 200) {
                const vmDetails: {
                  public_ip: string;
                  memory_mb: number;
                  name: string;
                  cpu: number;
                  storage: number;
                  private_ip?: string;
                  droplet_id?: number;
                } = {
                  public_ip: vmData.data.data.droplet.networks.v4.find(
                    (item: { type: string; ip_address: string }) =>
                      item.type === "public"
                  ).ip_address,
                  private_ip: vmData.data.data.droplet.networks.v4.find(
                    (item: { type: string; ip_address: string }) =>
                      item.type === "private"
                  ).ip_address,
                  memory_mb: vmData.data.data.droplet.memory,
                  name: vmData.data.data.droplet.name,
                  cpu: vmData.data.data.droplet.vcpus,
                  storage: vmData.data.data.droplet.disk,
                  droplet_id: vmData.data.data.droplet.id,
                };
                sendPayload.ips.push(vmDetails.public_ip);
                sendPayload.nodes.push({
                  host: vmDetails.public_ip,
                  role: counter === 0 ? "control-plane" : "worker",
                  hostname: vmDetails.name,
                  cpu: vmDetails.cpu,
                  memory_mb: vmDetails.memory_mb,
                  storage: vmDetails.storage,
                  private_ip: vmDetails.private_ip,
                  droplet_id: vmDetails.droplet_id,
                });
                counter++;
              }
            }
          } else {
            continue;
          }
        }
      }
      else if(createDroplet.status===402){
        toast.error('Insufficient balance. Please top up your account to create a Kubernetes cluster.');
        router.push('dashboard/nav/billing');
        return;
      }

      console.log(sendPayload, "...........sendPayload.............");

      await sleep(120000);

      //console.log({...response.data.payload,ownerId:userId,projectId:state.selectedProject},"{...response.data.payload,ownerId:userId,projectId:state.selectedProject}")
      const response4 = await api.post("/services/kubernetes/clusters", {
        ...sendPayload,
        ownerId: targetUserId,
        projectId: state.selectedProject,
         role:role
      });
      if (response4.status == 200) {
        // alert(
        //   "your cluster is being created. please wait for some time......."
        // );
        //debugger
        toast.success("Cluster request captured");
        //navigate to status page.
        // window.location.href=`/dashboard/${response.data.clusterId}/status`;
        if (role === "admin") {
          router.push('/dashboard/admin/kubernetes');
        } else {
          router.push(
            `/dashboard/services/kubernetes/clusters/${encodeURIComponent(response4.data.clusterId)}`
          );
        }
      }

      // toast.success(response.data);
      // Redirect to success page or dashboard
    } catch (err: unknown) {
      if (err instanceof Error) {
        console.log(err.message, "...........................47");
       // toast.error(err.message)
      } else {
       // toast.error("Unknown error occurred");
      }
    } finally {
      setIsLoading(false);
    }
  };

  const {
    selectedUser,
    userSearchQuery,
    selectedName,
    selectedNode,
    selectedVersion,
    selectedLocation,
    // selectedDbType,
    versions,
    selectedProject,
    selectedPlan,
  } = state;

  //const selectedDatabase = products?.find((db) => db.id === selectedDb);
  // const selectedLocationData = locations?.find(
  //   (location) => location.short === selectedLocation
  // );

  const steps = role === "admin" 
    ? [
        { id: 0, name: "User" },
        { id: 1, name: "Name" },
        { id: 2, name: "Location" },
        { id: 3, name: "Number" },
        { id: 4, name: "Plan" },
        { id: 5, name: "Version" },
        { id: 6, name: "Project" },
        { id: 7, name: "Payment" },
      ]
    : [
        { id: 1, name: "Name" },
        { id: 2, name: "Location" },
        { id: 3, name: "Number" },
        { id: 4, name: "Plan" },
        { id: 5, name: "Version" },
        { id: 6, name: "Project" },
        { id: 7, name: "Payment" },
      ];

  function makeNodeKeys(workers: number, clusterName: string) {
    const nodeNames = [];
    for (let i = 0; i <= workers; i++) {
      const uuid = crypto.randomUUID();
      if (i === 0) {
        nodeNames.push(`${clusterName}-${uuid}-cp-1`);
      } else {
        nodeNames.push(`${clusterName}-${uuid}-wp-${i}`);
      }
    }
    return nodeNames;
  }

  const sleep = (ms: number) =>
    new Promise<void>((resolve) => setTimeout(resolve, ms));

  // Use predefined database types
  //   const dbTypes = Object.keys(databaseInfo);

  return (
    <div >
      <div className="mb-8">
        <div className="mb-6 flex items-center">
          <Link
            href={role === "admin" ? "/dashboard/admin/kubernetes" : "/dashboard/services/kubernetes"}
            className="inline-flex items-center text-sm text-white/70 hover:text-white transition-colors duration-200 bg-white/5 hover:bg-white/10 rounded-lg px-4 py-2 border border-white/10 hover:border-white/20"
          >
            <ArrowLeft size={16} className="mr-2" />
            Back to Clusters
          </Link>
        </div>
        <div className="flex justify-between mb-2 mx-auto">
          {steps.map((step, index) => (
            <div
              key={step.id}
              className="flex-1 min-w-0 flex flex-col items-center"
            >
              {/* Number/Circle and connecting lines */}
              <div className="flex items-center w-full">
                {/* {index > 0 && (
        <div
          className={`basis-0 flex-1 h-0.5 transition-colors duration-300 ${
            currentStep >= step.id ? "bg-blue-600" : "bg-white/10"
          }`}
        />
      )} */}

                <div className="flex flex-col items-center min-w-0">
                  <div
                    className={`shrink-0 rounded-full flex items-center justify-center transition-colors duration-300
                      w-6 h-6 sm:w-7 sm:h-7 md:w-8 md:h-8 ${
                        currentStep > step.id
                          ? "bg-blue-600 text-white"
                          : currentStep === step.id
                            ? "bg-blue-500 text-white"
                            : "bg-white/10 text-white/50"
                      }`}
                  >
                    {currentStep > step.id ? (
                      <CheckCircle2 size={16} />
                    ) : (
                      step.id
                    )}
                  </div>

                  {/* Tag Name */}
                  <p
                    className={`mt-2 text-center truncate max-w-[72px] sm:max-w-[112px] md:max-w-[140px]
                      text-[10px] sm:text-xs md:text-sm ${
                        currentStep >= step.id ? "text-white" : "text-white/50"
                      }`}
                    title={step.name}
                  >
                    {step.name}
                  </p>
                </div>

                {index < steps.length - 1 && (
                  <div
                    className={`basis-0 flex-1 h-0.5 transition-colors duration-300 ${
                      currentStep > step.id ? "bg-blue-600" : "bg-white/10"
                    }`}
                  />
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-6">
          {currentStep === 0 && (
            <Card className="bg-white/5 border-white/10">
              <CardHeader>
                <CardTitle className="text-white">Select User</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="relative space-y-2">
                    <Label htmlFor="user-search" className="text-white/80">
                      Search Users
                    </Label>
                    <Input
                      id="user-search"
                      value={userSearchQuery}
                      onChange={(e) =>
                        setState({ ...state, userSearchQuery: e.target.value })
                      }
                      type="text"
                      placeholder="Search by email or username..."
                      className="bg-white/10 border-white/20 rounded-md text-white placeholder:text-white/50"
                    />
                  </div>
                  <div className="space-y-2">
                   
                    <div className="space-y-2">
                  <Label className="text-white">Available Users</Label>
                  <div className="max-h-[400px] overflow-y-auto border border-white/10 rounded-lg">
                    {filteredUsers.length === 0 ? (
                      <div className="p-4 text-center text-white/60">
                        No users found
                      </div>
                    ) : (
                      filteredUsers.map((user) => (
                        <div
                          key={user.id}
                          onClick={() => handleUserSelect(user.id)}
                          className={`p-4 cursor-pointer transition-colors border-b border-white/5 last:border-b-0 ${
                            selectedUser === user.id
                              ? "bg-blue-500/20 border-l-4 border-l-blue-500"
                              : "hover:bg-white/5"
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <div>
                              <div className="text-white font-medium">
                                {user.email}
                              </div>
                              {user.username && (
                                <div className="text-xs text-white/60">
                                  @{user.username}
                                </div>
                              )}
                            </div>
                            {selectedUser === user.id && (
                              <CheckCircle2 className="h-5 w-5 text-blue-400" />
                            )}
                          </div>
                        </div>
                        
                      ))
                      
                    )}
                  </div>
                </div>
                    {validationErrors.user && (
                      <p className="text-sm text-red-500">
                        {validationErrors.user}
                      </p>
                    )}
                  </div>
                </div>
              </CardContent>
              <CardFooter className="flex justify-end">
                <Button
                  onClick={handleNextStep}
                  className="cursor-pointer bg-white text-black rounded-md hover:bg-gray-200"
                >
                  Next <ChevronRight size={16} className="ml-2" />
                </Button>
              </CardFooter>
            </Card>
          )}

          {currentStep === 1 && (
            <Card className="bg-white/5 border-white/10">
              <CardHeader>
                <CardTitle className="text-white">
                  Kubernetes Cluster Name
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <Input
                    value={selectedName}
                    onChange={(e) =>
                      setState({ ...state, selectedName: e.target.value })
                    }
                    type="text"
                    placeholder="my-production-cluster"
                    className={`bg-white/10 border-white/20 rounded-md text-white placeholder:text-white/50 ${
                      validationErrors.name ? "border-red-500" : ""
                    }`}
                  />
                  {validationErrors.name && (
                    <p className="text-sm text-red-500">
                      {validationErrors.name}
                    </p>
                  )}
                </div>
              </CardContent>
              <CardFooter className={role==='admin'?"flex justify-between":"flex justify-end"}>
                {
                  role === "admin" && (
                     <Button
                  variant="outline"
                  onClick={handlePrevStep}
                  className="cursor-pointer rounded-md border-white/20 text-black hover:bg-white/10"
                >
                  Back
                </Button>
                  )
                }
                <Button
                  onClick={handleNextStep}
                  className="cursor-pointer bg-white text-black rounded-md hover:bg-gray-200"
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
                  className="cursor-pointer rounded-md border-white/20 text-black hover:bg-white/10"
                >
                  Back
                </Button>
                <Button
                  onClick={handleNextStep}
                  className="cursor-pointer bg-white text-black rounded-md hover:bg-gray-200"
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
                <div className="space-y-2">
                  <Input
                    value={selectedNode}
                    onChange={(e) =>
                      setState({
                        ...state,
                        selectedNode: Number(e.target.value),
                      })
                    }
                    type="number"
                    min="1"
                    placeholder="number of nodes (e.g., 3)"
                    className={`bg-white/10 border-white/20 rounded-md text-white placeholder:text-white/50 ${
                      validationErrors.nodes ? "border-red-500" : ""
                    }`}
                  />
                  {validationErrors.nodes && (
                    <p className="text-sm text-red-500">
                      {validationErrors.nodes}
                    </p>
                  )}
                </div>
              </CardContent>
              <CardFooter className="flex justify-between">
                <Button
                  variant="outline"
                  onClick={handlePrevStep}
                  className="cursor-pointer rounded-md border-white/20 text-black hover:bg-white/10"
                >
                  Back
                </Button>
                <Button
                  onClick={handleNextStep}
                  className="cursor-pointer bg-white text-black rounded-md hover:bg-gray-200"
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
               <div className="max-h-[400px] overflow-y-auto border border-white/10 rounded-lg">
              <CardContent>
               
                <RadioGroup
                  value={state.selectedPlan}
                  onValueChange={(value) =>
                    setState({ ...state, selectedPlan: value })
                  }
                  className="grid grid-cols-1 gap-4"
                >
                  {products.map((plan) => (
                    <div key={plan.id}>
                      <RadioGroupItem
                        value={plan.name || ""}
                        id={plan.name || ""}
                        className="peer sr-only"
                      />
                      <Label
                        htmlFor={plan.name || ""}
                        className="block bg-white/10 rounded-lg border-2 border-transparent cursor-pointer p-4 sm:p-5 transition-all peer-data-[state=checked]:border-blue-500 hover:bg-white/15"
                      >
                        {/* Plan Header */}
                        <div className="flex flex-col sm:flex-row items-start justify-between gap-3 sm:gap-4 mb-4">
                          <div className="flex items-start gap-3 flex-1">
                            <div className="p-2 bg-blue-500/20 rounded-lg shrink-0">
                              <Box className="w-5 h-5 text-blue-400" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <h3 className="text-base sm:text-lg font-bold text-white mb-1 truncate">
                                {plan.name}
                              </h3>
                              {plan.description && (
                                <p className="text-xs sm:text-sm text-white/60 line-clamp-2">
                                  {plan.description}
                                </p>
                              )}
                            </div>
                          </div>
                          <div className="text-left sm:text-right ml-11 sm:ml-4 shrink-0">
                            <div className="text-xl sm:text-2xl font-bold text-green-400">
                              ${plan.price?.toFixed(2) || "0.00"}
                            </div>
                            <div className="text-xs text-white/60">per month</div>
                            {plan.discount && plan.discount > 0 && (
                              <div className="text-xs text-orange-400 mt-1">
                                {plan.discount}% off
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Resources Grid */}
                        <div className="grid grid-cols-3 gap-2 sm:gap-3 pt-3 sm:pt-4 border-t border-white/10">
                          <div>
                            <div className="flex items-center gap-1.5 sm:gap-2 mb-1">
                              <Cpu className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-blue-400 shrink-0" />
                              <span className="text-[10px] sm:text-xs text-white/60">
                                CPU
                              </span>
                            </div>
                            <p className="text-sm sm:text-base font-semibold text-white truncate">
                              {plan.resources.cpu || 0} vCPU
                            </p>
                          </div>
                          <div>
                            <div className="flex items-center gap-1.5 sm:gap-2 mb-1">
                              <Server className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-green-400 shrink-0" />
                              <span className="text-[10px] sm:text-xs text-white/60">
                                RAM
                              </span>
                            </div>
                            <p className="text-sm sm:text-base font-semibold text-white truncate">
                              {plan.resources.ram || 0} GB
                            </p>
                          </div>
                          <div>
                            <div className="flex items-center gap-1.5 sm:gap-2 mb-1">
                              <HardDrive className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-purple-400 shrink-0" />
                              <span className="text-[10px] sm:text-xs text-white/60">
                                Storage
                              </span>
                            </div>
                            <p className="text-sm sm:text-base font-semibold text-white truncate">
                              {plan.resources.storage || 0} GB
                            </p>
                          </div>
                        </div>
                      </Label>
                    </div>
                  ))}
                </RadioGroup>
                
              </CardContent>
              </div>
              <CardFooter className="flex justify-between">
                <Button
                  variant="outline"
                  onClick={handlePrevStep}
                  className="cursor-pointer rounded-md border-white/20 text-black hover:bg-white/10"
                >
                  Back
                </Button>
                <Button
                  onClick={handleNextStep}
                  className="cursor-pointer bg-white text-black rounded-md hover:bg-gray-200"
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
                  className="cursor-pointer rounded-md border-white/20 text-black hover:bg-white/10"
                >
                  Back
                </Button>
                <Button
                  onClick={handleNextStep}
                  className="cursor-pointer bg-white text-black rounded-md hover:bg-gray-200"
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
                      <SelectValue placeholder="Select project" />
                    </SelectTrigger>
                    <SelectContent className="bg-black border-white/20 text-white">
                      {projects.filter(item=>item.owner===selectedUser).map((item) => (
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
                  className="cursor-pointer rounded-md border-white/20 text-black hover:bg-white/10"
                >
                  Back
                </Button>
                <Button
                  onClick={handleNextStep}
                  className="cursor-pointer bg-white text-black rounded-md hover:bg-gray-200"
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
                  className="cursor-pointer rounded-md border-white/20 text-black hover:bg-white/10"
                >
                  Back
                </Button>
                <Button
                  onClick={onSubmit}
                  size="lg"
                  disabled={isLoading || !termsAccepted}
                  className="cursor-pointer bg-white text-black rounded-md hover:bg-gray-200 w-full sm:w-auto"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin mr-2" />
                      Processing.. please wait for some time{" "}
                    </>
                  ) : (
                    <>Pay and Deploy</>
                  )}
                </Button>
              </CardFooter>
            </Card>
          )}
        </div>

        <div className="lg:col-span-1">
          <Card className="sticky top-8 bg-white/5 border-white/10">
            <CardHeader>
              <CardTitle className="text-white">Order Summary</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {selectedName && (
                <div className="flex justify-between items-center p-3 bg-white/5 rounded-lg">
                  <span className="text-sm text-white/60">Name:</span>
                  <span className="font-medium text-white">{selectedName}</span>
                </div>
              )}

              {selectedLocation && (
                <div className="flex justify-between items-center p-3 bg-white/5 rounded-lg">
                  <span className="text-sm text-white/60">Location:</span>
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-white">
                      {
                        locations.find((loc) => loc.short === selectedLocation)
                          ?.city
                      }
                    </span>
                    <Image
                      src={`https://flagsapi.com/${locations.find((loc) => loc.short === selectedLocation)?.country_code}/flat/64.png`}
                      alt={selectedLocation}
                      width={20}
                      height={20}
                      className="object-contain"
                    />
                  </div>
                </div>
              )}

              {selectedNode && (
                <div className="flex justify-between items-center p-3 bg-white/5 rounded-lg">
                  <span className="text-sm text-white/60">Node:</span>
                  <span className="font-medium text-white">{selectedNode}</span>
                </div>
              )}

              {selectedPlan && (
                <div className="bg-gradient-to-r from-blue-500/10 to-purple-500/10 border border-white/10 rounded-xl p-4 shadow-lg">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-sm font-medium text-white/80">
                      Selected Plan
                    </span>
                    <div className="px-2 py-1 bg-white/10 rounded-full">
                      <span className="text-xs font-semibold text-white">
                        {selectedPlan}
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-4">
                    <div className="text-center p-3 bg-white/5 rounded-lg hover:bg-white/10 transition-colors">
                      <div className="text-2xl font-bold text-blue-400 mb-1">
                        {
                          products.find(
                            (plan) => plan.name === selectedPlan
                          )?.resources.cpu
                        }
                      </div>
                      <div className="text-xs text-white/60 uppercase tracking-wide">
                        vCPU
                      </div>
                    </div>

                    <div className="text-center p-3 bg-white/5 rounded-lg hover:bg-white/10 transition-colors">
                      <div className="text-2xl font-bold text-green-400 mb-1">
                       {
                          products.find(
                            (plan) => plan.name === selectedPlan
                          )?.resources.ram
                        }
                      </div>
                      <div className="text-xs text-white/60 uppercase tracking-wide">
                        RAM
                      </div>
                    </div>

                    <div className="text-center p-3 bg-white/5 rounded-lg hover:bg-white/10 transition-colors">
                      <div className="text-2xl font-bold text-purple-400 mb-1">
                        {
                          products.find(
                            (plan) => plan.name === selectedPlan
                          )?.resources.storage
                        }
                      </div>
                      <div className="text-xs text-white/60 uppercase tracking-wide">
                        Storage
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {selectedVersion && (
                <div className="flex justify-between items-center p-3 bg-white/5 rounded-lg">
                  <span className="text-sm text-white/60">Version:</span>
                  <span className="font-medium text-white">
                    {selectedVersion}
                  </span>
                </div>
              )}

              {/* {selectedProject && (
      <div className="flex justify-between items-center p-3 bg-white/5 rounded-lg">
        <span className="text-sm text-white/60">Project:</span>
        <span className="font-medium text-white">{selectedProject}</span>
      </div>
    )} */}

              <Separator className="bg-white/10" />
              <div className="flex justify-between items-center font-bold text-lg text-white">
                <span>Total</span>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default NewClusterPage;
