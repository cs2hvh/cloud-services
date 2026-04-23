"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  AlertCircle,
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Cpu,
  HardDrive,
  Loader2,
  Server,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import api from "@/lib/axios/axios";
import { Tables } from "@/lib/supabase/types";
import { formatPrice } from "@/lib/utils";
import { NAMING_RULES } from "@/lib/validation/constants";
import { createDatabaseSchema, validateEngineVersion } from "@/lib/validation/database";
import { z } from "zod";

interface PageProps {
  products: Tables<"products">[];
  locations: Tables<"locations">[];
  projects: Tables<"projects">[];
  userId: string;
  clusters: Tables<"database_clusters">[];
}

interface DatabaseType {
  id: string;
  code: string;
  name: string;
  description: string;
  icon_url: string;
  versions: string[];
  available: boolean;
}

type ErrorState = {
  name: string;
  location: string;
  dbType: string;
  plan: string;
  version: string;
  project: string;
};

type CpuType = "basic" | "general_purpose" | "storage_optimized";

type ProductResources = {
  cpu?: number;
  ram?: number;
  storage?: number;
};

const STEP_META = [
  {
    id: 1,
    name: "Name",
    title: "Name the cluster",
    description: "Choose a clear production-safe name for this managed database cluster.",
    iconSrc: "/dashboard-icons/name.png",
  },
  {
    id: 2,
    name: "Location",
    title: "Select deployment region",
    description: "Place the cluster near your applications, users, or compliance boundary.",
    iconSrc: "/dashboard-icons/location.png",
  },
  {
    id: 3,
    name: "Type",
    title: "Choose database engine",
    description: "Select the engine that best matches workload requirements and tooling.",
    iconSrc: "/dashboard-icons/type.png",
  },
  {
    id: 4,
    name: "Plan",
    title: "Right-size compute and storage",
    description: "Pick the performance tier, plan size, and engine version for deployment.",
    iconSrc: "/dashboard-icons/plan-1.png",
  },
  {
    id: 5,
    name: "Project",
    title: "Attach to a project",
    description: "Associate the cluster with an existing project for organization and access.",
    iconSrc: "/dashboard-icons/project-1.png",
  },
  {
    id: 6,
    name: "Review",
    title: "Review and confirm",
    description: "Verify configuration, monthly pricing, and policy acceptance before launch.",
    iconSrc: "/dashboard-icons/review-1.png",
  },
] as const;

const CPU_META: Record<CpuType, { label: string; description: string }> = {
  basic: {
    label: "Basic",
    description: "Shared CPU for development, staging, and lower-throughput workloads.",
  },
  general_purpose: {
    label: "General Purpose",
    description: "Dedicated CPU for steady production traffic and balanced performance.",
  },
  storage_optimized: {
    label: "Storage Optimized",
    description: "Higher storage profile for data-heavy or IO-focused deployments.",
  },
};

const panelClassName = "glass-panel overflow-hidden";

const inputClassName =
  "border-white/[0.14] bg-white/[0.05] text-white placeholder:text-white/30 focus-visible:ring-0 focus-visible:border-white/25";

function getProductResources(product: Tables<"products">): ProductResources {
  return ((product.resources as ProductResources | null) || {}) as ProductResources;
}

function getProductCpuType(product: Tables<"products">): CpuType {
  const cpuType = (product as { cpu_type?: CpuType }).cpu_type;
  return cpuType || "basic";
}

function getDiscountPercent(product: Tables<"products">): number {
  const parsed = Number(product.discount ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function getEffectivePrice(product?: Tables<"products"> | null): number | null {
  if (!product || product.price === null || product.price === undefined) {
    return null;
  }

  const price = Number(product.price);
  if (!Number.isFinite(price)) {
    return null;
  }

  const discount = getDiscountPercent(product);
  return discount > 0 ? price * (1 - discount / 100) : price;
}

function getPriceLabel(product?: Tables<"products"> | null): string {
  if (!product) return "-";

  const effectivePrice = getEffectivePrice(product);
  if (effectivePrice === null || effectivePrice === 0) {
    return "Free";
  }

  return `${formatPrice(effectivePrice)}/mo`;
}

function FieldError({ message }: { message: string }) {
  if (!message) return null;

  return (
    <div className="mt-3 flex items-center gap-2 text-sm text-red-400">
      <AlertCircle className="h-4 w-4" />
      <span>{message}</span>
    </div>
  );
}

function SummaryRow({ label, value, icon, empty }: { label: string; value: React.ReactNode; icon?: string; empty?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2">
      <div className="flex items-center gap-2">
        {icon && (
          <Image src={icon} alt="" width={14} height={14} className={`h-3.5 w-3.5 shrink-0 object-contain ${empty ? "opacity-20" : "opacity-50"}`} unoptimized />
        )}
        <span className={`text-sm ${empty ? "text-white/28" : "text-white/42"}`}>{label}</span>
      </div>
      <span className={`text-right text-sm ${empty ? "text-white/20" : "font-medium text-white/88"}`}>{value}</span>
    </div>
  );
}

function StepContainer({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className={panelClassName}>
      <div className="border-b border-white/[0.06] px-6 py-5 sm:px-7">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/38">
          {eyebrow}
        </p>
        <h2 className="mt-2 text-xl font-semibold tracking-tight text-white sm:text-2xl">
          {title}
        </h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-white/48">{description}</p>
      </div>
      <div className="px-6 py-6 sm:px-7 sm:py-7">{children}</div>
    </div>
  );
}

const DatabaseSelect = ({ products, locations, projects, userId, clusters }: PageProps) => {
  const [isLoading, setIsLoading] = useState(false);
  const [currentStep, setCurrentStep] = useState(1);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [databaseTypes, setDatabaseTypes] = useState<DatabaseType[]>([]);
  const [loadingTypes, setLoadingTypes] = useState(true);
  const [selectedCpuType, setSelectedCpuType] = useState<CpuType>("basic");
  const [state, setState] = useState({
    selectedDb: "",
    selectedName: "",
    selectedVersion: "",
    selectedLocation: "",
    selectedDbType: "",
    selectedProject: "",
  });
  const [errors, setErrors] = useState<ErrorState>({
    name: "",
    location: "",
    dbType: "",
    plan: "",
    version: "",
    project: "",
  });

  const router = useRouter();

  const validateClusterName = (name: string): string => {
    if (!name) {
      return "Cluster name is required";
    }
    if (name.length < NAMING_RULES.MIN_CLUSTER_NAME_LENGTH) {
      return `Cluster name must be at least ${NAMING_RULES.MIN_CLUSTER_NAME_LENGTH} characters`;
    }
    if (name.length > NAMING_RULES.MAX_CLUSTER_NAME_LENGTH) {
      return `Cluster name must be at most ${NAMING_RULES.MAX_CLUSTER_NAME_LENGTH} characters`;
    }
    if (!NAMING_RULES.CLUSTER_NAME_PATTERN.test(name)) {
      return "Cluster name must start and end with alphanumeric and use lowercase letters, numbers, or hyphens only";
    }
    if (clusters.some((cluster) => cluster.name === name)) {
      return "Cluster name already exists";
    }
    return "";
  };

  const validateLocation = (location: string): string => {
    return location ? "" : "Location is required";
  };

  const validateDbType = (dbType: string): string => {
    return dbType ? "" : "Database type is required";
  };

  const validatePlan = (planId: string): string => {
    return planId ? "" : "Database plan is required";
  };

  const validateVersion = (version: string, dbType: string): string => {
    if (!version) {
      return "Version is required";
    }
    if (dbType && !validateEngineVersion(dbType, version)) {
      return "Invalid version for selected database engine";
    }
    return "";
  };

  const validateProject = (projectId: string): string => {
    return projectId ? "" : "Project is required";
  };

  useEffect(() => {
    const fetchDatabaseTypes = async () => {
      try {
        setLoadingTypes(true);
        const response = await api.get("/database-types");
        if (response?.data?.success) {
          setDatabaseTypes(response?.data?.data ?? []);
        }
      } catch (error) {
        console.error("Error fetching database types:", error);
        toast.error("Failed to load database types");
      } finally {
        setLoadingTypes(false);
      }
    };

    fetchDatabaseTypes();
  }, []);

  const selectedDbTypeInfo = useMemo(
    () => databaseTypes.find((type) => type.code === state.selectedDbType),
    [databaseTypes, state.selectedDbType],
  );

  const versions = selectedDbTypeInfo?.versions || [];

  const availablePlans = useMemo(() => {
    if (!state.selectedDbType) {
      return [] as Tables<"products">[];
    }

    return products
      .filter((product) => {
        const matchesDbType = product.sub === state.selectedDbType;
        const matchesCpuType = getProductCpuType(product) === selectedCpuType;
        return matchesDbType && matchesCpuType;
      })
      .sort((first, second) => Number(first.price ?? 0) - Number(second.price ?? 0));
  }, [products, selectedCpuType, state.selectedDbType]);

  useEffect(() => {
    if (state.selectedDb && !availablePlans.some((plan) => plan.id === state.selectedDb)) {
      setState((prev) => ({ ...prev, selectedDb: "" }));
    }
  }, [availablePlans, state.selectedDb]);

  const selectedDatabase =
    availablePlans.find((plan) => plan.id === state.selectedDb) ||
    products.find((plan) => plan.id === state.selectedDb);

  const selectedLocationData = locations.find(
    (location) => location.short === state.selectedLocation,
  );

  const selectedProjectData = projects.find(
    (project) => project.id === state.selectedProject,
  );

  const activeStepMeta = STEP_META[currentStep - 1];

  const handleNextStep = () => {
    const nextErrors = { ...errors };

    if (currentStep === 1) {
      nextErrors.name = validateClusterName(state.selectedName);
    }

    if (currentStep === 2) {
      nextErrors.location = validateLocation(state.selectedLocation);
    }

    if (currentStep === 3) {
      nextErrors.dbType = validateDbType(state.selectedDbType);
    }

    if (currentStep === 4) {
      nextErrors.plan = validatePlan(state.selectedDb);
      nextErrors.version = validateVersion(state.selectedVersion, state.selectedDbType);
    }

    if (currentStep === 5) {
      nextErrors.project = validateProject(state.selectedProject);
    }

    setErrors(nextErrors);

    const fieldOrder: (keyof ErrorState)[] = [
      "name",
      "location",
      "dbType",
      "plan",
      "version",
      "project",
    ];
    const firstError = fieldOrder.map((field) => nextErrors[field]).find(Boolean);

    if (firstError) {
      toast.error(firstError);
      return;
    }

    if (currentStep < STEP_META.length) {
      setCurrentStep((prev) => prev + 1);
    }
  };

  const handlePrevStep = () => {
    if (currentStep > 1) {
      setCurrentStep((prev) => prev - 1);
    }
  };

  const handleDbTypeChange = (dbType: string) => {
    const selectedType = databaseTypes.find((type) => type.code === dbType);

    setState((prev) => ({
      ...prev,
      selectedDbType: dbType,
      selectedDb: "",
      selectedVersion: selectedType?.versions?.[0] || "",
    }));

    setErrors((prev) => ({
      ...prev,
      dbType: "",
      plan: "",
      version: "",
    }));
  };

  const handleDbPlanChange = (dbId: string) => {
    setState((prev) => ({ ...prev, selectedDb: dbId }));
    setErrors((prev) => ({ ...prev, plan: "" }));
  };

  const onSubmit = async () => {
    if (!termsAccepted) {
      toast.error("Please accept the terms of service and privacy policy");
      return;
    }

    try {
      //debugger
      setIsLoading(true);

      if (
        !state.selectedDb ||
        !state.selectedName ||
        !state.selectedVersion ||
        !state.selectedLocation ||
        !state.selectedDbType ||
        !state.selectedProject
      ) {
        toast.error("Please complete all required configuration fields");
        return;
      }

      const selectedPlan = availablePlans.find((plan) => plan.id === state.selectedDb);
      if (!selectedPlan) {
        toast.error("Invalid plan selected");
        return;
      }

      const resources = getProductResources(selectedPlan);
      const sizeSlug =
        selectedPlan.slug || `db-s-${resources.cpu || 1}vcpu-${resources.ram || 1}gb`;

      const payload = {
        name: state.selectedName,
        engine: state.selectedDbType,
        version: state.selectedVersion,
        num_nodes: 1,
        size: sizeSlug,
        plan_id: selectedPlan.id,
        region: state.selectedLocation,
        project_id: state.selectedProject,
        owner_id: userId,
      };

      try {
        createDatabaseSchema.parse(payload);
      } catch (validationError) {
        if (validationError instanceof z.ZodError) {
          const firstError = validationError.errors[0];
          toast.error(firstError.message);
          return;
        }
        throw validationError;
      }

      if (!validateEngineVersion(payload.engine, payload.version)) {
        toast.error(`Version ${payload.version} is not valid for ${payload.engine}`);
        return;
      }

      const response = await api.post("/services/database/create", payload);
      if (response.status === 200) {
        toast.success(response?.data?.message || "Database creation started!");
        const clusterId = response?.data?.data?.cluster_id;
        if (clusterId) {
          router.push(`/dashboard/services/database/clusters/${clusterId}`);
        }
      }
    } catch (error) {
      console.error(error);
      toast.error("Failed to create database. Please try again later.");
    } finally {
      setIsLoading(false);
    }
  };

  const progressPercentage = (currentStep / STEP_META.length) * 100;
  const selectedMonthlyPrice = getEffectivePrice(selectedDatabase);

  return (
    <div className="space-y-6 px-2 pt-4 text-white sm:px-3 lg:px-4">
      <div className={panelClassName}>
        <div className="flex flex-col gap-3 px-5 py-4 sm:px-6 sm:py-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-3xl">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-blue-300/70">
              Database Provisioning
            </p>
            <h1 className="mt-2 text-xl font-semibold tracking-tight text-white sm:text-2xl">
              Create a managed database cluster with a cleaner, production-ready setup flow.
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-white/48">
              Move through naming, region, engine, sizing, and project assignment with a
              focused review before provisioning begins.
            </p>
          </div>
          <Image
            src="/dashboard-services-icons/da database.png"
            alt=""
            width={160}
            height={160}
            className="hidden shrink-0 object-contain lg:block lg:h-[190px] lg:w-[190px] xl:h-[220px] xl:w-[220px]"
            priority
            unoptimized
          />
        </div>

        <div className="border-t border-white/[0.06] px-5 py-4 sm:px-6">
          <div className="mb-3 h-1.5 w-full overflow-hidden bg-white/[0.05]">
            <div
              className="h-full bg-gradient-to-r from-blue-400/85 to-white transition-all duration-300"
              style={{ width: `${progressPercentage}%` }}
            />
          </div>

          <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-6">
            {STEP_META.map((step) => {
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
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-white">{step.name}</div>
                        <div className="mt-1 line-clamp-2 text-[11px] leading-5 text-white/40">{step.title}</div>
                      </div>
                      <div className="relative flex h-12 w-12 shrink-0 items-center justify-center">
                        <Image src={step.iconSrc} alt={step.name} width={44} height={44} className="h-11 w-11 object-contain" unoptimized />
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

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-6">
          <StepContainer
            eyebrow={`Step ${currentStep.toString().padStart(2, "0")}`}
            title={activeStepMeta.title}
            description={activeStepMeta.description}
          >
            {currentStep === 1 && (
              <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_280px]">
                <div>
                  <Label htmlFor="cluster-name" className="mb-3 block text-sm font-medium text-white/78">
                    Cluster name
                  </Label>
                  <Input
                    id="cluster-name"
                    value={state.selectedName}
                    onChange={(event) => {
                      setState((prev) => ({ ...prev, selectedName: event.target.value }));
                      if (errors.name) {
                        setErrors((prev) => ({ ...prev, name: "" }));
                      }
                    }}
                    onBlur={() => {
                      setErrors((prev) => ({
                        ...prev,
                        name: validateClusterName(state.selectedName),
                      }));
                    }}
                    placeholder="my-production-db"
                    className={inputClassName}
                  />
                  <FieldError message={errors.name} />
                  <p className="mt-3 text-sm leading-6 text-white/42">
                    Use a stable lowercase identifier. It should be easy for operators to recognize
                    in tickets, dashboards, and project context.
                  </p>
                </div>

                <div className="border border-white/[0.08] bg-white/[0.04] p-5">
                  <h3 className="text-sm font-semibold text-white">Naming rules</h3>
                  <div className="mt-4 space-y-3 text-sm text-white/50">
                    <p>3-63 characters</p>
                    <p>Lowercase letters, numbers, and hyphens only</p>
                    <p>Must start and end with an alphanumeric character</p>
                    <p>Must be unique across your existing clusters</p>
                  </div>
                </div>
              </div>
            )}

            {currentStep === 2 && (
              <div>
                <RadioGroup
                  value={state.selectedLocation}
                  onValueChange={(value) => {
                    setState((prev) => ({ ...prev, selectedLocation: value }));
                    if (errors.location) {
                      setErrors((prev) => ({ ...prev, location: "" }));
                    }
                  }}
                  className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3"
                >
                  {locations.map((region) => (
                    <div key={region.id}>
                      <RadioGroupItem
                        value={region.short}
                        id={`region-${region.id}`}
                        className="peer sr-only"
                        disabled={!region.available}
                      />
                      <Label
                        htmlFor={`region-${region.id}`}
                        className={`flex cursor-pointer items-center gap-4 border p-4 transition-colors ${
                          region.available
                            ? "border-white/[0.08] bg-white/[0.04] hover:bg-white/[0.06] peer-data-[state=checked]:border-blue-400/30 peer-data-[state=checked]:bg-blue-500/10"
                            : "border-white/[0.05] bg-white/[0.02] opacity-55"
                        }`}
                      >
                        <Image
                          src={`https://flagsapi.com/${region.country_code}/flat/64.png`}
                          alt={region.city}
                          width={32}
                          height={24}
                          className="rounded-sm"
                          unoptimized
                        />
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-semibold text-white">{region.city}</div>
                          <div className="mt-1 text-xs uppercase tracking-wide text-white/35">
                            {region.country}
                          </div>
                        </div>
                        {!region.available && (
                          <Badge variant="outline" className="border-white/[0.14] bg-white/[0.04] text-white/55">
                            Coming soon
                          </Badge>
                        )}
                      </Label>
                    </div>
                  ))}
                </RadioGroup>
                <FieldError message={errors.location} />
              </div>
            )}

            {currentStep === 3 && (
              <div>
                {loadingTypes ? (
                  <div className="flex min-h-[260px] items-center justify-center border border-white/[0.08] bg-white/[0.03]">
                    <div className="text-center">
                      <Loader2 className="mx-auto h-8 w-8 animate-spin text-white/60" />
                      <p className="mt-4 text-sm text-white/45">Loading database engines</p>
                    </div>
                  </div>
                ) : (
                  <RadioGroup
                    value={state.selectedDbType}
                    onValueChange={(value) => {
                      const selectedType = databaseTypes.find((type) => type.code === value);
                      if (!selectedType?.available) return;
                      handleDbTypeChange(value);
                    }}
                    className="grid grid-cols-1 gap-4 xl:grid-cols-2"
                  >
                    {databaseTypes.map((dbType) => {
                      const planCount = products.filter((product) => product.sub === dbType.code).length;

                      return (
                        <div key={dbType.code}>
                          <RadioGroupItem
                            value={dbType.code}
                            id={`db-type-${dbType.code}`}
                            className="peer sr-only"
                            disabled={!dbType.available}
                          />
                          <Label
                            htmlFor={`db-type-${dbType.code}`}
                            className={`flex cursor-pointer items-start gap-4 border p-5 transition-colors ${
                              dbType.available
                                ? "border-white/[0.08] bg-white/[0.04] hover:bg-white/[0.06] peer-data-[state=checked]:border-blue-400/30 peer-data-[state=checked]:bg-blue-500/10"
                                : "border-white/[0.05] bg-white/[0.02] opacity-55"
                            }`}
                          >
                            <div className="flex h-12 w-12 items-center justify-center border border-white/[0.08] bg-white/[0.05]">
                              <Image
                                src={dbType.icon_url}
                                alt={dbType.name}
                                width={28}
                                height={28}
                                className="object-contain"
                              />
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-start justify-between gap-3">
                                <div>
                                  <div className="text-sm font-semibold text-white">{dbType.name}</div>
                                  <div className="mt-1 text-sm leading-6 text-white/45">
                                    {dbType.description}
                                  </div>
                                </div>
                                {!dbType.available && (
                                  <Badge variant="outline" className="border-white/[0.14] bg-white/[0.04] text-white/55">
                                    Unavailable
                                  </Badge>
                                )}
                              </div>

                              <div className="mt-4 flex flex-wrap gap-2">
                                <Badge variant="outline" className="border-white/[0.10] bg-white/[0.03] text-white/60">
                                  {dbType.versions.length} version{dbType.versions.length === 1 ? "" : "s"}
                                </Badge>
                                <Badge variant="outline" className="border-white/[0.10] bg-white/[0.03] text-white/60">
                                  {planCount} plan{planCount === 1 ? "" : "s"}
                                </Badge>
                              </div>
                            </div>
                          </Label>
                        </div>
                      );
                    })}
                  </RadioGroup>
                )}
                <FieldError message={errors.dbType} />
              </div>
            )}

            {currentStep === 4 && (
              <div className="space-y-6">
                <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_260px]">
                  <div>
                    <Label className="mb-3 block text-sm font-medium text-white/78">
                      CPU profile
                    </Label>
                    <Tabs
                      value={selectedCpuType}
                      onValueChange={(value) => {
                        setSelectedCpuType(value as CpuType);
                        setState((prev) => ({ ...prev, selectedDb: "" }));
                        setErrors((prev) => ({ ...prev, plan: "" }));
                      }}
                      className="w-full"
                    >
                      <TabsList className="grid h-auto w-full grid-cols-3 border border-white/[0.08] bg-white/[0.04] p-1">
                        <TabsTrigger value="basic" className="rounded-none px-3 py-2 text-xs data-[state=active]:bg-blue-500/90 data-[state=active]:text-white">
                          {CPU_META.basic.label}
                        </TabsTrigger>
                        <TabsTrigger value="general_purpose" className="rounded-none px-3 py-2 text-xs data-[state=active]:bg-blue-500/90 data-[state=active]:text-white">
                          {CPU_META.general_purpose.label}
                        </TabsTrigger>
                        <TabsTrigger value="storage_optimized" className="rounded-none px-3 py-2 text-xs data-[state=active]:bg-blue-500/90 data-[state=active]:text-white">
                          {CPU_META.storage_optimized.label}
                        </TabsTrigger>
                      </TabsList>
                    </Tabs>
                    <p className="mt-3 text-sm text-white/45">{CPU_META[selectedCpuType].description}</p>
                  </div>

                  <div>
                    <Label htmlFor="version" className="mb-3 block text-sm font-medium text-white/78">
                      Engine version
                    </Label>
                    <Select
                      value={state.selectedVersion}
                      onValueChange={(value) => {
                        setState((prev) => ({ ...prev, selectedVersion: value }));
                        if (errors.version) {
                          setErrors((prev) => ({ ...prev, version: "" }));
                        }
                      }}
                    >
                      <SelectTrigger id="version" className={inputClassName}>
                        <SelectValue placeholder="Select version" />
                      </SelectTrigger>
                      <SelectContent className="border-white/[0.12] bg-[#0a0a0c] text-white">
                        {versions.map((version) => (
                          <SelectItem key={version} value={version}>
                            v{version}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FieldError message={errors.version} />
                  </div>
                </div>

                {availablePlans.length === 0 ? (
                  <div className="border border-white/[0.08] bg-white/[0.03] px-6 py-12 text-center">
                    <Clock3 className="mx-auto h-8 w-8 text-white/40" />
                    <h3 className="mt-4 text-lg font-semibold text-white">No plans available</h3>
                    <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-white/45">
                      Try a different CPU profile or select another database engine to view
                      matching plans.
                    </p>
                  </div>
                ) : (
                  <div className="grid gap-4 xl:grid-cols-2">
                    {availablePlans.map((plan) => {
                      const resources = getProductResources(plan);
                      const isSelected = state.selectedDb === plan.id;
                      const discount = getDiscountPercent(plan);
                      const effectivePrice = getEffectivePrice(plan);

                      return (
                        <button
                          key={plan.id}
                          type="button"
                          onClick={() => handleDbPlanChange(plan.id)}
                          className={`border p-5 text-left transition-colors ${
                            isSelected
                              ? "border-blue-400/30 bg-blue-500/10"
                              : "border-white/[0.08] bg-white/[0.04] hover:bg-white/[0.06]"
                          }`}
                        >
                          <div className="flex items-start justify-between gap-4">
                            <div>
                              <div className="text-lg font-semibold text-white">{plan.name}</div>
                              <div className="mt-1 text-sm text-white/42">
                                {CPU_META[getProductCpuType(plan)].label} profile
                              </div>
                            </div>

                            <div className="text-right">
                              {effectivePrice === null || effectivePrice === 0 ? (
                                <div className="text-2xl font-semibold text-white">Free</div>
                              ) : (
                                <>
                                  {discount > 0 && (
                                    <div className="text-xs text-white/30 line-through">
                                      {formatPrice(Number(plan.price || 0))}/mo
                                    </div>
                                  )}
                                  <div className="text-2xl font-semibold text-white">
                                    {formatPrice(effectivePrice)}
                                    <span className="ml-1 text-sm font-normal text-white/45">/mo</span>
                                  </div>
                                </>
                              )}
                            </div>
                          </div>

                          <div className="mt-5 grid grid-cols-3 gap-3 border-t border-white/[0.08] pt-4">
                            <div>
                              <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-white/35">
                                <Cpu className="h-3.5 w-3.5" /> CPU
                              </div>
                              <div className="mt-2 text-sm font-medium text-white">
                                {resources.cpu || 1} vCPU
                              </div>
                            </div>
                            <div>
                              <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-white/35">
                                <Server className="h-3.5 w-3.5" /> RAM
                              </div>
                              <div className="mt-2 text-sm font-medium text-white">
                                {resources.ram || 1} GB
                              </div>
                            </div>
                            <div>
                              <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-white/35">
                                <HardDrive className="h-3.5 w-3.5" /> Storage
                              </div>
                              <div className="mt-2 text-sm font-medium text-white">
                                {resources.storage || 0} GB
                              </div>
                            </div>
                          </div>

                          {discount > 0 && (
                            <Badge variant="outline" className="mt-4 border-emerald-500/25 bg-emerald-500/10 text-emerald-300">
                              Save {discount}%
                            </Badge>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
                <FieldError message={errors.plan} />
              </div>
            )}

            {currentStep === 5 && (
              <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_280px]">
                <div>
                  <Label htmlFor="project" className="mb-3 block text-sm font-medium text-white/78">
                    Project
                  </Label>
                  <Select
                    value={state.selectedProject}
                    onValueChange={(value) => {
                      setState((prev) => ({ ...prev, selectedProject: value }));
                      if (errors.project) {
                        setErrors((prev) => ({ ...prev, project: "" }));
                      }
                    }}
                  >
                    <SelectTrigger id="project" className={inputClassName}>
                      <SelectValue placeholder="Select a project" />
                    </SelectTrigger>
                    <SelectContent className="border-white/[0.12] bg-[#0a0a0c] text-white">
                      {projects.map((project) => (
                        <SelectItem key={project.id} value={project.id}>
                          {project.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FieldError message={errors.project} />
                  <p className="mt-3 text-sm leading-6 text-white/45">
                    Projects help group infrastructure, audit activity, and access controls. Attach
                    the cluster to the team or workload that owns it.
                  </p>
                </div>

                <div className="border border-white/[0.08] bg-white/[0.04] p-5">
                  <h3 className="text-sm font-semibold text-white">Need a new project?</h3>
                  <p className="mt-3 text-sm leading-6 text-white/45">
                    Create a project first if this cluster belongs to a new environment or customer
                    workload.
                  </p>
                  <Link
                    href="/dashboard/projects/new"
                    className="mt-5 inline-flex items-center gap-1.5 text-sm font-medium text-white/68 transition-colors hover:text-white"
                  >
                    Create project
                    <ArrowUpRight className="h-3.5 w-3.5" />
                  </Link>
                </div>
              </div>
            )}

            {currentStep === 6 && (
              <div className="space-y-6">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="border border-white/[0.08] bg-white/[0.04] p-5">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/35">
                      Provisioning
                    </div>
                    <div className="mt-3 text-sm leading-6 text-white/50">
                      Provisioning begins immediately after confirmation. Status and connection
                      details will appear on the cluster detail page once the service comes online.
                    </div>
                  </div>

                  <div className="border border-white/[0.08] bg-white/[0.04] p-5">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/35">
                      Security & policy
                    </div>
                    <div className="mt-3 text-sm leading-6 text-white/50">
                      Managed database provisioning is governed by your selected project, account
                      billing, and accepted service terms.
                    </div>
                  </div>
                </div>

                <div className="border border-white/[0.08] bg-white/[0.04] p-5">
                  <div className="flex items-start gap-3">
                    <Checkbox
                      id="terms"
                      checked={termsAccepted}
                      onCheckedChange={(checked) => setTermsAccepted(checked === true)}
                      className="mt-0.5 rounded-sm border-white/20 data-[state=checked]:border-blue-400 data-[state=checked]:bg-blue-500"
                    />
                    <label htmlFor="terms" className="text-sm leading-6 text-white/70">
                      I accept the <Link href="/terms" className="text-white underline underline-offset-4">Terms of Service</Link> and <Link href="/privacy" className="text-white underline underline-offset-4">Privacy Policy</Link> for provisioning this managed database cluster.
                    </label>
                  </div>
                </div>
              </div>
            )}
          </StepContainer>

          <div className="flex items-center justify-between gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={handlePrevStep}
              disabled={currentStep === 1 || isLoading}
              className="border-white/[0.12] bg-transparent px-4 text-white hover:bg-white/[0.06] hover:text-white disabled:opacity-40"
            >
              <ChevronLeft className="mr-2 h-4 w-4" />
              Back
            </Button>

            {currentStep < STEP_META.length ? (
              <Button
                type="button"
                onClick={handleNextStep}
                className="cursor-pointer border border-blue-400/25 bg-blue-500/90 px-5 text-white hover:bg-blue-500"
              >
                Continue
                <ChevronRight className="ml-2 h-4 w-4" />
              </Button>
            ) : (
              <Button
                type="button"
                onClick={onSubmit}
                disabled={isLoading || !termsAccepted}
                className="border border-blue-400/25 bg-blue-500/90 px-5 text-white hover:bg-blue-500 disabled:opacity-50"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Provisioning...
                  </>
                ) : (
                  <>
                    Pay and Deploy
                    <ChevronRight className="ml-2 h-4 w-4" />
                  </>
                )}
              </Button>
            )}
          </div>
        </div>

        <div className="space-y-6">
          <div className={`${panelClassName} lg:sticky lg:top-8`}>
            <div className="border-b border-white/[0.06] px-6 py-5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/38">
                Summary
              </p>
              <h3 className="mt-2 text-lg font-semibold text-white">Configuration</h3>
            </div>

            <div className="px-6 py-4">
              {selectedDbTypeInfo && (
                <div className="mb-4 flex items-center gap-3 border border-white/[0.08] bg-white/[0.04] p-3.5">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center border border-blue-400/20 bg-blue-500/10">
                    <Image
                      src={selectedDbTypeInfo.icon_url}
                      alt={selectedDbTypeInfo.name}
                      width={26}
                      height={26}
                      className="object-contain"
                    />
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-white">{selectedDbTypeInfo.name}</div>
                    {state.selectedVersion && (
                      <div className="mt-0.5 text-xs uppercase tracking-wide text-white/35">
                        Version {state.selectedVersion}
                      </div>
                    )}
                  </div>
                </div>
              )}

              <div className="space-y-0.5">
                <SummaryRow icon="/dashboard-icons/name.png" label="Cluster name" value={state.selectedName || "—"} empty={!state.selectedName} />
                <SummaryRow icon="/dashboard-icons/region.png" label="Region" value={selectedLocationData?.city ?? "—"} empty={!selectedLocationData} />
                <SummaryRow icon="/dashboard-icons/engine.png" label="Engine" value={selectedDbTypeInfo?.name ?? "—"} empty={!selectedDbTypeInfo} />
              </div>

              {(selectedDatabase) && (
                <>
                  <div className="my-3 border-t border-white/[0.05]" />
                  <div className="space-y-0.5">
                    <SummaryRow icon="/dashboard-icons/cpu.png" label="CPU profile" value={CPU_META[selectedCpuType].label} />
                    <SummaryRow icon="/dashboard-icons/plan-1.png" label="Plan" value={selectedDatabase.name} />
                    {selectedProjectData && (
                      <SummaryRow icon="/dashboard-icons/project-1.png" label="Project" value={selectedProjectData.name} />
                    )}
                  </div>
                </>
              )}

              <Separator className="my-4 bg-white/[0.08]" />

              <div className="flex items-end justify-between gap-4">
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/35">
                    Estimated monthly cost
                  </div>
                  <div className="mt-2 text-2xl font-semibold text-white">
                    {selectedDatabase ? getPriceLabel(selectedDatabase) : "—"}
                  </div>
                </div>
                {selectedMonthlyPrice !== null && selectedMonthlyPrice !== 0 && (
                  <Badge variant="outline" className="border-white/[0.10] bg-white/[0.04] text-white/60">
                    Billed monthly
                  </Badge>
                )}
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
};

export default DatabaseSelect;
