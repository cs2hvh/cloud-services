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
  Server,
  Network,
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

interface FirewallRule {
  id: string;
  name: string;
  action: 'ALLOW' | 'DENY';
  protocol: 'TCP' | 'UDP' | 'BOTH';
  port: string;
  sourceIP: string;
  description: string;
}

// Mock servers - in real app, this would come from API
const userServers: any[] = [
  // This will be populated from actual user servers (VPS/Dedicated) from the backend
  // Only show servers if user actually has them
];

// Common port templates
const portTemplates = [
  { name: 'SSH', port: '22', protocol: 'TCP', description: 'Secure Shell access' },
  { name: 'HTTP', port: '80', protocol: 'TCP', description: 'Web server HTTP' },
  { name: 'HTTPS', port: '443', protocol: 'TCP', description: 'Web server HTTPS' },
  { name: 'MySQL', port: '3306', protocol: 'TCP', description: 'MySQL database' },
  { name: 'PostgreSQL', port: '5432', protocol: 'TCP', description: 'PostgreSQL database' },
  { name: 'FTP', port: '21', protocol: 'TCP', description: 'File Transfer Protocol' },
  { name: 'SMTP', port: '587', protocol: 'TCP', description: 'Email SMTP' },
  { name: 'DNS', port: '53', protocol: 'BOTH', description: 'Domain Name System' },
];

const FirewallRuleCreate = () => {
  const [currentStep, setCurrentStep] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  
  // Form state
  const [selectedServer, setSelectedServer] = useState<string>('');
  const [ruleName, setRuleName] = useState('');
  const [rules, setRules] = useState<FirewallRule[]>([]);

  const addRule = () => {
    const newRule: FirewallRule = {
      id: `rule-${Date.now()}`,
      name: '',
      action: 'ALLOW',
      protocol: 'TCP',
      port: '',
      sourceIP: '0.0.0.0/0',
      description: ''
    };
    setRules([...rules, newRule]);
  };

  const removeRule = (id: string) => {
    setRules(rules.filter(rule => rule.id !== id));
  };

  const updateRule = (id: string, field: keyof FirewallRule, value: string) => {
    setRules(rules.map(rule => 
      rule.id === id ? { ...rule, [field]: value } : rule
    ));
  };

  const applyTemplate = (ruleId: string, template: typeof portTemplates[0]) => {
    updateRule(ruleId, 'name', template.name);
    updateRule(ruleId, 'port', template.port);
    updateRule(ruleId, 'protocol', template.protocol as 'TCP' | 'UDP' | 'BOTH');
    updateRule(ruleId, 'description', template.description);
  };

  const validateRules = () => {
    if (rules.length === 0) {
      toast.error('Please add at least one firewall rule');
      return false;
    }

    for (const rule of rules) {
      if (!rule.name.trim()) {
        toast.error('Please enter a name for all rules');
        return false;
      }
      if (!rule.port.trim()) {
        toast.error('Please specify ports for all rules');
        return false;
      }
      if (!rule.sourceIP.trim()) {
        toast.error('Please specify source IP for all rules');
        return false;
      }
    }
    return true;
  };

  const handleNextStep = () => {
    if (currentStep === 1 && !selectedServer) {
      toast.error('Please select a server');
      return;
    }
    if (currentStep === 2 && !ruleName.trim()) {
      toast.error('Please enter a rule set name');
      return;
    }
    if (currentStep === 3 && !validateRules()) {
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
    setIsLoading(true);
    try {
      // Here you would make the API call to apply firewall rules
      await new Promise(resolve => setTimeout(resolve, 2000)); // Simulate API call
      toast.success('Firewall rules applied successfully!');
      // Redirect to firewall dashboard
    } catch {
      toast.error('Failed to apply firewall rules. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const steps = [
    { id: 1, name: "Server" },
    { id: 2, name: "Name" },
    { id: 3, name: "Rules" },
    { id: 4, name: "Review" },
  ];

  const selectedServerData = userServers.find(s => s.id === selectedServer);

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
          {/* Step 1: Server Selection */}
          {currentStep === 1 && (
            <Card className="bg-white/5 border-white/10">
              <CardHeader>
                <CardTitle className="text-white">Select Server</CardTitle>
              </CardHeader>
              <CardContent>
                {userServers.length > 0 ? (
                  <RadioGroup value={selectedServer} onValueChange={setSelectedServer} className="grid grid-cols-1 gap-4">
                    {userServers.map((server) => (
                      <div key={server.id}>
                        <RadioGroupItem value={server.id} id={server.id} className="peer sr-only" />
                        <Label htmlFor={server.id} className="flex items-center gap-4 p-4 bg-white/10 rounded-lg border-2 border-transparent cursor-pointer transition-all peer-data-[state=checked]:border-blue-500 hover:bg-white/15">
                          <Server className="w-8 h-8 text-blue-400" />
                          <div className="flex-1">
                            <div className="font-semibold text-white">{server.name}</div>
                            <div className="text-sm text-white/60">{server.type} • {server.ip}</div>
                          </div>
                        </Label>
                      </div>
                    ))}
                  </RadioGroup>
                ) : (
                  <div className="text-center py-8">
                    <Server className="w-12 h-12 text-white/30 mx-auto mb-4" />
                    <h3 className="text-lg font-medium text-white mb-2">No Servers Available</h3>
                    <p className="text-white/60 text-center mb-4">
                      You need to have VPS or dedicated servers to configure firewall rules.
                    </p>
                    <Button asChild>
                      <a href="/dashboard/services/compute/vps/new" className="bg-white text-black hover:bg-gray-200">
                        Deploy a VPS
                      </a>
                    </Button>
                  </div>
                )}
                <p className="text-xs text-white/60 mt-4">
                  Select the server you want to configure firewall rules for
                </p>
              </CardContent>
              <CardFooter className="flex justify-end">
                <Button 
                  onClick={handleNextStep} 
                  disabled={userServers.length === 0 || !selectedServer}
                  className="bg-white text-black rounded-md hover:bg-white/90"
                >
                  Next <ChevronRight size={16} className="ml-2" />
                </Button>
              </CardFooter>
            </Card>
          )}

          {/* Step 2: Rule Set Name */}
          {currentStep === 2 && (
            <Card className="bg-white/5 border-white/10">
              <CardHeader>
                <CardTitle className="text-white">Firewall Rule Set Name</CardTitle>
              </CardHeader>
              <CardContent>
                <Input
                  value={ruleName}
                  onChange={(e) => setRuleName(e.target.value)}
                  type="text"
                  placeholder="web-server-rules"
                  className="bg-white/10 border-white/20 rounded-md text-white placeholder:text-white/50"
                />
                <p className="text-xs text-white/60 mt-2">
                  Choose a descriptive name for this set of firewall rules
                </p>
              </CardContent>
              <CardFooter className="flex justify-between">
                <Button variant="outline" onClick={handlePrevStep} className="rounded-md border-white/20 text-white hover:bg-white/10">Back</Button>
                <Button onClick={handleNextStep} className="bg-white text-black rounded-md hover:bg-white/90">Next <ChevronRight size={16} className="ml-2" /></Button>
              </CardFooter>
            </Card>
          )}

          {/* Step 3: Firewall Rules */}
          {currentStep === 3 && (
            <Card className="bg-white/5 border-white/10">
              <CardHeader>
                <div className="flex justify-between items-center">
                  <CardTitle className="text-white">Firewall Rules</CardTitle>
                  <Button 
                    onClick={addRule}
                    size="sm"
                    className="bg-white text-black hover:bg-gray-200"
                  >
                    Add Rule
                  </Button>
                </div>
                <p className="text-sm text-white/60">
                  Configure firewall rules to control network access to your server.
                </p>
              </CardHeader>
              <CardContent className="space-y-4">
                {rules.length === 0 ? (
                  <div className="text-center py-8">
                    <Shield className="w-12 h-12 text-white/30 mx-auto mb-4" />
                    <p className="text-white/60 mb-4">No firewall rules configured yet</p>
                    <Button onClick={addRule} className="bg-white text-black hover:bg-gray-200">
                      Add Your First Rule
                    </Button>
                  </div>
                ) : (
                  rules.map((rule, index) => (
                    <Card key={rule.id} className="bg-white/10 border-white/20">
                      <CardHeader className="pb-3">
                        <div className="flex justify-between items-center">
                          <h4 className="text-white font-medium">Rule {index + 1}</h4>
                          <div className="flex gap-2">
                            <Select onValueChange={(value) => {
                              const template = portTemplates.find(t => t.name === value);
                              if (template) applyTemplate(rule.id, template);
                            }}>
                              <SelectTrigger className="w-32 bg-white/10 border-white/20 text-white text-xs">
                                <SelectValue placeholder="Template" />
                              </SelectTrigger>
                              <SelectContent>
                                {portTemplates.map((template) => (
                                  <SelectItem key={template.name} value={template.name}>
                                    {template.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <Button
                              onClick={() => removeRule(rule.id)}
                              size="sm"
                              variant="outline"
                              className="border-red-500/50 text-red-400 hover:bg-red-500/10"
                            >
                              Remove
                            </Button>
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div>
                            <Label className="text-white">Rule Name</Label>
                            <Input
                              value={rule.name}
                              onChange={(e) => updateRule(rule.id, 'name', e.target.value)}
                              placeholder="SSH Access"
                              className="bg-white/10 border-white/20 text-white placeholder:text-white/50"
                            />
                          </div>
                          <div>
                            <Label className="text-white">Action</Label>
                            <Select 
                              value={rule.action} 
                              onValueChange={(value: 'ALLOW' | 'DENY') => updateRule(rule.id, 'action', value)}
                            >
                              <SelectTrigger className="bg-white/10 border-white/20 text-white">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="ALLOW">ALLOW</SelectItem>
                                <SelectItem value="DENY">DENY</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div>
                            <Label className="text-white">Protocol</Label>
                            <Select 
                              value={rule.protocol} 
                              onValueChange={(value: 'TCP' | 'UDP' | 'BOTH') => updateRule(rule.id, 'protocol', value)}
                            >
                              <SelectTrigger className="bg-white/10 border-white/20 text-white">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="TCP">TCP</SelectItem>
                                <SelectItem value="UDP">UDP</SelectItem>
                                <SelectItem value="BOTH">TCP & UDP</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div>
                            <Label className="text-white">Port(s)</Label>
                            <Input
                              value={rule.port}
                              onChange={(e) => updateRule(rule.id, 'port', e.target.value)}
                              placeholder="22 or 80,443 or 8000-8080"
                              className="bg-white/10 border-white/20 text-white placeholder:text-white/50"
                            />
                          </div>
                        </div>
                        <div>
                          <Label className="text-white">Source IP/CIDR</Label>
                          <Input
                            value={rule.sourceIP}
                            onChange={(e) => updateRule(rule.id, 'sourceIP', e.target.value)}
                            placeholder="0.0.0.0/0 (any) or 192.168.1.0/24"
                            className="bg-white/10 border-white/20 text-white placeholder:text-white/50"
                          />
                          <p className="text-xs text-white/60 mt-1">
                            Use 0.0.0.0/0 for any IP, or specify IP/CIDR for restricted access
                          </p>
                        </div>
                        <div>
                          <Label className="text-white">Description (Optional)</Label>
                          <Input
                            value={rule.description}
                            onChange={(e) => updateRule(rule.id, 'description', e.target.value)}
                            placeholder="Allow SSH access from office network"
                            className="bg-white/10 border-white/20 text-white placeholder:text-white/50"
                          />
                        </div>
                      </CardContent>
                    </Card>
                  ))
                )}
              </CardContent>
              <CardFooter className="flex justify-between">
                <Button variant="outline" onClick={handlePrevStep} className="rounded-md border-white/20 text-white hover:bg-white/10">Back</Button>
                <Button onClick={handleNextStep} className="bg-white text-black rounded-md hover:bg-white/90">Next <ChevronRight size={16} className="ml-2" /></Button>
              </CardFooter>
            </Card>
          )}

          {/* Step 4: Review */}
          {currentStep === 4 && (
            <Card className="bg-white/5 border-white/10">
              <CardHeader>
                <CardTitle className="text-white">Review & Apply</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Configuration Summary */}
                <div>
                  <Label className="text-white">Configuration Summary</Label>
                  <div className="mt-4 space-y-3 p-4 bg-white/10 rounded-lg">
                    <div className="flex justify-between">
                      <span className="text-white/60">Server:</span>
                      <span className="text-white">{selectedServerData?.name}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-white/60">Server IP:</span>
                      <span className="text-white">{selectedServerData?.ip}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-white/60">Rule Set Name:</span>
                      <span className="text-white">{ruleName}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-white/60">Total Rules:</span>
                      <span className="text-white">{rules.length}</span>
                    </div>
                  </div>
                </div>

                <Separator className="bg-white/10" />

                {/* Rules Summary */}
                {rules.length > 0 && (
                  <div>
                    <Label className="text-white">Firewall Rules</Label>
                    <div className="mt-4 space-y-2">
                      {rules.map((rule, index) => (
                        <div key={rule.id} className="p-3 bg-white/5 rounded-lg">
                          <div className="flex justify-between items-start">
                            <div>
                              <div className="text-sm font-medium text-white">
                                {rule.name || `Rule ${index + 1}`}
                              </div>
                              <div className="text-xs text-white/60 mt-1">
                                {rule.action} {rule.protocol} port {rule.port} from {rule.sourceIP}
                              </div>
                              {rule.description && (
                                <div className="text-xs text-white/50 mt-1">{rule.description}</div>
                              )}
                            </div>
                            <div className={`px-2 py-1 rounded text-xs ${
                              rule.action === 'ALLOW' 
                                ? 'bg-green-500/20 text-green-400' 
                                : 'bg-red-500/20 text-red-400'
                            }`}>
                              {rule.action}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
              <CardFooter className="flex justify-between">
                <Button variant="outline" onClick={handlePrevStep} className="rounded-md border-white/20 text-white hover:bg-white/10">Back</Button>
                <Button
                  onClick={onSubmit}
                  disabled={isLoading}
                  className="bg-white text-black rounded-md hover:bg-white/90"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Applying Rules...
                    </>
                  ) : (
                    'Apply Firewall Rules'
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
                <div className="text-sm text-white/60">Selected Server</div>
                <div className="text-white">{selectedServerData?.name || 'Not selected'}</div>
                {selectedServerData && (
                  <div className="text-xs text-white/60">{selectedServerData.type} • {selectedServerData.ip}</div>
                )}
              </div>
              
              <div>
                <div className="text-sm text-white/60">Rule Set Name</div>
                <div className="text-white">{ruleName || 'Not set'}</div>
              </div>

              <div>
                <div className="text-sm text-white/60">Firewall Rules</div>
                <div className="text-white">{rules.length} configured</div>
              </div>

              <Separator className="bg-white/10" />
              
              <div className="text-center">
                <div className="text-sm text-white/60">Status</div>
                <div className="text-lg font-bold text-white">Ready to Apply</div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default FirewallRuleCreate;
