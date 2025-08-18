"use client";
import { useState, useEffect } from "react";
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
  Cpu,
  Database,
  HardDrive,
  Loader2,
  MapPin,
  Server,
} from "lucide-react";
import Image from "next/image";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import Link from "next/link";
import { toast } from "sonner";
import axios from "axios";
import { formatPrice } from "@/lib/utils";
import { Tables } from "@/lib/supabase/types";
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

interface PageProps {
  products: Tables<"products">[];
  locations: Tables<"locations">[];
}

const databaseVersions = {
  mysql: ["5.7", "8.0", "8.1"],
  postgresql: ["12", "13", "14", "15", "16"],
  mongodb: ["4.4", "5.0", "6.0", "7.0"],
  redis: ["6.2", "7.0", "7.2"],
  mariadb: ["10.6", "10.7", "10.8", "10.11"],
  clickhouse: ["22.8", "23.8", "24.1"],
};

const DatabaseSelect = ({ products, locations }: PageProps) => {
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [currentStep, setCurrentStep] = useState<number>(1);
  const [termsAccepted, setTermsAccepted] = useState<boolean>(false);
  const [availablePlans, setAvailablePlans] = useState<Tables<"products">[]>(
    [],
  );

  const [state, setState] = useState({
    selectedDb: "", // Selected database product
    selectedName: "", // Cluster name
    selectedVersion: "", // Selected version
    selectedLocation: "", // Selected location
    selectedDbType: "", // Selected database type (mysql, mongodb, etc.)
    versions: [] as string[], // Available versions
  });

  // Filter products when database type changes
  useEffect(() => {
    if (state.selectedDbType) {
      const filteredProducts = products.filter(
        (product) => product.sub === state.selectedDbType,
      );
      setAvailablePlans(filteredProducts);

      // Set versions based on selected DB type
      setState((prevState) => ({
        ...prevState,
        versions:
          databaseVersions[
            state.selectedDbType as keyof typeof databaseVersions
          ] || [],
        selectedVersion:
          databaseVersions[
            state.selectedDbType as keyof typeof databaseVersions
          ]?.[0] || "",
      }));
    }
  }, [state.selectedDbType, products]);

  const handleNextStep = () => {
    if (currentStep === 1 && !state.selectedName) {
      toast.error("Please enter a database cluster name");
      return;
    }

    if (currentStep === 2 && !state.selectedLocation) {
      toast.error("Please select a location");
      return;
    }

    if (currentStep === 3 && !state.selectedDbType) {
      toast.error("Please select a database type");
      return;
    }

    if (currentStep === 4 && !state.selectedDb) {
      toast.error("Please select a database plan");
      return;
    }

    if (currentStep === 5 && !state.selectedVersion) {
      toast.error("Please select a database version");
      return;
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
    if (!termsAccepted) {
      toast.error("Please accept the terms of service and privacy policy");
      return;
    }

    try {
      setIsLoading(true);
      if (
        !state.selectedDb ||
        !state.selectedName ||
        !state.selectedVersion ||
        !state.selectedLocation ||
        !state.selectedDbType
      ) {
        toast.error("Please fill in all the required fields");
        return;
      }

      const response = await axios.post("/api/services/order/database", {
        name: state.selectedName,
        database_type: state.selectedDbType,
        database_plan: state.selectedDb,
        version: state.selectedVersion,
        location: state.selectedLocation,
      });

      toast.success(response.data);
      // Redirect to success page or dashboard
    } catch (error) {
      toast.error("Failed to create database. Please try again later.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleDbTypeChange = (dbType: string) => {
    setState((prevState) => ({
      ...prevState,
      selectedDbType: dbType,
      selectedDb: "", // Reset selected plan when changing DB type
      selectedVersion:
        databaseVersions[dbType as keyof typeof databaseVersions]?.[0] || "",
    }));
  };

  const handleDbPlanChange = (dbId: string) => {
    setState((prevState) => ({
      ...prevState,
      selectedDb: dbId,
    }));
  };

  const {
    selectedDb,
    selectedName,
    selectedVersion,
    selectedLocation,
    selectedDbType,
    versions,
  } = state;

  const selectedDatabase = products?.find((db) => db.id === selectedDb);
  const selectedLocationData = locations?.find(
    (location) => location.short === selectedLocation,
  );

  const steps = [
    { id: 1, name: "Cluster Name" },
    { id: 2, name: "Location" },
    { id: 3, name: "Database Type" },
    { id: 4, name: "Database Plan" },
    { id: 5, name: "Configuration" },
    { id: 6, name: "Review & Pay" },
  ];

  // Get unique database types from products
  const dbTypes = [
    ...new Set(products.filter((p) => p.type === "database").map((p) => p.sub)),
  ].filter(Boolean) as string[];

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
          {/* Step 1: Database Name */}
          {currentStep === 1 && (
            <Card>
              <CardHeader>
                <CardTitle>Database Cluster Name</CardTitle>
                <CardDescription>
                  Choose a unique name for your database cluster
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Input
                  value={selectedName}
                  onChange={(e) =>
                    setState((prevState) => ({
                      ...prevState,
                      selectedName: e.target.value,
                    }))
                  }
                  type="text"
                  placeholder="my-production-db"
                  className="text-base"
                />
                <p className="text-xs text-muted-foreground mt-2">
                  The name will be used to identify your database in the
                  dashboard
                </p>
              </CardContent>
              <CardFooter className="flex justify-end">
                <Button onClick={handleNextStep}>
                  Next <ChevronRight size={16} />
                </Button>
              </CardFooter>
            </Card>
          )}

          {/* Step 2: Location Selection */}
          {currentStep === 2 && (
            <Card>
              <CardHeader>
                <CardTitle>Location</CardTitle>
                <CardDescription>
                  Choose a datacenter region for your database
                </CardDescription>
              </CardHeader>
              <CardContent>
                <RadioGroup
                  value={selectedLocation}
                  onValueChange={(value) =>
                    setState((prevState) => ({
                      ...prevState,
                      selectedLocation: value,
                    }))
                  }
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
                        className="flex gap-3 rounded-md bg-gray-50 dark:bg-secondary border-2 cursor-pointer border-muted p-4 peer-data-[state=checked]:border-primary peer-data-[state=checked]:cursor-default transition-all duration-100 ease-in-out transform-gpu active:scale-[0.98]"
                      >
                        <div className="flex items-center">
                          <Image
                            src={`https://flagsapi.com/${region.country_code}/flat/64.png`}
                            alt={region.city}
                            className="rounded-md"
                            width={32}
                            height={24}
                          />
                        </div>
                        <div>
                          <div className="font-medium">{region.city}</div>
                          <div className="text-xs text-muted-foreground">
                            {region.country}
                          </div>
                        </div>
                        {!region.available && (
                          <Badge variant="outline" className="text-xs">
                            Coming soon
                          </Badge>
                        )}
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

          {/* Step 3: Database Type Selection (New) */}
          {currentStep === 3 && (
            <Card>
              <CardHeader>
                <CardTitle>Database Type</CardTitle>
                <CardDescription>
                  Select your database engine type
                </CardDescription>
              </CardHeader>
              <CardContent>
                <RadioGroup
                  value={selectedDbType}
                  onValueChange={handleDbTypeChange}
                  className="grid grid-cols-1 sm:grid-cols-2 gap-3"
                >
                  {dbTypes.map((dbType) => (
                    <div key={dbType}>
                      <RadioGroupItem
                        value={dbType}
                        id={`type-${dbType}`}
                        className="peer sr-only"
                      />
                      <Label
                        htmlFor={`type-${dbType}`}
                        className="flex items-center gap-3 bg-gray-50 dark:bg-secondary rounded-md border-2 cursor-pointer border-muted p-4 peer-data-[state=checked]:border-primary peer-data-[state=checked]:cursor-default transition-all duration-100 ease-in-out transform-gpu active:scale-[0.99]"
                      >
                        <div className="flex-shrink-0">
                          <Database className="size-6 text-primary" />
                        </div>
                        <div>
                          <p className="text-base font-semibold capitalize">
                            {dbType}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {dbType === "mysql" &&
                              "Reliable, popular SQL database"}
                            {dbType === "postgresql" &&
                              "Advanced open-source database"}
                            {dbType === "mongodb" && "NoSQL document database"}
                            {dbType === "redis" &&
                              "In-memory data structure store"}
                            {dbType === "mariadb" &&
                              "Community-developed MySQL fork"}
                            {dbType === "clickhouse" &&
                              "Column-oriented OLAP database"}
                          </p>
                        </div>
                        <div className="ml-auto">
                          <Badge variant="outline">
                            {products.filter((p) => p.sub === dbType).length}{" "}
                            plans
                          </Badge>
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

          {/* Step 4: Database Plan Selection */}
          {currentStep === 4 && (
            <Card>
              <CardHeader>
                <CardTitle>Database Plan</CardTitle>
                <CardDescription>
                  Select your {selectedDbType} database plan
                </CardDescription>
              </CardHeader>
              <CardContent>
                <RadioGroup
                  value={selectedDb}
                  onValueChange={handleDbPlanChange}
                  className="grid grid-cols-1 gap-3"
                >
                  {availablePlans.map((database) => (
                    <div key={database.id}>
                      <RadioGroupItem
                        value={database.id}
                        id={database.id}
                        className="peer sr-only"
                      />
                      <Label
                        htmlFor={database.id}
                        className="flex justify-between items-center gap-4 bg-gray-50 dark:bg-secondary rounded-md border-2 cursor-pointer border-muted p-4 peer-data-[state=checked]:border-primary peer-data-[state=checked]:cursor-default transition-all duration-100 ease-in-out transform-gpu active:scale-[0.99]"
                      >
                        <div className="flex items-center gap-3">
                          <Icons.tailwind className="size-5" />
                          <div>
                            <p className="text-base font-semibold">
                              {database.name}
                            </p>
                            {/* {database.description && (
                                                            <p className="text-xs text-muted-foreground">{database.description}</p>
                                                        )} */}
                            <div className="flex gap-2 text-xs text-muted-foreground">
                              <span>{database.resources.cpu} vCPU</span>
                              <span>{database.resources.ram} GB RAM</span>
                              <span>
                                {database.resources.storage} GB Storage
                              </span>
                            </div>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="font-semibold">
                            {database.price === 0 ? (
                              "Free"
                            ) : database.discount ? (
                              <div>
                                <span className="line-through text-xs text-muted-foreground">
                                  {formatPrice(database.price)}/mo
                                </span>
                                <span className="ml-1">
                                  {formatPrice(
                                    database.price *
                                      (1 - Number(database.discount) / 100),
                                  )}
                                  /mo
                                </span>
                              </div>
                            ) : (
                              `${formatPrice(database.price)}/mo`
                            )}
                          </div>
                          {database.discount &&
                            Number(database.discount) > 0 && (
                              <Badge
                                variant="outline"
                                className="text-green-600 bg-green-50 dark:bg-green-950/20"
                              >
                                Save {database.discount}%
                              </Badge>
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

          {/* Step 5: Version and Configuration */}
          {currentStep === 5 && selectedDb && (
            <Card>
              <CardHeader>
                <CardTitle>Configuration</CardTitle>
                <CardDescription>
                  Select version for your {selectedDbType} database
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div>
                  <Label htmlFor="version" className="mb-2 block">
                    Database Version
                  </Label>
                  <Select
                    value={selectedVersion}
                    onValueChange={(value) =>
                      setState((prevState) => ({
                        ...prevState,
                        selectedVersion: value,
                      }))
                    }
                  >
                    <SelectTrigger id="version" className="w-full">
                      <SelectValue placeholder="Select version" />
                    </SelectTrigger>
                    <SelectContent>
                      {versions.map((version) => (
                        <SelectItem key={version} value={version}>
                          v{version}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label className="mb-2 block">Resources</Label>
                  {selectedDatabase && (
                    <div className="grid grid-cols-3 gap-4 bg-gray-50 dark:bg-secondary rounded-md p-4">
                      <div className="text-center p-2">
                        <div className="flex justify-center">
                          <Cpu className="h-5 w-5 text-muted-foreground" />
                        </div>
                        <div className="mt-1 font-medium">
                          {selectedDatabase.resources.cpu} vCPU
                        </div>
                        <div className="text-xs text-muted-foreground">
                          Dedicated cores
                        </div>
                      </div>
                      <div className="text-center p-2">
                        <div className="flex justify-center">
                          <Server className="h-5 w-5 text-muted-foreground" />
                        </div>
                        <div className="mt-1 font-medium">
                          {selectedDatabase.resources.ram} GB
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
                          {selectedDatabase.resources.storage} GB
                        </div>
                        <div className="text-xs text-muted-foreground">
                          NVMe SSD
                        </div>
                      </div>
                    </div>
                  )}
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

          {/* Step 6: Review & Payment */}
          {currentStep === 6 && (
            <Card>
              <CardHeader>
                <CardTitle>Review & Payment</CardTitle>
                <CardDescription>
                  Review your database configuration and complete the order
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <h3 className="text-sm font-medium text-muted-foreground">
                        Database Details
                      </h3>
                      <div className="bg-gray-50 dark:bg-secondary rounded-md p-4 space-y-3">
                        <div className="flex justify-between">
                          <span className="text-sm text-muted-foreground">
                            Cluster Name:
                          </span>
                          <span className="font-medium">{selectedName}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-sm text-muted-foreground">
                            Database Type:
                          </span>
                          <span className="font-medium capitalize">
                            {selectedDbType}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-sm text-muted-foreground">
                            Plan:
                          </span>
                          <span className="font-medium">
                            {selectedDatabase?.name}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-sm text-muted-foreground">
                            Version:
                          </span>
                          <span className="font-medium">
                            v{selectedVersion}
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
                            {selectedLocationData && (
                              <Image
                                src={`https://flagsapi.com/${selectedLocationData.country_code}/flat/64.png`}
                                alt={selectedLocationData.city}
                                className="rounded-sm"
                                width={18}
                                height={14}
                              />
                            )}
                            <span className="font-medium">
                              {selectedLocationData?.city},{" "}
                              {selectedLocationData?.country}
                            </span>
                          </div>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-sm text-muted-foreground">
                            Datacenter:
                          </span>
                          <div className="flex items-center gap-1">
                            <MapPin size={14} />
                            <span className="font-medium">
                              {selectedLocationData?.short}
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
                    {selectedDatabase && (
                      <div className="bg-gray-50 dark:bg-secondary rounded-md p-4">
                        <div className="grid grid-cols-3 gap-4">
                          <div className="text-center p-2">
                            <div className="flex justify-center">
                              <Cpu className="h-5 w-5 text-muted-foreground" />
                            </div>
                            <div className="mt-1 font-medium">
                              {selectedDatabase.resources.cpu} vCPU
                            </div>
                            <div className="text-xs text-muted-foreground">
                              Dedicated cores
                            </div>
                          </div>
                          <div className="text-center p-2">
                            <div className="flex justify-center">
                              <Server className="h-5 w-5 text-muted-foreground" />
                            </div>
                            <div className="mt-1 font-medium">
                              {selectedDatabase.resources.ram} GB
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
                              {selectedDatabase.resources.storage} GB
                            </div>
                            <div className="text-xs text-muted-foreground">
                              NVMe SSD
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

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
              <CardDescription>Current database configuration</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Database Info */}
              <div className="space-y-4">
                {selectedName && (
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">
                      Cluster Name:
                    </span>
                    <span className="font-medium">{selectedName}</span>
                  </div>
                )}

                {selectedDbType && (
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">
                      Database Type:
                    </span>
                    <span className="font-medium capitalize">
                      {selectedDbType}
                    </span>
                  </div>
                )}

                {selectedDatabase && (
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">Plan:</span>
                    <div className="flex items-center">
                      <Icons.tailwind className="size-5 mr-2" />
                      <span className="font-medium">
                        {selectedDatabase.name}
                      </span>
                    </div>
                  </div>
                )}

                {selectedVersion && (
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">
                      Version:
                    </span>
                    <span className="font-medium">v{selectedVersion}</span>
                  </div>
                )}

                {selectedLocationData && (
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">
                      Location:
                    </span>
                    <div className="flex items-center gap-1">
                      <Image
                        src={`https://flagsapi.com/${selectedLocationData.country_code}/flat/64.png`}
                        alt={selectedLocationData.city}
                        className="rounded-sm"
                        width={16}
                        height={12}
                      />
                      <span className="font-medium">
                        {selectedLocationData.city}
                      </span>
                    </div>
                  </div>
                )}

                {selectedDatabase && (
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">
                      Resources:
                    </span>
                    <span className="font-medium text-xs">
                      {selectedDatabase.resources.cpu} vCPU /{" "}
                      {selectedDatabase.resources.ram} GB /{" "}
                      {selectedDatabase.resources.storage} GB
                    </span>
                  </div>
                )}

                <Separator />

                {/* Pricing */}
                <div className="pt-2">
                  <div className="flex justify-between items-center">
                    <span>Subtotal</span>
                    <span className="font-medium">
                      {selectedDatabase
                        ? selectedDatabase.price === 0
                          ? "Free"
                          : `${formatPrice(selectedDatabase.price)}/mo`
                        : "-"}
                    </span>
                  </div>

                  {selectedDatabase &&
                    selectedDatabase.discount &&
                    Number(selectedDatabase.discount) > 0 && (
                      <div className="flex justify-between items-center text-green-600 dark:text-green-500">
                        <span>Discount</span>
                        <span>-{selectedDatabase.discount}%</span>
                      </div>
                    )}
                </div>

                <div className="bg-primary/5 p-4 rounded-md flex justify-between items-center">
                  <span className="font-semibold">Total</span>
                  <span className="font-bold text-lg">
                    {selectedDatabase
                      ? selectedDatabase.price === 0
                        ? "Free"
                        : selectedDatabase.discount &&
                            Number(selectedDatabase.discount) > 0
                          ? `${formatPrice(selectedDatabase.price * (1 - Number(selectedDatabase.discount) / 100))}/mo`
                          : `${formatPrice(selectedDatabase.price)}/mo`
                      : "-"}
                  </span>
                </div>
              </div>

              <div className="text-xs text-muted-foreground">
                Databases are billed on a monthly basis. You can cancel at any
                time.
              </div>
            </CardContent>

            {currentStep < 6 && (
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

export default DatabaseSelect;
