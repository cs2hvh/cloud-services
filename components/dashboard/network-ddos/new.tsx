'use client';
import { useState, useEffect } from "react";
import { ArrowLeft, CheckCircle2, FolderTree, AlertCircle, User, Search, Loader2 } from "lucide-react";
import Image from "next/image";
import { toast } from "sonner";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  AppTypeStep,
  DomainStep,
  EdgePortStep,
  OriginStep,
  SettingsStep,
  type SpectrumFormData,
} from "./steps";
// import api from "@/lib/axios/axios";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {  Tables } from "@/lib/supabase/types";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import axios from "axios";

function SummaryRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2.5">
      <span className="text-sm text-white/42">{label}</span>
      <div className="text-right text-sm font-medium text-white/88">{value}</div>
    </div>
  );
}

interface SpectrumAppCreateProps {
  projects: Tables<"projects">[];
  userId: string;
  role?: "user" | "admin";
  allUsers?: Array<{
    id: string;
    email: string;
    username?: string;
  }>;
  spectrumApps?: string[];
}

const SpectrumAppCreate = ({ projects, userId, role = "user", allUsers = [], spectrumApps = [] }: SpectrumAppCreateProps) => {
 // console.log(spectrumApps,"........spectrumApps in spectrum create component........");
  const [currentStep, setCurrentStep] = useState(role === "admin" ? 0 : 1);
  const [isLoading, setIsLoading] = useState(false);
  const [userSearchQuery, setUserSearchQuery] = useState("");
  const [spectrumPrice, setSpectrumPrice] = useState<number>(0);
  const [loadingPrice, setLoadingPrice] = useState(true);

  const router = useRouter();
  
  // Form state
  const [formData, setFormData] = useState<SpectrumFormData>({
    selectedUser: role === "admin" ? "" : userId,
    appType: '',
    domain: '',
    edgePort: 0,
    originType: '',
    originIP: '',
    originPort: 0,
    argoSmartRouting: false,
    tls: 'off',
    ipAccessRule: false,
    proxyProtocol: 'off',
    edgeIpType: 'dynamic',
    edgeIpConnectivity: 'all',
    trafficType: 'direct',
    project_id: projects[0]?.id || '',
  });

  const [errors, setErrors] = useState({
    user: "",
    project: "",
  });

  // Fetch DDoS protection pricing
  useEffect(() => {
    const fetchPrice = async () => {
      try {
        const response = await axios.get("/api/admin/products?type=network-ddos");
        const products = response.data.products;
        
        if (products && products.length > 0) {
          setSpectrumPrice(parseFloat(products[0].price) || 0);
        }
      } catch (error) {
        console.error("Error fetching spectrum price:", error);
        setSpectrumPrice(0);
      } finally {
        setLoadingPrice(false);
      }
    };

    fetchPrice();
  }, []);

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
    setFormData((prev) => ({
      ...prev,
      selectedUser: selectedUserId,
    }));
    if (errors.user) {
      setErrors({ ...errors, user: "" });
    }
  };

  const validateUser = (selectedUser: string): string => {
    if (role === "admin" && !selectedUser) {
      return "User selection is required";
    }
    return "";
  };

  const updateFormData = (data: Partial<SpectrumFormData>) => {
    setFormData(prev => ({ ...prev, ...data }));
  };

  // Check if the selected app type is SSH or RDP
  const isSSHorRDP = formData.appType === 'ssh' || formData.appType === 'rdp';

  const handleNextStep = () => {
    // Validate user on step 0 (admin only)
    if (currentStep === 0 && role === "admin") {
      const userError = validateUser(formData.selectedUser || "");
      if (userError) {
        setErrors({ ...errors, user: userError });
        toast.error(userError);
        return;
      } else {
        setErrors({ ...errors, user: "" });
      }
    }

    // For SSH/RDP: skip step 3 (Edge Port) and step 5 (Settings)
    if (isSSHorRDP) {
      if (currentStep === 2) {
        // Skip step 3 (Edge Port) and go to step 4 (Origin)
        setCurrentStep(4);
        return;
      } else if (currentStep === 4) {
        // Skip step 5 (Settings) and go to step 6 (Project)
        setCurrentStep(6);
        return;
      }
    }

    // Validate project on step 6
    if (currentStep === 6) {
      if (!formData.project_id) {
        setErrors({ ...errors, project: "Project is required" });
        toast.error("Please select a project");
        return;
      } else {
        setErrors({ ...errors, project: "" });
      }
    }

    if (currentStep < 6) {
      setCurrentStep(currentStep + 1);
    }
  };

  const handlePrevStep = () => {
    const minStep = role === "admin" ? 0 : 1;
    
    // For SSH/RDP: skip step 3 (Edge Port) and step 5 (Settings) when going back
    if (isSSHorRDP) {
      if (currentStep === 4) {
        // Skip step 3 (Edge Port) and go to step 2 (Domain)
        setCurrentStep(2);
        return;
      } else if (currentStep === 6) {
        // Skip step 5 (Settings) and go to step 4 (Origin)
        setCurrentStep(4);
        return;
      }
    }
    
    if (currentStep > minStep) {
      setCurrentStep(currentStep - 1);
    }
  };

  const onSubmit = async () => {
    //
    if (!formData.project_id) {
      toast.error("Please select a project");
      return;
    }

    const targetUserId = role === "admin" ? formData.selectedUser : userId;
    if (!targetUserId) {
      toast.error("Invalid user selection");
      return;
    }

    setIsLoading(true);
    try {
      // Log the form data
      //console.log('Spectrum App Configuration:', formData);
      //
      const response = await fetch("/api/services/spectrum/apps/create", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          dns: { name: formData.domain, type: "CNAME" , original_protocol: formData.appType},
          protocol: `${
            formData.appType === "rdp" || formData.appType === "ssh"
              ? "tcp"
              : formData.appType
          }/${formData.edgePort}`,
          argo_smart_routing: true,
          proxy_protocol: formData.proxyProtocol,
          tls: "off",
          origin_direct: [
            `${
              formData.appType === "rdp" || formData.appType === "ssh"
                ? "tcp"
                : formData.appType
            }://${formData.originIP}:${formData.originPort}`,
          ],
          project_id: formData.project_id,
          owner_id: targetUserId,
          role: role,
        }),
      });

      if (response.status === 201) {
       
        if (role === "admin") {
          router.push('/dashboard/admin/network-ddos');
        } else {
          router.push('/dashboard/services/network-ddos');
        }
         toast.success('Spectrum application created successfully!');
        router.refresh();

      }
      else if(response.status===402){
          toast.error('Insufficient balance. Please top up your account to create a Spectrum application.');
          router.push('/dashboard/nav/billing');
          return;
      }
      else {
         toast.error('Sorry , we are temporarily unable to process your request. Please try again later.');
        return;
      }
       
      }
     catch (error) {
      console.error('Failed to create Spectrum app:', error);
      toast.error('Failed to create Spectrum application. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const steps = role === "admin"
    ? (isSSHorRDP
        ? [
            { id: 0, name: "User",     displayId: 1, iconSrc: "/dashboard icons/users & DBs .png" },
            { id: 1, name: "App Type", displayId: 2, iconSrc: "/dashboard icons/apptype .png" },
            { id: 2, name: "Domain",   displayId: 3, iconSrc: "/dashboard icons/domain.png" },
            { id: 4, name: "Origin",   displayId: 4, iconSrc: "/dashboard icons/origin.png" },
            { id: 6, name: "Project",  displayId: 5, iconSrc: "/dashboard icons/project _1.png" }
          ]
        : [
            { id: 0, name: "User",      iconSrc: "/dashboard icons/users & DBs .png" },
            { id: 1, name: "App Type",  iconSrc: "/dashboard icons/apptype .png" },
            { id: 2, name: "Domain",    iconSrc: "/dashboard icons/domain.png" },
            { id: 3, name: "Edge Port", iconSrc: "/dashboard icons/edge port .png" },
            { id: 4, name: "Origin",    iconSrc: "/dashboard icons/origin.png" },
            { id: 5, name: "Settings",  iconSrc: "/dashboard icons/advanced settings .png" },
            { id: 6, name: "Project",   iconSrc: "/dashboard icons/project _1.png" }
          ])
    : (isSSHorRDP
        ? [
            { id: 1, name: "App Type", displayId: 1, iconSrc: "/dashboard icons/apptype .png" },
            { id: 2, name: "Domain",   displayId: 2, iconSrc: "/dashboard icons/domain.png" },
            { id: 4, name: "Origin",   displayId: 3, iconSrc: "/dashboard icons/origin.png" },
            { id: 6, name: "Project",  displayId: 4, iconSrc: "/dashboard icons/project _1.png" }
          ]
        : [
            { id: 1, name: "App Type",  iconSrc: "/dashboard icons/apptype .png" },
            { id: 2, name: "Domain",    iconSrc: "/dashboard icons/domain.png" },
            { id: 3, name: "Edge Port", iconSrc: "/dashboard icons/edge port .png" },
            { id: 4, name: "Origin",    iconSrc: "/dashboard icons/origin.png" },
            { id: 5, name: "Settings",  iconSrc: "/dashboard icons/advanced settings .png" },
            { id: 6, name: "Project",   iconSrc: "/dashboard icons/project _1.png" }
          ]);

  // Filter projects based on selected user (admin mode) or current user
  const filteredProjects = role === "admin" && formData.selectedUser
    ? projects.filter(
        (project) =>
          project.owner === formData.selectedUser ||
          (project.users &&
            Array.isArray(project.users) &&
            (project.users as string[]).includes(formData.selectedUser!))
      )
    : projects;

  const selectedProject = filteredProjects.find((proj) => proj.id === formData.project_id);
  const panelClassName = "glass-panel overflow-hidden";
  const summaryPanelClassName =
    "overflow-hidden rounded-none border border-white/[0.1] bg-[linear-gradient(180deg,rgba(18,24,37,0.98),rgba(10,14,22,0.96))] shadow-[0_24px_56px_rgba(2,6,20,0.38)] backdrop-blur-2xl";
  const wizardStartStep = role === "admin" ? 0 : 1;
  const progressStep = currentStep - wizardStartStep + 1;
  const progressPercentage = (progressStep / steps.length) * 100;

  return (
    <div className="space-y-5 px-2 py-4 text-white sm:px-3 lg:px-4">
      <div className={panelClassName}>
        <div className="flex flex-col gap-4 px-5 py-5 sm:px-6 sm:py-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <Link
              href={role === "admin" ? "/dashboard/admin/network-ddos" : "/dashboard/services/network-ddos"}
              className="inline-flex items-center text-sm text-white/60 transition-colors hover:text-white"
            >
              <ArrowLeft size={16} className="mr-2" />
              Back to protection inventory
            </Link>
            <p className="mt-5 text-[11px] font-semibold uppercase tracking-[0.2em] text-blue-300/70">
              Network Security
            </p>
            <h1 className="mt-2 text-xl font-semibold tracking-tight text-white sm:text-2xl">
              Configure Layer 4 DDoS protection with clearer operational choices.
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-white/48">
              Move through app type, domain, routing, origin, and project assignment in a more compact enterprise flow.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:min-w-[240px]">
            <div className="border border-white/[0.08] bg-white/[0.04] px-3 py-2.5">
              <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/35">
                Progress
              </div>
              <div className="mt-1.5 text-lg font-semibold text-white">
                {progressStep} / {steps.length}
              </div>
            </div>
            <div className="border border-white/[0.08] bg-white/[0.04] px-3 py-2.5">
              <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/35">
                Monthly rate
              </div>
              <div className="mt-1.5 text-lg font-semibold text-white">
                {loadingPrice ? "-" : "$" + spectrumPrice.toFixed(2)}
              </div>
            </div>
          </div>
        </div>

        <div className="border-t border-white/[0.06] px-5 py-4 sm:px-6">
          <div className="mb-3 h-1.5 w-full overflow-hidden bg-white/[0.05]">
            <div
              className="h-full bg-gradient-to-r from-blue-400/85 to-white transition-all duration-300"
              style={{ width: progressPercentage + "%" }}
            />
          </div>

          <div className="grid gap-2.5 sm:grid-cols-2" style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }}>
            {steps.map((step) => {
              const isActive = currentStep === step.id;
              const isCompleted = currentStep > step.id;
              const stepNumber = "displayId" in step ? step.displayId : step.id;

              return (
                <button
                  key={step.id}
                  type="button"
                  onClick={() => {
                    if (step.id < currentStep) {
                      setCurrentStep(step.id);
                    }
                  }}
                  className={
                    (isActive
                      ? "border border-blue-400/30 bg-blue-500/10 "
                      : isCompleted
                        ? "border border-white/[0.08] bg-white/[0.04] hover:bg-white/[0.06] "
                        : "border border-white/[0.06] bg-transparent ") +
                    (step.id < currentStep ? "cursor-pointer " : "cursor-default ") +
                    "px-3 py-3 text-left transition-colors"
                  }
                >
                  <div className="flex flex-col h-full">
                    <span className="text-xs font-semibold text-white/32">
                      {String(stepNumber).padStart(2, "0")}
                    </span>
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

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_360px] xl:items-start">
        {/* Main Form */}
        <div className="space-y-6">
          {/* Step 0: User Selection (Admin Only) */}
          {currentStep === 0 && role === "admin" && (
            <Card className={panelClassName}>
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2">
                  <User className="h-5 w-5" />
                  Select User
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div>
                  <Label htmlFor="user-search" className="mb-2 block text-white">
                    Search User
                  </Label>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-white/50" />
                    <Input
                      id="user-search"
                      type="text"
                      placeholder="Search by email, username, or ID..."
                      value={userSearchQuery}
                      onChange={(e) => setUserSearchQuery(e.target.value)}
                      className="pl-10 bg-white/10 border-white/20 text-white placeholder:text-white/50"
                    />
                  </div>
                </div>

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
                            formData.selectedUser === user.id
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
                            {formData.selectedUser === user.id && (
                              <CheckCircle2 className="h-5 w-5 text-blue-400" />
                            )}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {errors.user && (
                  <div className="flex items-center gap-2 text-red-500 text-sm">
                    <AlertCircle className="w-4 h-4" />
                    <span>{errors.user}</span>
                  </div>
                )}
              </CardContent>
              <CardFooter className="flex justify-end">
                <Button
                  onClick={handleNextStep}
                  disabled={!formData.selectedUser}
                  className="cursor-pointer rounded-md border border-blue-400/25 bg-blue-500/90 text-white hover:bg-blue-500"
                >
                  Next
                </Button>
              </CardFooter>
            </Card>
          )}

          {/* Step 1: App Type */}
          {currentStep === 1 && (
            <AppTypeStep
              formData={formData}
              onUpdate={updateFormData}
              onNext={handleNextStep}
              onBack={handlePrevStep}
            />
          )}

          {/* Step 2: Domain */}
          {currentStep === 2 && (
            <DomainStep
              spectrumApps={spectrumApps}
              formData={formData}
              onUpdate={updateFormData}
              onNext={handleNextStep}
              onBack={handlePrevStep}
            />
          )}

          {/* Step 3: Edge Port */}
          {currentStep === 3 && (
            <EdgePortStep
              formData={formData}
              onUpdate={updateFormData}
              onNext={handleNextStep}
              onBack={handlePrevStep}
            />
          )}

          {/* Step 4: Origin */}
          {currentStep === 4 && (
            <OriginStep
              formData={formData}
              onUpdate={updateFormData}
              onNext={handleNextStep}
              onBack={handlePrevStep}
            />
          )}

          {/* Step 5: Settings */}
          {currentStep === 5 && (
            <SettingsStep
              formData={formData}
              onUpdate={updateFormData}
              onNext={handleNextStep}
              onBack={handlePrevStep}
              onSubmit={onSubmit}
              isLoading={isLoading}
            />
          )}

          {/* Step 6: Project Selection */}
          {currentStep === 6 && (
            <Card className={panelClassName}>
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2">
                  <FolderTree className="h-5 w-5" />
                  Project
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div>
                  <Label htmlFor="project" className="mb-2 block text-white">
                    Select Project
                  </Label>
                  <Select
                    value={formData.project_id}
                    onValueChange={(value) => {
                      updateFormData({ project_id: value });
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
                            ? "No projects available for selected user"
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
                  <p className="text-xs text-white/50 mt-2">
                    This Spectrum app will be associated with the selected project
                  </p>
                </div>
              </CardContent>
              <CardContent className="flex justify-between pt-0">
                <button
                  onClick={handlePrevStep}
                  className="rounded-md border border-white/[0.14] bg-white/[0.03] px-4 py-2 text-white/82 transition-colors hover:bg-white/[0.07]"
                >
                  Back
                </button>
                <Button
                  onClick={onSubmit}
                  disabled={isLoading || !formData.project_id}
                  className="cursor-pointer rounded-md border border-blue-400/25 bg-blue-500/90 text-white hover:bg-blue-500"
                >
                  {isLoading ? 
                 <>Creating<Loader2 className="animate-spin h-4 w-4 mr-2" /></>: "Create"}
                </Button>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Summary Sidebar */}
        <div className={`${panelClassName} xl:sticky xl:top-8`}>
          <div className="border-b border-white/[0.06] px-6 py-5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/38">
              Summary
            </p>
            <h3 className="mt-1.5 text-lg font-semibold text-white">Deployment Configuration</h3>
          </div>
          <div className="px-6 py-5">
            {(formData.appType || formData.domain || formData.edgePort > 0 || formData.originIP || formData.ipAccessRule || (formData.proxyProtocol && formData.proxyProtocol !== 'off') || selectedProject) ? (
              <div className="divide-y divide-white/[0.05]">
                {formData.appType && (
                  <SummaryRow label="Application" value={<span className="uppercase">{formData.appType}</span>} />
                )}
                {formData.domain && (
                  <SummaryRow label="Domain" value={formData.domain} />
                )}
                {formData.edgePort > 0 && (
                  <SummaryRow label="Edge Port" value={formData.edgePort} />
                )}
                {formData.originIP && (
                  <SummaryRow label="Origin" value={`${formData.originIP}${formData.originPort > 0 ? `:${formData.originPort}` : ""}`} />
                )}
                {(formData.ipAccessRule || (formData.proxyProtocol && formData.proxyProtocol !== 'off')) && (
                  <SummaryRow
                    label="Protection"
                    value={[formData.ipAccessRule ? 'IP Rules' : null, formData.proxyProtocol && formData.proxyProtocol !== 'off' ? `Proxy ${formData.proxyProtocol.toUpperCase()}` : null].filter(Boolean).join(' / ')}
                  />
                )}
                {selectedProject && (
                  <SummaryRow label="Project" value={selectedProject.name} />
                )}
              </div>
            ) : null}
            <Separator className="my-4 bg-white/[0.08]" />
            <div className="flex items-end justify-between gap-4">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/35">
                  Estimated monthly cost
                </div>
                <div className="mt-2 text-2xl font-semibold text-white">
                  {!loadingPrice && spectrumPrice > 0 ? `$${spectrumPrice.toFixed(2)}` : "—"}
                </div>
              </div>
              {!loadingPrice && spectrumPrice > 0 && (
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

export default SpectrumAppCreate;




