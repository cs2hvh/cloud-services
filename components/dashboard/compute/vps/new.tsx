'use client';
import { useState } from "react";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Button } from "@/components/ui/button";
import {
  CheckCircle2,
  ChevronRight,
  Cpu,
  HardDrive,
  Loader2,
  MemoryStick,
  Shield,
  Network,
  Database,
} from "lucide-react";
import Image from "next/image";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
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

export interface ComputeOptions {
  locations?: Array<{ id: string; name: string; node: string }>;
  osTemplates?: Array<{ id: string; name: string; type: string }>;
  specs?: Array<{ id: string; name: string; cpuCores: number; memoryMB: number; diskGB: number; hourlyRate: number; monthlyRate: number }>;
}

interface PageProps {
  locations: Tables<"locations">[];
  computeOptions?: ComputeOptions;
}

// VPS Plans
const vpsPlans = [
  {
    id: 'vps-basic',
    name: 'Basic',
    price: 5,
    resources: { cpu: 1, ram: 2, storage: 50, bandwidth: 2 },
    popular: false,
    discount: null,
  },
  {
    id: 'vps-standard',
    name: 'Standard',
    price: 12,
    resources: { cpu: 2, ram: 4, storage: 80, bandwidth: 4 },
    popular: true,
    discount: null,
  },
  {
    id: 'vps-performance',
    name: 'Performance',
    price: 24,
    resources: { cpu: 4, ram: 8, storage: 160, bandwidth: 5 },
    popular: false,
    discount: 10,
  },
  {
    id: 'vps-enterprise',
    name: 'Enterprise',
    price: 48,
    resources: { cpu: 8, ram: 16, storage: 320, bandwidth: 8 },
    popular: false,
    discount: 15,
  },
];

// Operating Systems
const operatingSystems = [
  { 
    id: 'ubuntu-22', 
    name: 'Ubuntu 22.04 LTS', 
    description: 'Most popular Linux distribution',
    icon: 'https://cdn.jsdelivr.net/gh/devicons/devicon/icons/ubuntu/ubuntu-plain.svg'
  },
  { 
    id: 'ubuntu-20', 
    name: 'Ubuntu 20.04 LTS', 
    description: 'Long-term support version',
    icon: 'https://cdn.jsdelivr.net/gh/devicons/devicon/icons/ubuntu/ubuntu-plain.svg'
  },
  { 
    id: 'debian-11', 
    name: 'Debian 11', 
    description: 'Stable and reliable Linux',
    icon: 'https://cdn.jsdelivr.net/gh/devicons/devicon/icons/debian/debian-original.svg'
  },
  { 
    id: 'centos-8', 
    name: 'CentOS 8', 
    description: 'Enterprise-class Linux',
    icon: 'https://cdn.jsdelivr.net/gh/devicons/devicon/icons/centos/centos-original.svg'
  },
  { 
    id: 'fedora-38', 
    name: 'Fedora 38', 
    description: 'Cutting-edge Linux distribution',
    icon: 'https://cdn.jsdelivr.net/gh/devicons/devicon/icons/fedora/fedora-original.svg'
  },
  { 
    id: 'windows-2022', 
    name: 'Windows Server 2022', 
    description: 'Latest Windows Server',
    icon: 'https://cdn.jsdelivr.net/gh/devicons/devicon/icons/windows8/windows8-original.svg'
  },
];

// Add-ons
const addons = [
  {
    id: 'extra-ip',
    name: 'Additional IP Address',
    description: 'Get an extra dedicated IPv4 address',
    price: 3,
    icon: Network,
  },
  {
    id: 'ddos-protection',
    name: 'DDoS Protection',
    description: 'Advanced DDoS protection up to 10Gbps',
    price: 10,
    icon: Shield,
  },
  {
    id: 'automated-backups',
    name: 'Automated Backups',
    description: 'Daily automated backups with 7-day retention',
    price: 5,
    icon: Database,
  },
];

const VPSSelect = ({ locations, computeOptions }: PageProps) => {
  const [currentStep, setCurrentStep] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  
  // Form state
  const [vpsName, setVpsName] = useState('');
  const [selectedLocation, setSelectedLocation] = useState<string>('');
  const [selectedPlan, setSelectedPlan] = useState<string>('');
  const [selectedOS, setSelectedOS] = useState<string>('');
  const [selectedAddons, setSelectedAddons] = useState<string[]>([]);
  const [sshPassword, setSshPassword] = useState('');
  const [termsAccepted, setTermsAccepted] = useState(false);

  // Use computed options if provided, otherwise use hardcoded defaults
  const effectiveSpecs = computeOptions?.specs && computeOptions.specs.length > 0 
    ? computeOptions.specs 
    : vpsPlans;
  
  const effectiveOSList = computeOptions?.osTemplates && computeOptions.osTemplates.length > 0
    ? computeOptions.osTemplates.map(os => ({
        id: os.id,
        name: os.name,
        description: `Template: ${os.type}`,
        icon: 'https://cdn.jsdelivr.net/gh/devicons/devicon/icons/linux/linux-original.svg'
      }))
    : operatingSystems;

  // Calculate total price
  const calculateTotalPrice = () => {
    const plan = effectiveSpecs.find(p => 
      typeof p.id === 'string' ? p.id === selectedPlan : p.id == selectedPlan
    );
    
    // Handle both old format (price, discount) and new format (monthlyRate)
    let planPrice = 0;
    if (plan) {
      if ('monthlyRate' in plan) {
        planPrice = plan.monthlyRate;
      } else if ('price' in plan) {
        planPrice = plan.price as number;
        const discount = plan.discount as number | undefined;
        if (discount) {
          planPrice = planPrice * (1 - discount / 100);
        }
      }
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

  const handleNextStep = () => {
    if (currentStep === 1) {
      if (!vpsName.trim()) {
        toast.error('Please enter a VPS name');
        return;
      }
      if (!sshPassword || sshPassword.length < 12) {
        toast.error('SSH password must be at least 12 characters');
        return;
      }
      const hasUpperCase = /[A-Z]/.test(sshPassword);
      const hasLowerCase = /[a-z]/.test(sshPassword);
      const hasNumbers = /[0-9]/.test(sshPassword);
      const hasSpecialChar = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(sshPassword);
      
      if (!hasUpperCase || !hasLowerCase || !hasNumbers || !hasSpecialChar) {
        toast.error('Password must contain uppercase, lowercase, numbers, and special characters');
        return;
      }
    }
    if (currentStep === 2 && !selectedLocation) {
      toast.error('Please select a location');
      return;
    }
    if (currentStep === 3 && !selectedPlan) {
      toast.error('Please select a plan');
      return;
    }
    if (currentStep === 4 && !selectedOS) {
      toast.error('Please select an operating system');
      return;
    }
    
    if (currentStep < 5) {
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
      // Get the selected plan details
      const plan = effectiveSpecs.find(p => 
        typeof p.id === 'string' ? p.id === selectedPlan : p.id == selectedPlan
      );
      
      if (!plan) {
        throw new Error("Invalid plan selected");
      }

      // Extract specs from plan (handle both old and new formats)
      let cpuCores = 1;
      let memoryMB = 2048;
      let diskGB = 50;

      if ('cpuCores' in plan) {
        // New format from Proxmox specs
        cpuCores = plan.cpuCores as number;
        memoryMB = plan.memoryMB as number;
        diskGB = plan.diskGB as number;
      } else if ('resources' in plan) {
        // Old format from hardcoded plans
        cpuCores = plan.resources.cpu;
        memoryMB = plan.resources.ram * 1024; // Convert GB to MB
        diskGB = plan.resources.storage;
      }

      // Prepare the payload for VM creation
      const createPayload = {
        hostname: vpsName,
        location: selectedLocation,
        os: selectedOS,
        cpuCores,
        memoryMB,
        diskGB,
        sshPassword,
      };

      // Call the VM creation API
      const response = await fetch('/api/services/compute/vms/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(createPayload),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to create VPS');
      }

      const result = await response.json();
      toast.success('VPS deployment initiated successfully!');
      
      // Optionally redirect or show VM details
      console.log('VM created:', result.data);
      // You could redirect to the new VPS details page here
      // router.push(`/dashboard/compute/vms/${result.data.id}`);
    } catch (error) {
      console.error('VPS creation error:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to deploy VPS. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const steps = [
    { id: 1, name: "Name" },
    { id: 2, name: "Location" },
    { id: 3, name: "Plan" },
    { id: 4, name: "OS" },
    { id: 5, name: "Review" },
  ];

  const selectedLocationData = locations?.find(
    (location) => location.short === selectedLocation,
  );

  return (
    <div className="py-4">
      {/* Progress Steps */}
      <div className="mb-8">
        <div className="flex justify-between mb-2">
          {steps.map((step, index) => (
            <div key={step.id} className="flex-1 flex flex-col items-center">
              <div className="flex items-center w-full">
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors duration-300 ${
                    currentStep > step.id ? "bg-blue-600 text-white" : 
                    currentStep === step.id ? "bg-blue-500 text-white" : "bg-white/10 text-white/50"
                  }`}
                >
                  {currentStep > step.id ? <CheckCircle2 size={16} /> : step.id}
                </div>
                {index < steps.length - 1 && (
                  <div className={`flex-1 h-0.5 transition-colors duration-300 ${
                    currentStep > step.id ? 'bg-blue-600' : 'bg-white/10'
                  }`}></div>
                )}
              </div>
              <p className={`mt-2 text-xs ${currentStep >= step.id ? 'text-white' : 'text-white/50'}`}>{step.name}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Main Form */}
        <div className="lg:col-span-2 space-y-6">
          {/* Step 1: Name & SSH Password */}
          {currentStep === 1 && (
            <Card className="bg-white/5 border-white/10">
              <CardHeader>
                <CardTitle className="text-white">VPS Configuration</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label className="text-white mb-2 block">Instance Name</Label>
                  <Input
                    value={vpsName}
                    onChange={(e) => setVpsName(e.target.value)}
                    type="text"
                    placeholder="web-server-01"
                    className="bg-white/10 border-white/20 rounded-md text-white placeholder:text-white/50"
                  />
                  <p className="text-xs text-white/50 mt-1">Alphanumeric and hyphens only</p>
                </div>

                <div>
                  <Label className="text-white mb-2 block">SSH Root Password</Label>
                  <Input
                    value={sshPassword}
                    onChange={(e) => setSshPassword(e.target.value)}
                    type="password"
                    placeholder="••••••••••••"
                    className="bg-white/10 border-white/20 rounded-md text-white placeholder:text-white/50"
                  />
                  <p className="text-xs text-white/50 mt-1">Minimum 12 characters with uppercase, lowercase, numbers, and special characters</p>
                </div>
              </CardContent>
              <CardFooter className="flex justify-end">
                <Button onClick={handleNextStep} className="bg-white text-black rounded-md hover:bg-white/90">
                  Next <ChevronRight size={16} className="ml-2" />
                </Button>
              </CardFooter>
            </Card>
          )}

          {/* Step 2: Location */}
          {currentStep === 2 && (
            <Card className="bg-white/5 border-white/10">
              <CardHeader>
                <CardTitle className="text-white">Location</CardTitle>
              </CardHeader>
              <CardContent>
                <RadioGroup
                  value={selectedLocation}
                  onValueChange={setSelectedLocation}
                  className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4"
                >
                  {locations.map((region) => (
                    <div key={region.id}>
                      <RadioGroupItem value={region.short} id={region.city} className="peer sr-only" disabled={!region.available} />
                      <Label
                        htmlFor={region.city}
                        className="flex items-center gap-3 rounded-md bg-white/10 border-2 border-transparent cursor-pointer p-4 transition-all peer-data-[state=checked]:border-blue-500"
                      >
                        <Image src={`https://flagsapi.com/${region.country_code}/flat/64.png`} alt={region.city} width={32} height={24} className="rounded-sm" />
                        <div>
                          <div className="font-medium text-white">{region.city}</div>
                          <div className="text-xs text-white/60">{region.country}</div>
                        </div>
                        {!region.available && <Badge variant="outline" className="text-xs ml-auto text-white/70 border-white/30">Coming soon</Badge>}
                      </Label>
                    </div>
                  ))}
                </RadioGroup>
              </CardContent>
              <CardFooter className="flex justify-between">
                <Button variant="outline" onClick={handlePrevStep} className="rounded-md border-white/20 text-white hover:bg-white/10">Back</Button>
                <Button onClick={handleNextStep} className="bg-white text-black rounded-md hover:bg-white/90">Next <ChevronRight size={16} className="ml-2" /></Button>
              </CardFooter>
            </Card>
          )}

          {/* Step 3: Plan */}
          {currentStep === 3 && (
            <Card className="bg-white/5 border-white/10">
              <CardHeader>
                <CardTitle className="text-white">VPS Plan</CardTitle>
              </CardHeader>
              <CardContent>
                <RadioGroup value={selectedPlan} onValueChange={setSelectedPlan} className="grid grid-cols-1 gap-4">
                  {vpsPlans.map((plan) => (
                    <div key={plan.id}>
                      <RadioGroupItem value={plan.id} id={plan.id} className="peer sr-only" />
                      <Label htmlFor={plan.id} className="block bg-white/10 rounded-lg border-2 border-transparent cursor-pointer p-5 transition-all peer-data-[state=checked]:border-blue-500 hover:bg-white/15">
                        <div className="flex justify-between items-start mb-4">
                          <div>
                            <p className="font-bold text-lg text-white">{plan.name}</p>
                            {plan.popular && (
                              <Badge variant="outline" className="text-blue-400 bg-blue-500/10 border-blue-500/30 mt-2">
                                Popular
                              </Badge>
                            )}
                            {plan.discount && (
                              <Badge variant="outline" className="text-green-400 bg-green-500/10 border-green-500/30 mt-2 ml-2">
                                Save {plan.discount}%
                              </Badge>
                            )}
                          </div>
                          <div className="text-right">
                            {plan.discount ? (
                              <div>
                                <span className="line-through text-sm text-white/40">${plan.price}</span>
                                <div className="text-2xl font-bold text-white">
                                  ${Math.round(plan.price * (1 - plan.discount / 100))}
                                  <span className="text-sm font-normal text-white/60">/mo</span>
                                </div>
                              </div>
                            ) : (
                              <div className="text-2xl font-bold text-white">
                                ${plan.price}
                                <span className="text-sm font-normal text-white/60">/mo</span>
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="grid grid-cols-4 gap-3 pt-4 border-t border-white/10">
                          <div>
                            <div className="flex items-center gap-2 mb-1">
                              <Cpu className="w-4 h-4 text-blue-400" />
                              <span className="text-xs text-white/60">CPU</span>
                            </div>
                            <p className="font-semibold text-white">
                              {plan.resources.cpu} vCPU{plan.resources.cpu > 1 ? 's' : ''}
                            </p>
                          </div>
                          <div>
                            <div className="flex items-center gap-2 mb-1">
                              <MemoryStick className="w-4 h-4 text-green-400" />
                              <span className="text-xs text-white/60">RAM</span>
                            </div>
                            <p className="font-semibold text-white">
                              {plan.resources.ram} GB
                            </p>
                          </div>
                          <div>
                            <div className="flex items-center gap-2 mb-1">
                              <HardDrive className="w-4 h-4 text-purple-400" />
                              <span className="text-xs text-white/60">Storage</span>
                            </div>
                            <p className="font-semibold text-white">
                              {plan.resources.storage} GB
                            </p>
                          </div>
                          <div>
                            <div className="flex items-center gap-2 mb-1">
                              <Network className="w-4 h-4 text-orange-400" />
                              <span className="text-xs text-white/60">Bandwidth</span>
                            </div>
                            <p className="font-semibold text-white">
                              {plan.resources.bandwidth} TB
                            </p>
                          </div>
                        </div>
                      </Label>
                    </div>
                  ))}
                </RadioGroup>
              </CardContent>
              <CardFooter className="flex justify-between">
                <Button variant="outline" onClick={handlePrevStep} className="rounded-md border-white/20 text-white hover:bg-white/10">Back</Button>
                <Button onClick={handleNextStep} className="bg-white text-black rounded-md hover:bg-white/90">Next <ChevronRight size={16} className="ml-2" /></Button>
              </CardFooter>
            </Card>
          )}

          {/* Step 4: Operating System */}
          {currentStep === 4 && (
            <Card className="bg-white/5 border-white/10">
              <CardHeader>
                <CardTitle className="text-white">Operating System</CardTitle>
              </CardHeader>
              <CardContent>
                <RadioGroup value={selectedOS} onValueChange={setSelectedOS} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {effectiveOSList.map((os) => (
                    <div key={os.id}>
                      <RadioGroupItem value={os.id} id={`os-${os.id}`} className="peer sr-only" />
                      <Label htmlFor={`os-${os.id}`} className="flex items-start gap-3 bg-white/10 rounded-md border-2 border-transparent cursor-pointer p-4 transition-all peer-data-[state=checked]:border-blue-500 hover:bg-white/15">
                        <div className="w-10 h-10 relative flex-shrink-0">
                          <Image 
                            src={os.icon} 
                            alt={os.name}
                            width={40}
                            height={40}
                            className="object-contain"
                          />
                        </div>
                        <div className="flex-1">
                          <p className="font-semibold text-white">{os.name}</p>
                          <p className="text-xs text-white/60 mt-1">{os.description}</p>
                        </div>
                      </Label>
                    </div>
                  ))}
                </RadioGroup>
              </CardContent>
              <CardFooter className="flex justify-between">
                <Button variant="outline" onClick={handlePrevStep} className="rounded-md border-white/20 text-white hover:bg-white/10">Back</Button>
                <Button onClick={handleNextStep} className="bg-white text-black rounded-md hover:bg-white/90">Next <ChevronRight size={16} className="ml-2" /></Button>
              </CardFooter>
            </Card>
          )}

          {/* Step 5: Add-ons & Review */}
          {currentStep === 5 && (
            <Card className="bg-white/5 border-white/10">
              <CardHeader>
                <CardTitle className="text-white">Add-ons & Review</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div>
                  <Label className="text-white">Add-ons (Optional)</Label>
                  <div className="mt-4 space-y-4">
                    {addons.map((addon) => {
                      const IconComponent = addon.icon;
                      return (
                        <div key={addon.id} className="flex items-center space-x-3 p-4 bg-white/10 rounded-lg border border-white/10">
                          <Checkbox
                            id={addon.id}
                            checked={selectedAddons.includes(addon.id)}
                            onCheckedChange={() => handleAddonToggle(addon.id)}
                          />
                          <IconComponent className="w-5 h-5 text-blue-400" />
                          <div className="flex-1">
                            <div className="font-medium text-white">{addon.name}</div>
                            <div className="text-sm text-white/60">{addon.description}</div>
                          </div>
                          <div className="text-white font-medium">+${addon.price}/month</div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <Separator className="bg-white/10" />

                {/* Order Summary */}
                <div>
                  <Label className="text-white">Order Summary</Label>
                  <div className="mt-4 space-y-3 p-4 bg-white/10 rounded-lg">
                    <div className="flex justify-between">
                      <span className="text-white/60">VPS Name:</span>
                      <span className="text-white">{vpsName}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-white/60">Location:</span>
                      <span className="text-white">{selectedLocationData?.city}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-white/60">Plan:</span>
                      <span className="text-white">
                        {vpsPlans.find(p => p.id === selectedPlan)?.name}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-white/60">Operating System:</span>
                      <span className="text-white">
                        {operatingSystems.find(os => os.id === selectedOS)?.name}
                      </span>
                    </div>
                    {selectedAddons.length > 0 && (
                      <div>
                        <div className="text-white/60 mb-2">Add-ons:</div>
                        {selectedAddons.map(addonId => {
                          const addon = addons.find(a => a.id === addonId);
                          return addon ? (
                            <div key={addonId} className="flex justify-between ml-4">
                              <span className="text-white/60">• {addon.name}</span>
                              <span className="text-white">+${addon.price}/month</span>
                            </div>
                          ) : null;
                        })}
                      </div>
                    )}
                    <Separator className="bg-white/10" />
                    <div className="flex justify-between text-lg font-bold">
                      <span className="text-white">Total:</span>
                      <span className="text-white">${calculateTotalPrice()}/month</span>
                    </div>
                  </div>
                </div>

                {/* Terms */}
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="terms"
                    checked={termsAccepted}
                    onCheckedChange={(checked) => setTermsAccepted(checked === true)}
                  />
                  <Label htmlFor="terms" className="text-sm text-white/60">
                    I agree to the terms of service and privacy policy
                  </Label>
                </div>
              </CardContent>
              <CardFooter className="flex justify-between">
                <Button variant="outline" onClick={handlePrevStep} className="rounded-md border-white/20 text-white hover:bg-white/10">Back</Button>
                <Button
                  onClick={onSubmit}
                  disabled={isLoading || !termsAccepted}
                  className="bg-white text-black rounded-md hover:bg-white/90"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Deploying...
                    </>
                  ) : (
                    'Deploy VPS'
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
              <CardTitle className="text-white">Configuration Summary</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <div className="text-sm text-white/60">VPS Name</div>
                <div className="text-white">{vpsName || 'Not set'}</div>
              </div>
              
              {selectedLocationData && (
                <div>
                  <div className="text-sm text-white/60">Location</div>
                  <div className="flex items-center gap-2">
                    <Image 
                      src={`https://flagsapi.com/${selectedLocationData.country_code}/flat/64.png`} 
                      alt={selectedLocationData.city} 
                      width={16} 
                      height={12} 
                      className="rounded-sm" 
                    />
                    <span className="text-white">{selectedLocationData.city}</span>
                  </div>
                </div>
              )}

              {selectedPlan && (
                <div>
                  <div className="text-sm text-white/60">Plan</div>
                  <div className="text-white">
                    {vpsPlans.find(p => p.id === selectedPlan)?.name}
                  </div>
                  <div className="mt-2 space-y-1 text-sm">
                    {(() => {
                      const plan = vpsPlans.find(p => p.id === selectedPlan);
                      return plan ? (
                        <>
                          <div className="flex justify-between text-white/60">
                            <span>CPU:</span>
                            <span>{plan.resources.cpu} vCPU{plan.resources.cpu > 1 ? 's' : ''}</span>
                          </div>
                          <div className="flex justify-between text-white/60">
                            <span>RAM:</span>
                            <span>{plan.resources.ram} GB</span>
                          </div>
                          <div className="flex justify-between text-white/60">
                            <span>Storage:</span>
                            <span>{plan.resources.storage} GB SSD</span>
                          </div>
                          <div className="flex justify-between text-white/60">
                            <span>Bandwidth:</span>
                            <span>{plan.resources.bandwidth} TB</span>
                          </div>
                        </>
                      ) : null;
                    })()}
                  </div>
                </div>
              )}

              {selectedOS && (
                <div>
                  <div className="text-sm text-white/60">Operating System</div>
                  <div className="text-white">
                    {operatingSystems.find(os => os.id === selectedOS)?.name}
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

export default VPSSelect;
