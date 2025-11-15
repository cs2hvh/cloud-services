'use client';
import { useState } from "react";
import { CheckCircle2, FolderTree, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import {
  Card,
  CardContent,
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

interface SpectrumAppCreateProps {
  projects: Tables<"projects">[];
  userId: string;
}

const SpectrumAppCreate = ({ projects, userId }: SpectrumAppCreateProps) => {
  const [currentStep, setCurrentStep] = useState(1);
  const [isLoading, setIsLoading] = useState(false);

  const router = useRouter();
  
  // Form state
  const [formData, setFormData] = useState<SpectrumFormData>({
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
    project: "",
  });

  const updateFormData = (data: Partial<SpectrumFormData>) => {
    setFormData(prev => ({ ...prev, ...data }));
  };

  const handleNextStep = () => {
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
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };

  const onSubmit = async () => {
    if (!formData.project_id) {
      toast.error("Please select a project");
      return;
    }

    setIsLoading(true);
    try {
      // Log the form data
      console.log('Spectrum App Configuration:', formData);
      //debugger
      const response = await api.post('/services/spectrum/apps/create', {
        dns: { name: formData.domain, type: 'CNAME' },
        protocol: `${formData.appType==='rdp'||formData.appType==='ssh'?"tcp":formData.appType}/${formData.originPort}`,
        argo_smart_routing: true,
        proxy_protocol: formData.proxyProtocol,
        tls: 'off',
        origin_direct: [`${formData.appType==='rdp'||formData.appType==='ssh'?"tcp":formData.appType}://${formData.originIP}:${formData.originPort}`],
        project_id: formData.project_id,
        owner_id: userId,
      });

      if (response.status === 201) {
        toast.success('Spectrum application created successfully!');
        router.push('/dashboard/services/network-ddos');
        router.refresh();
      }
    } catch (error) {
      console.error('Failed to create Spectrum app:', error);
      toast.error('Failed to create Spectrum application. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const steps = [
    { id: 1, name: "AppType" },
    { id: 2, name: "Domain" },
    { id: 3, name: "Edge Port" },
    { id: 4, name: "Origin" },
    { id: 5, name: "Settings" },
    { id: 6, name: "Project" }
  ];

  const selectedProject = projects.find((proj) => proj.id === formData.project_id);

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
                      step.id
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
                      {projects.length === 0 ? (
                        <div className="px-2 py-6 text-center text-white/60">
                          No projects available
                        </div>
                      ) : (
                        projects.map((project) => (
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
                    {formData.originPort > 0 && (
                      <div className="text-xs text-white/60 mt-1">
                        Port: {formData.originPort}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Settings Section */}
              {currentStep === 5 && (
                <>
                  <div className="h-px bg-white/10 my-3" />
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
                  <div className="h-px bg-white/10 my-3" />
                  <div className="flex justify-between items-start">
                    <div className="text-sm text-white/60">Project</div>
                    <div className="text-white text-sm text-right max-w-[60%] break-words">
                      {selectedProject.name}
                    </div>
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
