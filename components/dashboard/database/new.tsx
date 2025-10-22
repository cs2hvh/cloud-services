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
import { send } from "process";
import { useRouter } from "next/navigation";

interface PageProps {
  products: Tables<"products">[];
  locations: Tables<"locations">[];
   projects: Tables<"projects">[];
  userId: string;
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
  mysql: ["8"],
  pg: ["14", "15", "16", "17"],
  mongodb: ["7", "8"],
  // redis: ["6.2", "7.0", "7.2"],
  // mariadb: ["10.6", "10.7", "10.8", "10.11"],
  kafka: ["3.8"],
};

const databaseInfo = {
  mysql: {
    name: "MySQL",
    description: "Popular open-source relational database",
    icon: "https://cdn.jsdelivr.net/gh/devicons/devicon/icons/mysql/mysql-original.svg",
  },
  pg: {
    name: "PostgreSQL",
    description: "Advanced open-source database",
    icon: "https://cdn.jsdelivr.net/gh/devicons/devicon/icons/postgresql/postgresql-original.svg",
  },
  mongodb: {
    name: "MongoDB",
    description: "NoSQL document database",
    icon: "https://cdn.jsdelivr.net/gh/devicons/devicon/icons/mongodb/mongodb-original.svg",
  },
  // redis: {
  //   name: "Redis",
  //   description: "In-memory data structure store",
  //   icon: "/redis.png"
  // },
  // mariadb: {
  //   name: "MariaDB",
  //   description: "MySQL-compatible database",
  //   icon: "https://cdn.jsdelivr.net/gh/devicons/devicon/icons/mariadb/mariadb-original.svg"
  // },
  kafka: {
    name: "Apache Kafka",
    description: "Distributed event streaming",
    icon: "/kafka.png",
  },
};

// Sample database plans if products are empty
const sampleDatabasePlans = {
  mysql: [
    {
      id: "db-s-1vcpu-1gb",
      name: "Starter",
      sub: "mysql",
      type: "database",
      price: 15,
      resources: { cpu: 1, ram: 1, storage: 15 },
      discount: null,
    },
    {
      id: "db-s-1vcpu-2gb",
      name: "Basic",
      sub: "mysql",
      type: "database",
      price: 35,
      resources: { cpu: 1, ram: 2, storage: 34 },
      discount: null,
    },
    {
      id: "db-s-2vcpu-4gb",
      name: "Professional",
      sub: "mysql",
      type: "database",
      price: 75,
      resources: { cpu: 2, ram: 4, storage: 56 },
      discount: null,
    },
    {
      id: "db-s-4vcpu-8gb",
      name: "Business",
      sub: "mysql",
      type: "database",
      price: 150,
      resources: { cpu: 4, ram: 8, storage: 120 },
      discount: null,
    },
  ],
  pg: [
    {
      id: "db-s-1vcpu-1gb",
      name: "Starter",
      sub: "postgresql",
      type: "database",
      price: 15,
      resources: { cpu: 1, ram: 1, storage: 15 },
      discount: null,
    },
    {
      id: "db-s-1vcpu-2gb",
      name: "Basic",
      sub: "postgresql",
      type: "database",
      price: 35,
      resources: { cpu: 1, ram: 2, storage: 34 },
      discount: null,
    },
    {
      id: "db-s-2vcpu-4gb",
      name: "Professional",
      sub: "postgresql",
      type: "database",
      price: 75,
      resources: { cpu: 2, ram: 4, storage: 56 },
      discount: null,
    },
    {
      id: "db-s-4vcpu-8gb",
      name: "Business",
      sub: "postgresql",
      type: "database",
      price: 150,
      resources: { cpu: 4, ram: 8, storage: 120 },
      discount: null,
    },
  ],
  mongodb: [
    {
      id: "db-s-1vcpu-1gb",
      name: "Starter",
      sub: "mysql",
      type: "database",
      price: 15,
      resources: { cpu: 1, ram: 1, storage: 15 },
      discount: null,
    },
    {
      id: "db-s-1vcpu-2gb",
      name: "Basic",
      sub: "mysql",
      type: "database",
      price: 35,
      resources: { cpu: 1, ram: 2, storage: 34 },
      discount: null,
    },
    {
      id: "db-s-2vcpu-4gb",
      name: "Professional",
      sub: "mysql",
      type: "database",
      price: 75,
      resources: { cpu: 2, ram: 4, storage: 56 },
      discount: null,
    },
    {
      id: "db-s-4vcpu-8gb",
      name: "Business",
      sub: "mysql",
      type: "database",
      price: 150,
      resources: { cpu: 4, ram: 8, storage: 120 },
      discount: null,
    },
  ],
  redis: [
    {
      id: "db-s-1vcpu-1gb",
      name: "Starter",
      sub: "mysql",
      type: "database",
      price: 15,
      resources: { cpu: 1, ram: 1, storage: 15 },
      discount: null,
    },
    {
      id: "db-s-1vcpu-2gb",
      name: "Basic",
      sub: "mysql",
      type: "database",
      price: 35,
      resources: { cpu: 1, ram: 2, storage: 34 },
      discount: null,
    },
    {
      id: "db-s-2vcpu-4gb",
      name: "Professional",
      sub: "mysql",
      type: "database",
      price: 75,
      resources: { cpu: 2, ram: 4, storage: 56 },
      discount: null,
    },
    {
      id: "db-s-4vcpu-8gb",
      name: "Business",
      sub: "mysql",
      type: "database",
      price: 150,
      resources: { cpu: 4, ram: 8, storage: 120 },
      discount: null,
    },
  ],
  mariadb: [
    {
      id: "db-s-1vcpu-1gb",
      name: "Starter",
      sub: "mysql",
      type: "database",
      price: 15,
      resources: { cpu: 1, ram: 1, storage: 15 },
      discount: null,
    },
    {
      id: "db-s-1vcpu-2gb",
      name: "Basic",
      sub: "mysql",
      type: "database",
      price: 35,
      resources: { cpu: 1, ram: 2, storage: 34 },
      discount: null,
    },
    {
      id: "db-s-2vcpu-4gb",
      name: "Professional",
      sub: "mysql",
      type: "database",
      price: 75,
      resources: { cpu: 2, ram: 4, storage: 56 },
      discount: null,
    },
    {
      id: "db-s-4vcpu-8gb",
      name: "Business",
      sub: "mysql",
      type: "database",
      price: 150,
      resources: { cpu: 4, ram: 8, storage: 120 },
      discount: null,
    },
  ],
  kafka: [
    {
      id: "db-s-1vcpu-1gb",
      name: "Starter",
      sub: "mysql",
      type: "database",
      price: 15,
      resources: { cpu: 1, ram: 1, storage: 15 },
      discount: null,
    },
    {
      id: "db-s-1vcpu-2gb",
      name: "Basic",
      sub: "mysql",
      type: "database",
      price: 35,
      resources: { cpu: 1, ram: 2, storage: 34 },
      discount: null,
    },
    {
      id: "db-s-2vcpu-4gb",
      name: "Professional",
      sub: "mysql",
      type: "database",
      price: 75,
      resources: { cpu: 2, ram: 4, storage: 56 },
      discount: null,
    },
    {
      id: "db-s-4vcpu-8gb",
      name: "Business",
      sub: "mysql",
      type: "database",
      price: 150,
      resources: { cpu: 4, ram: 8, storage: 120 },
      discount: null,
    },
  ],
};

const DatabaseSelect = ({ products, locations, projects, userId }: PageProps) => {
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [currentStep, setCurrentStep] = useState<number>(1);
  const [termsAccepted, setTermsAccepted] = useState<boolean>(false);
  const [availablePlans, setAvailablePlans] = useState<Tables<"products">[]>(
    []
  );

  const [state, setState] = useState({
    selectedDb: "", // Selected database product
    selectedName: "", // Cluster name
    selectedVersion: "", // Selected version
    selectedLocation: "", // Selected location
    selectedDbType: "", // Selected database type (mysql, mongodb, etc.)
    versions: [] as string[], // Available versions
    selectedNode: "",
    selectedProject: "",
  });

  const router = useRouter();

  // Filter products when database type changes
  useEffect(() => {
    if (state.selectedDbType) {
      let filteredProducts = products.filter(
        (product) => product.sub === state.selectedDbType
      );

      // Use sample plans if no products available
      if (filteredProducts.length === 0) {
        const samplePlans =
          sampleDatabasePlans[
            state.selectedDbType as keyof typeof sampleDatabasePlans
          ];
        if (samplePlans) {
          filteredProducts = samplePlans as any;
        }
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
    // if (currentStep === 3 && !state.selectedNode) {
    //   toast.error("Please select a number of nodes");
    //   return;
    // }
    if (currentStep === 3 && state.selectedNode.length > 2) {
      toast.error(
        "Please select valid number of nodes.It should be less than 100"
      );
      return;
    }

    if (currentStep === 4 && !state.selectedDbType) {
      toast.error("Please select a database type");
      return;
    }

    if (currentStep === 5 && !state.selectedDb) {
      toast.error("Please select a database plan");
      return;
    }

    if (currentStep === 6 && !state.selectedVersion) {
      toast.error("Please select a database version");
      return;
    }
    if (currentStep === 7 && !state.selectedProject) {
      toast.error("Please select a project");
      return;
    }

    if (currentStep < 8) {
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
       debugger
      setIsLoading(true);
      if (
        !state.selectedDb ||
        !state.selectedName ||
        !state.selectedVersion ||
        !state.selectedLocation ||
        !state.selectedDbType ||
       // !state.selectedNode||
        !state.selectedProject
      ) {
        toast.error("Please fill in all the required fields");
        return;
      }

      const sendPayload = {
        name: state.selectedName,
        engine: state.selectedDbType,
        version: state.selectedVersion,
        num_nodes: 1,
        size: state.selectedDb,
        region: state.selectedLocation,
        project_id: selectedProject,
        owner_id: userId,
      };
      const response = await api.post("/services/database/create", sendPayload);
      if (response.status === 200) {
        toast.success(
          response.data.message || "Database created successfully!"
        );
        router.push(
          `/dashboard/services/database/clusters/${response.data.data.cluster_id}`
        );
      }
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
    selectedNode,
    selectedProject
  } = state;

  const selectedDatabase = products?.find((db) => db.id === selectedDb);
  const selectedLocationData = locations?.find(
    (location) => location.short === selectedLocation
  );

  const steps = [
    { id: 1, name: "Name" },
    { id: 2, name: "Location" },
    // { id: 3, name: "Nodes" },
    { id: 3, name: "Type" },
    { id: 4, name: "Plan" },
    { id: 5, name: "Config" },
    { id: 6, name: "Project" },
    { id: 7, name: "Review" },
  ];

  // Use predefined database types
  const dbTypes = Object.keys(databaseInfo);

  return (
    <div className="py-4">
      <div className="mb-8">
        <div className="flex justify-between mb-2">
           {steps.map((step, index) => (
            <div
              key={step.id}
              className="flex-1 min-w-0 flex flex-col items-center"
            >
              {/* Number/Circle and connecting lines */}
              <div className="flex items-center w-full">
                {/* {index > 0 && (
        <div
          className={`basis-0 flex-1 h-0.5 transition-colors duration-300 ${
            currentStep >= step.id ? "bg-blue-600" : "bg-white/10"
          }`}
        />
      )} */}

                <div className="flex flex-col items-center min-w-0">
                  <div
                    className={`shrink-0 rounded-full flex items-center justify-center transition-colors duration-300
                      w-6 h-6 sm:w-7 sm:h-7 md:w-8 md:h-8 ${
                        currentStep > step.id
                          ? "bg-blue-600 text-white"
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

                  {/* Tag Name */}
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

                {index < steps.length - 1 && (
                  <div
                    className={`basis-0 flex-1 h-0.5 transition-colors duration-300 ${
                      currentStep > step.id ? "bg-blue-600" : "bg-white/10"
                    }`}
                  />
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-6">
          {currentStep === 1 && (
            <Card className="bg-white/5 border-white/10">
              <CardHeader>
                <CardTitle className="text-white">
                  Database Cluster Name
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Input
                  value={selectedName}
                  onChange={(e) =>
                    setState({ ...state, selectedName: e.target.value })
                  }
                  type="text"
                  placeholder="my-production-db"
                  className="bg-white/10 border-white/20 rounded-md text-white placeholder:text-white/50"
                />
              </CardContent>
              <CardFooter className="flex justify-end">
                <Button
                  onClick={handleNextStep}
                  className="bg-white text-black rounded-md hover:bg-gray-200"
                >
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
                  onValueChange={(value) =>
                    setState({ ...state, selectedLocation: value })
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

          {/* {currentStep === 3 && (
            <Card className="bg-white/5 border-white/10">
              <CardHeader>
                <CardTitle className="text-white"> Nodes</CardTitle>
              </CardHeader>
              <CardContent>
                <Input
                  value={selectedNode}
                  onChange={(e) =>
                    setState({ ...state, selectedNode: e.target.value })
                  }
                  type="number"
                  placeholder="number of nodes"
                  className="bg-white/10 border-white/20 rounded-md text-white placeholder:text-white/50"
                />
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
          )} */}

          {currentStep === 3 && (
            <Card className="bg-white/5 border-white/10">
              <CardHeader>
                <CardTitle className="text-white">Database Type</CardTitle>
              </CardHeader>
              <CardContent>
                <RadioGroup
                  value={selectedDbType}
                  onValueChange={handleDbTypeChange}
                  className="grid grid-cols-1 sm:grid-cols-2 gap-4"
                >
                  {dbTypes.map((dbType) => {
                    const info =
                      databaseInfo[dbType as keyof typeof databaseInfo];
                    let planCount = products.filter(
                      (p) => p.sub === dbType
                    ).length;
                    // Use sample plan count if no products
                    if (planCount === 0) {
                      const samplePlans =
                        sampleDatabasePlans[
                          dbType as keyof typeof sampleDatabasePlans
                        ];
                      planCount = samplePlans ? samplePlans.length : 0;
                    }
                    return (
                      <div key={dbType}>
                        <RadioGroupItem
                          value={dbType}
                          id={`type-${dbType}`}
                          className="peer sr-only"
                        />
                        <Label
                          htmlFor={`type-${dbType}`}
                          className="flex items-start gap-3 bg-white/10 rounded-md border-2 border-transparent cursor-pointer p-4 transition-all peer-data-[state=checked]:border-blue-500 hover:bg-white/15"
                        >
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
                            <p className="font-semibold text-white">
                              {info.name}
                            </p>
                            <p className="text-xs text-white/60 mt-1">
                              {info.description}
                            </p>
                          </div>
                          {planCount > 0 && (
                            <Badge
                              variant="outline"
                              className="ml-auto text-white/70"
                            >
                              {planCount} plans
                            </Badge>
                          )}
                        </Label>
                      </div>
                    );
                  })}
                </RadioGroup>
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

          {currentStep === 4 && (
            <Card className="bg-white/5 border-white/10">
              <CardHeader>
                <CardTitle className="text-white">Database Plan</CardTitle>
              </CardHeader>
              <CardContent>
                <RadioGroup
                  value={selectedDb}
                  onValueChange={handleDbPlanChange}
                  className="grid grid-cols-1 gap-4"
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
                        className="block bg-white/10 rounded-lg border-2 border-transparent cursor-pointer p-5 transition-all peer-data-[state=checked]:border-blue-500 hover:bg-white/15"
                      >
                        <div className="flex justify-between items-start mb-4">
                          <div>
                            <p className="font-bold text-lg text-white">
                              {database.name}
                            </p>
                            {database.discount &&
                              Number(database.discount) > 0 && (
                                <Badge
                                  variant="outline"
                                  className="text-green-400 bg-green-500/10 border-green-500/30 mt-2"
                                >
                                  Save {database.discount}%
                                </Badge>
                              )}
                          </div>
                          <div className="text-right">
                            {database.price === 0 || database.price === null ? (
                              <div>
                                <span className="text-2xl font-bold text-white">
                                  Free
                                </span>
                              </div>
                            ) : database.discount ? (
                              <div>
                                <span className="line-through text-sm text-white/40">
                                  ${database.price}
                                </span>
                                <div className="text-2xl font-bold text-white">
                                  $
                                  {(
                                    database.price! *
                                    (1 - Number(database.discount) / 100)
                                  ).toFixed(0)}
                                  <span className="text-sm font-normal text-white/60">
                                    /mo
                                  </span>
                                </div>
                              </div>
                            ) : (
                              <div className="text-2xl font-bold text-white">
                                ${database.price}
                                <span className="text-sm font-normal text-white/60">
                                  /mo
                                </span>
                              </div>
                            )}
                          </div>
                        </div>
                        {database.resources && (
                          <div className="grid grid-cols-3 gap-3 pt-4 border-t border-white/10">
                            <div>
                              <div className="flex items-center gap-2 mb-1">
                                <Cpu className="w-4 h-4 text-blue-400" />
                                <span className="text-xs text-white/60">
                                  CPU
                                </span>
                              </div>
                              <p className="font-semibold text-white">
                                {
                                  (
                                    database.resources as {
                                      cpu: number;
                                      ram: number;
                                      storage: number;
                                    }
                                  ).cpu
                                }{" "}
                                vCPU
                              </p>
                            </div>
                            <div>
                              <div className="flex items-center gap-2 mb-1">
                                <Server className="w-4 h-4 text-green-400" />
                                <span className="text-xs text-white/60">
                                  RAM
                                </span>
                              </div>
                              <p className="font-semibold text-white">
                                {
                                  (
                                    database.resources as {
                                      cpu: number;
                                      ram: number;
                                      storage: number;
                                    }
                                  ).ram
                                }{" "}
                                GB
                              </p>
                            </div>
                            <div>
                              <div className="flex items-center gap-2 mb-1">
                                <HardDrive className="w-4 h-4 text-purple-400" />
                                <span className="text-xs text-white/60">
                                  Storage
                                </span>
                              </div>
                              <p className="font-semibold text-white">
                                {
                                  (
                                    database.resources as {
                                      cpu: number;
                                      ram: number;
                                      storage: number;
                                    }
                                  ).storage
                                }{" "}
                                GB
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

          {currentStep === 5 && selectedDb && (
            <Card className="bg-white/5 border-white/10">
              <CardHeader>
                <CardTitle className="text-white">Configuration</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div>
                  <Label htmlFor="version" className="mb-2 block text-white">
                    Database Version
                  </Label>
                  <Select
                    value={selectedVersion}
                    onValueChange={(value) =>
                      setState({ ...state, selectedVersion: value })
                    }
                  >
                    <SelectTrigger
                      id="version"
                      className="w-full bg-white/10 border-white/20 rounded-md text-white"
                    >
                      <SelectValue placeholder="Select version" />
                    </SelectTrigger>
                    <SelectContent className="bg-black border-white/20 text-white">
                      {versions.map((version) => (
                        <SelectItem key={version} value={version}>
                          v{version}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
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


           {currentStep === 6 && (
            <Card className="bg-white/5 border-white/10">
              <CardHeader>
                <CardTitle className="text-white">Project</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div>
                  <Label htmlFor="project" className="mb-2 block text-white">
                    Select Project
                  </Label>
                  <Select
                    value={selectedProject}
                    onValueChange={(value) =>
                      setState({ ...state, selectedProject: value })
                    }
                  >
                    <SelectTrigger
                      id="project"
                      className="w-full bg-white/10 border-white/20 rounded-md text-white"
                    >
                      <SelectValue placeholder="Select project" />
                    </SelectTrigger>
                    <SelectContent className="bg-black border-white/20 text-white">
                      {projects.map((project) => (
                        <SelectItem key={project.id} value={project.id}>
                          {project.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
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

          {currentStep === 7 && (
            <Card className="bg-white/5 border-white/10">
              <CardHeader>
                <CardTitle className="text-white">Review & Payment</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="terms"
                    checked={termsAccepted}
                    onCheckedChange={(checked) =>
                      setTermsAccepted(checked === true)
                    }
                    className="rounded-sm"
                  />
                  <label
                    htmlFor="terms"
                    className="text-sm leading-none text-white"
                  >
                    I accept the{" "}
                    <Link
                      href="/terms"
                      className="text-blue-400 hover:underline"
                    >
                      Terms of Service
                    </Link>{" "}
                    and{" "}
                    <Link
                      href="/privacy"
                      className="text-blue-400 hover:underline"
                    >
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
                  className="rounded-md border-white/20 text-dark hover:bg-white/10"
                >
                  Back
                </Button>
                <Button
                  onClick={onSubmit}
                  size="lg"
                  disabled={isLoading || !termsAccepted}
                  className="bg-white text-black rounded-md hover:bg-gray-200 w-full sm:w-auto"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin mr-2" />
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

        <div className="lg:col-span-1">
          <Card className="sticky top-8 bg-white/5 border-white/10">
            <CardHeader>
              <CardTitle className="text-white">Order Summary</CardTitle>
              {selectedDbType && (
                <div className="mt-4 p-4 bg-white/5 rounded-lg flex justify-center">
                  <Image
                    src={
                      databaseInfo[selectedDbType as keyof typeof databaseInfo]
                        ?.icon || ""
                    }
                    alt={
                      databaseInfo[selectedDbType as keyof typeof databaseInfo]
                        ?.name || selectedDbType
                    }
                    width={60}
                    height={60}
                    className="object-contain"
                  />
                </div>
              )}
            </CardHeader>
            <CardContent className="space-y-4">
              {selectedName && (
                <div className="flex justify-between items-center">
                  <span className="text-sm text-white/60">Name:</span>
                  <span className="font-medium text-white">{selectedName}</span>
                </div>
              )}
              {selectedDbType && (
                <div className="flex justify-between items-center">
                  <span className="text-sm text-white/60">Type:</span>
                  <div className="flex items-center gap-2">
                    <Image
                      src={
                        databaseInfo[
                          selectedDbType as keyof typeof databaseInfo
                        ]?.icon || ""
                      }
                      alt={
                        databaseInfo[
                          selectedDbType as keyof typeof databaseInfo
                        ]?.name || selectedDbType
                      }
                      width={20}
                      height={20}
                      className="object-contain"
                    />
                    <span className="font-medium text-white">
                      {databaseInfo[selectedDbType as keyof typeof databaseInfo]
                        ?.name || selectedDbType}
                    </span>
                  </div>
                </div>
              )}
              {selectedNode && (
                <div className="flex justify-between items-center">
                  <span className="text-sm text-white/60">Node:</span>
                  <span className="font-medium text-white">{selectedNode}</span>
                </div>
              )}
              {selectedDatabase && (
                <div className="flex justify-between items-center">
                  <span className="text-sm text-white/60">Plan:</span>
                  <span className="font-medium text-white">
                    {selectedDatabase.name}
                  </span>
                </div>
              )}
              {selectedVersion && (
                <div className="flex justify-between items-center">
                  <span className="text-sm text-white/60">Version:</span>
                  <span className="font-medium text-white">
                    v{selectedVersion}
                  </span>
                </div>
              )}
              {selectedLocationData && (
                <div className="flex justify-between items-center">
                  <span className="text-sm text-white/60">Location:</span>
                  <div className="flex items-center gap-2">
                    <Image
                      src={`https://flagsapi.com/${selectedLocationData.country_code}/flat/64.png`}
                      alt={selectedLocationData.city}
                      width={16}
                      height={12}
                      className="rounded-sm"
                    />
                    <span className="font-medium text-white">
                      {selectedLocationData.city}
                    </span>
                  </div>
                </div>
              )}
              <Separator className="bg-white/10" />
              <div className="flex justify-between items-center font-bold text-lg text-white">
                <span>Total</span>
                <span>
                  {selectedDatabase
                    ? selectedDatabase.price === 0 ||
                      selectedDatabase.price === null
                      ? "Free"
                      : selectedDatabase.discount &&
                          Number(selectedDatabase.discount) > 0
                        ? `${formatPrice(selectedDatabase.price! * (1 - Number(selectedDatabase.discount) / 100))}/mo`
                        : `${formatPrice(selectedDatabase.price!)}/mo`
                    : "-"}
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
