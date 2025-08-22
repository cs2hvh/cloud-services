"use client";
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
  BadgeHelp,
  CheckCircle2,
  ChevronRight,
  Cpu,
  Gamepad,
  HardDrive,
  Loader2,
  MapPin,
  Server,
  Shield,
  Wifi,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import Link from "next/link";
import { toast } from "sonner";
import axios from "axios";
import { formatPrice } from "@/lib/utils";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Icons } from "@/components/ui/icons";
import { Switch } from "@/components/ui/switch";
import { Tables } from "@/lib/supabase/types";
import { PP_Location } from "@/types/pterodactyl";
import { useProjects } from "@/app/dashboard/provider";

// Define prop types for the component
interface PageProps {
  products: Tables<"products">[];
  locations: PP_Location[];
}

type GameInfo = {
  name: string;
  description: string;
  icon: string;
};
type GameType = "cs2" | "minecraft" | "valheim" | "rust";
// Define the available game types with their icons and descriptions
const GAME_TYPES: Record<GameType, GameInfo> = {
  cs2: {
    name: "Counter-Strike 2",
    description: "First-person shooter game developed by Valve",
    icon: "gamepad",
  },
  minecraft: {
    name: "Minecraft",
    description: "Sandbox game created by Mojang Studios",
    icon: "cube",
  },
  valheim: {
    name: "Valheim",
    description: "Survival and sandbox game developed by Iron Gate Studio",
    icon: "axe",
  },
  rust: {
    name: "Rust",
    description: "Survival game developed by Facepunch Studios",
    icon: "tent",
  },
};

// Additional services configuration
const ADDITIONAL_SERVICES = [
  {
    id: "ddos_protection",
    name: "DDoS Protection",
    description: "Enterprise-grade DDoS protection for your game server",
    price: 5.99,
    icon: <Shield className="h-5 w-5" />,
  },
  {
    id: "priority_support",
    name: "Priority Support",
    description: "24/7 priority technical support with 1-hour response time",
    price: 3.99,
    icon: <BadgeHelp className="h-5 w-5" />,
  },
];

const GameServerSelect = ({ products, locations }: PageProps) => {
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [currentStep, setCurrentStep] = useState<number>(1);
  const [termsAccepted, setTermsAccepted] = useState<boolean>(false);
  const { projects } = useProjects();

  // Game server state
  const [state, setState] = useState({
    selectedGameType: "",
    selectedPlan: "",
    selectedLocation: "",
    serverName: "",
    additionalServices: {} as Record<string, boolean>,
    selectedProject: projects[0].id,
  });

  // Get filtered plans based on selected game type
  const filteredPlans = state.selectedGameType
    ? products.filter((product) => product.sub === state.selectedGameType)
    : [];

  // Get the selected plan details
  const selectedPlan = products.find(
    (product) => product.id === state.selectedPlan,
  );

  // Get the selected location details
  const selectedLocation = locations.find(
    (loc) => loc.attributes.short === state.selectedLocation,
  );

  // Calculate additional services cost
  const getAdditionalServicesCost = () => {
    return ADDITIONAL_SERVICES.reduce((total, service) => {
      return total + (state.additionalServices[service.id] ? service.price : 0);
    }, 0);
  };

  // Calculate total cost
  const calculateTotalCost = () => {
    const basePrice = selectedPlan ? selectedPlan.price : 0;
    const discount = selectedPlan?.discount || 0;
    const discountedPrice = basePrice * (1 - discount / 100);
    const additionalServicesPrice = getAdditionalServicesCost();

    return discountedPrice + additionalServicesPrice;
  };

  // Handle next step validation and navigation
  const handleNextStep = () => {
    // Step 1: Validate game type selection
    if (currentStep === 1 && !state.selectedGameType) {
      toast.error("Please select a game type");
      return;
    }

    // Step 2: Validate plan selection
    if (currentStep === 2 && !state.selectedPlan) {
      toast.error("Please select a server plan");
      return;
    }

    // Step 3: Validate location selection
    if (currentStep === 3 && !state.selectedLocation) {
      toast.error("Please select a server location");
      return;
    }

    // Step 4: Validate server name
    if (currentStep === 4 && !state.serverName) {
      toast.error("Please enter a server name");
      return;
    }

    // Proceed to next step if all validations pass
    if (currentStep < 5) {
      setCurrentStep(currentStep + 1);
    }
  };

  // Handle previous step navigation
  const handlePrevStep = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };

  // Handle form submission
  const onSubmit = async () => {
    if (!termsAccepted) {
      toast.error("Please accept the terms of service and privacy policy");
      return;
    }

    try {
      setIsLoading(true);

      // Validate all required fields
      if (
        !state.selectedGameType ||
        !state.selectedPlan ||
        !state.selectedLocation ||
        !state.selectedProject ||
        !state.serverName
      ) {
        toast.error("Please fill in all the required fields");
        return;
      }

      // Prepare data for API submission
      const orderData = {
        name: state.serverName,
        game_type: state.selectedGameType,
        plan_id: state.selectedPlan,
        location: state.selectedLocation,
        projectid: state.selectedProject,
        additional_services: Object.entries(state.additionalServices)
          .filter(([, value]) => value)
          .map(([key]) => key),
      };

      // Submit order to API
      const response = await axios.post("/api/services/order/game", orderData);

      toast.success(response.data || "Game server ordered successfully!");
      // Redirect to success page or dashboard
    } catch (error) {
      console.error("Order error:", error);
      toast.error("Failed to create game server. Please try again later.");
    } finally {
      setIsLoading(false);
    }
  };

  // Toggle additional service selection
  const toggleAdditionalService = (serviceId: string) => {
    setState((prev) => ({
      ...prev,
      additionalServices: {
        ...prev.additionalServices,
        [serviceId]: !prev.additionalServices[serviceId],
      },
    }));
  };

  // Update game type selection
  const handleGameTypeChange = (gameType: string) => {
    setState((prev) => ({
      ...prev,
      selectedGameType: gameType,
      selectedPlan: "", // Reset plan when game type changes
    }));
  };

  // Steps configuration
  const steps = [
    { id: 1, name: "Game Type" },
    { id: 2, name: "Server Plan" },
    { id: 3, name: "Location" },
    { id: 4, name: "Configuration" },
    { id: 5, name: "Review & Pay" },
  ];

  return (
    <div className="py-4">
      {/* Progress indicator */}
      <div className="mb-8">
        <div className="flex justify-between mb-2">
          {steps.map((step) => (
            <div key={step.id} className="flex flex-col items-center">
              <div
                className={`flex items-center justify-center w-8 h-8 rounded-full mb-1 
                                ${
                                  currentStep === step.id
                                    ? "bg-primary text-primary-foreground"
                                    : currentStep > step.id
                                      ? "bg-green-500 text-white"
                                      : "bg-secondary text-secondary-foreground"
                                }`}
              >
                {currentStep > step.id ? <CheckCircle2 size={16} /> : step.id}
              </div>
              <span
                className={`text-xs ${currentStep === step.id ? "text-primary font-medium" : "text-muted-foreground"}`}
              >
                {step.name}
              </span>
            </div>
          ))}
        </div>
        <Progress value={(currentStep / steps.length) * 100} className="h-2" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-6">
          {/* Step 1: Game Type Selection */}
          {currentStep === 1 && (
            <Card>
              <CardHeader>
                <CardTitle>Select Game Type</CardTitle>
                <CardDescription>
                  Choose the game you want to host on your server
                </CardDescription>
              </CardHeader>
              <CardContent>
                <RadioGroup
                  value={state.selectedGameType}
                  onValueChange={handleGameTypeChange}
                  className="grid grid-cols-1 md:grid-cols-2 gap-4"
                >
                  {Object.entries(GAME_TYPES).map(([key, game]) => (
                    <div key={key}>
                      <RadioGroupItem
                        value={key}
                        id={`game-${key}`}
                        className="peer sr-only"
                      />
                      <Label
                        htmlFor={`game-${key}`}
                        className="flex gap-3 rounded-md bg-gray-50 dark:bg-secondary border-2 cursor-pointer border-muted p-4 peer-data-[state=checked]:border-primary peer-data-[state=checked]:cursor-default transition-all duration-100 ease-in-out transform-gpu active:scale-[0.98]"
                      >
                        <div className="flex items-center justify-center size-10 bg-primary/10 rounded-md text-primary">
                          <Gamepad className="size-5" />
                        </div>
                        <div>
                          <div className="font-medium">{game.name}</div>
                          <div className="text-xs text-muted-foreground">
                            {game.description}
                          </div>
                        </div>
                      </Label>
                    </div>
                  ))}
                </RadioGroup>
              </CardContent>
              <CardFooter className="flex justify-end">
                <Button onClick={handleNextStep}>
                  Next <ChevronRight size={16} />
                </Button>
              </CardFooter>
            </Card>
          )}

          {/* Step 2: Server Plan Selection */}
          {currentStep === 2 && (
            <Card>
              <CardHeader>
                <CardTitle>Select Server Plan</CardTitle>
                <CardDescription>
                  Choose the plan that best fits your needs
                </CardDescription>
              </CardHeader>
              <CardContent>
                <RadioGroup
                  value={state.selectedPlan}
                  onValueChange={(value) =>
                    setState((prev) => ({ ...prev, selectedPlan: value }))
                  }
                  className="grid grid-cols-1 gap-4"
                >
                  {filteredPlans.map((plan) => (
                    <div key={plan.id}>
                      <RadioGroupItem
                        value={plan.id}
                        id={plan.id}
                        className="peer sr-only"
                      />
                      <Label
                        htmlFor={plan.id}
                        className="flex justify-between items-center gap-4 bg-gray-50 dark:bg-secondary rounded-md border-2 cursor-pointer border-muted p-4 peer-data-[state=checked]:border-primary peer-data-[state=checked]:cursor-default transition-all duration-100 ease-in-out transform-gpu active:scale-[0.99]"
                      >
                        <div className="flex flex-col">
                          <div className="flex items-center gap-2">
                            <div className="font-semibold">{plan.name}</div>
                            {plan.discount! > 0 && (
                              <Badge
                                variant="outline"
                                className="text-green-600 border-green-600"
                              >
                                {plan.discount}% OFF
                              </Badge>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground mt-1">
                            {plan.description}
                          </p>

                          <div className="grid grid-cols-4 gap-3 mt-3">
                            <div className="flex flex-col items-center p-2 bg-primary/5 rounded">
                              <Cpu
                                size={16}
                                className="text-muted-foreground mb-1"
                              />
                              <span className="text-sm font-medium">
                                {plan.resources.cpu} CPU
                              </span>
                            </div>
                            <div className="flex flex-col items-center p-2 bg-primary/5 rounded">
                              <Server
                                size={16}
                                className="text-muted-foreground mb-1"
                              />
                              <span className="text-sm font-medium">
                                {plan.resources.ram} GB
                              </span>
                            </div>
                            <div className="flex flex-col items-center p-2 bg-primary/5 rounded">
                              <HardDrive
                                size={16}
                                className="text-muted-foreground mb-1"
                              />
                              <span className="text-sm font-medium">
                                {plan.resources.storage} GB
                              </span>
                            </div>
                            <div className="flex flex-col items-center p-2 bg-primary/5 rounded">
                              <Wifi
                                size={16}
                                className="text-muted-foreground mb-1"
                              />
                              <span className="text-sm font-medium">
                                {plan.resources.bandwith} GB
                              </span>
                            </div>
                          </div>
                        </div>

                        <div className="text-right">
                          <div className="font-bold text-lg">
                            {formatPrice(
                              plan.price * (1 - plan.discount! / 100),
                            )}
                            /mo
                          </div>
                          {plan.discount! > 0 && (
                            <div className="text-sm text-muted-foreground line-through">
                              {formatPrice(plan.price)}/mo
                            </div>
                          )}
                        </div>
                      </Label>
                    </div>
                  ))}
                </RadioGroup>
              </CardContent>
              <CardFooter className="flex justify-between">
                <Button variant="outline" onClick={handlePrevStep}>
                  Back
                </Button>
                <Button onClick={handleNextStep}>
                  Next <ChevronRight size={16} />
                </Button>
              </CardFooter>
            </Card>
          )}

          {/* Step 3: Location Selection */}
          {currentStep === 3 && (
            <Card>
              <CardHeader>
                <CardTitle>Server Location</CardTitle>
                <CardDescription>
                  Choose a location for your game server
                </CardDescription>
              </CardHeader>
              <CardContent>
                <RadioGroup
                  value={state.selectedLocation}
                  onValueChange={(value) =>
                    setState((prev) => ({
                      ...prev,
                      selectedLocation: value,
                    }))
                  }
                  className="grid grid-cols-1 sm:grid-cols-2 gap-4"
                >
                  {locations.map((location) => (
                    <div key={location.attributes.id}>
                      <RadioGroupItem
                        value={String(location.attributes.id)}
                        id={String(location.attributes.id)}
                        className="peer sr-only"
                      />
                      <Label
                        htmlFor={String(location.attributes.id)}
                        className="flex gap-3 items-center rounded-md bg-gray-50 dark:bg-secondary border-2 cursor-pointer border-muted p-4 peer-data-[state=checked]:border-primary peer-data-[state=checked]:cursor-default transition-all duration-100 ease-in-out transform-gpu active:scale-[0.98]"
                      >
                        <div className="flex items-center justify-center size-10 bg-primary/10 rounded-md text-primary">
                          <MapPin className="size-5" />
                        </div>
                        <div>
                          <div className="font-medium">
                            {location.attributes.long}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            Region: {location.attributes.short}
                          </div>
                        </div>
                      </Label>
                    </div>
                  ))}
                </RadioGroup>
              </CardContent>
              <CardFooter className="flex justify-between">
                <Button variant="outline" onClick={handlePrevStep}>
                  Back
                </Button>
                <Button onClick={handleNextStep}>
                  Next <ChevronRight size={16} />
                </Button>
              </CardFooter>
            </Card>
          )}

          {/* Step 4: Additional Configuration */}
          {currentStep === 4 && (
            <Card>
              <CardHeader>
                <CardTitle>Server Configuration</CardTitle>
                <CardDescription>
                  Customize your game server settings
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div>
                  <Label htmlFor="server-name" className="mb-2 block">
                    Server Name
                  </Label>
                  <Input
                    id="server-name"
                    value={state.serverName}
                    onChange={(e) =>
                      setState((prev) => ({
                        ...prev,
                        serverName: e.target.value,
                      }))
                    }
                    placeholder="My Awesome Game Server"
                    className="text-base"
                  />
                  <p className="text-xs text-muted-foreground mt-2">
                    This name will be displayed in the server browser and your
                    dashboard
                  </p>
                </div>

                <div>
                  <Label htmlFor="project-id" className="mb-2 block">
                    Project
                  </Label>
                  <Select
                    value={state.selectedProject}
                    onValueChange={(e) =>
                      setState((prev) => ({ ...prev, selectedProject: e }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select Project" />
                    </SelectTrigger>
                    <SelectContent className="w-full">
                      {projects.map((project) => (
                        <SelectItem key={project.id} value={project.id}>
                          {project.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <Separator />

                <div>
                  <h3 className="text-base font-medium mb-4">
                    Additional Services
                  </h3>
                  <div className="space-y-4">
                    {ADDITIONAL_SERVICES.map((service) => (
                      <div
                        key={service.id}
                        className="flex items-center justify-between"
                      >
                        <div className="flex items-center gap-3">
                          <div className="flex-shrink-0 size-9 flex items-center justify-center rounded-md bg-primary/10 text-primary">
                            {service.icon}
                          </div>
                          <div>
                            <h4 className="text-sm font-medium">
                              {service.name}
                            </h4>
                            <p className="text-xs text-muted-foreground">
                              {service.description}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-sm font-medium">
                            {formatPrice(service.price)}/mo
                          </span>
                          <Switch
                            checked={
                              state.additionalServices[service.id] || false
                            }
                            onCheckedChange={() =>
                              toggleAdditionalService(service.id)
                            }
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </CardContent>
              <CardFooter className="flex justify-between">
                <Button variant="outline" onClick={handlePrevStep}>
                  Back
                </Button>
                <Button onClick={handleNextStep}>
                  Next <ChevronRight size={16} />
                </Button>
              </CardFooter>
            </Card>
          )}

          {/* Step 5: Review & Payment */}
          {currentStep === 5 && (
            <Card>
              <CardHeader>
                <CardTitle>Review & Payment</CardTitle>
                <CardDescription>
                  Review your game server configuration and complete the order
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <h3 className="text-sm font-medium text-muted-foreground">
                        Server Details
                      </h3>
                      <div className="bg-gray-50 dark:bg-secondary rounded-md p-4 space-y-3">
                        <div className="flex justify-between">
                          <span className="text-sm text-muted-foreground">
                            Server Name:
                          </span>
                          <span className="font-medium">
                            {state.serverName}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-sm text-muted-foreground">
                            Game:
                          </span>
                          <span className="font-medium">
                            {
                              GAME_TYPES[state.selectedGameType as GameType]
                                ?.name
                            }
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-sm text-muted-foreground">
                            Plan:
                          </span>
                          <span className="font-medium">
                            {selectedPlan?.name}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <h3 className="text-sm font-medium text-muted-foreground">
                        Deployment Location
                      </h3>
                      <div className="bg-gray-50 dark:bg-secondary rounded-md p-4 space-y-3">
                        <div className="flex justify-between items-center">
                          <span className="text-sm text-muted-foreground">
                            Region:
                          </span>
                          <div className="flex items-center gap-2">
                            <MapPin size={14} />
                            <span className="font-medium">
                              {selectedLocation?.attributes.long}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <h3 className="text-sm font-medium text-muted-foreground">
                      Resources
                    </h3>
                    {selectedPlan && (
                      <div className="bg-gray-50 dark:bg-secondary rounded-md p-4">
                        <div className="grid grid-cols-4 gap-4">
                          <div className="text-center p-2">
                            <div className="flex justify-center">
                              <Cpu className="h-5 w-5 text-muted-foreground" />
                            </div>
                            <div className="mt-1 font-medium">
                              {selectedPlan.resources.cpu} vCPU
                            </div>
                            <div className="text-xs text-muted-foreground">
                              Processor
                            </div>
                          </div>
                          <div className="text-center p-2">
                            <div className="flex justify-center">
                              <Server className="h-5 w-5 text-muted-foreground" />
                            </div>
                            <div className="mt-1 font-medium">
                              {selectedPlan.resources.ram} GB
                            </div>
                            <div className="text-xs text-muted-foreground">
                              Memory
                            </div>
                          </div>
                          <div className="text-center p-2">
                            <div className="flex justify-center">
                              <HardDrive className="h-5 w-5 text-muted-foreground" />
                            </div>
                            <div className="mt-1 font-medium">
                              {selectedPlan.resources.storage} GB
                            </div>
                            <div className="text-xs text-muted-foreground">
                              SSD Storage
                            </div>
                          </div>
                          <div className="text-center p-2">
                            <div className="flex justify-center">
                              <Wifi className="h-5 w-5 text-muted-foreground" />
                            </div>
                            <div className="mt-1 font-medium">
                              {selectedPlan.resources.bandwith} GB
                            </div>
                            <div className="text-xs text-muted-foreground">
                              Bandwidth
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Additional services review */}
                  {Object.keys(state.additionalServices).some(
                    (key) => state.additionalServices[key],
                  ) && (
                    <div className="space-y-2">
                      <h3 className="text-sm font-medium text-muted-foreground">
                        Additional Services
                      </h3>
                      <div className="bg-gray-50 dark:bg-secondary rounded-md p-4 space-y-3">
                        {ADDITIONAL_SERVICES.map(
                          (service) =>
                            state.additionalServices[service.id] && (
                              <div
                                key={service.id}
                                className="flex justify-between"
                              >
                                <span className="text-sm">{service.name}</span>
                                <span className="font-medium">
                                  {formatPrice(service.price)}/mo
                                </span>
                              </div>
                            ),
                        )}
                      </div>
                    </div>
                  )}

                  <Separator />

                  <div className="flex items-center justify-between py-2">
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="terms"
                        checked={termsAccepted}
                        onCheckedChange={(checked) =>
                          setTermsAccepted(checked === true)
                        }
                      />
                      <label htmlFor="terms" className="text-sm leading-none">
                        I accept the{" "}
                        <Link
                          href="/terms"
                          className="underline underline-offset-4 hover:text-primary"
                          target="_blank"
                        >
                          Terms of Service
                        </Link>{" "}
                        and{" "}
                        <Link
                          href="/privacy"
                          className="underline underline-offset-4 hover:text-primary"
                          target="_blank"
                        >
                          Privacy Policy
                        </Link>
                      </label>
                    </div>
                  </div>
                </div>
              </CardContent>
              <CardFooter className="flex flex-col sm:flex-row gap-4 justify-between">
                <Button
                  variant="outline"
                  onClick={handlePrevStep}
                  disabled={isLoading}
                >
                  Back
                </Button>
                <Button
                  onClick={onSubmit}
                  className="w-full sm:w-auto"
                  size="lg"
                  disabled={isLoading || !termsAccepted}
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Processing...
                    </>
                  ) : (
                    <>Pay and Deploy</>
                  )}
                </Button>
              </CardFooter>
            </Card>
          )}
        </div>

        {/* Order summary sidebar */}
        <div className="lg:col-span-1">
          <Card className="sticky top-8">
            <CardHeader>
              <CardTitle>Order Summary</CardTitle>
              <CardDescription>Game server configuration</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Server Info */}
              <div className="space-y-4">
                {state.selectedGameType && (
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">Game:</span>
                    <div className="flex items-center gap-2">
                      <div className="flex items-center justify-center size-6 bg-primary/10 rounded-md text-primary">
                        <Icons.tailwind className="size-3" />
                      </div>
                      <span className="font-medium">
                        {GAME_TYPES[state.selectedGameType as GameType]?.name}
                      </span>
                    </div>
                  </div>
                )}

                {state.serverName && (
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">
                      Server Name:
                    </span>
                    <span className="font-medium">{state.serverName}</span>
                  </div>
                )}

                {selectedPlan && (
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">Plan:</span>
                    <span className="font-medium">{selectedPlan.name}</span>
                  </div>
                )}

                {selectedLocation && (
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">
                      Location:
                    </span>
                    <div className="flex items-center gap-1">
                      <MapPin size={14} className="text-muted-foreground" />
                      <span className="font-medium">
                        {selectedLocation.attributes.long}
                      </span>
                    </div>
                  </div>
                )}

                {selectedPlan && (
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">
                      Resources:
                    </span>
                    <span className="font-medium text-xs">
                      {selectedPlan.resources.cpu} vCPU /{" "}
                      {selectedPlan.resources.ram} GB /{" "}
                      {selectedPlan.resources.storage} GB
                    </span>
                  </div>
                )}

                {/* Additional Services Summary */}
                {Object.keys(state.additionalServices).some(
                  (key) => state.additionalServices[key],
                ) && (
                  <>
                    <Separator />
                    <div className="space-y-3">
                      <span className="text-sm font-medium">
                        Additional Services
                      </span>
                      {ADDITIONAL_SERVICES.map(
                        (service) =>
                          state.additionalServices[service.id] && (
                            <div
                              key={service.id}
                              className="flex justify-between items-center"
                            >
                              <div className="flex items-center gap-2">
                                <div className="flex-shrink-0 size-5 flex items-center justify-center">
                                  {service.icon}
                                </div>
                                <span className="text-sm">{service.name}</span>
                              </div>
                              <span className="text-sm">
                                {formatPrice(service.price)}/mo
                              </span>
                            </div>
                          ),
                      )}
                    </div>
                  </>
                )}

                <Separator />

                {/* Pricing */}
                <div className="pt-2">
                  {selectedPlan && (
                    <div className="flex justify-between items-center">
                      <span>Server Plan</span>
                      <div className="text-right">
                        <span className="font-medium">
                          {formatPrice(selectedPlan.price)}/mo
                        </span>
                        {selectedPlan.discount! > 0 && (
                          <div className="text-green-600 dark:text-green-500 text-sm">
                            -{selectedPlan.discount}% discount
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {getAdditionalServicesCost() > 0 && (
                    <div className="flex justify-between items-center mt-2">
                      <span>Additional Services</span>
                      <span className="font-medium">
                        {formatPrice(getAdditionalServicesCost())}/mo
                      </span>
                    </div>
                  )}
                </div>

                <div className="bg-primary/5 p-4 rounded-md flex justify-between items-center">
                  <span className="font-semibold">Total</span>
                  <span className="font-bold text-lg">
                    {selectedPlan ? formatPrice(calculateTotalCost()) : "-"}/mo
                  </span>
                </div>
              </div>

              <div className="text-xs text-muted-foreground">
                Game servers are billed on a monthly basis. You can cancel at
                any time.
              </div>
            </CardContent>

            {currentStep < 5 && selectedPlan && (
              <CardFooter>
                <Button
                  className="w-full"
                  variant={
                    currentStep === steps.length - 1 ? "default" : "outline"
                  }
                  onClick={handleNextStep}
                >
                  {currentStep === steps.length - 1
                    ? "Review Order"
                    : "Continue"}
                  <ChevronRight size={16} />
                </Button>
              </CardFooter>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
};

export default GameServerSelect;
