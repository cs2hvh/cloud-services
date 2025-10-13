'use client';
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
  // Database,
  HardDrive,
  Loader2,
  // MapPin,
  Server,
} from "lucide-react";
import Image from "next/image";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import Link from "next/link";
import { toast } from "sonner";
import { formatPrice } from "@/lib/utils";
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
// import { Progress } from "@/components/ui/progress";
// import { Icons } from "@/components/ui/icons";
import api from "@/lib/axios/axios";

interface PageProps {
  products: Tables<"products">[];
  locations: Tables<"locations">[];
}

// Define the proper type for the database products
// interface DatabaseProduct {
//   id: string;
//   name: string | null;
//   sub: string | null;
//   type: string;
//   price: number | null;
//   resources: {
//     cpu: number;
//     ram: number;
//     storage: number;
//   };
//   discount: number | null;
//   created_at?: string | null;
//   description?: string | null;
//   image?: string | null;
// }

const databaseVersions = {
  mysql: ["5.7", "8.0", "8.1"],
  postgresql: ["12", "13", "14", "15", "16"],
  mongodb: ["4.4", "5.0", "6.0", "7.0"],
  redis: ["6.2", "7.0", "7.2"],
  mariadb: ["10.6", "10.7", "10.8", "10.11"],
  kafka: ["3.4", "3.5", "3.6"],
};

const databaseInfo = {
  mysql: { 
    name: "MySQL", 
    description: "Popular open-source relational database", 
    icon: "https://cdn.jsdelivr.net/gh/devicons/devicon/icons/mysql/mysql-original.svg" 
  },
  postgresql: { 
    name: "PostgreSQL", 
    description: "Advanced open-source database", 
    icon: "https://cdn.jsdelivr.net/gh/devicons/devicon/icons/postgresql/postgresql-original.svg" 
  },
  mongodb: { 
    name: "MongoDB", 
    description: "NoSQL document database", 
    icon: "https://cdn.jsdelivr.net/gh/devicons/devicon/icons/mongodb/mongodb-original.svg" 
  },
  redis: { 
    name: "Redis", 
    description: "In-memory data structure store", 
    icon: "/redis.png" 
  },
  mariadb: { 
    name: "MariaDB", 
    description: "MySQL-compatible database", 
    icon: "https://cdn.jsdelivr.net/gh/devicons/devicon/icons/mariadb/mariadb-original.svg" 
  },
  kafka: { 
    name: "Apache Kafka", 
    description: "Distributed event streaming", 
    icon: "/kafka.png" 
  },
};

// Sample database plans if products are empty
const sampleDatabasePlans = {
  mysql: [
    { id: 'mysql-starter', name: 'Starter', sub: 'mysql', type: 'database', price: 15, resources: { cpu: 1, ram: 2, storage: 20 }, discount: null },
    { id: 'mysql-basic', name: 'Basic', sub: 'mysql', type: 'database', price: 35, resources: { cpu: 2, ram: 4, storage: 50 }, discount: null },
    { id: 'mysql-pro', name: 'Professional', sub: 'mysql', type: 'database', price: 75, resources: { cpu: 4, ram: 8, storage: 100 }, discount: 10 },
    { id: 'mysql-business', name: 'Business', sub: 'mysql', type: 'database', price: 150, resources: { cpu: 8, ram: 16, storage: 250 }, discount: 15 },
  ],
  postgresql: [
    { id: 'pg-starter', name: 'Starter', sub: 'postgresql', type: 'database', price: 20, resources: { cpu: 1, ram: 2, storage: 25 }, discount: null },
    { id: 'pg-basic', name: 'Basic', sub: 'postgresql', type: 'database', price: 45, resources: { cpu: 2, ram: 4, storage: 60 }, discount: null },
    { id: 'pg-pro', name: 'Professional', sub: 'postgresql', type: 'database', price: 95, resources: { cpu: 4, ram: 8, storage: 150 }, discount: 10 },
    { id: 'pg-enterprise', name: 'Enterprise', sub: 'postgresql', type: 'database', price: 250, resources: { cpu: 16, ram: 32, storage: 500 }, discount: 20 },
  ],
  mongodb: [
    { id: 'mongo-free', name: 'Free Tier', sub: 'mongodb', type: 'database', price: 0, resources: { cpu: 0.5, ram: 1, storage: 5 }, discount: null },
    { id: 'mongo-starter', name: 'Starter', sub: 'mongodb', type: 'database', price: 25, resources: { cpu: 1, ram: 2, storage: 30 }, discount: null },
    { id: 'mongo-pro', name: 'Professional', sub: 'mongodb', type: 'database', price: 85, resources: { cpu: 4, ram: 8, storage: 120 }, discount: 15 },
    { id: 'mongo-scale', name: 'Scale', sub: 'mongodb', type: 'database', price: 199, resources: { cpu: 8, ram: 16, storage: 300 }, discount: 20 },
  ],
  redis: [
    { id: 'redis-cache', name: 'Cache', sub: 'redis', type: 'database', price: 10, resources: { cpu: 0.5, ram: 1, storage: 5 }, discount: null },
    { id: 'redis-standard', name: 'Standard', sub: 'redis', type: 'database', price: 30, resources: { cpu: 1, ram: 4, storage: 10 }, discount: null },
    { id: 'redis-pro', name: 'Professional', sub: 'redis', type: 'database', price: 60, resources: { cpu: 2, ram: 8, storage: 25 }, discount: 10 },
    { id: 'redis-enterprise', name: 'Enterprise', sub: 'redis', type: 'database', price: 120, resources: { cpu: 4, ram: 16, storage: 50 }, discount: 15 },
  ],
  mariadb: [
    { id: 'maria-starter', name: 'Starter', sub: 'mariadb', type: 'database', price: 15, resources: { cpu: 1, ram: 2, storage: 20 }, discount: null },
    { id: 'maria-standard', name: 'Standard', sub: 'mariadb', type: 'database', price: 40, resources: { cpu: 2, ram: 4, storage: 60 }, discount: null },
    { id: 'maria-pro', name: 'Professional', sub: 'mariadb', type: 'database', price: 80, resources: { cpu: 4, ram: 8, storage: 120 }, discount: 10 },
  ],
  kafka: [
    { id: 'kafka-basic', name: 'Basic', sub: 'kafka', type: 'database', price: 50, resources: { cpu: 2, ram: 4, storage: 50 }, discount: null },
    { id: 'kafka-standard', name: 'Standard', sub: 'kafka', type: 'database', price: 120, resources: { cpu: 4, ram: 8, storage: 100 }, discount: 10 },
    { id: 'kafka-pro', name: 'Professional', sub: 'kafka', type: 'database', price: 250, resources: { cpu: 8, ram: 16, storage: 250 }, discount: 15 },
  ],
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
      
      // Use sample plans if no products available
      if (filteredProducts.length === 0) {
        // const samplePlans = sampleDatabasePlans[
        //   state.selectedDbType as keyof typeof sampleDatabasePlans
        // ];
        // if (samplePlans) {
        //   filteredProducts = samplePlans as DatabaseProduct[];
        // }
      }
      
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

      const response = await api.post("/services/order/database", {
        name: state.selectedName,
        database_type: state.selectedDbType,
        database_plan: state.selectedDb,
        version: state.selectedVersion,
        location: state.selectedLocation,
      });

      toast.success(response.data);
      // Redirect to success page or dashboard
    } catch (error) {
      console.log(error);
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
    { id: 1, name: "Name" },
    { id: 2, name: "Location" },
    { id: 3, name: "Type" },
    { id: 4, name: "Plan" },
    { id: 5, name: "Config" },
    { id: 6, name: "Review" },
  ];

  // Use predefined database types
  const dbTypes = Object.keys(databaseInfo);

  return (
    <div className="py-4">
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
        <div className="lg:col-span-2 space-y-6">
          {currentStep === 1 && (
            <Card className="bg-white/5 border-white/10">
              <CardHeader>
                <CardTitle className="text-white">Database Cluster Name</CardTitle>
              </CardHeader>
              <CardContent>
                <Input
                  value={selectedName}
                  onChange={(e) => setState({ ...state, selectedName: e.target.value })}
                  type="text"
                  placeholder="my-production-db"
                  className="bg-white/10 border-white/20 rounded-md text-white placeholder:text-white/50"
                />
              </CardContent>
              <CardFooter className="flex justify-end">
                <Button onClick={handleNextStep} className="bg-white text-black rounded-md hover:bg-gray-200">
                  Next <ChevronRight size={16} className="ml-2" />
                </Button>
              </CardFooter>
            </Card>
          )}

          {currentStep === 2 && (
            <Card className="bg-white/5 border-white/10">
              <CardHeader>
                <CardTitle className="text-white">Location</CardTitle>
              </CardHeader>
              <CardContent>
                <RadioGroup
                  value={selectedLocation}
                  onValueChange={(value) => setState({ ...state, selectedLocation: value })}
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
                <Button onClick={handleNextStep} className="bg-white text-black rounded-md hover:bg-gray-200">Next <ChevronRight size={16} className="ml-2" /></Button>
              </CardFooter>
            </Card>
          )}

          {currentStep === 3 && (
            <Card className="bg-white/5 border-white/10">
              <CardHeader>
                <CardTitle className="text-white">Database Type</CardTitle>
              </CardHeader>
              <CardContent>
                <RadioGroup value={selectedDbType} onValueChange={handleDbTypeChange} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {dbTypes.map((dbType) => {
                    const info = databaseInfo[dbType as keyof typeof databaseInfo];
                    let planCount = products.filter((p) => p.sub === dbType).length;
                    // Use sample plan count if no products
                    if (planCount === 0) {
                      const samplePlans = sampleDatabasePlans[dbType as keyof typeof sampleDatabasePlans];
                      planCount = samplePlans ? samplePlans.length : 0;
                    }
                    return (
                      <div key={dbType}>
                        <RadioGroupItem value={dbType} id={`type-${dbType}`} className="peer sr-only" />
                        <Label htmlFor={`type-${dbType}`} className="flex items-start gap-3 bg-white/10 rounded-md border-2 border-transparent cursor-pointer p-4 transition-all peer-data-[state=checked]:border-blue-500 hover:bg-white/15">
                          <div className="w-10 h-10 relative flex-shrink-0">
                            <Image 
                              src={info.icon} 
                              alt={info.name}
                              width={40}
                              height={40}
                              className="object-contain"
                            />
                          </div>
                          <div className="flex-1">
                            <p className="font-semibold text-white">{info.name}</p>
                            <p className="text-xs text-white/60 mt-1">{info.description}</p>
                          </div>
                          {planCount > 0 && (
                            <Badge variant="outline" className="ml-auto text-white/70">{planCount} plans</Badge>
                          )}
                        </Label>
                      </div>
                    );
                  })}
                </RadioGroup>
              </CardContent>
              <CardFooter className="flex justify-between">
                <Button variant="outline" onClick={handlePrevStep} className="rounded-md border-white/20 text-white hover:bg-white/10">Back</Button>
                <Button onClick={handleNextStep} className="bg-white text-black rounded-md hover:bg-gray-200">Next <ChevronRight size={16} className="ml-2" /></Button>
              </CardFooter>
            </Card>
          )}

          {currentStep === 4 && (
            <Card className="bg-white/5 border-white/10">
              <CardHeader>
                <CardTitle className="text-white">Database Plan</CardTitle>
              </CardHeader>
              <CardContent>
                <RadioGroup value={selectedDb} onValueChange={handleDbPlanChange} className="grid grid-cols-1 gap-4">
                  {availablePlans.map((database) => (
                    <div key={database.id}>
                      <RadioGroupItem value={database.id} id={database.id} className="peer sr-only" />
                      <Label htmlFor={database.id} className="block bg-white/10 rounded-lg border-2 border-transparent cursor-pointer p-5 transition-all peer-data-[state=checked]:border-blue-500 hover:bg-white/15">
                        <div className="flex justify-between items-start mb-4">
                          <div>
                            <p className="font-bold text-lg text-white">{database.name}</p>
                            {database.discount && Number(database.discount) > 0 && (
                              <Badge variant="outline" className="text-green-400 bg-green-500/10 border-green-500/30 mt-2">
                                Save {database.discount}%
                              </Badge>
                            )}
                          </div>
                          <div className="text-right">
                            {database.price === 0 || database.price === null ? (
                              <div>
                                <span className="text-2xl font-bold text-white">Free</span>
                              </div>
                            ) : database.discount ? (
                              <div>
                                <span className="line-through text-sm text-white/40">${database.price}</span>
                                <div className="text-2xl font-bold text-white">
                                  ${(database.price! * (1 - Number(database.discount) / 100)).toFixed(0)}
                                  <span className="text-sm font-normal text-white/60">/mo</span>
                                </div>
                              </div>
                            ) : (
                              <div className="text-2xl font-bold text-white">
                                ${database.price}
                                <span className="text-sm font-normal text-white/60">/mo</span>
                              </div>
                            )}
                          </div>
                        </div>
                        {database.resources && (
                          <div className="grid grid-cols-3 gap-3 pt-4 border-t border-white/10">
                            <div>
                              <div className="flex items-center gap-2 mb-1">
                                <Cpu className="w-4 h-4 text-blue-400" />
                                <span className="text-xs text-white/60">CPU</span>
                              </div>
                              <p className="font-semibold text-white">
                                {(database.resources as { cpu: number; ram: number; storage: number; }).cpu} vCPU
                              </p>
                            </div>
                            <div>
                              <div className="flex items-center gap-2 mb-1">
                                <Server className="w-4 h-4 text-green-400" />
                                <span className="text-xs text-white/60">RAM</span>
                              </div>
                              <p className="font-semibold text-white">
                                {(database.resources as { cpu: number; ram: number; storage: number; }).ram} GB
                              </p>
                            </div>
                            <div>
                              <div className="flex items-center gap-2 mb-1">
                                <HardDrive className="w-4 h-4 text-purple-400" />
                                <span className="text-xs text-white/60">Storage</span>
                              </div>
                              <p className="font-semibold text-white">
                                {(database.resources as { cpu: number; ram: number; storage: number; }).storage} GB
                              </p>
                            </div>
                          </div>
                        )}
                      </Label>
                    </div>
                  ))}
                </RadioGroup>
              </CardContent>
              <CardFooter className="flex justify-between">
                <Button variant="outline" onClick={handlePrevStep} className="rounded-md border-white/20 text-white hover:bg-white/10">Back</Button>
                <Button onClick={handleNextStep} className="bg-white text-black rounded-md hover:bg-gray-200">Next <ChevronRight size={16} className="ml-2" /></Button>
              </CardFooter>
            </Card>
          )}

          {currentStep === 5 && selectedDb && (
            <Card className="bg-white/5 border-white/10">
              <CardHeader>
                <CardTitle className="text-white">Configuration</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div>
                  <Label htmlFor="version" className="mb-2 block text-white">Database Version</Label>
                  <Select value={selectedVersion} onValueChange={(value) => setState({ ...state, selectedVersion: value }) }>
                    <SelectTrigger id="version" className="w-full bg-white/10 border-white/20 rounded-md text-white">
                      <SelectValue placeholder="Select version" />
                    </SelectTrigger>
                    <SelectContent className="bg-black border-white/20 text-white">
                      {versions.map((version) => <SelectItem key={version} value={version}>v{version}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
              <CardFooter className="flex justify-between">
                <Button variant="outline" onClick={handlePrevStep} className="rounded-md border-white/20 text-white hover:bg-white/10">Back</Button>
                <Button onClick={handleNextStep} className="bg-white text-black rounded-md hover:bg-gray-200">Next <ChevronRight size={16} className="ml-2" /></Button>
              </CardFooter>
            </Card>
          )}

          {currentStep === 6 && (
            <Card className="bg-white/5 border-white/10">
              <CardHeader>
                <CardTitle className="text-white">Review & Payment</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center space-x-2">
                  <Checkbox id="terms" checked={termsAccepted} onCheckedChange={(checked) => setTermsAccepted(checked === true)} className="rounded-sm" />
                  <label htmlFor="terms" className="text-sm leading-none text-white">
                    I accept the <Link href="/terms" className="text-blue-400 hover:underline">Terms of Service</Link> and <Link href="/privacy" className="text-blue-400 hover:underline">Privacy Policy</Link>
                  </label>
                </div>
              </CardContent>
              <CardFooter className="flex justify-between">
                <Button variant="outline" onClick={handlePrevStep} disabled={isLoading} className="rounded-md border-white/20 text-white hover:bg-white/10">Back</Button>
                <Button onClick={onSubmit} size="lg" disabled={isLoading || !termsAccepted} className="bg-white text-black rounded-md hover:bg-gray-200 w-full sm:w-auto">
                  {isLoading ? <><Loader2 className="w-4 h-4 animate-spin mr-2" />Processing...</> : <>Pay and Deploy</>}
                </Button>
              </CardFooter>
            </Card>
          )}
        </div>

        <div className="lg:col-span-1">
          <Card className="sticky top-8 bg-white/5 border-white/10">
            <CardHeader>
              <CardTitle className="text-white">Order Summary</CardTitle>
              {selectedDbType && (
                <div className="mt-4 p-4 bg-white/5 rounded-lg flex justify-center">
                  <Image 
                    src={databaseInfo[selectedDbType as keyof typeof databaseInfo]?.icon || ""} 
                    alt={databaseInfo[selectedDbType as keyof typeof databaseInfo]?.name || selectedDbType}
                    width={60}
                    height={60}
                    className="object-contain"
                  />
                </div>
              )}
            </CardHeader>
            <CardContent className="space-y-4">
              {selectedName && <div className="flex justify-between items-center"><span className="text-sm text-white/60">Name:</span><span className="font-medium text-white">{selectedName}</span></div>}
              {selectedDbType && (
                <div className="flex justify-between items-center">
                  <span className="text-sm text-white/60">Type:</span>
                  <div className="flex items-center gap-2">
                    <Image 
                      src={databaseInfo[selectedDbType as keyof typeof databaseInfo]?.icon || ""} 
                      alt={databaseInfo[selectedDbType as keyof typeof databaseInfo]?.name || selectedDbType}
                      width={20}
                      height={20}
                      className="object-contain"
                    />
                    <span className="font-medium text-white">
                      {databaseInfo[selectedDbType as keyof typeof databaseInfo]?.name || selectedDbType}
                    </span>
                  </div>
                </div>
              )}
              {selectedDatabase && <div className="flex justify-between items-center"><span className="text-sm text-white/60">Plan:</span><span className="font-medium text-white">{selectedDatabase.name}</span></div>}
              {selectedVersion && <div className="flex justify-between items-center"><span className="text-sm text-white/60">Version:</span><span className="font-medium text-white">v{selectedVersion}</span></div>}
              {selectedLocationData && <div className="flex justify-between items-center"><span className="text-sm text-white/60">Location:</span><div className="flex items-center gap-2"><Image src={`https://flagsapi.com/${selectedLocationData.country_code}/flat/64.png`} alt={selectedLocationData.city} width={16} height={12} className="rounded-sm" /><span className="font-medium text-white">{selectedLocationData.city}</span></div></div>}
              <Separator className="bg-white/10" />
              <div className="flex justify-between items-center font-bold text-lg text-white">
                <span>Total</span>
                <span>
                  {selectedDatabase ? selectedDatabase.price === 0 || selectedDatabase.price === null ? "Free" : selectedDatabase.discount && Number(selectedDatabase.discount) > 0 ? `${formatPrice(selectedDatabase.price! * (1 - Number(selectedDatabase.discount) / 100))}/mo` : `${formatPrice(selectedDatabase.price!)}/mo` : "-"}
                </span>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default DatabaseSelect;