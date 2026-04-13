"use client";

import { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "motion/react";
import { X, Save, Loader2, Package, Server, Cpu, HardDrive, DollarSign } from "lucide-react";
import { Tables } from "@/lib/supabase/types";
import { toast } from "sonner";
import api from "@/lib/axios/axios";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getErrorMessage } from "@/config/functions";

interface DropletSize {
  slug: string;
  memory: number;
  vcpus: number;
  disk: number;
  transfer: number;
  price_monthly: number;
  price_hourly: number;
  regions: string[];
  available: boolean;
  description: string;
}

type K8sCpuType = "shared" | "dedicated" | "gpu";

const K8S_CPU_META: Record<K8sCpuType, { label: string; description: string }> = {
  shared: {
    label: "Shared CPU",
    description: "Cost-effective shared vCPU plans for development, staging, and lighter workloads.",
  },
  dedicated: {
    label: "Dedicated CPU",
    description: "Dedicated vCPU plans for production traffic requiring consistent performance.",
  },
  gpu: {
    label: "GPU",
    description: "GPU-accelerated instances for AI/ML, rendering, and compute-heavy tasks.",
  },
};

const MACHINE_TYPES: Record<K8sCpuType, { value: string; label: string }[]> = {
  shared: [
    { value: "basic", label: "Basic" },
    { value: "premium-intel", label: "Premium Intel" },
    { value: "premium-amd", label: "Premium AMD" },
  ],
  dedicated: [
    { value: "general-purpose", label: "General Purpose" },
    { value: "cpu-optimized", label: "CPU-Optimized" },
    { value: "memory-optimized", label: "Memory-Optimized" },
    { value: "storage-optimized", label: "Storage-Optimized" },
  ],
  gpu: [
    { value: "gpu", label: "GPU Droplet" },
  ],
};

function inferSlugCategory(slug: string): { cpuType: K8sCpuType; machineType: string } {
  if (slug.startsWith("gpu-")) return { cpuType: "gpu", machineType: "gpu" };
  if (slug.startsWith("g-") || slug.startsWith("gd-")) return { cpuType: "dedicated", machineType: "general-purpose" };
  if (slug.startsWith("c-") || slug.startsWith("c2-")) return { cpuType: "dedicated", machineType: "cpu-optimized" };
  if (slug.startsWith("m-") || slug.startsWith("m3-") || slug.startsWith("m6-")) return { cpuType: "dedicated", machineType: "memory-optimized" };
  if (slug.startsWith("so-") || slug.startsWith("so1_5-")) return { cpuType: "dedicated", machineType: "storage-optimized" };
  if (slug.startsWith("s-")) {
    if (slug.endsWith("-intel")) return { cpuType: "shared", machineType: "premium-intel" };
    if (slug.endsWith("-amd")) return { cpuType: "shared", machineType: "premium-amd" };
    return { cpuType: "shared", machineType: "basic" };
  }
  return { cpuType: "shared", machineType: "basic" };
}

interface EditPlanDialogProps {
  product: Tables<"products"> | null;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export default function EditPlanDialog({
  product,
  isOpen,
  onClose,
  onSuccess,
}: EditPlanDialogProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingDroplets, setIsLoadingDroplets] = useState(false);
  const [dropletSizes, setDropletSizes] = useState<DropletSize[]>([]);
  const [selectedDroplet, setSelectedDroplet] = useState<string>("");
  const [selectedCpuType, setSelectedCpuType] = useState<K8sCpuType>("shared");
  const [selectedMachineType, setSelectedMachineType] = useState<string>("basic");
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    cpu: 2,
    ram: 4,
    storage: 50,
    price: 25.0,
    fixed_price: 0,
    discount: 0,
    slug: "",
  });

  // Fetch droplet sizes when dialog opens
  useEffect(() => {
    if (isOpen) {
      fetchDropletSizes();
    }
  }, [isOpen]);

  const fetchDropletSizes = async () => {
    setIsLoadingDroplets(true);
    try {
      const response = await api.get("/digitalocean/sizes?kubernetes=true");
      if (response.status === 200 && response?.data?.sizes) {
        setDropletSizes(response?.data?.sizes ?? []);
      }
    } catch (error) {
      console.error("Error fetching droplet sizes:", error);
      toast.error("Failed to load droplet sizes");
    } finally {
      setIsLoadingDroplets(false);
    }
  };

  const handleDropletChange = (slug: string) => {
    setSelectedDroplet(slug);
    const droplet = dropletSizes.find((d) => d.slug === slug);
    
    if (droplet) {
      setFormData({
        ...formData,
        cpu: droplet.vcpus,
        ram: Math.round(droplet.memory / 1024),
        storage: droplet.disk,
        price: droplet.price_monthly,
        slug: droplet.slug,
      });
    }
  };

  // Filter droplets based on selected cpu type and machine type
  const filteredDroplets = useMemo(() => {
    return dropletSizes.filter((d) => {
      const { cpuType, machineType } = inferSlugCategory(d.slug);
      return cpuType === selectedCpuType && machineType === selectedMachineType;
    });
  }, [dropletSizes, selectedCpuType, selectedMachineType]);

  // Initialize form when product changes
  useEffect(() => {
    if (product) {
      const productCpuType = (product as { cpu_type?: string }).cpu_type as K8sCpuType | undefined;
      const productMachineType = (product as { machine_type?: string }).machine_type;

      setFormData({
        name: product.name || "",
        description: product.description || "",
        cpu: product.resources?.cpu || 2,
        ram: product.resources?.ram || 4,
        storage: product.resources?.storage || 50,
        price: product.price || 25.0,
        fixed_price: (product as { fixed_price?: number }).fixed_price || 0,
        discount: product.discount || 0,
        slug: (product as { slug?: string }).slug || "",
      });
      setSelectedDroplet((product as { slug?: string }).slug || "");

      // Set cpu_type and machine_type from product, or infer from slug
      if (productCpuType && ["shared", "dedicated", "gpu"].includes(productCpuType)) {
        setSelectedCpuType(productCpuType);
        setSelectedMachineType(productMachineType || MACHINE_TYPES[productCpuType]?.[0]?.value || "basic");
      } else {
        const slug = (product as { slug?: string }).slug || "";
        if (slug) {
          const inferred = inferSlugCategory(slug);
          setSelectedCpuType(inferred.cpuType);
          setSelectedMachineType(inferred.machineType);
        } else {
          setSelectedCpuType("shared");
          setSelectedMachineType("basic");
        }
      }
    }
  }, [product]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!product) return;

    // Validation
    if (!formData.name.trim()) {
      toast.error("Plan name is required");
      return;
    }

    if (formData.price <= 0) {
      toast.error("Price must be greater than 0");
      return;
    }

    if (formData.cpu <= 0 || formData.ram <= 0 || formData.storage <= 0) {
      toast.error("Resources must be greater than 0");
      return;
    }

    setIsLoading(true);
    try {
      const response = await api.put("/admin/products", {
        id: product.id,
        name: formData.name,
        description: formData.description || null,
        price: formData.price,
        fixed_price: formData.fixed_price ?? 0,
        resources: {
          cpu: formData.cpu,
          ram: formData.ram,
          storage: formData.storage,
        },
        discount: formData.discount > 0 ? formData.discount : 0,
        slug: formData.slug || null,
        cpu_type: selectedCpuType,
        machine_type: selectedMachineType,
      });

      if (response.status === 200) {
        toast.success("Plan updated successfully");
        onSuccess();
        onClose();
      }
    } catch (error) {
      console.error("Error updating plan:", error);
      toast.error(getErrorMessage(error, "Failed to update plan"));
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen || !product) return null;

  const selectedDropletData = dropletSizes.find((d) => d.slug === selectedDroplet);

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4"
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.95, opacity: 0 }}
          onClick={(e) => e.stopPropagation()}
          className="bg-neutral-900 rounded-2xl border border-neutral-800 shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto"
        >
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b border-neutral-800 sticky top-0 bg-neutral-900 z-10">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-500/20 rounded-lg">
                <Package className="h-5 w-5 text-blue-400" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-white">Edit Plan</h2>
                <p className="text-sm text-neutral-400">
                  Update Kubernetes plan details
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              disabled={isLoading}
              className="p-2 hover:bg-neutral-800 rounded-lg transition-colors disabled:opacity-50"
            >
              <X className="h-5 w-5 text-neutral-400" />
            </button>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="p-6 space-y-6">
            {/* Plan Name */}
            <div className="space-y-2">
              <Label htmlFor="name" className="text-sm font-medium text-neutral-300">
                Plan Name *
              </Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) =>
                  setFormData({ ...formData, name: e.target.value })
                }
                placeholder="e.g., Standard Kubernetes"
                disabled={isLoading}
                className="bg-neutral-800 border-neutral-700 text-white placeholder:text-neutral-500 focus:border-blue-500 focus:ring-blue-500"
              />
            </div>

            {/* Description */}
            <div className="space-y-2">
              <Label htmlFor="description" className="text-sm font-medium text-neutral-300">
                Description
              </Label>
              <textarea
                id="description"
                value={formData.description}
                onChange={(e) =>
                  setFormData({ ...formData, description: e.target.value })
                }
                placeholder="Brief description of the plan"
                rows={3}
                disabled={isLoading}
                className="w-full px-4 py-3 bg-neutral-800 border border-neutral-700 rounded-lg text-white placeholder:text-neutral-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50 resize-none"
              />
            </div>

            {/* CPU Type Tabs */}
            <div className="space-y-2">
              <Label className="text-sm font-medium text-neutral-300">
                CPU Type
              </Label>
              <Tabs
                value={selectedCpuType}
                onValueChange={(value) => {
                  const newCpuType = value as K8sCpuType;
                  setSelectedCpuType(newCpuType);
                  setSelectedMachineType(MACHINE_TYPES[newCpuType]?.[0]?.value || "basic");
                  setSelectedDroplet("");
                }}
                className="w-full"
              >
                <TabsList className="grid h-auto w-full grid-cols-3 bg-neutral-800 border border-neutral-700 p-1">
                  {(Object.keys(K8S_CPU_META) as K8sCpuType[]).map((type) => (
                    <TabsTrigger
                      key={type}
                      value={type}
                      className="px-3 py-2 text-xs data-[state=active]:bg-blue-600 data-[state=active]:text-white text-neutral-400"
                    >
                      {K8S_CPU_META[type].label}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </Tabs>
              <p className="text-xs text-neutral-500">
                {K8S_CPU_META[selectedCpuType].description}
              </p>
            </div>

            {/* Machine Type Selection */}
            <div className="space-y-2">
              <Label className="text-sm font-medium text-neutral-300">
                Machine Type
              </Label>
              <Select
                value={selectedMachineType}
                onValueChange={(value) => {
                  setSelectedMachineType(value);
                  setSelectedDroplet("");
                }}
                disabled={isLoading}
              >
                <SelectTrigger className="bg-neutral-800 border-neutral-700 text-white focus:border-blue-500 focus:ring-blue-500">
                  <SelectValue placeholder="Select machine type" />
                </SelectTrigger>
                <SelectContent className="bg-neutral-800 border-neutral-700">
                  {MACHINE_TYPES[selectedCpuType].map((mt) => (
                    <SelectItem
                      key={mt.value}
                      value={mt.value}
                      className="text-white hover:bg-neutral-700 focus:bg-neutral-700"
                    >
                      {mt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Droplet Size Selection */}
            <div className="space-y-2">
              <Label htmlFor="droplet" className="text-sm font-medium text-neutral-300">
                Droplet Size
              </Label>
              <Select
                value={selectedDroplet}
                onValueChange={handleDropletChange}
                disabled={isLoading || isLoadingDroplets}
              >
                <SelectTrigger className="bg-neutral-800 border-neutral-700 text-white focus:border-blue-500 focus:ring-blue-500">
                  <SelectValue placeholder={isLoadingDroplets ? "Loading droplets..." : filteredDroplets.length === 0 ? "No droplets for this category" : "Select a droplet size (optional)"} />
                </SelectTrigger>
                <SelectContent className="bg-neutral-800 border-neutral-700">
                  {filteredDroplets.map((droplet) => (
                    <SelectItem
                      key={droplet.slug}
                      value={droplet.slug}
                      className="text-white hover:bg-neutral-700 focus:bg-neutral-700"
                    >
                      <div className="flex items-center justify-between w-full gap-4">
                        <span className="font-medium">{droplet.slug}</span>
                        <span className="text-xs text-neutral-400">
                          {droplet.vcpus} vCPU • {Math.round(droplet.memory / 1024)}GB RAM • {droplet.disk}GB Disk
                        </span>
                        <span className="text-xs text-blue-400 font-semibold">
                          ${droplet.price_monthly}/mo
                        </span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-neutral-500">
                Change droplet to update resources automatically
              </p>
            </div>

            {/* Droplet Details (if selected) */}
            {selectedDropletData && (
              <div className="p-4 bg-neutral-800/50 rounded-lg border border-neutral-700 space-y-3">
                <h4 className="text-sm font-semibold text-white flex items-center gap-2">
                  <Server className="h-4 w-4 text-blue-400" />
                  Current Droplet Details
                </h4>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-1.5 text-neutral-400">
                      <Cpu className="h-3.5 w-3.5" />
                      <span className="text-xs">CPU</span>
                    </div>
                    <span className="text-sm font-semibold text-white">
                      {selectedDropletData.vcpus} vCPU
                    </span>
                  </div>
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-1.5 text-neutral-400">
                      <Server className="h-3.5 w-3.5" />
                      <span className="text-xs">RAM</span>
                    </div>
                    <span className="text-sm font-semibold text-white">
                      {Math.round(selectedDropletData.memory / 1024)} GB
                    </span>
                  </div>
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-1.5 text-neutral-400">
                      <HardDrive className="h-3.5 w-3.5" />
                      <span className="text-xs">Disk</span>
                    </div>
                    <span className="text-sm font-semibold text-white">
                      {selectedDropletData.disk} GB
                    </span>
                  </div>
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-1.5 text-neutral-400">
                      <DollarSign className="h-3.5 w-3.5" />
                      <span className="text-xs">DO Price</span>
                    </div>
                    <span className="text-sm font-semibold text-blue-400">
                      ${selectedDropletData.price_monthly}
                    </span>
                  </div>
                </div>
                <p className="text-xs text-neutral-400 italic">
                  {selectedDropletData.description}
                </p>
              </div>
            )}

            {/* Resources */}
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-white">Resources</h3>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {/* CPU */}
                <div className="space-y-2">
                  <Label htmlFor="cpu" className="text-sm font-medium text-neutral-300">
                    CPU (vCPU) *
                  </Label>
                  <Input
                    id="cpu"
                    type="number"
                    min="1"
                    step="1"
                    value={formData.cpu}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        cpu: parseInt(e.target.value) || 1,
                      })
                    }
                    disabled={isLoading}
                    className="bg-neutral-800 border-neutral-700 text-white focus:border-blue-500 focus:ring-blue-500"
                  />
                </div>

                {/* RAM */}
                <div className="space-y-2">
                  <Label htmlFor="ram" className="text-sm font-medium text-neutral-300">
                    RAM (GB) *
                  </Label>
                  <Input
                    id="ram"
                    type="number"
                    min="1"
                    step="1"
                    value={formData.ram}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        ram: parseInt(e.target.value) || 1,
                      })
                    }
                    disabled={isLoading}
                    className="bg-neutral-800 border-neutral-700 text-white focus:border-blue-500 focus:ring-blue-500"
                  />
                </div>

                {/* Storage */}
                <div className="space-y-2">
                  <Label htmlFor="storage" className="text-sm font-medium text-neutral-300">
                    Storage (GB) *
                  </Label>
                  <Input
                    id="storage"
                    type="number"
                    min="1"
                    step="1"
                    value={formData.storage}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        storage: parseInt(e.target.value) || 1,
                      })
                    }
                    disabled={isLoading}
                    className="bg-neutral-800 border-neutral-700 text-white focus:border-blue-500 focus:ring-blue-500"
                  />
                </div>
              </div>
            </div>

            {/* Pricing */}
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-white">Pricing</h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Price */}
                <div className="space-y-2">
                  <Label htmlFor="price" className="text-sm font-medium text-neutral-300">
                    Price (USD/month) *
                  </Label>
                  <Input
                    id="price"
                    type="number"
                    min="0"
                    step="0.01"
                    value={formData.price}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        price: parseFloat(e.target.value) || 0,
                      })
                    }
                    disabled={isLoading}
                    className="bg-neutral-800 border-neutral-700 text-white focus:border-blue-500 focus:ring-blue-500"
                  />
                </div>

                {/* Fixed Price */}
                <div className="space-y-2">
                  <Label htmlFor="fixed_price" className="text-sm font-medium text-neutral-300">
                    Fixed Price (USD)
                  </Label>
                  <Input
                    id="fixed_price"
                    type="number"
                    min="0"
                    step="0.01"
                    value={formData.fixed_price}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        fixed_price: parseFloat(e.target.value) || 0,
                      })
                    }
                    disabled={isLoading}
                    className="bg-neutral-800 border-neutral-700 text-white focus:border-blue-500 focus:ring-blue-500"
                  />
                </div>
              </div>

              {/* Discount */}
              <div className="space-y-2">
                <Label htmlFor="discount" className="text-sm font-medium text-neutral-300">
                  Discount (%)
                </Label>
                <Input
                  id="discount"
                  type="number"
                  min="0"
                  max="100"
                  step="1"
                  value={formData.discount}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      discount: parseInt(e.target.value) || 0,
                    })
                  }
                  disabled={isLoading}
                  className="bg-neutral-800 border-neutral-700 text-white focus:border-blue-500 focus:ring-blue-500"
                />
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center justify-end gap-3 pt-4 border-t border-neutral-800">
              <Button
                type="button"
                onClick={onClose}
                disabled={isLoading}
                variant="ghost"
                className="cursor-pointer bg-neutral-800 hover:bg-neutral-700 text-white"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={isLoading}
                className="cursor-pointer bg-blue-600 hover:bg-blue-700 text-white"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Updating...
                  </>
                ) : (
                  <>
                    <Save className="h-4 w-4 mr-2" />
                    Update Plan
                  </>
                )}
              </Button>
            </div>
          </form>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
