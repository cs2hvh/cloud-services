"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { 
  HardDrive, 
  Loader2, 
  ChevronRight, 
  CheckCircle2, 
  AlertCircle,
  Lock,
  Unlock,
  Globe,
  User,
  Search,
  ArrowLeft
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tables } from "@/lib/supabase/types";
import { toast } from "sonner";
import axios from "axios";
import { BUCKET_NAME_RULES } from "@/lib/validation/object-storage";
import Link from "next/link";
import Image from "next/image";

interface BucketCreateProps {
  projects: Tables<"projects">[];
  locations: Tables<"locations">[];
  userId: string;
  buckets: { name: string }[];
  role: "user" | "admin";
  allUsers?: Array<{
    id: string;
    email: string;
    username?: string;
  }>;
}

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

const BucketCreate = ({ projects, locations, userId, buckets, role, allUsers = [] }: BucketCreateProps) => {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [currentStep, setCurrentStep] = useState(role === "admin" ? 0 : 1);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [userSearchQuery, setUserSearchQuery] = useState("");
  const [storagePrice, setStoragePrice] = useState<number>(0);
  const [loadingPrice, setLoadingPrice] = useState(true);
  const [isCheckingName, setIsCheckingName] = useState(false);
  const [nameAvailable, setNameAvailable] = useState<boolean | null>(null);

  const [formData, setFormData] = useState({
    selectedUser: role === "admin" ? "" : userId,
    name: "",
    region: undefined as string | undefined,
    project_id: projects[0]?.id || "",
    acl: "private" as "private" | "public-read",
    cors_enabled: false,
    versioning_enabled: false,
  });

  const [errors, setErrors] = useState({
    user: "",
    name: "",
    region: "",
    project: "",
  });

  // Fetch object storage pricing
  useEffect(() => {
    const fetchPrice = async () => {
      try {
        const endpoint =
          role === "admin"
            ? "/api/admin/products?type=object-storage"
            : "/api/products?type=object-storage";
        const response = await axios.get(endpoint);
        const products = response?.data?.products;
        
        if (products && products.length > 0) {
          setStoragePrice(parseFloat(products[0].price) || 0);
        }
      } catch (error) {
        console.error("Error fetching storage price:", error);
        // Default to 0 if fetch fails
        setStoragePrice(0);
      } finally {
        setLoadingPrice(false);
      }
    };

    fetchPrice();
  }, [role]);

  // Steps array with conditional user selection for admin
  const steps = role === "admin"
    ? [
        { id: 0, name: "User",     iconSrc: "/dashboard icons/users & DBs .png" },
        { id: 1, name: "Name",     iconSrc: "/dashboard icons/name .png" },
        { id: 2, name: "Location", iconSrc: "/dashboard icons/location.png" },
        { id: 3, name: "Settings", iconSrc: "/dashboard icons/settings _1.png" },
        { id: 4, name: "Project",  iconSrc: "/dashboard icons/project _1.png" },
      ]
    : [
        { id: 1, name: "Name",     iconSrc: "/dashboard icons/name .png" },
        { id: 2, name: "Location", iconSrc: "/dashboard icons/location.png" },
        { id: 3, name: "Settings", iconSrc: "/dashboard icons/settings _1.png" },
        { id: 4, name: "Project",  iconSrc: "/dashboard icons/project _1.png" },
      ];

  const maxStep = role === "admin" ? 4 : 4;
  const minStep = role === "admin" ? 0 : 1;


  const validateUser = (selectedUser: string): string => {
    if (role === "admin" && !selectedUser) {
      return "User selection is required";
    }
    return "";
  };

  const validateBucketName = (name: string): string => {
    if (!name) {
      return "Bucket name is required";
    }
    if (name.length < BUCKET_NAME_RULES.minLength) {
      return `Bucket name must be at least ${BUCKET_NAME_RULES.minLength} characters`;
    }
    if (name.length > BUCKET_NAME_RULES.maxLength) {
      return `Bucket name must be at most ${BUCKET_NAME_RULES.maxLength} characters`;
    }
    if (!BUCKET_NAME_RULES.pattern.test(name)) {
      return BUCKET_NAME_RULES.description;
    }
    if (name.match(/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/)) {
      return "Bucket name cannot be formatted as an IP address";
    }
    if (name.startsWith("xn--")) {
      return 'Bucket name cannot start with "xn--"';
    }
    if (name.endsWith("-s3alias")) {
      return 'Bucket name cannot end with "-s3alias"';
    }
    if (buckets.some((bucket) => bucket.name === name)) {
      return "Bucket name is already taken. Please choose a different name.";
    }
    return "";
  };

  const validateRegion = (region: string | undefined): string => {
    if (!region) {
      return "Region is required";
    }
    return "";
  };

  const validateProject = (projectId: string): string => {
    if (!projectId) {
      return "Project is required";
    }
    return "";
  };

  // Filter users based on search query
  const filteredUsers = allUsers.filter(
    (user) =>
      !userSearchQuery ||
      user.email.toLowerCase().includes(userSearchQuery.toLowerCase()) ||
      (user.username &&
        user.username.toLowerCase().includes(userSearchQuery.toLowerCase())) ||
      user.id.toLowerCase().includes(userSearchQuery.toLowerCase())
  );

  // Handle user selection
  const handleUserSelect = (selectedUserId: string) => {
    setFormData((prev) => {
      // Check if the currently selected project belongs to the new user
      const projectBelongsToUser = projects.some(
        (p) => p.id === prev.project_id && p.owner === selectedUserId
      );
      
      // Reset project_id if it doesn't belong to the newly selected user
      return {
        ...prev,
        selectedUser: selectedUserId,
        project_id: projectBelongsToUser ? prev.project_id : (projects.find((p) => p.owner === selectedUserId)?.id || ""),
      };
    });
    
    if (errors.user) {
      setErrors({ ...errors, user: "" });
    }
  };

  const handleNextStep = async () => {
    let hasError = false;

    if (currentStep === 0 && role === "admin") {
      const userError = validateUser(formData.selectedUser);
      if (userError) {
        setErrors((prev) => ({ ...prev, user: userError }));
        toast.error(userError);
        hasError = true;
      } else {
        setErrors((prev) => ({ ...prev, user: "" }));
      }
    }

    if (currentStep === 1) {
      // debugger
      const nameError = validateBucketName(formData.name);
      if (nameError) {
        setErrors((prev) => ({ ...prev, name: nameError }));
        toast.error(nameError);
        hasError = true;
      } else {
        setErrors((prev) => ({ ...prev, name: "" }));
        // Check global availability via server API (reuse helper)
        const available = await checkNameAvailability(formData.name);
       
        if (available === false) {
          setErrors((prev) => ({ ...prev, name: "Bucket name is already taken globally" }));
          toast.error("Bucket name is already taken globally");
          hasError = true;
        } else if (available === null) {
          // conservative: treat unknown as error
          toast.error("Failed to verify bucket name availability. Try again.");
          hasError = true;
        }
      }
    }

    if (currentStep === 2) {
      const regionError = validateRegion(formData.region);
      if (regionError) {
        setErrors((prev) => ({ ...prev, region: regionError }));
        toast.error(regionError);
        hasError = true;
      } else {
        setErrors((prev) => ({ ...prev, region: "" }));
      }
    }

    if (currentStep === 4) {
      const projectError = validateProject(formData.project_id);
      if (projectError) {
        setErrors((prev) => ({ ...prev, project: projectError }));
        toast.error(projectError);
        hasError = true;
      } else {
        setErrors((prev) => ({ ...prev, project: "" }));
      }
    }

    if (!hasError && currentStep < maxStep) {
      setCurrentStep(currentStep + 1);
    } else if (!hasError && currentStep === maxStep) {
      // On last step, validate everything before allowing submit
      onSubmit();
    }
  };

  // Helper: check name availability via server API
  const checkNameAvailability = async (name: string): Promise<boolean | null> => {
    if (!name) return null;
    const local = validateBucketName(name);
    if (local) {
      setNameAvailable(null);
      return null;
    }

    try {
      setIsCheckingName(true);
      const resp = await axios.get("/api/services/object-storage/check-bucket", {
        params: { name },
      });
      const exists = resp.data?.exists;
      const available = !exists;
      setNameAvailable(available);
      // Update inline error state only when not available
      setErrors((prev) => ({ ...prev, name: available ? "" : "Bucket name is already taken globally" }));
      return available;
    } catch (err) {
      console.error("Error checking bucket name:", err);
      setNameAvailable(null);
      return null;
    } finally {
      setIsCheckingName(false);
    }
  };

  const handlePrevStep = () => {
    if (currentStep > minStep) {
      setCurrentStep(currentStep - 1);
    }
  };

  const onSubmit = async () => {
    if (!termsAccepted) {
      toast.error("Please accept the terms of service and privacy policy");
      return;
    }

    setIsLoading(true);
    try {
      const payload = {
        type: "bucket" as const,
        name: formData.name.toLowerCase(),
        region: formData.region,
        project_id: formData.project_id,
        owner_id: role === "admin" ? formData.selectedUser : userId,
        acl: formData.acl,
        cors_enabled: formData.cors_enabled,
        versioning_enabled: formData.versioning_enabled,
        status: "creating" as const,
        size_bytes: 0,
        object_count: 0,
      };

      await axios.post("/api/services/object-storage/buckets/create", payload);

      toast.success("Bucket created successfully!");
      router.push(role==="admin" ? "/dashboard/admin/object-storage" : "/dashboard/services/object-storage");
      router.refresh();
    } catch (error) {
      toast.error(axios.isAxiosError(error) ? error.response?.data?.error || "Failed to create bucket" : "Failed to create bucket");
      
    } finally {
      setIsLoading(false);
    }
  };

  const selectedLocation = locations.find((loc) => loc.short === formData.region);
  const selectedProject = projects.find((proj) => proj.id === formData.project_id);
  const selectedUser = allUsers.find((user) => user.id === formData.selectedUser);

  // Filter projects based on selected user (admin role only)
  const filteredProjects = role === "admin" && formData.selectedUser
    ? projects.filter((project) => project.owner === formData.selectedUser)
    : projects;

  const panelClassName = "glass-panel overflow-hidden";
  const wizardStartStep = role === "admin" ? 0 : 1;
  const progressStep = currentStep - wizardStartStep + 1;
  const progressPercentage = (progressStep / steps.length) * 100;

  return (
    <div className="space-y-5 px-2 py-4 text-white sm:px-3 lg:px-4">
      <div className={panelClassName}>
        <div className="flex flex-col gap-3 px-5 py-4 sm:px-6 sm:py-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-3xl">
            <Link
              href="/dashboard/services/object-storage"
              className="inline-flex items-center text-sm text-white/60 transition-colors hover:text-white"
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to buckets
            </Link>
            <p className="mt-5 text-[11px] font-semibold uppercase tracking-[0.2em] text-blue-300/70">
              Storage Provisioning
            </p>
            <h1 className="mt-2 text-xl font-semibold tracking-tight text-white sm:text-2xl">
              Create an object storage bucket with clear region, access, and ownership controls.
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-white/48">
              Move through naming, location, access settings, and project assignment with a
              focused review before the bucket is created.
            </p>
          </div>
          <Image
            src="/dashboard-services-icons/da object storage.png"
            alt=""
            width={160}
            height={160}
            className="hidden shrink-0 object-contain lg:block lg:h-[190px] lg:w-[190px] xl:h-[220px] xl:w-[220px]"
            priority
          />
        </div>

        <div className="border-t border-white/[0.06] px-5 py-4 sm:px-6">
          <div className="h-1.5 w-full overflow-hidden bg-white/[0.06]">
            <div
              className="h-full bg-blue-500 transition-all duration-300"
              style={{ width: `${progressPercentage}%` }}
            />
          </div>

          <div className={`mt-4 grid gap-3 ${role === "admin" ? "md:grid-cols-3 xl:grid-cols-5" : "md:grid-cols-2 xl:grid-cols-4"}`}>
            {steps.map((step) => {
              const isActive = currentStep === step.id;
              const isCompleted = currentStep > step.id;

              return (
                <div
                  key={step.id}
                  className={`border px-3 py-3 transition-colors ${
                    isActive
                      ? "border-blue-400/30 bg-blue-500/10"
                      : isCompleted
                        ? "border-white/[0.08] bg-white/[0.04]"
                        : "border-white/[0.06] bg-transparent"
                  }`}
                >
                  <div className="flex flex-col h-full">
                    <span className="text-xs font-semibold text-white/32">0{step.id - wizardStartStep + 1}</span>
                    <div className="mt-2 flex items-center justify-between gap-2 pt-3">
                      <div className="truncate text-sm font-semibold text-white">{step.name}</div>
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
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_340px] xl:items-start">
        <div className="space-y-6 xl:min-w-0">
          {/* Step 0: User Selection (Admin Only) */}
          {currentStep === 0 && role === "admin" && (
            <Card className={panelClassName}>
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2">
                  <User className="h-5 w-5" />
                    Select User
                </CardTitle>
                <CardDescription className="text-white/60">
                  Choose the user to assign this bucket to
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {/* Search Bar */}
                  <div>
                 
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-white/50" />
                      <Input
                        placeholder="Search by email, username, or user ID..."
                        value={userSearchQuery}
                        onChange={(e) => setUserSearchQuery(e.target.value)}
                        className="pl-10 bg-white/10 border-white/20 text-white placeholder:text-white/50 focus:border-white/40 focus:ring-0"
                      />
                    </div>
                  </div>

                  {/* Users Table */}
                  <div className="rounded-md border border-white/10 bg-white/5 max-h-96 overflow-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="border-white/10 hover:bg-white/5">
                          <TableHead className="text-white/80">Email</TableHead>
                          <TableHead className="text-white/80">Username</TableHead>
                          <TableHead className="text-white/80">User ID</TableHead>
                          <TableHead className="text-white/80 w-20">Select</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredUsers.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={4} className="text-center py-8 text-white/60">
                              No users found
                            </TableCell>
                          </TableRow>
                        ) : (
                          filteredUsers.map((user) => (
                            <TableRow
                              key={user.id}
                              className={`border-white/10 hover:bg-white/5 cursor-pointer transition-colors ${
                                formData.selectedUser === user.id ? "bg-blue-600/20 border-blue-500/30" : ""
                              }`}
                              onClick={() => handleUserSelect(user.id)}
                            >
                              <TableCell className="text-white font-medium">
                                {user.email}
                              </TableCell>
                              <TableCell className="text-white/80">
                                {user.username ? `@${user.username}` : (
                                  <span className="text-white/40 italic">No username</span>
                                )}
                              </TableCell>
                              <TableCell className="text-white/60 font-mono text-sm">
                                {user.id.slice(0, 8)}...
                              </TableCell>
                              <TableCell>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleUserSelect(user.id);
                                  }}
                                  className={`p-2 h-8 w-8 rounded-full ${
                                    formData.selectedUser === user.id
                                      ? "cursor-pointer bg-blue-600 hover:bg-blue-700 text-white"
                                      : "cursor-pointer bg-white/10 hover:bg-white/20 text-white/60"
                                  }`}
                                >
                                  {formData.selectedUser === user.id ? (
                                    <CheckCircle2 className="h-4 w-4" />
                                  ) : (
                                    <div className="h-4 w-4 rounded-full border-2 border-current" />
                                  )}
                                </Button>
                              </TableCell>
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                  </div>

                  {/* Show selected user info */}
                  {selectedUser && (
                    <div className="p-3 bg-blue-600/10 border border-blue-500/30 rounded-md">
                      <div className="flex items-center gap-2 text-blue-400 text-sm">
                        <CheckCircle2 className="h-4 w-4" />
                        <span>Selected User:</span>
                      </div>
                      <div className="mt-1 text-white">
                        <span className="font-medium">
                          {selectedUser.email}
                        </span>
                        {selectedUser.username && (
                          <span className="text-white/60 ml-2">
                            (@{selectedUser.username})
                          </span>
                        )}
                      </div>
                    </div>
                  )}

                  {errors.user && (
                    <div className="flex items-center gap-2 text-red-500 text-sm">
                      <AlertCircle className="w-4 h-4" />
                      <span>{errors.user}</span>
                    </div>
                  )}
                </div>
              </CardContent>
              <CardFooter className="flex justify-end">
                <Button
                  onClick={handleNextStep}
                  disabled={!formData.selectedUser}
                  className="cursor-pointer rounded-md border border-blue-400/25 bg-blue-500/90 text-white hover:bg-blue-500 disabled:opacity-50"
                >
                  Next <ChevronRight size={16} className="ml-2" />
                </Button>
              </CardFooter>
            </Card>
          )}

          {/* Step 1: Bucket Name */}
          {currentStep === 1 && (
            <Card className={panelClassName}>
              <CardHeader>
                <CardTitle className="text-white">Bucket Name</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <Input
                    value={formData.name}
                    onChange={(e) => {
                      const value = e.target.value.toLowerCase();
                      setFormData({ ...formData, name: value });
                      // reset availability on change
                      if (nameAvailable !== null) setNameAvailable(null);
                      if (errors.name) {
                        const nameError = validateBucketName(value);
                        setErrors({ ...errors, name: nameError });
                      }
                    }}
                    onBlur={async () => {
                      const error = validateBucketName(formData.name);
                      setErrors({ ...errors, name: error });
                      if (!error) {
                        await checkNameAvailability(formData.name);
                      }
                    }}
                    type="text"
                    placeholder="my-bucket"
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
                  {!errors.name && isCheckingName && (
                    <div className="flex items-center gap-2 text-sm text-white/60">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Checking availability...</span>
                    </div>
                  )}
                  {!errors.name && nameAvailable === true && (
                    <div className="text-sm text-green-400">Name is available</div>
                  )}
                  {!errors.name && nameAvailable === false && (
                    <div className="text-sm text-red-400">Name is already taken globally</div>
                  )}
                  <p className="text-xs text-white/50">
                    Must be 3-63 characters, lowercase letters, numbers, and hyphens only.
                  </p>
                </div>
              </CardContent>
              <CardFooter className="flex justify-end">
                <Button
                  onClick={handleNextStep}
                  disabled={isCheckingName}
                  className="cursor-pointer rounded-md border border-blue-400/25 bg-blue-500/90 text-white hover:bg-blue-500 disabled:opacity-60"
                >
                  {isCheckingName ? (
                    <>
                      Checking... <Loader2 className="w-4 h-4 animate-spin ml-2" />
                    </>
                  ) : (
                    <>
                      Next <ChevronRight size={16} className="ml-2" />
                    </>
                  )}
                </Button>
              </CardFooter>
            </Card>
          )}

          {/* Step 2: Location/Region */}
          {currentStep === 2 && (
            <Card className={panelClassName}>
              <CardHeader>
                <CardTitle className="text-white">Location</CardTitle>
              </CardHeader>
              <CardContent>
                <RadioGroup
                  value={formData.region}
                  onValueChange={(value) => {
                    setFormData({ ...formData, region: value });
                    if (errors.region) {
                      setErrors({ ...errors, region: "" });
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
                {errors.region && (
                  <div className="flex items-center gap-2 text-red-500 text-sm mt-4">
                    <AlertCircle className="w-4 h-4" />
                    <span>{errors.region}</span>
                  </div>
                )}
              </CardContent>
              <CardFooter className="flex justify-between">
                <Button
                  variant="outline"
                  onClick={handlePrevStep}
                  className="cursor-pointer rounded-md border border-white/[0.14] bg-white/[0.03] text-white/82 hover:bg-white/[0.07]"
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

          {/* Step 3: Bucket Settings */}
          {currentStep === 3 && (
            <Card className={panelClassName}>
              <CardHeader>
                <CardTitle className="text-white">Bucket Settings</CardTitle>
                <CardDescription className="text-white/60">
                  Configure access control, CORS, and versioning for your bucket.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2">
                        {formData.acl === "private" ? (
                          <Lock className="h-4 w-4 text-green-400" />
                        ) : (
                          <Unlock className="h-4 w-4 text-blue-400" />
                        )}
                        <Label htmlFor="acl">Access Control (ACL)</Label>
                      </div>
                      <p className="text-sm text-white/60">
                        {formData.acl === "private"
                          ? "Private (recommended)"
                          : "Public read access"}
                      </p>
                    </div>
                    <Select
                     
                      value={formData.acl}
                      onValueChange={(value: "private" | "public-read") =>
                        setFormData({ ...formData, acl: value })
                      }
                    >
                      <SelectTrigger className="cursor-pointer w-[180px] bg-white/10 border-white/20">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="private">Private</SelectItem>
                        <SelectItem value="public-read">Public Read</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <Separator className="bg-white/10" />

                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2">
                        <Globe className="h-4 w-4 text-blue-400" />
                        <Label htmlFor="cors">
                          CORS (Cross-Origin Resource Sharing)
                        </Label>
                      </div>
                      <p className="text-sm text-white/60">
                        Allow cross-origin requests to your bucket
                      </p>
                    </div>
                    <Switch
                    className="cursor-pointer"
                      id="cors"
                      checked={formData.cors_enabled}
                      onCheckedChange={(checked) =>
                        setFormData({ ...formData, cors_enabled: checked })
                      }
                    />
                  </div>

                  <Separator className="bg-white/10" />

                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2">
                        <HardDrive className="h-4 w-4 text-purple-400" />
                        <Label htmlFor="versioning">Object Versioning</Label>
                      </div>
                      <p className="text-sm text-white/60">
                        Keep multiple versions of objects in your bucket
                      </p>
                    </div>
                    <Switch
                       className="cursor-pointer"
                      id="versioning"
                      checked={formData.versioning_enabled}
                      onCheckedChange={(checked) =>
                        setFormData({ ...formData, versioning_enabled: checked })
                      }
                    />
                  </div>
                </div>
              </CardContent>
              <CardFooter className="flex justify-between">
                <Button variant="outline" onClick={handlePrevStep} className="cursor-pointer rounded-md border border-white/[0.14] bg-white/[0.03] text-white/82 hover:bg-white/[0.07]">
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

          {/* Step 4: Project Selection - Changed to Dropdown */}
          {currentStep === 4 && (
            <Card className={panelClassName}>
              <CardHeader>
                <CardTitle className="text-white">Project</CardTitle>
                {role === "admin" && selectedUser && (
                  <CardDescription className="text-white/60">
                    Showing projects owned by{" "}
                    <span className="text-blue-400 font-medium">
                      {selectedUser.email}
                    </span>
                  </CardDescription>
                )}
              </CardHeader>
              <CardContent className="space-y-6">
                <div>
                  <Label htmlFor="project" className="mb-2 block text-white">
                    Select Project
                  </Label>
                  <Select
                    value={formData.project_id}
                    onValueChange={(value) => {
                      setFormData({ ...formData, project_id: value });
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
                      {filteredProjects.length === 0 ? (
                        <div className="px-2 py-6 text-center text-white/60">
                          {role === "admin" && formData.selectedUser
                            ? "No projects found for selected user"
                            : "No projects available"}
                        </div>
                      ) : (
                        filteredProjects.map((project) => (
                          <SelectItem key={project.id} value={project.id}>
                            {project.name}
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                  {errors.project && (
                    <div className="flex items-center gap-2 text-red-500 text-sm mt-2">
                      <AlertCircle className="w-4 h-4" />
                      <span>{errors.project}</span>
                    </div>
                  )}
                </div>

                <div className="flex items-start space-x-2 bg-white/5 p-4 rounded-lg">
                  <Checkbox
                    id="terms"
                    checked={termsAccepted}
                    onCheckedChange={(checked) =>
                      setTermsAccepted(checked as boolean)
                    }
                  />
                  <label
                    htmlFor="terms"
                    className="text-sm leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 text-white"
                  >
                    I agree to the{" "}
                    <Link href="/terms" className="text-blue-400 hover:underline">
                      Terms of Service
                    </Link>{" "}
                    and{" "}
                    <Link href="/privacy" className="text-blue-400 hover:underline">
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
                  className="cursor-pointer rounded-md border border-white/[0.14] bg-white/[0.03] text-white/82 hover:bg-white/[0.07]"
                >
                  Back
                </Button>
                <Button
                  onClick={handleNextStep}
                  disabled={isLoading || !termsAccepted}
                  size="lg"
                  className="cursor-pointer rounded-md border border-blue-400/25 bg-blue-500/90 text-white hover:bg-blue-500"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin mr-2" />
                      Creating...
                    </>
                  ) : (
                    <>
                      <HardDrive className="mr-2 h-4 w-4" />
                      Create Bucket
                    </>
                  )}
                </Button>
              </CardFooter>
            </Card>
          )}
        </div>

        {/* Right Side: Summary Card */}
        <div className={`${panelClassName} xl:sticky xl:top-8`}>
          <div className="border-b border-white/[0.06] px-6 py-5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/38">
              Summary
            </p>
            <h3 className="mt-2 text-lg font-semibold text-white">Configuration</h3>
          </div>
          <div className="px-6 py-4">
            <div className="space-y-0.5">
              {role === "admin" && selectedUser && (
                <SummaryRow label="Assigned To" value={selectedUser.email} />
              )}
              <SummaryRow icon="/dashboard icons/name.png" label="Name" value={formData.name || "—"} empty={!formData.name} />
              <SummaryRow
                icon="/dashboard icons/region .png"
                label="Region"
                value={selectedLocation ? (
                  <span className="flex items-center justify-end gap-2">
                    <Image src={`https://flagsapi.com/${selectedLocation.country_code}/flat/64.png`} alt={selectedLocation.city} width={16} height={12} className="rounded-sm" />
                    {selectedLocation.city}
                  </span>
                ) : "—"}
                empty={!selectedLocation}
              />
              <SummaryRow icon="/dashboard icons/Acess.png" label="Access" value={formData.acl === "public-read" ? "Public Read" : "Private"} />
              <SummaryRow icon="/dashboard icons/versioning .png" label="Versioning" value={formData.versioning_enabled ? "Enabled" : "Off"} />
              {selectedProject && (
                <SummaryRow icon="/dashboard icons/project _1.png" label="Project" value={selectedProject.name} />
              )}
            </div>
            <Separator className="my-4 bg-white/[0.08]" />
            <div className="flex items-end justify-between gap-4">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/35">
                  Estimated monthly cost
                </div>
                <div className="mt-2 text-2xl font-semibold text-white">
                  {loadingPrice ? "—" : storagePrice > 0 ? `$${storagePrice.toFixed(2)}` : "Free"}
                </div>
              </div>
              {!loadingPrice && storagePrice > 0 && (
                <Badge variant="outline" className="border-white/[0.10] bg-white/[0.04] text-white/60">
                  per month
                </Badge>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default BucketCreate;
