"use client";
import { kubernetesClusterSchema } from "@/lib/validation/kubernetes";
import { useEffect, useMemo, useState } from "react";
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
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
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

type K8sCpuType = "shared" | "dedicated" | "gpu";

const K8S_CPU_META: Record<K8sCpuType, { label: string; description: string }> = {
  shared: {
    label: "Shared CPU",
    description: "Cost-effective shared vCPU plans for development, staging, and lighter workloads.",
  },
  dedicated: {
    label: "Dedicated CPU",
    description: "Dedicated vCPU plans for production traffic requiring consistent performance.",
  },
  gpu: {
    label: "GPU",
    description: "GPU-accelerated instances for AI/ML, rendering, and compute-heavy tasks.",
  },
};

const K8S_MACHINE_TYPES: Record<K8sCpuType, { value: string; label: string }[]> = {
  shared: [
    { value: "basic", label: "Basic" },
    { value: "premium-intel", label: "Premium Intel" },
    { value: "premium-amd", label: "Premium AMD" },
  ],
  dedicated: [
    { value: "general-purpose", label: "General Purpose" },
    { value: "cpu-optimized", label: "CPU-Optimized" },
    { value: "memory-optimized", label: "Memory-Optimized" },
    { value: "storage-optimized", label: "Storage-Optimized" },
  ],
  gpu: [
    { value: "gpu", label: "GPU Droplet" },
  ],
};

function getProductCpuType(product: Tables<"products">): K8sCpuType {
  const cpuType = (product as { cpu_type?: string }).cpu_type;
  if (cpuType && ["shared", "dedicated", "gpu"].includes(cpuType)) {
    return cpuType as K8sCpuType;
  }
  return "shared";
}

function getProductMachineType(product: Tables<"products">): string {
  return (product as { machine_type?: string }).machine_type || "basic";
}

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
    plan?: string;
    version?: string;
    project?: string;
  }>({
    name: undefined,
    nodes: undefined,
    user: undefined,
    plan: undefined,
    version: undefined,
    project: undefined,
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

  const [selectedCpuType, setSelectedCpuType] = useState<K8sCpuType>("shared");
  const [selectedMachineType, setSelectedMachineType] = useState<string>("basic");

  // Filter products by selected cpu type and machine type
  const filteredProducts = useMemo(() => {
    return products.filter((product) => {
      const productCpu = getProductCpuType(product);
      const productMachine = getProductMachineType(product);
      return productCpu === selectedCpuType && productMachine === selectedMachineType;
    }).sort((a, b) => (a.price ?? 0) - (b.price ?? 0));
  }, [products, selectedCpuType, selectedMachineType]);

  // Filter users based on search query
  const filteredUsers = allUsers.filter(
    (user) =>
      !state.userSearchQuery ||
      user.email.toLowerCase().includes(state.userSearchQuery.toLowerCase()) ||
      (user.username &&
        user.username.toLowerCase().includes(state.userSearchQuery.toLowerCase())) ||
      user.id.toLowerCase().includes(state.userSearchQuery.toLowerCase())
  );

  // Filter projects based on selected user in admin mode
  const filteredProjects = useMemo(() => {
    if (role === "admin") {
      if (!state.selectedUser) {
        return [];
      }
      return projects.filter((project) => project.owner === state.selectedUser);
    }
    return projects;
  }, [projects, role, state.selectedUser]);

  // Keep selected project valid when user selection changes
  useEffect(() => {
    if (!state.selectedProject) {
      return;
    }

    const isProjectAvailable = filteredProjects.some(
      (project) => project.id === state.selectedProject
    );

    if (!isProjectAvailable) {
      setState((prev) => ({ ...prev, selectedProject: "" }));
    }
  }, [filteredProjects, state.selectedProject]);

  // Handle user selection
  const handleUserSelect = (selectedUserId: string) => {
    setState((prev) => ({
      ...prev,
      selectedUser: selectedUserId,
      selectedProject: projects.some(
        (project) =>
          project.id === prev.selectedProject && project.owner === selectedUserId
      )
        ? prev.selectedProject
        : "",
    }));
    if (validationErrors.user || validationErrors.project) {
      setValidationErrors({ ...validationErrors, user: "", project: undefined });
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

    if (currentStep === 4) {
      if (!state.selectedPlan) {
        setValidationErrors((prev) => ({
          ...prev,
          plan: "Please select a plan",
        }));
        toast.error("Please select a plan");
        return;
      }
      setValidationErrors((prev) => ({ ...prev, plan: undefined }));
    }

    if (currentStep === 5) {
      if (!state.selectedVersion) {
        setValidationErrors((prev) => ({
          ...prev,
          version: "Please select a version",
        }));
        toast.error("Please select a version");
        return;
      }
      setValidationErrors((prev) => ({ ...prev, version: undefined }));
    }

    if (currentStep === 6) {
      if (!state.selectedProject) {
        setValidationErrors((prev) => ({
          ...prev,
          project: "Please select a project",
        }));
        toast.error("Please select a project");
        return;
      }
      setValidationErrors((prev) => ({ ...prev, project: undefined }));
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

      const selectedProduct = products.find(
        (product) => product.name === state.selectedPlan
      );
      if (!selectedProduct || !selectedProduct.slug) {
        toast.error("Please select a valid plan");
        return;
      }

      const response = await api.post("/services/kubernetes/clusters/init", {
        name: state.selectedName,
        region: state.selectedLocation,
        version: state.selectedVersion,
        nodeCount: state.selectedNode,
        size: selectedProduct.slug,
        ownerId: targetUserId,
        projectId: state.selectedProject,
        planId: selectedProduct.id,
        resources: {
          cpu: selectedProduct.resources.cpu,
          ram: selectedProduct.resources.ram,
          storage: selectedProduct.resources.storage,
        },
      });
      const settledResponse = response as typeof response & {
        error?: unknown;
        data?: { message?: string; clusterId?: string };
      };

      if (settledResponse.error) {
        return;
      }

      if (settledResponse.status === 200) {
        toast.success("Cluster initialized.");
        if (role === "admin") {
          router.push('/dashboard/admin/kubernetes');
        } else {
          const newClusterId = settledResponse.data?.clusterId;
          if (!newClusterId) {
            toast.error("Cluster created but ID missing — check dashboard.");
            router.push('/dashboard/services/kubernetes');
          } else {
            router.push(
              `/dashboard/services/kubernetes/clusters/${encodeURIComponent(newClusterId)}`
            );
          }
        }
        return;
      }

      toast.error(
        settledResponse.data?.message || "Failed to initialize cluster.",
      );
    } catch (err: unknown) {
      if (err instanceof Error) {
        console.log(err.message, "...........................47");
        toast.error(err.message || "Failed to initialize cluster.");
      } else {
        toast.error("Failed to initialize cluster.");
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
        { id: 0, name: "User",     iconSrc: "/dashboard icons/users & DBs .png" },
        { id: 1, name: "Name",     iconSrc: "/dashboard icons/name .png" },
        { id: 2, name: "Location", iconSrc: "/dashboard icons/location.png" },
        { id: 3, name: "Number",   iconSrc: "/dashboard icons/number .png" },
        { id: 4, name: "Plan",     iconSrc: "/dashboard icons/plan _1.png" },
        { id: 5, name: "Version",  iconSrc: "/dashboard icons/versioning .png" },
        { id: 6, name: "Project",  iconSrc: "/dashboard icons/project _1.png" },
        { id: 7, name: "Payment",  iconSrc: "/dashboard icons/payment .png" },
      ]
    : [
        { id: 1, name: "Name",     iconSrc: "/dashboard icons/name .png" },
        { id: 2, name: "Location", iconSrc: "/dashboard icons/location.png" },
        { id: 3, name: "Number",   iconSrc: "/dashboard icons/number .png" },
        { id: 4, name: "Plan",     iconSrc: "/dashboard icons/plan _1.png" },
        { id: 5, name: "Version",  iconSrc: "/dashboard icons/versioning .png" },
        { id: 6, name: "Project",  iconSrc: "/dashboard icons/project _1.png" },
        { id: 7, name: "Payment",  iconSrc: "/dashboard icons/payment .png" },
      ];

  const panelClassName = "glass-panel overflow-hidden";

  function SummaryRow({ label, value, icon, empty }: { label: string; value: React.ReactNode; icon?: string; empty?: boolean }) {
    return (
      <div className="flex items-center justify-between gap-4 py-2">
        <div className="flex items-center gap-2">
          {icon && (
            <Image src={icon} alt="" width={14} height={14} className={`h-3.5 w-3.5 shrink-0 object-contain ${empty ? "opacity-20" : "opacity-50"}`} />
          )}
          <span className={`text-sm ${empty ? "text-white/28" : "text-white/42"}`}>{label}</span>
        </div>
        <span className={`text-right text-sm ${empty ? "text-white/20" : "font-medium text-white/88"}`}>{value}</span>
      </div>
    );
  }
  const wizardStartStep = role === "admin" ? 0 : 1;
  const progressStep = currentStep - wizardStartStep + 1;
  const progressPercentage = (progressStep / steps.length) * 100;
  const selectedPlanDetails = products.find((plan) => plan.name === selectedPlan);
  const nodePresets = [1, 2, 3, 5];
  const selectedLocationDetails = locations.find((loc) => loc.short === selectedLocation);

  // Use predefined database types
  //   const dbTypes = Object.keys(databaseInfo);

  return (
    <div className="space-y-6 px-2 pt-4 text-white sm:px-3 lg:px-4">
      <div className={panelClassName}>
        <div className="flex flex-col gap-3 px-5 py-4 sm:px-6 sm:py-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-3xl">
            <Link
              href={role === "admin" ? "/dashboard/admin/kubernetes" : "/dashboard/services/kubernetes"}
              className="inline-flex items-center text-sm text-white/60 transition-colors hover:text-white"
            >
              <ArrowLeft size={16} className="mr-2" />
              Back to clusters
            </Link>
            <p className="mt-5 text-[11px] font-semibold uppercase tracking-[0.2em] text-blue-300/70">
              Kubernetes Provisioning
            </p>
            <h1 className="mt-2 text-xl font-semibold tracking-tight text-white sm:text-2xl">
              Create a managed Kubernetes cluster with clearer sizing and deployment controls.
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-white/48">
              Move through cluster identity, region, node count, plan sizing, version, project assignment, and final review in a cleaner enterprise flow.
            </p>
          </div>
          <Image
            src="/dashboard-services-icons/da kuubernetes.png"
            alt=""
            width={160}
            height={160}
            className="hidden shrink-0 object-contain lg:block lg:h-[190px] lg:w-[190px] xl:h-[220px] xl:w-[220px]"
            priority
          />
        </div>

        <div className="border-t border-white/[0.06] px-5 py-4 sm:px-6">
          <div className="mb-3 h-1.5 w-full overflow-hidden bg-white/[0.05]">
            <div
              className="h-full bg-gradient-to-r from-blue-400/85 to-white transition-all duration-300"
              style={{ width: `${progressPercentage}%` }}
            />
          </div>

          <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-7">
            {steps.map((step) => {
              const isActive = currentStep === step.id;
              const isCompleted = currentStep > step.id;

              return (
                <button
                  key={step.id}
                  type="button"
                  onClick={() => {
                    if (step.id < currentStep) {
                      setCurrentStep(step.id);
                    }
                  }}
                  className={`border px-3 py-3 text-left transition-colors ${
                    isActive
                      ? "border-blue-400/30 bg-blue-500/10"
                      : isCompleted
                        ? "border-white/[0.08] bg-white/[0.04] hover:bg-white/[0.06]"
                        : "border-white/[0.06] bg-transparent"
                  } ${step.id < currentStep ? "cursor-pointer" : "cursor-default"}`}
                >
                  <div className="flex flex-col h-full">
                    <span className="text-xs font-semibold text-white/32">0{step.id}</span>
                    <div className="mt-2 flex items-center justify-between gap-2 pt-3">
                      <div className="text-sm font-semibold text-white">{step.name}</div>
                      <div className="relative flex h-12 w-12 shrink-0 items-center justify-center">
                        <Image src={step.iconSrc} alt={step.name} width={44} height={44} className="h-11 w-11 object-contain" />
                        {isCompleted && (
                          <span className="absolute -right-1 -top-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-emerald-500">
                            <svg className="h-2 w-2 text-white" viewBox="0 0 12 12" fill="none"><path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_360px]">

        <div className="space-y-6">
          {currentStep === 0 && (
            <Card className={panelClassName}>
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
                  className="cursor-pointer rounded-md border border-blue-400/25 bg-blue-500/90 text-white hover:bg-blue-500"
                >
                  Next <ChevronRight size={16} className="ml-2" />
                </Button>
              </CardFooter>
            </Card>
          )}

          {currentStep === 1 && (
            <Card className={panelClassName}>
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
                  className="cursor-pointer rounded-md border-white/[0.14] bg-white/[0.03] text-white/82 hover:bg-white/[0.07]"
                >
                  Back
                </Button>
                  )
                }
                <Button
                  onClick={handleNextStep}
                  className="cursor-pointer rounded-md border border-blue-400/25 bg-blue-500/90 text-white hover:bg-blue-500"
                >
                  Next <ChevronRight size={16} className="ml-2" />
                </Button>
              </CardFooter>
            </Card>
          )}

          {currentStep === 2 && (
            <Card className={panelClassName}>
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
                  className="cursor-pointer rounded-md border-white/[0.14] bg-white/[0.03] text-white/82 hover:bg-white/[0.07]"
                >
                  Back
                </Button>
                <Button
                  onClick={handleNextStep}
                  className="cursor-pointer rounded-md border border-blue-400/25 bg-blue-500/90 text-white hover:bg-blue-500"
                >
                  Next <ChevronRight size={16} className="ml-2" />
                </Button>
              </CardFooter>
            </Card>
          )}

          {currentStep === 3 && (
            <Card className={panelClassName}>
              <CardHeader className="space-y-2">
                <CardTitle className="text-white">Worker topology</CardTitle>
                <p className="text-sm leading-6 text-white/50">
                  Choose the worker count for the cluster. One control plane node is
                  included automatically.
                </p>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
                  {nodePresets.map((count) => {
                    const isSelected = selectedNode === count;

                    return (
                      <button
                        key={count}
                        type="button"
                        onClick={() =>
                          setState({
                            ...state,
                            selectedNode: count,
                          })
                        }
                        className={
                          isSelected
                            ? "border border-blue-400/30 bg-blue-500/10 p-4 text-left transition-colors"
                            : "border border-white/[0.08] bg-white/[0.03] p-4 text-left transition-colors hover:bg-white/[0.06]"
                        }
                      >
                        <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/35">
                          Preset
                        </div>
                        <div className="mt-2 text-2xl font-semibold text-white">
                          {count}
                        </div>
                        <div className="mt-1 text-sm text-white/68">
                          Worker{count === 1 ? "" : "s"}
                        </div>
                        <div className="mt-3 text-xs text-white/40">
                          {count + 1} total nodes with control plane
                        </div>
                      </button>
                    );
                  })}
                </div>

                <div className="grid gap-4 lg:grid-cols-[240px_minmax(0,1fr)]">
                  <div className="border border-white/[0.08] bg-white/[0.03] p-4">
                    <Label
                      htmlFor="worker-count"
                      className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/40"
                    >
                      Custom count
                    </Label>
                    <Input
                      id="worker-count"
                      value={selectedNode}
                      onChange={(e) =>
                        setState({
                          ...state,
                          selectedNode: Number(e.target.value),
                        })
                      }
                      type="number"
                      min="1"
                      placeholder="e.g. 3"
                      className={
                        "mt-3 h-11 border-white/[0.12] bg-white/[0.04] text-white placeholder:text-white/35 " +
                        (validationErrors.nodes ? "border-red-500" : "")
                      }
                    />
                    {validationErrors.nodes && (
                      <p className="mt-2 text-sm text-red-400">
                        {validationErrors.nodes}
                      </p>
                    )}
                  </div>

                  <div className="grid gap-3 sm:grid-cols-3">
                    <div className="border border-white/[0.08] bg-white/[0.03] p-4">
                      <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/35">
                        Total nodes
                      </div>
                      <div className="mt-2 text-lg font-semibold text-white">
                        {selectedNode ? selectedNode + 1 : 0}
                      </div>
                      <p className="mt-1 text-xs leading-5 text-white/45">
                        Includes one managed control plane node.
                      </p>
                    </div>
                    <div className="border border-white/[0.08] bg-white/[0.03] p-4">
                      <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/35">
                        Best for
                      </div>
                      <div className="mt-2 text-sm font-medium text-white">
                        API services and internal platforms
                      </div>
                      <p className="mt-1 text-xs leading-5 text-white/45">
                        Scale workers later as workloads grow.
                      </p>
                    </div>
                    <div className="border border-white/[0.08] bg-white/[0.03] p-4">
                      <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/35">
                        Guidance
                      </div>
                      <div className="mt-2 text-sm font-medium text-white">
                        Start lean, expand safely
                      </div>
                      <p className="mt-1 text-xs leading-5 text-white/45">
                        Keep smaller environments efficient during setup.
                      </p>
                    </div>
                  </div>
                </div>
              </CardContent>
              <CardFooter className="flex justify-between">
                <Button
                  variant="outline"
                  onClick={handlePrevStep}
                  className="cursor-pointer rounded-md border-white/[0.14] bg-white/[0.03] text-white/82 hover:bg-white/[0.07]"
                >
                  Back
                </Button>
                <Button
                  onClick={handleNextStep}
                  className="cursor-pointer rounded-md border border-blue-400/25 bg-blue-500/90 text-white hover:bg-blue-500"
                >
                  Next <ChevronRight size={16} className="ml-2" />
                </Button>
              </CardFooter>
            </Card>
          )}

          {currentStep === 4 && (
            <Card className={panelClassName}>
              <CardHeader className="space-y-2">
                <CardTitle className="text-white">Cluster plan</CardTitle>
                <p className="text-sm leading-6 text-white/50">
                  Select a compute profile that matches the initial workload. Choose CPU type,
                  machine type, then pick the right plan size.
                </p>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* CPU Type Tabs */}
                <div>
                  <Label className="mb-3 block text-sm font-medium text-white/78">
                    CPU type
                  </Label>
                  <Tabs
                    value={selectedCpuType}
                    onValueChange={(value) => {
                      const newCpu = value as K8sCpuType;
                      setSelectedCpuType(newCpu);
                      setSelectedMachineType(K8S_MACHINE_TYPES[newCpu]?.[0]?.value || "basic");
                      setState((prev) => ({ ...prev, selectedPlan: "" }));
                    }}
                    className="w-full"
                  >
                    <TabsList className="grid h-auto w-full grid-cols-3 border border-white/[0.08] bg-white/[0.04] p-1">
                      {(Object.keys(K8S_CPU_META) as K8sCpuType[]).map((type) => (
                        <TabsTrigger
                          key={type}
                          value={type}
                          className="rounded-none px-3 py-2 text-xs data-[state=active]:bg-blue-500/90 data-[state=active]:text-white"
                        >
                          {K8S_CPU_META[type].label}
                        </TabsTrigger>
                      ))}
                    </TabsList>
                  </Tabs>
                  <p className="mt-3 text-sm text-white/45">{K8S_CPU_META[selectedCpuType].description}</p>
                </div>

                {/* Machine Type Selector */}
                <div>
                  <Label className="mb-3 block text-sm font-medium text-white/78">
                    Machine type
                  </Label>
                  <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                    {K8S_MACHINE_TYPES[selectedCpuType].map((mt) => {
                      const isSelected = selectedMachineType === mt.value;
                      return (
                        <button
                          key={mt.value}
                          type="button"
                          onClick={() => {
                            setSelectedMachineType(mt.value);
                            setState((prev) => ({ ...prev, selectedPlan: "" }));
                          }}
                          className={`border px-4 py-3 text-left transition-colors ${
                            isSelected
                              ? "border-blue-400/30 bg-blue-500/10"
                              : "border-white/[0.08] bg-white/[0.03] hover:bg-white/[0.06]"
                          }`}
                        >
                          <div className="text-sm font-semibold text-white">
                            {mt.label}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {selectedPlan && (
                  <div className="flex flex-col gap-3 border border-blue-400/20 bg-blue-500/8 p-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-blue-200/70">
                        Selected plan
                      </div>
                      <div className="mt-1 text-base font-semibold text-white">
                        {selectedPlan}
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2 text-xs text-white/72">
                      <span className="border border-white/[0.08] bg-white/[0.06] px-2.5 py-1.5">
                        {selectedPlanDetails?.resources.cpu || 0} vCPU
                      </span>
                      <span className="border border-white/[0.08] bg-white/[0.06] px-2.5 py-1.5">
                        {selectedPlanDetails?.resources.ram || 0} GB RAM
                      </span>
                      <span className="border border-white/[0.08] bg-white/[0.06] px-2.5 py-1.5">
                        {selectedPlanDetails?.resources.storage || 0} GB Storage
                      </span>
                    </div>
                  </div>
                )}

                {filteredProducts.length === 0 ? (
                  <div className="border border-white/[0.08] bg-white/[0.03] px-6 py-12 text-center">
                    <Box className="mx-auto h-8 w-8 text-white/40" />
                    <h3 className="mt-4 text-lg font-semibold text-white">No plans available</h3>
                    <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-white/45">
                      No plans match this CPU type and machine type. Try a different combination
                      or contact support.
                    </p>
                  </div>
                ) : (
                  <div className="max-h-[360px] overflow-y-auto pr-1">
                    <RadioGroup
                      value={state.selectedPlan}
                      onValueChange={(value) => {
                        setState({ ...state, selectedPlan: value });
                        if (validationErrors.plan) {
                          setValidationErrors((prev) => ({ ...prev, plan: undefined }));
                        }
                      }}
                      className="space-y-3"
                    >
                      {filteredProducts.map((plan) => (
                      <div key={plan.id}>
                        <RadioGroupItem
                          value={plan.name || ""}
                          id={plan.name || ""}
                          className="peer sr-only"
                        />
                        <Label
                          htmlFor={plan.name || ""}
                          className="grid cursor-pointer gap-4 border border-white/[0.08] bg-white/[0.03] p-4 transition-colors peer-data-[state=checked]:border-blue-400/30 peer-data-[state=checked]:bg-blue-500/10 hover:bg-white/[0.05] xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_120px] xl:items-center"
                        >
                          <div className="flex items-start gap-3">
                            <div className="flex h-10 w-10 items-center justify-center border border-white/[0.08] bg-white/[0.05] text-blue-300">
                              <Box className="h-4 w-4" />
                            </div>
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <h3 className="text-sm font-semibold text-white sm:text-base">
                                  {plan.name}
                                </h3>
                                {state.selectedPlan === plan.name && (
                                  <Badge className="border-blue-400/30 bg-blue-500/15 text-blue-100 hover:bg-blue-500/15">
                                    Selected
                                  </Badge>
                                )}
                              </div>
                              <p className="mt-1 text-sm leading-6 text-white/48">
                                {plan.description || "Balanced compute profile for Kubernetes workloads."}
                              </p>
                            </div>
                          </div>

                          <div className="grid grid-cols-3 gap-2 sm:max-w-[360px]">
                            <div className="border border-white/[0.08] bg-white/[0.04] px-3 py-2.5">
                              <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-white/35">
                                <Cpu className="h-3.5 w-3.5 text-blue-300" /> CPU
                              </div>
                              <div className="mt-1.5 text-sm font-semibold text-white">
                                {plan.resources.cpu || 0} vCPU
                              </div>
                            </div>
                            <div className="border border-white/[0.08] bg-white/[0.04] px-3 py-2.5">
                              <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-white/35">
                                <Server className="h-3.5 w-3.5 text-emerald-300" /> RAM
                              </div>
                              <div className="mt-1.5 text-sm font-semibold text-white">
                                {plan.resources.ram || 0} GB
                              </div>
                            </div>
                            <div className="border border-white/[0.08] bg-white/[0.04] px-3 py-2.5">
                              <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-white/35">
                                <HardDrive className="h-3.5 w-3.5 text-violet-300" /> Disk
                              </div>
                              <div className="mt-1.5 text-sm font-semibold text-white">
                                {plan.resources.storage || 0} GB
                              </div>
                            </div>
                          </div>

                          <div className="text-left xl:text-right">
                            <div className="text-lg font-semibold text-white">
                              {"$" + (plan.price?.toFixed(2) || "0.00")}
                            </div>
                            <div className="text-xs text-white/45">monthly rate</div>
                          </div>
                        </Label>
                      </div>
                    ))}
                  </RadioGroup>
                </div>
                )}
                {validationErrors.plan && (
                  <p className="text-sm text-red-500">{validationErrors.plan}</p>
                )}
              </CardContent>
              <CardFooter className="flex justify-between">
                <Button
                  variant="outline"
                  onClick={handlePrevStep}
                  className="cursor-pointer rounded-md border-white/[0.14] bg-white/[0.03] text-white/82 hover:bg-white/[0.07]"
                >
                  Back
                </Button>
                <Button
                  onClick={handleNextStep}
                  className="cursor-pointer rounded-md border border-blue-400/25 bg-blue-500/90 text-white hover:bg-blue-500"
                >
                  Next <ChevronRight size={16} className="ml-2" />
                </Button>
              </CardFooter>
            </Card>
          )}

          {currentStep === 5 && (
            <Card className={panelClassName}>
              <CardHeader className="space-y-2">
                <CardTitle className="text-white">Version policy</CardTitle>
                <p className="text-sm leading-6 text-white/50">
                  Pick the Kubernetes version for this cluster. Keep the initial
                  rollout predictable and aligned with supported workloads.
                </p>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {versions.map((version, index) => {
                    const isSelected = selectedVersion === version;

                    return (
                      <button
                        key={version}
                        type="button"
                        onClick={() => {
                          setState({ ...state, selectedVersion: version });
                          if (validationErrors.version) {
                            setValidationErrors((prev) => ({ ...prev, version: undefined }));
                          }
                        }}
                        className={
                          isSelected
                            ? "border border-blue-400/30 bg-blue-500/10 p-4 text-left transition-colors"
                            : "border border-white/[0.08] bg-white/[0.03] p-4 text-left transition-colors hover:bg-white/[0.05]"
                        }
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/35">
                            Kubernetes
                          </div>
                          {index === 0 && (
                            <Badge className="border-blue-400/30 bg-blue-500/15 text-blue-100 hover:bg-blue-500/15">
                              Recommended
                            </Badge>
                          )}
                        </div>
                        <div className="mt-3 text-xl font-semibold text-white">
                          {"v" + version}
                        </div>
                        <p className="mt-2 text-sm leading-6 text-white/48">
                          Stable version for managed cluster provisioning.
                        </p>
                      </button>
                    );
                  })}
                </div>

                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="border border-white/[0.08] bg-white/[0.03] p-4">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/35">
                      Selected
                    </div>
                    <div className="mt-2 text-base font-semibold text-white">
                      {selectedVersion ? "v" + selectedVersion : "Not selected"}
                    </div>
                  </div>
                  <div className="border border-white/[0.08] bg-white/[0.03] p-4">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/35">
                      Track
                    </div>
                    <div className="mt-2 text-base font-semibold text-white">
                      Stable
                    </div>
                  </div>
                  <div className="border border-white/[0.08] bg-white/[0.03] p-4">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/35">
                      Upgrades
                    </div>
                    <div className="mt-2 text-base font-semibold text-white">
                      Managed later
                    </div>
                  </div>
                </div>
                {validationErrors.version && (
                  <p className="text-sm text-red-500">{validationErrors.version}</p>
                )}
              </CardContent>
              <CardFooter className="flex justify-between">
                <Button
                  variant="outline"
                  onClick={handlePrevStep}
                  className="cursor-pointer rounded-md border-white/[0.14] bg-white/[0.03] text-white/82 hover:bg-white/[0.07]"
                >
                  Back
                </Button>
                <Button
                  onClick={handleNextStep}
                  className="cursor-pointer rounded-md border border-blue-400/25 bg-blue-500/90 text-white hover:bg-blue-500"
                >
                  Next <ChevronRight size={16} className="ml-2" />
                </Button>
              </CardFooter>
            </Card>
          )}

          {currentStep === 6 && (
            <Card className={panelClassName}>
              <CardHeader className="space-y-2">
                <CardTitle className="text-white">Project assignment</CardTitle>
                <p className="text-sm leading-6 text-white/50">
                  Attach this cluster to the project that should own operations and billing.
                </p>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_260px]">
                  <div>
                    <Label htmlFor="project" className="mb-2 block text-white">
                      Project
                    </Label>
                    <Select
                      value={selectedProject}
                      onValueChange={(value) => {
                        setState({ ...state, selectedProject: value });
                        if (validationErrors.project) {
                          setValidationErrors((prev) => ({ ...prev, project: undefined }));
                        }
                      }}
                    >
                      <SelectTrigger
                        id="project"
                        className={
                          "h-11 w-full border-white/[0.12] bg-white/[0.04] text-white " +
                          (validationErrors.project ? "border-red-500" : "")
                        }
                      >
                        <SelectValue placeholder="Select project" />
                      </SelectTrigger>
                      <SelectContent className="border-white/20 bg-black text-white">
                        {filteredProjects.map((project) => (
                          <SelectItem key={project.id} value={project.id}>
                            {project.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {filteredProjects.length === 0 && (
                      <p className="mt-2 text-sm text-white/60">
                        {role === "admin"
                          ? "No projects found for selected user."
                          : "No projects available."}
                      </p>
                    )}
                    {validationErrors.project && (
                      <p className="mt-2 text-sm text-red-500">{validationErrors.project}</p>
                    )}
                  </div>

                  <div className="border border-white/[0.08] bg-white/[0.03] p-4">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/35">
                      Selected project
                    </div>
                    <div className="mt-2 text-base font-semibold text-white">
                      {selectedProject
                        ? filteredProjects.find((project) => project.id === selectedProject)?.name || "Unknown project"
                        : "No project selected"}
                    </div>
                    <p className="mt-1 text-xs leading-5 text-white/45">
                      Ownership, grouping, and later operations will follow this project.
                    </p>
                  </div>
                </div>
              </CardContent>
              <CardFooter className="flex justify-between">
                <Button
                  variant="outline"
                  onClick={handlePrevStep}
                  className="cursor-pointer rounded-md border-white/[0.14] bg-white/[0.03] text-white/82 hover:bg-white/[0.07]"
                >
                  Back
                </Button>
                <Button
                  onClick={handleNextStep}
                  className="cursor-pointer rounded-md border border-blue-400/25 bg-blue-500/90 text-white hover:bg-blue-500"
                >
                  Next <ChevronRight size={16} className="ml-2" />
                </Button>
              </CardFooter>
            </Card>
          )}

          {currentStep === 7 && (
            <Card className={panelClassName}>
              <CardHeader className="space-y-2">
                <CardTitle className="text-white">Review and confirm</CardTitle>
                <p className="text-sm leading-6 text-white/50">
                  Verify the provisioning details before cluster creation begins.
                </p>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <div className="border border-white/[0.08] bg-white/[0.03] p-4">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/35">
                      Cluster
                    </div>
                    <div className="mt-2 text-base font-semibold text-white">
                      {selectedName || "Not set"}
                    </div>
                  </div>
                  <div className="border border-white/[0.08] bg-white/[0.03] p-4">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/35">
                      Location
                    </div>
                    <div className="mt-2 text-base font-semibold text-white">
                      {selectedLocationDetails?.city || "Not set"}
                    </div>
                  </div>
                  <div className="border border-white/[0.08] bg-white/[0.03] p-4">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/35">
                      Workers
                    </div>
                    <div className="mt-2 text-base font-semibold text-white">
                      {selectedNode || 0}
                    </div>
                  </div>
                  <div className="border border-white/[0.08] bg-white/[0.03] p-4">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/35">
                      Version
                    </div>
                    <div className="mt-2 text-base font-semibold text-white">
                      {selectedVersion ? "v" + selectedVersion : "Not set"}
                    </div>
                  </div>
                </div>

                <div className="border border-white/[0.08] bg-white/[0.03] p-4">
                  <div className="flex items-start gap-3">
                    <Checkbox
                      id="terms"
                      checked={termsAccepted}
                      onCheckedChange={(checked) => setTermsAccepted(checked === true)}
                      className="mt-1 border-white/30 data-[state=checked]:border-blue-400 data-[state=checked]:bg-blue-500"
                    />
                    <div>
                      <Label htmlFor="terms" className="text-sm font-medium text-white">
                        I understand that provisioning starts immediately.
                      </Label>
                      <p className="mt-1 text-sm leading-6 text-white/45">
                        Charges begin when infrastructure is created. Review the selected plan,
                        project, and version before continuing.
                      </p>
                    </div>
                  </div>
                </div>
              </CardContent>
              <CardFooter className="flex justify-between">
                <Button
                  variant="outline"
                  onClick={handlePrevStep}
                  className="cursor-pointer rounded-md border-white/[0.14] bg-white/[0.03] text-white/82 hover:bg-white/[0.07]"
                >
                  Back
                </Button>
                <Button
                  onClick={onSubmit}
                  disabled={isLoading || !termsAccepted}
                  className="cursor-pointer rounded-md border border-blue-400/25 bg-blue-500/90 text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isLoading ? (
                    <>
                      <Loader2 size={16} className="mr-2 animate-spin" /> Creating
                    </>
                  ) : (
                    <>
                      Create Cluster <ChevronRight size={16} className="ml-2" />
                    </>
                  )}
                </Button>
              </CardFooter>
            </Card>
          )}
        </div>

        <div className="space-y-6">
          <div className={`${panelClassName} lg:sticky lg:top-8`}>
            <div className="border-b border-white/[0.06] px-6 py-5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/38">Summary</p>
              <h3 className="mt-2 text-lg font-semibold text-white">Configuration</h3>
            </div>
            <div className="px-6 py-4">
              <div className="space-y-0.5">
                <SummaryRow icon="/dashboard icons/name.png" label="Cluster" value={selectedName || "—"} empty={!selectedName} />
                <SummaryRow
                  icon="/dashboard icons/region .png"
                  label="Location"
                  value={selectedLocationDetails ? (
                    <span className="flex items-center justify-end gap-2">
                      {selectedLocationDetails.country_code && (
                        <Image src={"https://flagsapi.com/" + selectedLocationDetails.country_code + "/flat/64.png"} alt={selectedLocation} width={16} height={12} className="rounded-sm object-contain" />
                      )}
                      {selectedLocationDetails.city}
                    </span>
                  ) : "—"}
                  empty={!selectedLocation}
                />
                <SummaryRow icon="/dashboard icons/number .png" label="Workers" value={selectedNode ? `${selectedNode} (${selectedNode + 1} total)` : "—"} empty={!selectedNode} />
                <SummaryRow icon="/dashboard icons/versioning .png" label="Version" value={selectedVersion ? `v${selectedVersion}` : "—"} empty={!selectedVersion} />
                {selectedProject && (
                  <SummaryRow icon="/dashboard icons/project _1.png" label="Project" value={projects.find((p) => p.id === selectedProject)?.name || selectedProject} />
                )}
              </div>

              {selectedPlan && (
                <>
                  <div className="my-3 border-t border-white/[0.05]" />
                  <div className="space-y-0.5">
                    <SummaryRow icon="/dashboard icons/plan _1.png" label="Plan" value={selectedPlan} />
                    {selectedPlanDetails && (
                      <>
                        <SummaryRow icon="/dashboard icons/cpu .png" label="vCPU" value={selectedPlanDetails.resources.cpu} />
                        <SummaryRow icon="/dashboard icons/ram .png" label="RAM" value={selectedPlanDetails.resources.ram} />
                        <SummaryRow icon="/dashboard icons/storage .png" label="Disk" value={selectedPlanDetails.resources.storage} />
                      </>
                    )}
                  </div>
                </>
              )}

              <Separator className="my-4 bg-white/[0.08]" />
              <div className="flex items-end justify-between gap-4">
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/35">Monthly rate</div>
                  <div className="mt-2 text-2xl font-semibold text-white">
                    {selectedPlanDetails?.price != null ? `$${selectedPlanDetails.price.toFixed(2)}` : "—"}
                  </div>
                </div>
                {selectedPlanDetails?.price != null && (
                  <Badge variant="outline" className="border-white/[0.10] bg-white/[0.04] text-white/60">per month</Badge>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default NewClusterPage;
