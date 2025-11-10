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
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { 
  ChevronLeft, 
  ChevronRight, 
  Loader2, 
  AlertCircle, 
  Cpu, 
  HardDrive, 
  Server,
  CheckCircle2 
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { formatPrice } from "@/lib/utils";
import { Tables } from "@/lib/supabase/types";

const AdminDatabaseAssign = ({ products, locations, allUsers }: AdminDatabaseAssignProps) => {
  const [isLoading, setIsLoading] = useState(false);
  const [currentStep, setCurrentStep] = useState(1);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [availablePlans, setAvailablePlans] = useState<Tables<"products">[]>([]);
  const [databaseTypes, setDatabaseTypes] = useState<DatabaseType[]>([]);
  const [loadingTypes, setLoadingTypes] = useState(true);
  const [userProjects, setUserProjects] = useState<UserProject[]>([]);
  const [loadingProjects, setLoadingProjects] = useState(false);

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

  // Fetch user projects when user is selected
  useEffect(() => {
    const fetchUserProjects = async () => {
      if (!state.selectedUser) {
        setUserProjects([]);
        return;
      }

      try {
        setLoadingProjects(true);
        const response = await api.get(`/users/projects/${state.selectedUser}`);
        if (response.data.success) {
          setUserProjects(response.data.data.projects);
          // Auto-select first project if available
          if (response.data.data.projects.length > 0) {
            setState(prev => ({ ...prev, selectedProject: response.data.data.projects[0].id }));
          }
        }
      } catch (error) {
        console.error("Error fetching user projects:", error);
        toast.error("Failed to load user projects");
        setUserProjects([]);
      } finally {
        setLoadingProjects(false);
      }
    };

    fetchUserProjects();
  }, [state.selectedUser]);

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
        toast.success(response.data.message || "Database successfully assigned!");
        router.push("/dashboard/admin/databases");
      }
    } catch (error: any) {
      console.log(error);
      toast.error(error.message || "Failed to assign database. Please try again later.");
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
            <Card className="bg-white/5 border-white/10">
              <CardHeader>
                <CardTitle className="text-white">Database Type</CardTitle>
              </CardHeader>
              <CardContent>
                {loadingTypes ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
                  </div>
                ) : (
                  <RadioGroup
                    value={state.selectedDbType}
                    onValueChange={handleDbTypeChange}
                    className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"
                  >
                    {databaseTypes
                      .filter((type) => type.available)
                      .map((dbType) => (
                        <div key={dbType.id}>
                          <RadioGroupItem
                            value={dbType.code}
                            id={dbType.code}
                            className="peer sr-only"
                          />
                          <Label
                            htmlFor={dbType.code}
                            className="flex flex-col items-center gap-3 rounded-md bg-white/10 border-2 border-transparent cursor-pointer p-6 transition-all peer-data-[state=checked]:border-blue-500 hover:bg-white/15"
                          >
                            <Image
                              src={dbType.icon_url}
                              alt={dbType.name}
                              width={48}
                              height={48}
                              className="rounded-lg"
                            />
                            <div className="text-center">
                              <div className="font-medium text-white">
                                {dbType.name}
                              </div>
                              <div className="text-xs text-white/60 mt-1">
                                {dbType.description}
                              </div>
                              <div className="text-xs text-blue-400 mt-2">
                                {dbType.versions.length > 0 && 
                                  `${dbType.versions.length} version${dbType.versions.length !== 1 ? 's' : ''} available`
                                }
                              </div>
                            </div>
                          </Label>
                        </div>
                      ))}
                  </RadioGroup>
                )}
                {errors.dbType && (
                  <div className="flex items-center gap-2 text-red-500 text-sm mt-4">
                    <AlertCircle className="w-4 h-4" />
                    <span>{errors.dbType}</span>
                  </div>
                )}
              </CardContent>
              <CardFooter className="flex justify-between">
                <Button
                  variant="outline"
                  onClick={handlePrevStep}
                  className="cursor-pointer rounded-md border-white/20 text-white hover:bg-white/10"
                >
                  <ChevronLeft size={16} className="mr-2" /> Back
                </Button>
                <Button
                  onClick={handleNextStep}
                  disabled={loadingTypes}
                  className="bg-white text-black rounded-md hover:bg-gray-200"
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
                <CardTitle className="text-white">
                  Choose Plan for {selectedDbTypeInfo?.name}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-6">
                  {/* Version Selection */}
                  <div>
                    <Label className="text-white mb-2 block">Version</Label>
                    <Select
                      value={state.selectedVersion}
                      onValueChange={(value) => {
                        setState({ ...state, selectedVersion: value });
                        if (errors.version) {
                          setErrors({ ...errors, version: "" });
                        }
                      }}
                    >
                      <SelectTrigger className="bg-neutral-900 border-neutral-800 text-white focus:ring-0">
                        <SelectValue placeholder="Select version" />
                      </SelectTrigger>
                      <SelectContent className="bg-neutral-900 border-neutral-800">
                        {state.versions.map((version) => (
                          <SelectItem
                            key={version}
                            value={version}
                            className="text-white focus:bg-neutral-800 focus:text-white"
                          >
                            {version}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Plan Selection */}
                  <div>
                    <Label className="text-white mb-4 block">Plan</Label>
                    <RadioGroup
                      value={state.selectedDb}
                      onValueChange={handleDbPlanChange}
                      className="grid gap-4"
                    >
                      {availablePlans.map((plan) => (
                        <div key={plan.id}>
                          <RadioGroupItem
                            value={plan.id}
                            id={plan.id}
                            className="peer sr-only"
                          />
                          <Label
                            htmlFor={plan.id}
                            className="flex items-center justify-between rounded-md bg-white/10 border-2 border-transparent cursor-pointer p-4 transition-all peer-data-[state=checked]:border-blue-500"
                          >
                            <div className="flex items-center gap-4">
                              <div className="flex items-center gap-2">
                                <Cpu className="h-4 w-4 text-blue-400" />
                                <span className="text-white font-medium">
                                  {plan.resources?.cpu || 1} vCPU
                                </span>
                              </div>
                              <div className="flex items-center gap-2">
                                <HardDrive className="h-4 w-4 text-green-400" />
                                <span className="text-white font-medium">
                                  {plan.resources?.ram || 1}GB RAM
                                </span>
                              </div>
                              <div className="flex items-center gap-2">
                                <Server className="h-4 w-4 text-purple-400" />
                                <span className="text-white font-medium">
                                  {plan.resources?.storage || 10}GB Storage
                                </span>
                              </div>
                            </div>
                            <div className="text-right">
                              <div className="text-white font-bold">
                                {formatPrice(plan.price || 0)}
                              </div>
                              <div className="text-xs text-white/60">per month</div>
                            </div>
                          </Label>
                        </div>
                      ))}
                    </RadioGroup>
                  </div>

                  {(errors.plan || errors.version) && (
                    <div className="flex items-center gap-2 text-red-500 text-sm">
                      <AlertCircle className="w-4 h-4" />
                      <span>{errors.plan || errors.version}</span>
                    </div>
                  )}
                </div>
              </CardContent>
              <CardFooter className="flex justify-between">
                <Button
                  variant="outline"
                  onClick={handlePrevStep}
                  className="cursor-pointer rounded-md border-white/20 text-white hover:bg-white/10"
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
                <CardTitle className="text-white">
                  Select Project for {selectedUserData?.email}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {loadingProjects ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
                  </div>
                ) : userProjects.length === 0 ? (
                  <div className="text-center py-8">
                    <p className="text-white/60">This user has no projects available.</p>
                    <p className="text-white/40 text-sm mt-2">
                      The user needs to create a project first.
                    </p>
                  </div>
                ) : (
                  <RadioGroup
                    value={state.selectedProject}
                    onValueChange={(value) => {
                      setState({ ...state, selectedProject: value });
                      if (errors.project) {
                        setErrors({ ...errors, project: "" });
                      }
                    }}
                    className="grid gap-4"
                  >
                    {userProjects.map((project) => (
                      <div key={project.id}>
                        <RadioGroupItem
                          value={project.id}
                          id={project.id}
                          className="peer sr-only"
                        />
                        <Label
                          htmlFor={project.id}
                          className="flex flex-col gap-2 rounded-md bg-white/10 border-2 border-transparent cursor-pointer p-4 transition-all peer-data-[state=checked]:border-blue-500"
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-white font-medium">{project.name}</span>
                            <CheckCircle2
                              className={`h-4 w-4 ${
                                state.selectedProject === project.id ? "text-blue-500" : "text-transparent"
                              }`}
                            />
                          </div>
                          {project.description && (
                            <p className="text-white/60 text-sm">{project.description}</p>
                          )}
                          <p className="text-white/40 text-xs">
                            Created: {new Date(project.created_at).toLocaleDateString()}
                          </p>
                        </Label>
                      </div>
                    ))}
                  </RadioGroup>
                )}
                {errors.project && (
                  <div className="flex items-center gap-2 text-red-500 text-sm mt-4">
                    <AlertCircle className="w-4 h-4" />
                    <span>{errors.project}</span>
                  </div>
                )}
              </CardContent>
              <CardFooter className="flex justify-between">
                <Button
                  variant="outline"
                  onClick={handlePrevStep}
                  className="cursor-pointer rounded-md border-white/20 text-white hover:bg-white/10"
                >
                  <ChevronLeft size={16} className="mr-2" /> Back
                </Button>
                <Button
                  onClick={handleNextStep}
                  disabled={loadingProjects || userProjects.length === 0}
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
                <CardTitle className="text-white">Review Database Assignment</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-6">
                  {/* Assignment Summary */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-4">
                      <div>
                        <h3 className="text-white font-medium mb-2">User Details</h3>
                        <div className="space-y-1 text-sm">
                          <p className="text-white/80">Email: {selectedUserData?.email}</p>
                          <p className="text-white/80">Username: {selectedUserData?.username || 'Not set'}</p>
                        </div>
                      </div>

                      <div>
                        <h3 className="text-white font-medium mb-2">Database Details</h3>
                        <div className="space-y-1 text-sm">
                          <p className="text-white/80">Name: {state.selectedName}</p>
                          <p className="text-white/80">Type: {selectedDbTypeInfo?.name}</p>
                          <p className="text-white/80">Version: {state.selectedVersion}</p>
                          <p className="text-white/80">Location: {selectedLocationData?.city}, {selectedLocationData?.country}</p>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-4">
                      <div>
                        <h3 className="text-white font-medium mb-2">Plan Details</h3>
                        {selectedDatabase && (
                          <div className="space-y-1 text-sm">
                            <p className="text-white/80">CPU: {selectedDatabase.resources?.cpu || 1} vCPU</p>
                            <p className="text-white/80">RAM: {selectedDatabase.resources?.ram || 1}GB</p>
                            <p className="text-white/80">Storage: {selectedDatabase.resources?.storage || 10}GB</p>
                            <p className="text-white/80">Price: {formatPrice(selectedDatabase.price || 0)}/month</p>
                          </div>
                        )}
                      </div>

                      <div>
                        <h3 className="text-white font-medium mb-2">Project</h3>
                        {userProjects.find(p => p.id === state.selectedProject) && (
                          <div className="text-sm">
                            <p className="text-white/80">
                              {userProjects.find(p => p.id === state.selectedProject)?.name}
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  <Separator className="bg-white/10" />

                  {/* Terms and Conditions */}
                  <div className="flex items-start space-x-2">
                    <Checkbox
                      id="terms"
                      checked={termsAccepted}
                      onCheckedChange={(checked) => setTermsAccepted(checked as boolean)}
                      className="border-white/30 data-[state=checked]:bg-blue-600 data-[state=checked]:border-blue-600"
                    />
                    <div className="grid gap-1.5 leading-none">
                      <label
                        htmlFor="terms"
                        className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 text-white cursor-pointer"
                      >
                        I accept the terms and conditions for database assignment
                      </label>
                      <p className="text-xs text-white/60">
                        By assigning this database, you agree to our{" "}
                        <Link href="#" className="text-blue-400 hover:underline">
                          Terms of Service
                        </Link>{" "}
                        and{" "}
                        <Link href="#" className="text-blue-400 hover:underline">
                          Privacy Policy
                        </Link>
                        .
                      </p>
                    </div>
                  </div>
                </div>
              </CardContent>
              <CardFooter className="flex justify-between">
                <Button
                  variant="outline"
                  onClick={handlePrevStep}
                  className="cursor-pointer rounded-md border-white/20 text-white hover:bg-white/10"
                  disabled={isLoading}
                >
                  <ChevronLeft size={16} className="mr-2" /> Back
                </Button>
                <Button
                  onClick={onSubmit}
                  disabled={!termsAccepted || isLoading}
                  className="bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
                >
                  {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {isLoading ? "Assigning..." : "Assign Database"}
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