"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { X, Plus, Loader2, Server, Cpu, HardDrive, DollarSign } from "lucide-react";
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

interface AddPlanDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export default function AddPlanDialog({
  isOpen,
  onClose,
  onSuccess,
}: AddPlanDialogProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingDroplets, setIsLoadingDroplets] = useState(false);
  const [dropletSizes, setDropletSizes] = useState<DropletSize[]>([]);
  const [selectedDroplet, setSelectedDroplet] = useState<string>("");
  
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
      if (response.status === 200 && response.data.sizes) {
        setDropletSizes(response.data.sizes);
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
        ram: Math.round(droplet.memory / 1024), // Convert MB to GB
        storage: droplet.disk,
        price: droplet.price_monthly,
        slug: droplet.slug,
      });
    }
  };

  const resetForm = () => {
    setFormData({
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
    setSelectedDroplet("");
  };

  const handleClose = () => {
    if (!isLoading) {
      resetForm();
      onClose();
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validation
    if (!formData.name.trim()) {
      toast.error("Plan name is required");
      return;
    }

    if (!selectedDroplet) {
      toast.error("Please select a droplet size");
      return;
    }

    if (formData.price <= 0) {
      toast.error("Price must be greater than 0");
      return;
    }

    setIsLoading(true);
    try {
      const response = await api.post("/admin/products", {
        name: formData.name,
        description: formData.description || null,
        type: "kubernetes",
        sub: "kubernetes",
        price: formData.price,
        fixed_price: formData.fixed_price ?? 0,
        resources: {
          cpu: formData.cpu,
          ram: formData.ram,
          storage: formData.storage,
        },
        discount: formData.discount > 0 ? formData.discount : null,
        slug: formData.slug,
      });

      if (response.status === 201) {
        toast.success("Plan created successfully");
        resetForm();
        onSuccess();
        onClose();
      }
    } catch (error) {
      console.error("Error creating plan:", error);
      toast.error(getErrorMessage(error, "Failed to create plan"));
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  const selectedDropletData = dropletSizes.find((d) => d.slug === selectedDroplet);

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4"
        onClick={handleClose}
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
              <div className="p-2 bg-green-500/20 rounded-lg">
                <Plus className="h-5 w-5 text-green-400" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-white">
                  Create New Plan
                </h2>
                <p className="text-sm text-neutral-400">
                  Add a new Kubernetes plan
                </p>
              </div>
            </div>
            <button
              onClick={handleClose}
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
                className="bg-neutral-800 border-neutral-700 text-white placeholder:text-neutral-500 focus:border-green-500 focus:ring-green-500"
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
                className="w-full px-4 py-3 bg-neutral-800 border border-neutral-700 rounded-lg text-white placeholder:text-neutral-500 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent disabled:opacity-50 resize-none"
              />
            </div>

            {/* Droplet Size Selection */}
            <div className="space-y-2">
              <Label htmlFor="droplet" className="text-sm font-medium text-neutral-300">
                Droplet Size *
              </Label>
              <Select
                value={selectedDroplet}
                onValueChange={handleDropletChange}
                disabled={isLoading || isLoadingDroplets}
              >
                <SelectTrigger className="bg-neutral-800 border-neutral-700 text-white focus:border-green-500 focus:ring-green-500">
                  <SelectValue placeholder={isLoadingDroplets ? "Loading droplets..." : "Select a droplet size"} />
                </SelectTrigger>
                <SelectContent className="bg-neutral-800 border-neutral-700">
                  {dropletSizes.map((droplet) => (
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
                        <span className="text-xs text-green-400 font-semibold">
                          ${droplet.price_monthly}/mo
                        </span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Droplet Details (if selected) */}
            {selectedDropletData && (
              <div className="p-4 bg-neutral-800/50 rounded-lg border border-neutral-700 space-y-3">
                <h4 className="text-sm font-semibold text-white flex items-center gap-2">
                  <Server className="h-4 w-4 text-green-400" />
                  Droplet Details
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
                    <span className="text-sm font-semibold text-green-400">
                      ${selectedDropletData.price_monthly}
                    </span>
                  </div>
                </div>
                <p className="text-xs text-neutral-400 italic">
                  {selectedDropletData.description}
                </p>
              </div>
            )}

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
                    className="bg-neutral-800 border-neutral-700 text-white focus:border-green-500 focus:ring-green-500"
                  />
                  <p className="text-xs text-neutral-500">
                    You can customize the price (DigitalOcean base: ${selectedDropletData?.price_monthly || "N/A"})
                  </p>
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
                    className="bg-neutral-800 border-neutral-700 text-white focus:border-green-500 focus:ring-green-500"
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
                  className="bg-neutral-800 border-neutral-700 text-white focus:border-green-500 focus:ring-green-500"
                />
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center justify-end gap-3 pt-4 border-t border-neutral-800">
              <Button
                type="button"
                onClick={handleClose}
                disabled={isLoading}
                variant="ghost"
                className="cursor-pointer bg-neutral-800 hover:bg-neutral-700 text-white"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={isLoading || !selectedDroplet}
                className="cursor-pointer bg-green-600 hover:bg-green-700 text-white disabled:opacity-50"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Creating...
                  </>
                ) : (
                  <>
                    <Plus className="h-4 w-4 mr-2" />
                    Create Plan
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
