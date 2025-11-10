"use client";
import { useState, useEffect } from "react";
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
  // Database,
  HardDrive,
  Loader2,
  // MapPin,
  Server,
  AlertCircle,
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
import api from "@/lib/axios/axios";
import { useRouter } from "next/navigation";
import { createDatabaseSchema, validateEngineVersion } from "@/lib/validation/database";
import { NAMING_RULES,  } from "@/lib/validation/constants";
import { z } from "zod";
// import { de } from "zod/v4/locales";

interface PageProps {
  products: Tables<"products">[];
  locations: Tables<"locations">[];
   projects: Tables<"projects">[];
  userId: string;
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

const DatabaseSelect = ({ products, locations, projects, userId }: PageProps) => {
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [currentStep, setCurrentStep] = useState<number>(1);
  const [termsAccepted, setTermsAccepted] = useState<boolean>(false);
  const [availablePlans, setAvailablePlans] = useState<Tables<"products">[]>(
    []
  );
  const [databaseTypes, setDatabaseTypes] = useState<DatabaseType[]>([]);
  const [loadingTypes, setLoadingTypes] = useState<boolean>(true);

  const [state, setState] = useState({
    selectedDb: "", // Selected database product
    selectedName: "", // Cluster name
    selectedVersion: "", // Selected version
    selectedLocation: "", // Selected location
    selectedDbType: "", // Selected database type (mysql, mongodb, etc.)
    versions: [] as string[], // Available versions
    selectedNode: "",
    selectedProject: "",
  });

  // Validation errors state
  const [errors, setErrors] = useState({
    name: "",
    location: "",
    dbType: "",
    plan: "",
    version: "",
    project: "",
  });

  const router = useRouter();

  // Validation functions
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
      return "Cluster name must start and end with alphanumeric, contain only lowercase letters, numbers, and hyphens";
    }
    return "";
  };

  const validateLocation = (location: string): string => {
    if (!location) {
      return "Location is required";
    }
    return "";
  };

  const validateDbType = (dbType: string): string => {
    if (!dbType) {
      return "Database type is required";
    }
    return "";
  };

  const validatePlan = (planId: string): string => {
    if (!planId) {
      return "Database plan is required";
    }
    return "";
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
    if (!projectId) {
      return "Project is required";
    }
    return "";
  };

  // Fetch database types on mount
  useEffect(() => {
    const fetchDatabaseTypes = async () => {
      try {
        setLoadingTypes(true);
        const response = await api.get("/database-types");
        if (response.data.success) {
          setDatabaseTypes(response.data.data);
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

  // Filter products when database type changes
  useEffect(() => {
    if (state.selectedDbType) {
      const filteredProducts = products.filter(
        (product) => product.sub === state.selectedDbType
      );

      setAvailablePlans(filteredProducts);

      // Set versions based on selected DB type from fetched database types
      const selectedType = databaseTypes.find(
        (type) => type.code === state.selectedDbType
      );
      
      if (selectedType) {
        setState((prevState) => ({
          ...prevState,
          versions: selectedType.versions || [],
          selectedVersion: selectedType.versions?.[0] || "",
        }));
      }
    }
  }, [state.selectedDbType, products, databaseTypes]);

  const handleNextStep = () => {
    let hasError = false;

    // Step 1: Validate cluster name
    if (currentStep === 1) {
      const nameError = validateClusterName(state.selectedName);
      if (nameError) {
        setErrors((prev) => ({ ...prev, name: nameError }));
        toast.error(nameError);
        hasError = true;
      } else {
        setErrors((prev) => ({ ...prev, name: "" }));
      }
    }

    // Step 2: Validate location
    if (currentStep === 2) {
      const locationError = validateLocation(state.selectedLocation);
      if (locationError) {
        setErrors((prev) => ({ ...prev, location: locationError }));
        toast.error(locationError);
        hasError = true;
      } else {
        setErrors((prev) => ({ ...prev, location: "" }));
      }
    }

    // Step 3: Validate database type
    if (currentStep === 3) {
      const dbTypeError = validateDbType(state.selectedDbType);
      if (dbTypeError) {
        setErrors((prev) => ({ ...prev, dbType: dbTypeError }));
        toast.error(dbTypeError);
        hasError = true;
      } else {
        setErrors((prev) => ({ ...prev, dbType: "" }));
      }
    }

    // Step 4: Validate plan and version
    if (currentStep === 4) {
      const planError = validatePlan(state.selectedDb);
      const versionError = validateVersion(state.selectedVersion, state.selectedDbType);
      
      if (planError) {
        setErrors((prev) => ({ ...prev, plan: planError }));
        toast.error(planError);
        hasError = true;
      } else if (versionError) {
        setErrors((prev) => ({ ...prev, version: versionError }));
        toast.error(versionError);
        hasError = true;
      } else {
        setErrors((prev) => ({ ...prev, plan: "", version: "" }));
      }
    }

    // Step 5: Validate project
    if (currentStep === 5) {
      const projectError = validateProject(state.selectedProject);
      if (projectError) {
        setErrors((prev) => ({ ...prev, project: projectError }));
        toast.error(projectError);
        hasError = true;
      } else {
        setErrors((prev) => ({ ...prev, project: "" }));
      }
    }

    // Only proceed if no validation errors
    if (!hasError && currentStep < 6) {
      setCurrentStep(currentStep + 1);
    }
  };

  const handlePrevStep = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };

  const onSubmit = async () => {
    if (!termsAccepted) {
      toast.error("Please accept the terms of service and privacy policy");
      return;
    }

    try {
      
      setIsLoading(true);
      debugger
      // Validate all required fields
      if (
        !state.selectedDb ||
        !state.selectedName ||
        !state.selectedVersion ||
        !state.selectedLocation ||
        !state.selectedDbType ||
        !state.selectedProject
      ) {
        toast.error("Please fill in all the required fields");
        return;
      }

      // Get the selected plan resources
      const selectedPlan = availablePlans.find(plan => plan.id === state.selectedDb);
      if (!selectedPlan) {
        toast.error("Invalid plan selected");
        return;
      }

      // Prepare payload matching the schema
      const payload = {
        name: state.selectedName,
        engine: state.selectedDbType,
        version: state.selectedVersion,
        num_nodes: 1,
        size: `db-s-${selectedPlan.resources?.cpu || 1}vcpu-${selectedPlan.resources?.ram || 1}gb`,
        region: state.selectedLocation,
        project_id: state.selectedProject,
        owner_id: userId,
      };

      // Validate payload with Zod schema
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

      // Validate engine version compatibility
      if (!validateEngineVersion(payload.engine, payload.version)) {
        toast.error(`Version ${payload.version} is not valid for ${payload.engine}`);
        return;
      }

      const response = await api.post("/services/database/create", payload);
      if (response.status === 200) {
        toast.success(
          response.data.message || "Database creation started!"
        );
        router.push(
          `/dashboard/services/database/clusters/${response.data.data.cluster_id}`
        );
      }
    } catch (error) {
      console.log(error);
      toast.error("Failed to create database. Please try again later.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleDbTypeChange = (dbType: string) => {
    const selectedType = databaseTypes.find((type) => type.code === dbType);
    
    setState((prevState) => ({
      ...prevState,
      selectedDbType: dbType,
      selectedDb: "", // Reset selected plan when changing DB type
      selectedVersion: selectedType?.versions?.[0] || "",
    }));
  };

  const handleDbPlanChange = (dbId: string) => {
    setState((prevState) => ({
      ...prevState,
      selectedDb: dbId,
    }));
  };

  const {
    selectedDb,
    selectedName,
    selectedVersion,
    selectedLocation,
    selectedDbType,
    versions,
    selectedNode,
    selectedProject
  } = state;

  const selectedDatabase = products?.find((db) => db.id === selectedDb);
  const selectedLocationData = locations?.find(
    (location) => location.short === selectedLocation
  );

  const steps = [
    { id: 1, name: "Name" },
    { id: 2, name: "Location" },
    { id: 3, name: "Type" },
    { id: 4, name: "Plan" },
    { id: 5, name: "Project" },
    { id: 6, name: "Review" },
  ];

  // Get current selected database type info
  const selectedDbTypeInfo = databaseTypes.find(
    (type) => type.code === selectedDbType
  );

  return (
    <div className="py-4">
      <div className="mb-8">
        <div className="flex justify-between mb-2">
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
          {currentStep === 1 && (
            <Card className="bg-white/5 border-white/10">
              <CardHeader>
                <CardTitle className="text-white">
                  Database Cluster Name
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <Input
                    value={selectedName}
                    onChange={(e) => {
                      const value = e.target.value;
                      setState({ ...state, selectedName: value });
                      // Clear error on change
                      if (errors.name) {
                        setErrors({ ...errors, name: "" });
                      }
                    }}
                    onBlur={() => {
                      // Validate on blur
                      const error = validateClusterName(selectedName);
                      setErrors({ ...errors, name: error });
                    }}
                    type="text"
                    placeholder="my-production-db"
                    className={`bg-white/10 border-white/20 rounded-md text-white placeholder:text-white/50 ${
                      errors.name ? "border-red-500 focus:border-red-500" : ""
                    }`}
                  />
                  {errors.name && (
                    <div className="flex items-center gap-2 text-red-500 text-sm">
                      <AlertCircle className="w-4 h-4" />
                      <span>{errors.name}</span>
                    </div>
                  )}
                  <p className="text-xs text-white/50">
                    Must be 3-63 characters, lowercase letters, numbers, and hyphens only. 
                    Must start and end with alphanumeric.
                  </p>
                </div>
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
                  onValueChange={(value) => {
                    setState({ ...state, selectedLocation: value });
                    // Clear error on change
                    if (errors.location) {
                      setErrors({ ...errors, location: "" });
                    }
                  }}
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
                {errors.location && (
                  <div className="flex items-center gap-2 text-red-500 text-sm mt-4">
                    <AlertCircle className="w-4 h-4" />
                    <span>{errors.location}</span>
                  </div>
                )}
              </CardContent>
              <CardFooter className="flex justify-between">
                <Button
                  variant="outline"
                  onClick={handlePrevStep}
                  className="rounded-md border-white/20 text-dark hover:bg-white/10"
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

          {/* {currentStep === 3 && (
            <Card className="bg-white/5 border-white/10">
              <CardHeader>
                <CardTitle className="text-white"> Nodes</CardTitle>
              </CardHeader>
              <CardContent>
                <Input
                  value={selectedNode}
                  onChange={(e) =>
                    setState({ ...state, selectedNode: e.target.value })
                  }
                  type="number"
                  placeholder="number of nodes"
                  className="bg-white/10 border-white/20 rounded-md text-white placeholder:text-white/50"
                />
              </CardContent>
              <CardFooter className="flex justify-between">
                 <Button
                  variant="outline"
                  onClick={handlePrevStep}
                  className="rounded-md border-white/20 text-dark hover:bg-white/10"
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
          )} */}

          {currentStep === 3 && (
           <Card className="bg-gradient-to-b from-white/10 to-white/5 border border-white/10 rounded-2xl shadow-lg backdrop-blur-md transition-all duration-300">
  <CardHeader className="pb-2">
    <CardTitle className="text-lg font-semibold text-white tracking-wide">
      Database Type
    </CardTitle>
  </CardHeader>

  <CardContent>
    {loadingTypes ? (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-white/80" />
      </div>
    ) : (
      <>
        <RadioGroup
          value={selectedDbType}
          onValueChange={(value) => {
            handleDbTypeChange(value);
            if (errors.dbType) {
              setErrors({ ...errors, dbType: "" });
            }
          }}
          className="grid grid-cols-1 sm:grid-cols-2 gap-5 mt-2"
        >
          {databaseTypes.map((dbType) => {
            const planCount = products.filter(
              (p) => p.sub === dbType.code
            ).length;

            return (
              <div key={dbType.code} className="relative">
                <RadioGroupItem
                  value={dbType.code}
                  id={`type-${dbType.code}`}
                  className="peer sr-only"
                />

                <Label
                  htmlFor={`type-${dbType.code}`}
                  className="flex items-start gap-3 bg-white/10 rounded-xl border border-white/10 cursor-pointer p-4 transition-all duration-200 hover:bg-white/15 peer-data-[state=checked]:border-blue-500 peer-data-[state=checked]:bg-blue-500/10"
                >
                  {/* Icon */}
                  <div className="w-12 h-12 flex items-center justify-center rounded-md bg-white/10 flex-shrink-0">
                    <Image
                      src={dbType.icon_url}
                      alt={dbType.name}
                      width={40}
                      height={40}
                      className="object-contain"
                    />
                  </div>

                  {/* Text */}
                  <div className="flex-1">
                    <p className="font-semibold text-white text-sm sm:text-base">
                      {dbType.name}
                    </p>
                    <p className="text-xs text-white/60 mt-1 leading-snug">
                      {dbType.description}
                    </p>
                  </div>

                  {/* Badge */}
                  {planCount > 0 && (
                    <Badge
                      variant="outline"
                      className="ml-auto text-white/80 border-white/20 bg-white/5 px-2 py-0.5 text-xs rounded-md"
                    >
                      {planCount} plans
                    </Badge>
                  )}
                </Label>
              </div>
            );
          })}
        </RadioGroup>

        {/* Error message */}
        {errors.dbType && (
          <div className="flex items-center gap-2 text-red-500 text-sm mt-4">
            <AlertCircle className="w-4 h-4" />
            <span>{errors.dbType}</span>
          </div>
        )}
      </>
    )}
  </CardContent>

  <CardFooter className="flex justify-between mt-4 pt-4 border-t border-white/10">
    <Button
      variant="outline"
      onClick={handlePrevStep}
      className="rounded-lg border-white/20 text-white hover:bg-white/10 hover:text-white transition-all"
    >
      Back
    </Button>
    <Button
      onClick={handleNextStep}
      className="bg-white text-black rounded-lg font-semibold hover:bg-gray-100 transition-all"
    >
      Next <ChevronRight size={16} className="ml-2" />
    </Button>
  </CardFooter>
</Card>

          )}

          {currentStep === 4 && (
            <Card className="bg-white/5 border-white/10">
              <CardHeader>
                <CardTitle className="text-white">Database Plan & Version</CardTitle>
              </CardHeader>
              <CardContent>
                {availablePlans.length === 0 ? (
                  <div className="text-center py-8 text-white/60">
                    No plans available for this database type
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-4">
                    {availablePlans.map((database) => (
                      <div key={database.id}>
                        <div
                          onClick={() => handleDbPlanChange(database.id)}
                          className={`block bg-white/10 rounded-lg border-2 cursor-pointer p-5 transition-all hover:bg-white/15 ${
                            selectedDb === database.id
                              ? "border-blue-500"
                              : "border-transparent"
                          }`}
                        >
                          <div className="flex justify-between items-start mb-4">
                            <div>
                              <p className="font-bold text-lg text-white">
                                {database.name}
                              </p>
                              {database.discount &&
                                Number(database.discount) > 0 && (
                                  <Badge
                                    variant="outline"
                                    className="text-green-400 bg-green-500/10 border-green-500/30 mt-2"
                                  >
                                    Save {database.discount}%
                                  </Badge>
                                )}
                            </div>
                            <div className="text-right">
                              {database.price === 0 || database.price === null ? (
                                <div>
                                  <span className="text-2xl font-bold text-white">
                                    Free
                                  </span>
                                </div>
                              ) : database.discount ? (
                                <div>
                                  <span className="line-through text-sm text-white/40">
                                    ${database.price}
                                  </span>
                                  <div className="text-2xl font-bold text-white">
                                    $
                                    {(
                                      database.price! *
                                      (1 - Number(database.discount) / 100)
                                    ).toFixed(0)}
                                    <span className="text-sm font-normal text-white/60">
                                      /mo
                                    </span>
                                  </div>
                                </div>
                              ) : (
                                <div className="text-2xl font-bold text-white">
                                  ${database.price}
                                  <span className="text-sm font-normal text-white/60">
                                    /mo
                                  </span>
                                </div>
                              )}
                            </div>
                          </div>
                          {database.resources && (
                            <div className="grid grid-cols-3 gap-3 pt-4 border-t border-white/10">
                              <div>
                                <div className="flex items-center gap-2 mb-1">
                                  <Cpu className="w-4 h-4 text-blue-400" />
                                  <span className="text-xs text-white/60">
                                    CPU
                                  </span>
                                </div>
                                <p className="font-semibold text-white">
                                  {
                                    (
                                      database.resources as {
                                        cpu: number;
                                        ram: number;
                                        storage: number;
                                      }
                                    ).cpu
                                  }{" "}
                                  vCPU
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
                                  {
                                    (
                                      database.resources as {
                                        cpu: number;
                                        ram: number;
                                        storage: number;
                                      }
                                    ).ram
                                  }{" "}
                                  GB
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
                                  {
                                    (
                                      database.resources as {
                                        cpu: number;
                                        ram: number;
                                        storage: number;
                                      }
                                    ).storage
                                  }{" "}
                                  GB
                                </p>
                              </div>
                            </div>
                          )}
                          
                          {/* Version Selection - Show only when this plan is selected */}
                          {selectedDb === database.id && versions.length > 0 && (
                            <div className="mt-4 pt-4 border-t border-white/10">
                              <Label htmlFor="version" className="mb-2 block text-white text-sm">
                                Select Version
                              </Label>
                              <Select
                                value={selectedVersion}
                                onValueChange={(value) => {
                                  setState({ ...state, selectedVersion: value });
                                  // Clear error on change
                                  if (errors.version) {
                                    setErrors({ ...errors, version: "" });
                                  }
                                }}
                              >
                                <SelectTrigger
                                  id="version"
                                  className={`w-full bg-white/10 border-white/20 rounded-md text-white ${
                                    errors.version ? "border-red-500" : ""
                                  }`}
                                  onClick={(e) => e.stopPropagation()}
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
                              {errors.version && (
                                <div className="flex items-center gap-2 text-red-500 text-sm mt-2">
                                  <AlertCircle className="w-4 h-4" />
                                  <span>{errors.version}</span>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                    {errors.plan && (
                      <div className="flex items-center gap-2 text-red-500 text-sm mt-2">
                        <AlertCircle className="w-4 h-4" />
                        <span>{errors.plan}</span>
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
              <CardFooter className="flex justify-between">
                <Button
                  variant="outline"
                  onClick={handlePrevStep}
                  className="rounded-md border-white/20 text-dark hover:bg-white/10"
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
                <CardTitle className="text-white">Project</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div>
                  <Label htmlFor="project" className="mb-2 block text-white">
                    Select Project
                  </Label>
                  <Select
                    value={selectedProject}
                    onValueChange={(value) => {
                      setState({ ...state, selectedProject: value });
                      // Clear error on change
                      if (errors.project) {
                        setErrors({ ...errors, project: "" });
                      }
                    }}
                  >
                    <SelectTrigger
                      id="project"
                      className={`w-full bg-white/10 border-white/20 rounded-md text-white ${
                        errors.project ? "border-red-500" : ""
                      }`}
                    >
                      <SelectValue placeholder="Select project" />
                    </SelectTrigger>
                    <SelectContent className="bg-black border-white/20 text-white">
                      {projects.map((project) => (
                        <SelectItem key={project.id} value={project.id}>
                          {project.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {errors.project && (
                    <div className="flex items-center gap-2 text-red-500 text-sm mt-2">
                      <AlertCircle className="w-4 h-4" />
                      <span>{errors.project}</span>
                    </div>
                  )}
                </div>
              </CardContent>
              <CardFooter className="flex justify-between">
                <Button
                  variant="outline"
                  onClick={handlePrevStep}
                  className="rounded-md border-white/20 text-dark hover:bg-white/10"
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
                  className="rounded-md border-white/20 text-dark hover:bg-white/10"
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

        <div className="lg:col-span-1">
          <Card className="sticky top-8 bg-white/5 border-white/10">
            <CardHeader>
              <CardTitle className="text-white">Order Summary</CardTitle>
              {selectedDbTypeInfo && (
                <div className="mt-4 p-4 bg-white/5 rounded-lg flex justify-center">
                  <Image
                    src={selectedDbTypeInfo.icon_url}
                    alt={selectedDbTypeInfo.name}
                    width={60}
                    height={60}
                    className="object-contain"
                  />
                </div>
              )}
            </CardHeader>
            <CardContent className="space-y-4">
              {selectedName && (
                <div className="flex justify-between items-center">
                  <span className="text-sm text-white/60">Name:</span>
                  <span className="font-medium text-white">{selectedName}</span>
                </div>
              )}
              {selectedDbTypeInfo && (
                <div className="flex justify-between items-center">
                  <span className="text-sm text-white/60">Type:</span>
                  <div className="flex items-center gap-2">
                    <Image
                      src={selectedDbTypeInfo.icon_url}
                      alt={selectedDbTypeInfo.name}
                      width={20}
                      height={20}
                      className="object-contain"
                    />
                    <span className="font-medium text-white">
                      {selectedDbTypeInfo.name}
                    </span>
                  </div>
                </div>
              )}
              {selectedNode && (
                <div className="flex justify-between items-center">
                  <span className="text-sm text-white/60">Node:</span>
                  <span className="font-medium text-white">{selectedNode}</span>
                </div>
              )}
              {selectedDatabase && (
                <div className="flex justify-between items-center">
                  <span className="text-sm text-white/60">Plan:</span>
                  <span className="font-medium text-white">
                    {selectedDatabase.name}
                  </span>
                </div>
              )}
              {selectedVersion && (
                <div className="flex justify-between items-center">
                  <span className="text-sm text-white/60">Version:</span>
                  <span className="font-medium text-white">
                    v{selectedVersion}
                  </span>
                </div>
              )}
              {selectedLocationData && (
                <div className="flex justify-between items-center">
                  <span className="text-sm text-white/60">Location:</span>
                  <div className="flex items-center gap-2">
                    <Image
                      src={`https://flagsapi.com/${selectedLocationData.country_code}/flat/64.png`}
                      alt={selectedLocationData.city}
                      width={16}
                      height={12}
                      className="rounded-sm"
                    />
                    <span className="font-medium text-white">
                      {selectedLocationData.city}
                    </span>
                  </div>
                </div>
              )}
              <Separator className="bg-white/10" />
              <div className="flex justify-between items-center font-bold text-lg text-white">
                <span>Total</span>
                <span>
                  {selectedDatabase
                    ? selectedDatabase.price === 0 ||
                      selectedDatabase.price === null
                      ? "Free"
                      : selectedDatabase.discount &&
                          Number(selectedDatabase.discount) > 0
                        ? `${formatPrice(selectedDatabase.price! * (1 - Number(selectedDatabase.discount) / 100))}/mo`
                        : `${formatPrice(selectedDatabase.price!)}/mo`
                    : "-"}
                </span>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default DatabaseSelect;
