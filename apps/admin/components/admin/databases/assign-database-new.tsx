"use client";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import api from "@/lib/axios/axios";

// Types and utilities
import {
  AdminDatabaseAssignProps,
  DatabaseType,
  UserProject,
  initialState,
  initialErrors,
} from "@/lib/types/admin-database";
import {
  validateUser,
  validateClusterName,
  validateLocation,
  validateDbType,
  validatePlan,
  validateVersion,
  validateProject,
} from "@/lib/validation/admin-database";
import { submitDatabaseAssignment } from "@/lib/utils/admin-database";

// Components
import { StepProgress } from "./step-progress";
import { UserSelectionStep } from "./steps/user-selection";
import { ClusterNameStep } from "./steps/cluster-name";
import { LocationStep } from "./steps/location-selection";
import { SummaryCard } from "./summary-card";

// UI Components
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { 
  ChevronLeft, 
  ChevronRight, 
  Loader2, 
  AlertCircle, 
  Cpu, 
  HardDrive, 
  Server,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { Tables } from "@/lib/supabase/types";

const AdminDatabaseAssign = ({ products, locations, allUsers, allProjects, basePath = "/dashboard/admin/databases" }: AdminDatabaseAssignProps & {
  /** Route prefix of the databases page to return to (admin panel passes its own). */
  basePath?: string;
}) => {
  const [isLoading, setIsLoading] = useState(false);
  const [currentStep, setCurrentStep] = useState(1);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [availablePlans, setAvailablePlans] = useState<Tables<"products">[]>([]);
  const [databaseTypes, setDatabaseTypes] = useState<DatabaseType[]>([]);
  const [loadingTypes, setLoadingTypes] = useState(true);
  const [userProjects, setUserProjects] = useState<UserProject[]>([]);

  const [state, setState] = useState(initialState);
  const [errors, setErrors] = useState(initialErrors);

  const router = useRouter();

  // Get selected data
  const selectedUserData = allUsers.find(user => user.id === state.selectedUser);
  const selectedDatabase = products?.find((db) => db.id === state.selectedDb);
  const selectedLocationData = locations?.find((location) => location.short === state.selectedLocation);
  const selectedDbTypeInfo = databaseTypes.find((type) => type.code === state.selectedDbType);

  const steps = [
    { id: 1, name: "User" },
    { id: 2, name: "Name" },
    { id: 3, name: "Location" },
    { id: 4, name: "Type" },
    { id: 5, name: "Plan" },
    { id: 6, name: "Project" },
    { id: 7, name: "Review" },
  ];

  // Fetch database types on mount
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

  // Filter user projects when user is selected
  useEffect(() => {
    if (!state.selectedUser) {
      setUserProjects([]);
      setState(prev => ({ ...prev, selectedProject: "" }));
      return;
    }

    // Filter projects where the selected user is the owner
    const filteredProjects = allProjects
      .filter(project => project.owner === state.selectedUser)
      .map(project => ({
        id: project.id,
        name: project.name,
        description: project.description || undefined,
        created_at: project.created_at || new Date().toISOString(),
      }));

    setUserProjects(filteredProjects);

    // Auto-select first project if available
    if (filteredProjects.length > 0) {
      setState(prev => ({ ...prev, selectedProject: filteredProjects[0].id }));
    } else {
      setState(prev => ({ ...prev, selectedProject: "" }));
    }
  }, [state.selectedUser, allProjects]);

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

    // Validation logic for each step
    const validationMap: { [key: number]: () => string } = {
      1: () => validateUser(state.selectedUser),
      2: () => validateClusterName(state.selectedName),
      3: () => validateLocation(state.selectedLocation),
      4: () => validateDbType(state.selectedDbType),
      5: () => {
        const planError = validatePlan(state.selectedDb);
        const versionError = validateVersion(state.selectedVersion, state.selectedDbType);
        return planError || versionError;
      },
      6: () => validateProject(state.selectedProject),
    };

    const validator = validationMap[currentStep];
    if (validator) {
      const error = validator();
      if (error) {
        const errorKey = Object.keys(errors)[currentStep - 1] as keyof typeof errors;
        setErrors(prev => ({ ...prev, [errorKey]: error }));
        toast.error(error);
        hasError = true;
      } else {
        const errorKey = Object.keys(errors)[currentStep - 1] as keyof typeof errors;
        setErrors(prev => ({ ...prev, [errorKey]: "" }));
      }
    }

    if (!hasError && currentStep < 7) {
      setCurrentStep(currentStep + 1);
    }
  };

  const handlePrevStep = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };

  const onSubmit = async () => {
    try {
      setIsLoading(true);
      const response = await submitDatabaseAssignment(state, availablePlans, termsAccepted);
      if (response.status === 200) {
        toast.success(response?.data?.message || "creating database for user");
        router.push(basePath);
      }
    } catch (error: unknown) {
      console.log(error);
      toast.error(error instanceof Error ? error.message : "Failed to assign database. Please try again later.");
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

  return (
    <div className="py-4">
      <StepProgress currentStep={currentStep} steps={steps} />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-6">
          {/* Step 1: User Selection */}
          {currentStep === 1 && (
            <UserSelectionStep
              state={state}
              setState={setState}
              errors={errors}
              setErrors={setErrors}
              allUsers={allUsers}
              onNext={handleNextStep}
            />
          )}

          {/* Step 2: Cluster Name */}
          {currentStep === 2 && (
            <ClusterNameStep
              state={state}
              setState={setState}
              errors={errors}
              setErrors={setErrors}
              onNext={handleNextStep}
              onPrev={handlePrevStep}
            />
          )}

          {/* Step 3: Location */}
          {currentStep === 3 && (
            <LocationStep
              state={state}
              setState={setState}
              errors={errors}
              setErrors={setErrors}
              locations={locations}
              onNext={handleNextStep}
              onPrev={handlePrevStep}
            />
          )}

          {/* Step 4: Database Type */}
          {currentStep === 4 && (
            <Card className="bg-gradient-to-b from-white/10 to-white/5 border border-white/10 rounded-2xl shadow-lg backdrop-blur-md transition-all duration-300">
              <CardHeader className="pb-2">
                <CardTitle className="text-lg font-semibold text-foreground tracking-wide">
                  Database Type
                </CardTitle>
              </CardHeader>
              <CardContent>
                {loadingTypes ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="w-8 h-8 animate-spin text-foreground/80" />
                  </div>
                ) : (
                  <>
                    <RadioGroup
                      value={state.selectedDbType}
                      onValueChange={(value) => {
                        handleDbTypeChange(value);
                        if (errors.dbType) {
                          setErrors({ ...errors, dbType: "" });
                        }
                      }}
                      className="grid grid-cols-1 sm:grid-cols-2 gap-5 mt-2"
                    >
                      {databaseTypes
                        .filter((type) => type.available)
                        .map((dbType) => {
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
                                  <p className="font-semibold text-foreground text-sm sm:text-base">
                                    {dbType.name}
                                  </p>
                                  <p className="text-xs text-foreground/60 mt-1 leading-snug">
                                    {dbType.description}
                                  </p>
                                </div>

                                {/* Badge */}
                                {planCount > 0 && (
                                  <Badge
                                    variant="outline"
                                    className="ml-auto text-foreground/80 border-white/20 bg-white/5 px-2 py-0.5 text-xs rounded-md"
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
                  className="rounded-lg border-white/20 text-foreground hover:bg-white/10 hover:text-foreground transition-all"
                >
                  <ChevronLeft size={16} className="mr-2" /> Back
                </Button>
                <Button
                  onClick={handleNextStep}
                  disabled={loadingTypes}
                  className="bg-white text-black rounded-lg font-semibold hover:bg-gray-100 transition-all"
                >
                  Next <ChevronRight size={16} className="ml-2" />
                </Button>
              </CardFooter>
            </Card>
          )}

          {/* Step 5: Plan Selection */}
          {currentStep === 5 && (
            <Card className="bg-white/5 border-white/10">
              <CardHeader>
                <CardTitle className="text-foreground">Database Plan & Version</CardTitle>
              </CardHeader>
              <CardContent>
                {availablePlans.length === 0 ? (
                  <div className="text-center py-8 text-foreground/60">
                    No plans available for this database type
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-4">
                    {availablePlans.map((database) => (
                      <div key={database.id}>
                        <div
                          onClick={() => handleDbPlanChange(database.id)}
                          className={`block bg-white/10 rounded-lg border-2 cursor-pointer p-5 transition-all hover:bg-white/15 ${
                            state.selectedDb === database.id
                              ? "border-blue-500"
                              : "border-transparent"
                          }`}
                        >
                          <div className="flex justify-between items-start mb-4">
                            <div>
                              <p className="font-bold text-lg text-foreground">
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
                                  <span className="text-2xl font-bold text-foreground">
                                    Free
                                  </span>
                                </div>
                              ) : database.discount ? (
                                <div>
                                  <span className="line-through text-sm text-foreground/40">
                                    ${database.price}
                                  </span>
                                  <div className="text-2xl font-bold text-foreground">
                                    $
                                    {(
                                      database.price! *
                                      (1 - Number(database.discount) / 100)
                                    ).toFixed(0)}
                                    <span className="text-sm font-normal text-foreground/60">
                                      /mo
                                    </span>
                                  </div>
                                </div>
                              ) : (
                                <div className="text-2xl font-bold text-foreground">
                                  ${database.price}
                                  <span className="text-sm font-normal text-foreground/60">
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
                                  <span className="text-xs text-foreground/60">
                                    CPU
                                  </span>
                                </div>
                                <p className="font-semibold text-foreground">
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
                                  <span className="text-xs text-foreground/60">
                                    RAM
                                  </span>
                                </div>
                                <p className="font-semibold text-foreground">
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
                                  <span className="text-xs text-foreground/60">
                                    Storage
                                  </span>
                                </div>
                                <p className="font-semibold text-foreground">
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
                          {state.selectedDb === database.id && state.versions.length > 0 && (
                            <div className="mt-4 pt-4 border-t border-white/10">
                              <Label htmlFor="version" className="mb-2 block text-foreground text-sm">
                                Select Version
                              </Label>
                              <Select
                                value={state.selectedVersion}
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
                                  className={`w-full bg-white/10 border-white/20 rounded-md text-foreground ${
                                    errors.version ? "border-red-500" : ""
                                  }`}
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <SelectValue placeholder="Select version" />
                                </SelectTrigger>
                                <SelectContent className="bg-card border-white/20 text-foreground">
                                  {state.versions.map((version) => (
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
                  <ChevronLeft size={16} className="mr-2" /> Back
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

          {/* Step 6: Project Selection */}
          {currentStep === 6 && (
            <Card className="bg-white/5 border-white/10">
              <CardHeader>
                <CardTitle className="text-foreground">Project</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div>
                  <Label htmlFor="project" className="mb-2 block text-foreground">
                    Select Project
                  </Label>
                  {userProjects.length === 0 ? (
                    <div className="text-center py-8 bg-white/5 rounded-lg border border-white/10">
                      <p className="text-foreground/60">This user has no projects available.</p>
                      <p className="text-foreground/40 text-sm mt-2">
                        The user needs to create a project first.
                      </p>
                    </div>
                  ) : (
                    <>
                      <Select
                        value={state.selectedProject}
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
                          className={`w-full bg-white/10 border-white/20 rounded-md text-foreground ${
                            errors.project ? "border-red-500" : ""
                          }`}
                        >
                          <SelectValue placeholder="Select project" />
                        </SelectTrigger>
                        <SelectContent className="bg-card border-white/20 text-foreground">
                          {userProjects.map((project) => (
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
                    </>
                  )}
                </div>
              </CardContent>
              <CardFooter className="flex justify-between">
                <Button
                  variant="outline"
                  onClick={handlePrevStep}
                  className="rounded-md border-white/20 text-dark hover:bg-white/10"
                >
                  <ChevronLeft size={16} className="mr-2" /> Back
                </Button>
                <Button
                  onClick={handleNextStep}
                  disabled={userProjects.length === 0}
                  className="bg-white text-black rounded-md hover:bg-gray-200 disabled:opacity-50"
                >
                  Next <ChevronRight size={16} className="ml-2" />
                </Button>
              </CardFooter>
            </Card>
          )}

          {/* Step 7: Review */}
          {currentStep === 7 && (
           <Card className="bg-white/5 border-white/10">
              <CardHeader>
                <CardTitle className="text-foreground">Review & Payment</CardTitle>
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
                    className="text-sm leading-none text-foreground"
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
                  className="cursor-pointer bg-white text-black rounded-md hover:bg-gray-200 w-full sm:w-auto"
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

        {/* Summary Card */}
        <div className="lg:col-span-1">
          <SummaryCard
            state={state}
            selectedDatabase={selectedDatabase}
            selectedLocationData={selectedLocationData}
            selectedDbTypeInfo={selectedDbTypeInfo}
            selectedUserData={selectedUserData}
            userProjects={userProjects}
          />
        </div>
      </div>
    </div>
  );
};

export default AdminDatabaseAssign;
