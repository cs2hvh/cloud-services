"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "motion/react";
import { 
  HardDrive, 
  Loader2, 
  ChevronRight, 
  CheckCircle2, 
  AlertCircle,
  MapPin,
  Settings,
  FolderTree,
  Lock,
  Unlock,
  Globe
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
}

const BucketCreate = ({ projects, locations, userId }: BucketCreateProps) => {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [currentStep, setCurrentStep] = useState(1);
  const [termsAccepted, setTermsAccepted] = useState(false);

  const [formData, setFormData] = useState({
    name: "",
    region: undefined as string | undefined,
    project_id: projects[0]?.id || "",
    acl: "private" as "private" | "public-read",
    cors_enabled: false,
    versioning_enabled: false,
  });

  const [errors, setErrors] = useState({
    name: "",
    region: "",
    project: "",
  });

  // Only 4 steps now, Review is removed from breadcrumb
  const steps = [
    { id: 1, name: "Name", icon: HardDrive },
    { id: 2, name: "Location", icon: MapPin },
    { id: 3, name: "Settings", icon: Settings },
    { id: 4, name: "Project", icon: FolderTree },
  ];

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

  const handleNextStep = () => {
    let hasError = false;

    if (currentStep === 1) {
      const nameError = validateBucketName(formData.name);
      if (nameError) {
        setErrors((prev) => ({ ...prev, name: nameError }));
        toast.error(nameError);
        hasError = true;
      } else {
        setErrors((prev) => ({ ...prev, name: "" }));
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

    if (!hasError && currentStep < 4) {
      setCurrentStep(currentStep + 1);
    } else if (!hasError && currentStep === 4) {
      // On last step, validate everything before allowing submit
      onSubmit();
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

    setIsLoading(true);
    try {
      const payload = {
        type: "bucket" as const,
        name: formData.name.toLowerCase(),
        region: formData.region,
        project_id: formData.project_id,
        owner_id: userId,
        acl: formData.acl,
        cors_enabled: formData.cors_enabled,
        versioning_enabled: formData.versioning_enabled,
        status: "creating" as const,
        size_bytes: 0,
        object_count: 0,
      };

      const response = await axios.post("/api/services/object-storage/buckets/create", payload);

      toast.success("Bucket created successfully!");
      router.push("/dashboard/services/object-storage");
      router.refresh();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error("Error creating bucket:", errorMessage);
      toast.error(axios.isAxiosError(error) ? error.response?.data?.error || "Failed to create bucket" : "Failed to create bucket");
    } finally {
      setIsLoading(false);
    }
  };

  const selectedLocation = locations.find((loc) => loc.short === formData.region);
  const selectedProject = projects.find((proj) => proj.id === formData.project_id);

  return (
    <div className="py-4">
      {/* Breadcrumb - Fixed Layout Like Database */}
      <div className="mb-8">
        <div className="flex justify-between mb-2">
          {steps.map((step, index) => (
            <div
              key={step.id}
              className="flex-1 min-w-0 flex flex-col items-center"
            >
              <div className="flex items-center w-full">
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

      {/* Grid Layout: Left (Form) + Right (Summary) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-6">
          {/* Step 1: Bucket Name */}
          {currentStep === 1 && (
            <Card className="bg-white/5 border-white/10">
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
                      if (errors.name) {
                        const nameError = validateBucketName(value);
                        setErrors({ ...errors, name: nameError });
                      }
                    }}
                    onBlur={() => {
                      const error = validateBucketName(formData.name);
                      setErrors({ ...errors, name: error });
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
                  <p className="text-xs text-white/50">
                    Must be 3-63 characters, lowercase letters, numbers, and hyphens only.
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

          {/* Step 2: Location/Region */}
          {currentStep === 2 && (
            <Card className="bg-white/5 border-white/10">
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

          {/* Step 3: Bucket Settings */}
          {currentStep === 3 && (
            <Card className="bg-white/5 border-white/10">
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
                      <SelectTrigger className="w-[180px] bg-white/10 border-white/20">
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
                <Button variant="outline" onClick={handlePrevStep} className="rounded-md border-white/20 text-dark hover:bg-white/10">
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

          {/* Step 4: Project Selection - Changed to Dropdown */}
          {currentStep === 4 && (
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
                  className="rounded-md border-white/20 text-dark hover:bg-white/10"
                >
                  Back
                </Button>
                <Button
                  onClick={handleNextStep}
                  disabled={isLoading || !termsAccepted}
                  size="lg"
                  className="bg-white text-black rounded-md hover:bg-gray-200"
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
        <div className="lg:col-span-1">
          <Card className="sticky top-8 bg-white/5 border-white/10">
            <CardHeader>
              <CardTitle className="text-white">Order Summary</CardTitle>
              <div className="mt-4 p-4 bg-white/5 rounded-lg flex justify-center">
                <HardDrive className="h-16 w-16 text-white/40" />
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {formData.name && (
                <div className="flex justify-between items-center">
                  <span className="text-sm text-white/60">Name:</span>
                  <span className="font-medium text-white">{formData.name}</span>
                </div>
              )}
              {selectedLocation && (
                <div className="flex justify-between items-center">
                  <span className="text-sm text-white/60">Location:</span>
                  <div className="flex items-center gap-2">
                    <Image
                      src={`https://flagsapi.com/${selectedLocation.country_code}/flat/64.png`}
                      alt={selectedLocation.city}
                      width={16}
                      height={12}
                      className="rounded-sm"
                    />
                    <span className="font-medium text-white">
                      {selectedLocation.city}
                    </span>
                  </div>
                </div>
              )}
              {formData.region && (
                <div className="flex justify-between items-center">
                  <span className="text-sm text-white/60">Region:</span>
                  <span className="font-medium text-white">{formData.region}</span>
                </div>
              )}
              <div className="flex justify-between items-center">
                <span className="text-sm text-white/60">Access:</span>
                <div className="flex items-center gap-2">
                  {formData.acl === "private" ? (
                    <Lock className="h-4 w-4 text-green-400" />
                  ) : (
                    <Unlock className="h-4 w-4 text-blue-400" />
                  )}
                  <span className="font-medium text-white capitalize">
                    {formData.acl === "public-read" ? "Public Read" : "Private"}
                  </span>
                </div>
              </div>
              {formData.cors_enabled && (
                <div className="flex justify-between items-center">
                  <span className="text-sm text-white/60">CORS:</span>
                  <Badge variant="secondary" className="bg-blue-500/20 text-blue-400">
                    Enabled
                  </Badge>
                </div>
              )}
              {formData.versioning_enabled && (
                <div className="flex justify-between items-center">
                  <span className="text-sm text-white/60">Versioning:</span>
                  <Badge variant="secondary" className="bg-purple-500/20 text-purple-400">
                    Enabled
                  </Badge>
                </div>
              )}
              {selectedProject && (
                <div className="flex justify-between items-center">
                  <span className="text-sm text-white/60">Project:</span>
                  <span className="font-medium text-white">{selectedProject.name}</span>
                </div>
              )}
              <Separator className="bg-white/10" />
              <div className="flex justify-between items-center font-bold text-lg text-white">
                <span>Total</span>
                <span>Free</span>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default BucketCreate;
