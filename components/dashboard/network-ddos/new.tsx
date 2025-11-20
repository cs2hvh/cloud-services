'use client';
import { useState, useEffect } from "react";
import { CheckCircle2, FolderTree, AlertCircle, User, Search, DollarSign } from "lucide-react";
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
import api from "@/lib/axios/axios";
import { useRouter } from "next/navigation";
import { Tables } from "@/lib/supabase/types";
import { Button } from "@/components/ui/button";
import axios from "axios";

interface SpectrumAppCreateProps {
  projects: Tables<"projects">[];
  userId: string;
  role?: "user" | "admin";
  allUsers?: Array<{
    id: string;
    email: string;
    username?: string;
  }>;
}

const SpectrumAppCreate = ({ projects, userId, role = "user", allUsers = [] }: SpectrumAppCreateProps) => {
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
    //debugger
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
      console.log('Spectrum App Configuration:', formData);
      debugger
      const response = await fetch("/api/services/spectrum/apps/create", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          dns: { name: formData.domain, type: "CNAME" },
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
        }),
      });

      if (response.status === 201) {
        toast.success('Spectrum application created successfully!');
        if (role === "admin") {
          router.push('/dashboard/admin/network-ddos');
        } else {
          router.push('/dashboard/services/network-ddos');
        }
        router.refresh();
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
            { id: 0, name: "User", displayId: 1 },
            { id: 1, name: "AppType", displayId: 2 },
            { id: 2, name: "Domain", displayId: 3 },
            { id: 4, name: "Origin", displayId: 4 },
            { id: 6, name: "Project", displayId: 5 }
          ]
        : [
            { id: 0, name: "User" },
            { id: 1, name: "AppType" },
            { id: 2, name: "Domain" },
            { id: 3, name: "Edge Port" },
            { id: 4, name: "Origin" },
            { id: 5, name: "Settings" },
            { id: 6, name: "Project" }
          ])
    : (isSSHorRDP
        ? [
            { id: 1, name: "AppType", displayId: 1 },
            { id: 2, name: "Domain", displayId: 2 },
            { id: 4, name: "Origin", displayId: 3 },
            { id: 6, name: "Project", displayId: 4 }
          ]
        : [
            { id: 1, name: "AppType" },
            { id: 2, name: "Domain" },
            { id: 3, name: "Edge Port" },
            { id: 4, name: "Origin" },
            { id: 5, name: "Settings" },
            { id: 6, name: "Project" }
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

  return (
    <div className="py-4">
      {/* Progress Steps */}
      <div className="mb-8">
        <div className="flex justify-between mb-2">
          {steps.map((step, index) => (
            <div key={step.id} className="flex-1 flex flex-col items-center">
              {/* Step circle and connector line */}
              <div className="flex items-center w-full">
                <div className="flex flex-col items-center relative">
                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors duration-300 ${
                      currentStep > step.id
                        ? "bg-green-600 text-white"
                        : currentStep === step.id
                          ? "bg-blue-500 text-white"
                          : "bg-white/10 text-white/50"
                    }`}
                  >
                    {currentStep > step.id ? (
                      <CheckCircle2 size={16} />
                    ) : (
                      ('displayId' in step ? step.displayId : step.id)
                    )}
                  </div>
                  {/* Step name positioned directly below the circle */}
                  <p
                    className={`mt-2 text-xs text-center whitespace-nowrap ${
                      currentStep >= step.id ? "text-white" : "text-white/50"
                    }`}
                  >
                    {step.name}
                  </p>
                </div>

                {/* Connector line */}
                {index < steps.length - 1 && (
                  <div
                    className={`flex-1 h-0.5 transition-colors duration-300 ${
                      currentStep > step.id ? "bg-green-600" : "bg-white/10"
                    }`}
                  ></div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Main Form */}
        <div className="lg:col-span-2 space-y-6">
          {/* Step 0: User Selection (Admin Only) */}
          {currentStep === 0 && role === "admin" && (
            <Card className="bg-white/5 border-white/10">
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
                  className="cursor-pointer bg-white text-black rounded-md hover:bg-white/90"
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
            <Card className="bg-white/5 border-white/10">
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
                  className="px-4 py-2 bg-white/10 text-white rounded-md hover:bg-white/20 transition-colors"
                >
                  Back
                </button>
                <Button
                  onClick={onSubmit}
                  disabled={isLoading || !formData.project_id}
                  className="cursor-pointer bg-white text-black rounded-md hover:bg-white/90"
                >
                  {isLoading ? "Creating..." : "Create"}
                </Button>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Summary Sidebar */}
        <div className="lg:col-span-1">
          <Card className="bg-white/5 border-white/10 sticky top-6">
            <CardHeader>
              <CardTitle className="text-white">Order Summary</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Application Type */}
              <div className="flex justify-between items-start">
                <div className="text-sm text-white/60">Application Type</div>
                <div className="text-white uppercase text-right text-sm">
                  {formData.appType || "Not selected"}
                </div>
              </div>

              {/* Domain Name */}
              {formData.domain && (
                <div className="flex justify-between items-start">
                  <div className="text-sm text-white/60">Domain Name</div>
                  <div className="text-white text-sm text-right max-w-[60%] break-words">
                    {formData.domain}
                  </div>
                </div>
              )}

              {/* Edge Port */}
              {formData.edgePort > 0 && (
                <div className="flex justify-between items-start">
                  <div className="text-sm text-white/60">Edge Port</div>
                  <div className="text-white text-sm">{formData.edgePort}</div>
                </div>
              )}

              {/* Origin */}
              {formData.originIP && (
                <div className="flex justify-between items-start">
                  <div className="text-sm text-white/60">Origin</div>
                  <div className="text-right max-w-[60%]">
                    <div className="text-white text-sm break-words">
                      {formData.originIP}
                    </div>
                   
                  </div>
                </div>
              )}
              {formData.originPort>0 && (
                <div className="flex justify-between items-start">
                  <div className="text-sm text-white/60">Port</div>
                  <div className="text-right max-w-[60%]">
                    <div className="text-white text-sm break-words">
                      {formData.originPort}
                    </div>
                   
                  </div>
                </div>
              )}


              {/* Settings Section */}
              {formData.ipAccessRule ||formData.proxyProtocol && (
                <>
                 
                  <div>
                    <div className="text-sm text-white/60 mb-3">Settings</div>
                    <div className="space-y-2 text-sm">
                      {/* <div className="flex justify-between">
                        <span className="text-white/60">Argo Routing:</span>
                        <span className="text-white">
                          {formData.argoSmartRouting ? "On" : "Off"}
                        </span>
                      </div> */}
                      {/* <div className="flex justify-between">
                        <span className="text-white/60">TLS:</span>
                        <span className="text-white capitalize">
                          {formData.tls}
                        </span>
                      </div> */}
                      <div className="flex justify-between">
                        <span className="text-white/60">IP Rules:</span>
                        <span className="text-white">
                          {formData.ipAccessRule ? "On" : "Off"}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-white/60">Proxy:</span>
                        <span className="text-white uppercase">
                          {formData.proxyProtocol}
                        </span>
                      </div>
                    </div>
                  </div>
                </>
              )}

              {/* Project Section */}
              {currentStep === 6 && selectedProject && (
                <>
                 
                  <div className="flex justify-between items-start">
                    <div className="text-sm text-white/60">Project</div>
                    <div className="text-white text-sm text-right max-w-[60%] break-words">
                      {selectedProject.name}
                    </div>
                  </div>
                </>
              )}

              {/* Pricing Section */}
              {!loadingPrice && spectrumPrice > 0 && (
                <>
                  <div className="border-t border-white/10 pt-4 mt-4">
                    <div className="flex justify-between items-center">
                      <div className="text-sm text-white/60 flex items-center gap-2">
                        <DollarSign className="h-4 w-4" />
                        Price
                      </div>
                      <div className="text-white text-lg font-semibold">
                        ${spectrumPrice.toFixed(2)}/mo
                      </div>
                    </div>
                    <p className="text-xs text-white/50 mt-2">
                      Monthly subscription for DDoS protection
                    </p>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default SpectrumAppCreate;
