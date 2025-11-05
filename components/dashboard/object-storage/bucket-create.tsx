"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "motion/react";
import { HardDrive, Loader2, ChevronRight, CheckCircle2, AlertCircle } from "lucide-react";
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
import { DO_SPACES_REGIONS, BUCKET_NAME_RULES } from "@/lib/validation/object-storage";
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
    region: "nyc3" as string|undefined,
    project_id: projects[0]?.id || "",
    acl: "private" as "private" | "public-read",
    cors_enabled: false,
    versioning_enabled: false,
  });

  const [errors, setErrors] = useState({
    name: "",
    region: "",
    project: "",
    location:""
  });

  const steps = [
    { id: 1, name: "Name" },
    { id: 2, name: "Location" },
    { id: 3, name: "Settings" },
    { id: 4, name: "Project" },
    { id: 5, name: "Review" },
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

  const validateRegion = (region: string|undefined): string => {
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

    // Step 1: Validate bucket name
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

    // Step 2: Validate region
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

    // Step 4: Validate project
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

    if (!hasError && currentStep < 5) {
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
    <div className="mx-auto space-y-6">
      {/* Breadcrumb */}
      <div className="flex justify-between mb-2">
        {steps.map((step, index) => (
          <div
            key={step.id}
            className="flex-1 min-w-0 flex flex-col items-center"
          >
            <div className="flex items-center w-full">
              {/* Left connecting line */}
              {index > 0 && (
                <div
                  className={`basis-0 flex-1 h-0.5 transition-colors duration-300 ${
                    currentStep > step.id ? "bg-blue-1000" : "bg-white/10"
                  }`}
                />
              )}

              {/* Step Circle + Label */}
              <div className="flex flex-col items-center min-w-0">
                <button
                  onClick={() => setCurrentStep(step.id)}
                  disabled={step.id > currentStep}
                  className={`rounded-full flex items-center justify-center transition-all duration-300
            w-6 h-6 sm:w-7 sm:h-7 md:w-8 md:h-8 
            ${
              currentStep > step.id
                ? "bg-blue-600 text-white"
                : currentStep === step.id
                  ? "bg-blue-500 text-white"
                  : "bg-white/10 text-white/50"
            }
            ${
              step.id <= currentStep
                ? "cursor-pointer hover:scale-105 hover:bg-blue-500/80"
                : "cursor-not-allowed"
            }
          `}
                >
                  {currentStep > step.id ? <CheckCircle2 size={16} /> : step.id}
                </button>

                {/* Step Label */}
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

              {/* Right connecting line */}
              {index < steps.length - 1 && (
                <div
                  className={`basis-0 flex-1 h-0.5 transition-colors duration-300 ${
                    currentStep >= step.id ? "bg-blue-600" : "bg-white/10"
                  }`}
                />
              )}
            </div>
          </div>
        ))}
      </div>

      <Separator className="bg-white/10" />

      {/* Step 1: Bucket Name */}
      {currentStep === 1 && (
        <Card className="border-white/10 bg-white/5">
          <CardHeader>
            <CardTitle className="text-2xl">Bucket Name</CardTitle>
            <CardDescription>
              Choose a unique name for your bucket.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Bucket Name *</Label>
              <Input
                id="name"
                placeholder="my-bucket"
                value={formData.name}
                onChange={(e) => {
                  const value = e.target.value.toLowerCase();
                  setFormData({ ...formData, name: value });
                  if (errors.name) {
                    const nameError = validateBucketName(value);
                    setErrors({ ...errors, name: nameError });
                  }
                }}
                className="bg-black/30 border-white/10"
              />
              {errors.name && (
                <p className="text-sm text-red-400">{errors.name}</p>
              )}
              <p className="text-sm text-white/60">
                Lowercase letters, numbers, and hyphens only. Must be 3-63
                characters.
              </p>
            </div>
          </CardContent>
          <CardFooter className="flex justify-between">
            <Button variant="outline" disabled>
              Previous
            </Button>
            <Button
              onClick={handleNextStep}
              className="bg-white text-black hover:bg-gray-200"
            >
              Next
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
              //value={formData.region}
              onValueChange={(value) => {
                setFormData({ ...formData, region: value });
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

      {/* Step 3: Bucket Settings */}
      {currentStep === 3 && (
        <Card className="border-white/10 bg-white/5">
          <CardHeader>
            <CardTitle className="text-2xl">Bucket Settings</CardTitle>
            <CardDescription>
              Configure access control, CORS, and versioning for your bucket.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="acl">Access Control (ACL)</Label>
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
                  <SelectTrigger className="w-[180px] bg-black/30 border-white/10">
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
                  <Label htmlFor="cors">
                    CORS (Cross-Origin Resource Sharing)
                  </Label>
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
                  <Label htmlFor="versioning">Object Versioning</Label>
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
            <Button variant="outline" onClick={handlePrevStep}>
              Previous
            </Button>
            <Button
              onClick={handleNextStep}
              className="bg-white text-black hover:bg-gray-200"
            >
              Next
            </Button>
          </CardFooter>
        </Card>
      )}

      {/* Step 4: Project Selection */}
      {currentStep === 4 && (
        <Card className="border-white/10 bg-white/5">
          <CardHeader>
            <CardTitle className="text-2xl">Select Project</CardTitle>
            <CardDescription>
              Choose which project this bucket will belong to.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <RadioGroup
              value={formData.project_id}
              onValueChange={(value) =>
                setFormData({ ...formData, project_id: value })
              }
            >
              <div className="grid grid-cols-1 gap-4">
                {projects.map((project) => (
                  <div
                    key={project.id}
                    className={`relative flex cursor-pointer rounded-lg border p-4 hover:border-white/40 transition-colors ${
                      formData.project_id === project.id
                        ? "border-white bg-white/10"
                        : "border-white/10 bg-white/5"
                    }`}
                  >
                    <RadioGroupItem
                      value={project.id}
                      id={project.id}
                      className="mt-1"
                    />
                    <Label
                      htmlFor={project.id}
                      className="ml-3 cursor-pointer flex-1"
                    >
                      <div className="font-semibold">{project.name}</div>
                      {project.description && (
                        <div className="text-sm text-white/60">
                          {project.description}
                        </div>
                      )}
                    </Label>
                  </div>
                ))}
              </div>
            </RadioGroup>
            {errors.project && (
              <p className="text-sm text-red-400">{errors.project}</p>
            )}
          </CardContent>
          <CardFooter className="flex justify-between">
            <Button variant="outline" onClick={handlePrevStep}>
              Previous
            </Button>
            <Button
              onClick={handleNextStep}
              className="bg-white text-black hover:bg-gray-200"
            >
              Next
            </Button>
          </CardFooter>
        </Card>
      )}

      {/* Step 5: Review & Confirm */}
      {currentStep === 5 && (
        <Card className="border-white/10 bg-white/5">
          <CardHeader>
            <CardTitle className="text-2xl">Review & Confirm</CardTitle>
            <CardDescription>
              Review your bucket configuration before creating.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-4">
              <div className="flex justify-between py-3 border-b border-white/10">
                <span className="text-white/60">Bucket Name</span>
                <span className="font-semibold">{formData.name}</span>
              </div>

              <div className="flex justify-between py-3 border-b border-white/10">
                <span className="text-white/60">Region</span>
                <span className="font-semibold">
                  {selectedLocation
                    ? `${selectedLocation.city}, ${selectedLocation.country}`
                    : formData.region}{" "}
                  ({formData.region})
                </span>
              </div>

              <div className="flex justify-between py-3 border-b border-white/10">
                <span className="text-white/60">Access Control</span>
                <span className="font-semibold capitalize">
                  {formData.acl === "public-read" ? "Public Read" : "Private"}
                </span>
              </div>

              <div className="flex justify-between py-3 border-b border-white/10">
                <span className="text-white/60">CORS Enabled</span>
                <span className="font-semibold">
                  {formData.cors_enabled ? "Yes" : "No"}
                </span>
              </div>

              <div className="flex justify-between py-3 border-b border-white/10">
                <span className="text-white/60">Versioning Enabled</span>
                <span className="font-semibold">
                  {formData.versioning_enabled ? "Yes" : "No"}
                </span>
              </div>

              <div className="flex justify-between py-3 border-b border-white/10">
                <span className="text-white/60">Project</span>
                <span className="font-semibold">{selectedProject?.name}</span>
              </div>
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
                className="text-sm leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
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
            >
              Previous
            </Button>
            <Button
              onClick={onSubmit}
              disabled={isLoading || !termsAccepted}
              className="bg-white text-black hover:bg-gray-200"
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
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
  );
};

export default BucketCreate;
