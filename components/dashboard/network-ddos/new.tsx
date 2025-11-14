'use client';
import { useState } from "react";
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
  Shield,
  Loader2,
  Globe,
  Network,
  Plus,
  Trash2,
  // Lock,
  // Server,
  // Gamepad2,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";

interface Application {
  id: string;
  name: string;
  protocol: 'TCP' | 'UDP';
  originIP: string;
  ports: string;
  applicationFilter?: string;
}

// DDoS Protection Plans
const protectionPlans = [
  {
    id: 'standard-protection',
    name: 'Standard Protection',
    price: 100,
    features: {
      applications: 2,
      bandwidth: '200 Tbps',
      locations: '100+ Global',
      support: 'Standard',
      analytics: 'Basic',
      geoBlock: false,
      appFilters: false,
      customRules: false
    },
    popular: false,
    discount: null,
  },
  {
    id: 'enterprise-protection',
    name: 'Enterprise Protection',
    price: 299,
    features: {
      applications: 'Unlimited',
      bandwidth: '200 Tbps',
      locations: '250+ Premium',
      support: 'Priority + SLA',
      analytics: 'Advanced',
      geoBlock: true,
      appFilters: true,
      customRules: true
    },
    popular: true,
    discount: null,
  },
];

// Application-specific filters (Enterprise only)
const applicationFilters = [
  { id: 'ssh', name: 'SSH Protection', description: 'Brute-force and intrusion protection' },
  { id: 'rdp', name: 'RDP Protection', description: 'Remote desktop attack mitigation' },
  { id: 'api', name: 'API Protection', description: 'Rate limiting and API security' },
  { id: 'game', name: 'Game Server', description: 'Gaming protocol optimization' },
  { id: 'database', name: 'Database Protection', description: 'Database connection filtering' },
  { id: 'web', name: 'Web Server', description: 'HTTP/HTTPS traffic optimization' },
];

// Add-on Services
const addons = [
  {
    id: 'extra-apps',
    name: 'Additional Applications',
    description: 'Add 5 more application slots (Standard plan only)',
    price: 50,
    icon: Plus,
    planRestriction: 'standard-protection',
  },
  {
    id: 'premium-analytics',
    name: 'Premium Analytics',
    description: 'Advanced traffic analytics and threat intelligence',
    price: 49,
    icon: Globe,
    planRestriction: null,
  },
  {
    id: 'priority-support',
    name: 'Priority Support',
    description: '24/7 priority support with dedicated engineers',
    price: 99,
    icon: Shield,
    planRestriction: 'standard-protection',
  },
];

const DDoSProtectionSelect = () => {
  const [currentStep, setCurrentStep] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  
  // Form state
  const [protectionName, setProtectionName] = useState('');
  const [selectedPlan, setSelectedPlan] = useState<string>('');
  const [applications, setApplications] = useState<Application[]>([]);
  const [selectedAddons, setSelectedAddons] = useState<string[]>([]);
  // const [geoBlockCountries, setGeoBlockCountries] = useState<string[]>([]);
  const [termsAccepted, setTermsAccepted] = useState(false);

  // Calculate total price
  const calculateTotalPrice = () => {
    const plan = protectionPlans.find(p => p.id === selectedPlan);
    let planPrice = plan ? plan.price : 0;
    
    // Apply discount if available
    if (plan?.discount) {
      planPrice = planPrice * (1 - plan.discount / 100);
    }
    
    const addonsPrice = selectedAddons.reduce((total, addonId) => {
      const addon = addons.find(a => a.id === addonId);
      return total + (addon ? addon.price : 0);
    }, 0);
    return Math.round(planPrice + addonsPrice);
  };

  const handleAddonToggle = (addonId: string) => {
    setSelectedAddons(prev => 
      prev.includes(addonId) 
        ? prev.filter(id => id !== addonId)
        : [...prev, addonId]
    );
  };

  const addApplication = () => {
    const selectedPlanData = protectionPlans.find(p => p.id === selectedPlan);
    const maxApps = selectedPlanData?.features.applications === 'Unlimited' ? 999 : 
                   typeof selectedPlanData?.features.applications === 'string' ? 
                   parseInt(selectedPlanData.features.applications) : 2;

    if (applications.length >= maxApps) {
      toast.error(`Maximum ${maxApps} applications allowed for this plan`);
      return;
    }

    const newApp: Application = {
      id: `app-${Date.now()}`,
      name: '',
      protocol: 'TCP',
      originIP: '',
      ports: '',
      applicationFilter: undefined
    };
    setApplications([...applications, newApp]);
  };

  const removeApplication = (id: string) => {
    setApplications(applications.filter(app => app.id !== id));
  };

  const updateApplication = (id: string, field: keyof Application, value: string) => {
    setApplications(applications.map(app => 
      app.id === id ? { ...app, [field]: value } : app
    ));
  };

  const validateApplications = () => {
    if (applications.length === 0) {
      toast.error('Please add at least one application');
      return false;
    }

    for (const app of applications) {
      if (!app.name.trim()) {
        toast.error('Please enter a name for all applications');
        return false;
      }
      if (!app.originIP.trim()) {
        toast.error('Please enter an origin IP for all applications');
        return false;
      }
      if (!app.ports.trim()) {
        toast.error('Please enter ports for all applications');
        return false;
      }
    }
    return true;
  };

  const handleNextStep = () => {
    if (currentStep === 1 && !protectionName.trim()) {
      toast.error('Please enter a protection name');
      return;
    }
    if (currentStep === 2 && !selectedPlan) {
      toast.error('Please select a plan');
      return;
    }
    if (currentStep === 3 && !validateApplications()) {
      return;
    }
    
    if (currentStep < 4) {
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
      // Here you would make the API call to setup Layer 4 protection
      await new Promise(resolve => setTimeout(resolve, 2000)); // Simulate API call
      toast.success('Layer 4 DDoS protection configured successfully!');
      // Redirect to protection dashboard
    } catch {
      toast.error('Failed to configure DDoS protection. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const steps = [
    { id: 1, name: "app-type" },
    { id: 2, name: "domain" },
    { id: 3, name: "edge-port" },
    { id: 4, name: "origin" },
    { id: 5, name: "settings" } 
  ];

  const selectedPlanData = protectionPlans.find(p => p.id === selectedPlan);
  const isEnterprise = selectedPlan === 'enterprise-protection';

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
          {/* Step 1: Name */}
          {currentStep === 1 && (
            <Card className="bg-white/5 border-white/10">
              <CardHeader>
                <CardTitle className="text-white">
                  Protection Configuration Name
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Input
                  value={protectionName}
                  onChange={(e) => setProtectionName(e.target.value)}
                  type="text"
                  placeholder="production-layer4-protection"
                  className="bg-white/10 border-white/20 rounded-md text-white placeholder:text-white/50"
                />
                <p className="text-xs text-white/60 mt-2">
                  Choose a descriptive name for your Layer 4 DDoS protection
                  setup
                </p>
              </CardContent>
              <CardFooter className="flex justify-end">
                <Button
                  onClick={handleNextStep}
                  className="bg-white text-black rounded-md hover:bg-white/90"
                >
                  Next <ChevronRight size={16} className="ml-2" />
                </Button>
              </CardFooter>
            </Card>
          )}

          {/* Step 2: Plan */}
          {currentStep === 2 && (
            <Card className="bg-white/5 border-white/10">
              <CardHeader>
                <CardTitle className="text-white">Protection Plan</CardTitle>
              </CardHeader>
              <CardContent>
                <RadioGroup
                  value={selectedPlan}
                  onValueChange={setSelectedPlan}
                  className="grid grid-cols-1 gap-6"
                >
                  {protectionPlans.map((plan) => (
                    <div key={plan.id}>
                      <RadioGroupItem
                        value={plan.id}
                        id={plan.id}
                        className="peer sr-only"
                      />
                      <Label
                        htmlFor={plan.id}
                        className="block bg-white/10 rounded-lg border-2 border-transparent cursor-pointer p-6 transition-all peer-data-[state=checked]:border-blue-500 hover:bg-white/15"
                      >
                        <div className="flex justify-between items-start mb-4">
                          <div>
                            <p className="font-bold text-xl text-white">
                              {plan.name}
                            </p>
                            {plan.popular && (
                              <Badge
                                variant="outline"
                                className="text-blue-400 bg-blue-500/10 border-blue-500/30 mt-2"
                              >
                                Recommended
                              </Badge>
                            )}
                          </div>
                          <div className="text-right">
                            <div className="text-3xl font-bold text-white">
                              ${plan.price}
                              <span className="text-lg font-normal text-white/60">
                                /mo
                              </span>
                            </div>
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-4 pt-4 border-t border-white/10">
                          <div>
                            <div className="flex items-center gap-2 mb-1">
                              <Network className="w-4 h-4 text-blue-400" />
                              <span className="text-xs text-white/60">
                                Applications
                              </span>
                            </div>
                            <p className="font-semibold text-white">
                              {plan.features.applications}
                            </p>
                          </div>
                          <div>
                            <div className="flex items-center gap-2 mb-1">
                              <Shield className="w-4 h-4 text-green-400" />
                              <span className="text-xs text-white/60">
                                Protection
                              </span>
                            </div>
                            <p className="font-semibold text-white">
                              {plan.features.bandwidth}
                            </p>
                          </div>
                          <div>
                            <div className="flex items-center gap-2 mb-1">
                              <Globe className="w-4 h-4 text-purple-400" />
                              <span className="text-xs text-white/60">
                                Locations
                              </span>
                            </div>
                            <p className="font-semibold text-white">
                              {plan.features.locations}
                            </p>
                          </div>
                          <div>
                            <div className="flex items-center gap-2 mb-1">
                              <CheckCircle2 className="w-4 h-4 text-orange-400" />
                              <span className="text-xs text-white/60">
                                Support
                              </span>
                            </div>
                            <p className="font-semibold text-white">
                              {plan.features.support}
                            </p>
                          </div>
                        </div>
                        {plan.id === "enterprise-protection" && (
                          <div className="mt-4 pt-4 border-t border-white/10">
                            <p className="text-sm font-medium text-white mb-2">
                              Enterprise Features:
                            </p>
                            <div className="grid grid-cols-2 gap-2 text-xs text-white/70">
                              <div>• Geographic blocking</div>
                              <div>• SSH/RDP protection</div>
                              <div>• API rate limiting</div>
                              <div>• Game server optimization</div>
                              <div>• Custom security rules</div>
                              <div>• Advanced analytics</div>
                            </div>
                          </div>
                        )}
                      </Label>
                    </div>
                  ))}
                </RadioGroup>
              </CardContent>
              <CardFooter className="flex justify-between">
                <Button
                  variant="outline"
                  onClick={handlePrevStep}
                  className="rounded-md border-white/20 text-white hover:bg-white/10"
                >
                  Back
                </Button>
                <Button
                  onClick={handleNextStep}
                  className="bg-white text-black rounded-md hover:bg-white/90"
                >
                  Next <ChevronRight size={16} className="ml-2" />
                </Button>
              </CardFooter>
            </Card>
          )}

          {/* Step 3: Applications */}
          {currentStep === 3 && (
            <Card className="bg-white/5 border-white/10">
              <CardHeader>
                <div className="flex justify-between items-center">
                  <CardTitle className="text-white">
                    Protected Applications
                  </CardTitle>
                  <Button
                    onClick={addApplication}
                    size="sm"
                    className="bg-blue-500 text-white hover:bg-blue-600"
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    Add Application
                  </Button>
                </div>
                <p className="text-sm text-white/60">
                  Configure your TCP/UDP applications. Each application protects
                  one IP with multiple ports.
                </p>
              </CardHeader>
              <CardContent className="space-y-4">
                {applications.length === 0 ? (
                  <div className="text-center py-8">
                    <Network className="w-12 h-12 text-white/30 mx-auto mb-4" />
                    <p className="text-white/60 mb-4">
                      No applications configured yet
                    </p>
                    <Button
                      onClick={addApplication}
                      className="bg-blue-500 text-white hover:bg-blue-600"
                    >
                      <Plus className="w-4 h-4 mr-2" />
                      Add Your First Application
                    </Button>
                  </div>
                ) : (
                  applications.map((app, index) => (
                    <Card key={app.id} className="bg-white/10 border-white/20">
                      <CardHeader className="pb-3">
                        <div className="flex justify-between items-center">
                          <h4 className="text-white font-medium">
                            Application {index + 1}
                          </h4>
                          <Button
                            onClick={() => removeApplication(app.id)}
                            size="sm"
                            variant="outline"
                            className="border-red-500/50 text-red-400 hover:bg-red-500/10"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div>
                            <Label className="text-white">
                              Application Name
                            </Label>
                            <Input
                              value={app.name}
                              onChange={(e) =>
                                updateApplication(
                                  app.id,
                                  "name",
                                  e.target.value
                                )
                              }
                              placeholder="web-server"
                              className="bg-white/10 border-white/20 text-white placeholder:text-white/50"
                            />
                          </div>
                          <div>
                            <Label className="text-white">Protocol</Label>
                            <Select
                              value={app.protocol}
                              onValueChange={(value: "TCP" | "UDP") =>
                                updateApplication(app.id, "protocol", value)
                              }
                            >
                              <SelectTrigger className="bg-white/10 border-white/20 text-white">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="TCP">TCP</SelectItem>
                                <SelectItem value="UDP">UDP</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                        <div>
                          <Label className="text-white">
                            Origin IP Address
                          </Label>
                          <Input
                            value={app.originIP}
                            onChange={(e) =>
                              updateApplication(
                                app.id,
                                "originIP",
                                e.target.value
                              )
                            }
                            placeholder="192.168.1.100"
                            className="bg-white/10 border-white/20 text-white placeholder:text-white/50"
                          />
                          <p className="text-xs text-white/60 mt-1">
                            The IP address of your origin server
                          </p>
                        </div>
                        <div>
                          <Label className="text-white">Ports</Label>
                          <Input
                            value={app.ports}
                            onChange={(e) =>
                              updateApplication(app.id, "ports", e.target.value)
                            }
                            placeholder="80,443,8080-8090"
                            className="bg-white/10 border-white/20 text-white placeholder:text-white/50"
                          />
                          <p className="text-xs text-white/60 mt-1">
                            Comma-separated ports or ranges (e.g.,
                            80,443,8080-8090)
                          </p>
                        </div>
                        {isEnterprise && (
                          <div>
                            <Label className="text-white">
                              Application Filter (Enterprise)
                            </Label>
                            <Select
                              value={app.applicationFilter || ""}
                              onValueChange={(value) =>
                                updateApplication(
                                  app.id,
                                  "applicationFilter",
                                  value
                                )
                              }
                            >
                              <SelectTrigger className="bg-white/10 border-white/20 text-white">
                                <SelectValue placeholder="Select application type (optional)" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="">
                                  No specific filter
                                </SelectItem>
                                {applicationFilters.map((filter) => (
                                  <SelectItem key={filter.id} value={filter.id}>
                                    {filter.name} - {filter.description}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <p className="text-xs text-white/60 mt-1">
                              Apply specialized protection rules for specific
                              application types
                            </p>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  ))
                )}
              </CardContent>
              <CardFooter className="flex justify-between">
                <Button
                  variant="outline"
                  onClick={handlePrevStep}
                  className="rounded-md border-white/20 text-white hover:bg-white/10"
                >
                  Back
                </Button>
                <Button
                  onClick={handleNextStep}
                  className="bg-white text-black rounded-md hover:bg-white/90"
                >
                  Next <ChevronRight size={16} className="ml-2" />
                </Button>
              </CardFooter>
            </Card>
          )}

          {/* Step 4: Add-ons & Review */}
          {currentStep === 4 && (
            <Card className="bg-white/5 border-white/10">
              <CardHeader>
                <CardTitle className="text-white">Add-ons & Review</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div>
                  <Label className="text-white">
                    Add-on Services (Optional)
                  </Label>
                  <div className="mt-4 space-y-4">
                    {addons
                      .filter(
                        (addon) =>
                          !addon.planRestriction ||
                          addon.planRestriction === selectedPlan
                      )
                      .map((addon) => {
                        const IconComponent = addon.icon;
                        return (
                          <div
                            key={addon.id}
                            className="flex items-center space-x-3 p-4 bg-white/10 rounded-lg border border-white/10"
                          >
                            <Checkbox
                              id={addon.id}
                              checked={selectedAddons.includes(addon.id)}
                              onCheckedChange={() =>
                                handleAddonToggle(addon.id)
                              }
                            />
                            <IconComponent className="w-5 h-5 text-blue-400" />
                            <div className="flex-1">
                              <div className="font-medium text-white">
                                {addon.name}
                              </div>
                              <div className="text-sm text-white/60">
                                {addon.description}
                              </div>
                            </div>
                            <div className="text-white font-medium">
                              +${addon.price}/month
                            </div>
                          </div>
                        );
                      })}
                  </div>
                </div>

                <Separator className="bg-white/10" />

                {/* Configuration Summary */}
                <div>
                  <Label className="text-white">Configuration Summary</Label>
                  <div className="mt-4 space-y-3 p-4 bg-white/10 rounded-lg">
                    <div className="flex justify-between">
                      <span className="text-white/60">Protection Name:</span>
                      <span className="text-white">{protectionName}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-white/60">Plan:</span>
                      <span className="text-white">
                        {selectedPlanData?.name}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-white/60">Applications:</span>
                      <span className="text-white">
                        {applications.length} configured
                      </span>
                    </div>

                    {applications.length > 0 && (
                      <div className="mt-4">
                        <div className="text-white/60 mb-2">
                          Application Details:
                        </div>
                        {applications.map((app, index) => (
                          <div
                            key={app.id}
                            className="ml-4 mb-2 p-2 bg-white/5 rounded"
                          >
                            <div className="text-sm text-white">
                              {app.name || `Application ${index + 1}`}
                            </div>
                            <div className="text-xs text-white/60">
                              {app.protocol} • {app.originIP} • Ports:{" "}
                              {app.ports}
                              {app.applicationFilter && (
                                <span className="ml-2 text-blue-400">
                                  •{" "}
                                  {
                                    applicationFilters.find(
                                      (f) => f.id === app.applicationFilter
                                    )?.name
                                  }
                                </span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {selectedAddons.length > 0 && (
                      <div>
                        <div className="text-white/60 mb-2">Add-ons:</div>
                        {selectedAddons.map((addonId) => {
                          const addon = addons.find((a) => a.id === addonId);
                          return addon ? (
                            <div
                              key={addonId}
                              className="flex justify-between ml-4"
                            >
                              <span className="text-white/60">
                                • {addon.name}
                              </span>
                              <span className="text-white">
                                +${addon.price}/month
                              </span>
                            </div>
                          ) : null;
                        })}
                      </div>
                    )}
                    <Separator className="bg-white/10" />
                    <div className="flex justify-between text-lg font-bold">
                      <span className="text-white">Total:</span>
                      <span className="text-white">
                        ${calculateTotalPrice()}/month
                      </span>
                    </div>
                  </div>
                </div>

                {/* Terms */}
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="terms"
                    checked={termsAccepted}
                    onCheckedChange={(checked) =>
                      setTermsAccepted(checked === true)
                    }
                  />
                  <Label htmlFor="terms" className="text-sm text-white/60">
                    I agree to the terms of service and privacy policy
                  </Label>
                </div>
              </CardContent>
              <CardFooter className="flex justify-between">
                <Button
                  variant="outline"
                  onClick={handlePrevStep}
                  className="rounded-md border-white/20 text-white hover:bg-white/10"
                >
                  Back
                </Button>
                <Button
                  onClick={onSubmit}
                  disabled={isLoading || !termsAccepted}
                  className="bg-white text-black rounded-md hover:bg-white/90"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Configuring...
                    </>
                  ) : (
                    "Enable Protection"
                  )}
                </Button>
              </CardFooter>
            </Card>
          )}
        </div>

        {/* Summary Sidebar */}
        <div className="lg:col-span-1">
          <Card className="bg-white/5 border-white/10 sticky top-6">
            <CardHeader>
              <CardTitle className="text-white">Protection Summary</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <div className="text-sm text-white/60">Protection Name</div>
                <div className="text-white">{protectionName || "Not set"}</div>
              </div>

              {selectedPlanData && (
                <div>
                  <div className="text-sm text-white/60">Plan</div>
                  <div className="text-white">{selectedPlanData.name}</div>
                  <div className="mt-2 space-y-1 text-sm">
                    <div className="flex justify-between text-white/60">
                      <span>Applications:</span>
                      <span>{selectedPlanData.features.applications}</span>
                    </div>
                    <div className="flex justify-between text-white/60">
                      <span>Protection:</span>
                      <span>{selectedPlanData.features.bandwidth}</span>
                    </div>
                    <div className="flex justify-between text-white/60">
                      <span>Locations:</span>
                      <span>{selectedPlanData.features.locations}</span>
                    </div>
                  </div>
                </div>
              )}

              <div>
                <div className="text-sm text-white/60">
                  Applications Configured
                </div>
                <div className="text-white">{applications.length}</div>
              </div>

              {isEnterprise && (
                <div>
                  <div className="text-sm text-white/60">
                    Enterprise Features
                  </div>
                  <div className="text-xs text-white/70 space-y-1">
                    <div>• Geographic blocking</div>
                    <div>• Application-specific filters</div>
                    <div>• Custom security rules</div>
                    <div>• Advanced analytics</div>
                  </div>
                </div>
              )}

              <Separator className="bg-white/10" />

              <div>
                <div className="text-sm text-white/60">Monthly Cost</div>
                <div className="text-2xl font-bold text-white">
                  ${calculateTotalPrice()}/month
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default DDoSProtectionSelect;
