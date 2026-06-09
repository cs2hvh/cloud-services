"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { X, Plus, Loader2, Server } from "lucide-react";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getErrorMessage } from "@/config/functions";

interface AddPlanDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

const DB_TYPES = [
  { value: "mysql", label: "MySQL" },
  { value: "pg", label: "PostgreSQL" },
  { value: "mongodb", label: "MongoDB" },
];

interface DOSize {
  slug: string;
  cpu_type: 'basic' | 'general_purpose' | 'storage_optimized';
  cpu: number;
  ram: number;
  display_name: string;
  num_nodes: number;
}

interface SizesByType {
  basic: DOSize[];
  general_purpose: DOSize[];
  storage_optimized: DOSize[];
}

interface DOOptionsResponse {
  success: boolean;
  data: {
    sizesByType: {
      [engine: string]: SizesByType;
    };
  };
}

export default function AddPlanDialog({
  isOpen,
  onClose,
  onSuccess,
}: AddPlanDialogProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [loadingSizes, setLoadingSizes] = useState(false);
  const [doSizes, setDoSizes] = useState<{ [engine: string]: SizesByType }>({});
  const [selectedCpuType, setSelectedCpuType] = useState<'basic' | 'general_purpose' | 'storage_optimized'>('basic');
  
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    sub: "mysql",
    slug: "",
    cpu_type: "basic" as 'basic' | 'general_purpose' | 'storage_optimized',
    cpu: 1,
    ram: 1,
    storage: 15,
    price: 15.0,
    fixed_price: 0,
    discount: 0,
  });

  // Fetch DO sizes when dialog opens
  useEffect(() => {
    if (isOpen) {
      fetchDOSizes();
    }
  }, [isOpen]);

  const fetchDOSizes = async () => {
    setLoadingSizes(true);
    try {
      const response = await api.get<DOOptionsResponse>("/admin/database-options");
      if (response?.data?.success) {
        setDoSizes(response?.data?.data?.sizesByType ?? {});
      }
    } catch (error) {
      console.error("Error fetching DO sizes:", error);
      toast.error("Failed to load database sizes");
    } finally {
      setLoadingSizes(false);
    }
  };

  const resetForm = () => {
    setFormData({
      name: "",
      description: "",
      sub: "mysql",
      slug: "",
      cpu_type: "basic",
      cpu: 1,
      ram: 1,
      storage: 15,
      price: 15.0,
      fixed_price: 0,
      discount: 0,
    });
    setSelectedCpuType('basic');
  };

  const handleClose = () => {
    if (!isLoading) {
      resetForm();
      onClose();
    }
  };

  const handleSizeSelect = (size: DOSize) => {
    setFormData({
      ...formData,
      slug: size.slug,
      cpu_type: size.cpu_type,
      cpu: size.cpu,
      ram: size.ram,
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validation
    if (!formData.name.trim()) {
      toast.error("Plan name is required");
      return;
    }

    if (!formData.slug) {
      toast.error("Please select a database size");
      return;
    }

    if (formData.price <= 0) {
      toast.error("Price must be greater than 0");
      return;
    }

    if (formData.storage <= 0) {
      toast.error("Storage must be greater than 0");
      return;
    }

    setIsLoading(true);
    try {
      const response = await api.post("/admin/products", {
        name: formData.name,
        description: formData.description || null,
        type: "database",
        sub: formData.sub,
        slug: formData.slug,
        cpu_type: formData.cpu_type,
        price: formData.price,
        fixed_price: formData.fixed_price ?? 0,
        resources: {
          cpu: formData.cpu,
          ram: formData.ram,
          storage: formData.storage,
        },
        discount: formData.discount ?? 0,
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

  const cpuTypeLabels = {
    basic: 'Basic (Shared CPU)',
    general_purpose: 'General Purpose (Dedicated CPU)',
    storage_optimized: 'Storage Optimized',
  };

  if (!isOpen) return null;

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
          className="bg-neutral-900 rounded-2xl border border-neutral-800 shadow-2xl max-w-3xl w-full max-h-[90vh] overflow-y-auto"
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
                  Add a new database plan
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
                placeholder="e.g., Professional"
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

            {/* Database Type */}
            <div className="space-y-2">
              <Label className="text-sm font-medium text-neutral-300">
                Database Type *
              </Label>
              <Select
                value={formData.sub}
                onValueChange={(value) => {
                  setFormData({ ...formData, sub: value, slug: "", cpu: 1, ram: 1 });
                }}
                disabled={isLoading}
              >
                <SelectTrigger className="bg-neutral-800 border-neutral-700 text-white focus:ring-green-500">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-neutral-900 border-neutral-800">
                  {DB_TYPES.map((type) => (
                    <SelectItem
                      key={type.value}
                      value={type.value}
                      className="text-white focus:bg-neutral-800 focus:text-white"
                    >
                      {type.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Database Size Selection */}
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-white">Database Size (from DigitalOcean) *</h3>
              
              {loadingSizes ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-neutral-400" />
                  <span className="ml-2 text-neutral-400">Loading sizes...</span>
                </div>
              ) : (
                <Tabs 
                  value={selectedCpuType} 
                  onValueChange={(value) => setSelectedCpuType(value as typeof selectedCpuType)}
                  className="w-full"
                >
                  <TabsList className="grid w-full grid-cols-3 bg-neutral-800">
                    <TabsTrigger 
                      value="basic" 
                      className="data-[state=active]:bg-green-600 data-[state=active]:text-white"
                    >
                      Basic
                    </TabsTrigger>
                    <TabsTrigger 
                      value="general_purpose"
                      className="data-[state=active]:bg-green-600 data-[state=active]:text-white"
                    >
                      General Purpose
                    </TabsTrigger>
                    <TabsTrigger 
                      value="storage_optimized"
                      className="data-[state=active]:bg-green-600 data-[state=active]:text-white"
                    >
                      Storage Optimized
                    </TabsTrigger>
                  </TabsList>
                  
                  {(['basic', 'general_purpose', 'storage_optimized'] as const).map((cpuType) => (
                    <TabsContent key={cpuType} value={cpuType} className="mt-4">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-48 overflow-y-auto pr-2">
                        {(doSizes[formData.sub]?.[cpuType] || []).length === 0 ? (
                          <p className="text-neutral-500 text-sm col-span-2 py-4 text-center">
                            No sizes available for this CPU type
                          </p>
                        ) : (
                          (doSizes[formData.sub]?.[cpuType] || []).map((size) => (
                            <div
                              key={size.slug}
                              onClick={() => handleSizeSelect(size)}
                              className={`p-3 rounded-lg border cursor-pointer transition-all ${
                                formData.slug === size.slug
                                  ? "border-green-500 bg-green-500/10"
                                  : "border-neutral-700 bg-neutral-800 hover:border-neutral-600"
                              }`}
                            >
                              <div className="flex items-center gap-2">
                                <Server className="h-4 w-4 text-neutral-400" />
                                <span className="text-sm font-medium text-white">
                                  {size.cpu} vCPU / {size.ram} GB RAM
                                </span>
                              </div>
                              <p className="text-xs text-neutral-500 mt-1 truncate">
                                {size.slug}
                              </p>
                            </div>
                          ))
                        )}
                      </div>
                    </TabsContent>
                  ))}
                </Tabs>
              )}

              {formData.slug && (
                <div className="p-3 bg-neutral-800 rounded-lg border border-neutral-700">
                  <p className="text-xs text-neutral-400">Selected Size:</p>
                  <p className="text-sm text-white font-medium">{formData.slug}</p>
                  <p className="text-xs text-neutral-500 mt-1">
                    {formData.cpu} vCPU, {formData.ram} GB RAM, {cpuTypeLabels[formData.cpu_type]}
                  </p>
                </div>
              )}
            </div>

            {/* Storage (user can customize) */}
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
                    storage: parseInt(e.target.value) || 15,
                  })
                }
                disabled={isLoading}
                className="bg-neutral-800 border-neutral-700 text-white focus:border-green-500 focus:ring-green-500"
              />
              <p className="text-xs text-neutral-500">
                Set the storage allocation for this plan
              </p>
            </div>

            {/* Pricing */}
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-white">Pricing</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
                      setFormData({ ...formData, price: parseFloat(e.target.value) || 0 })
                    }
                    disabled={isLoading}
                    className="bg-neutral-800 border-neutral-700 text-white focus:border-green-500 focus:ring-green-500"
                  />
                </div>
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
                      setFormData({ ...formData, fixed_price: parseFloat(e.target.value) || 0 })
                    }
                    disabled={isLoading}
                    className="bg-neutral-800 border-neutral-700 text-white focus:border-green-500 focus:ring-green-500"
                  />
                </div>
              </div>
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
                    setFormData({ ...formData, discount: parseInt(e.target.value) || 0 })
                  }
                  disabled={isLoading}
                  className="bg-neutral-800 border-neutral-700 text-white focus:border-green-500 focus:ring-green-500"
                />
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-3 pt-4 border-t border-neutral-800">
              <Button
                type="button"
                onClick={handleClose}
                disabled={isLoading}
                variant="outline"
                className="cursor-pointer flex-1 bg-neutral-800 hover:bg-neutral-700 text-white border-neutral-700"
              >
                <X className="h-4 w-4 mr-2" />
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={isLoading || !formData.slug}
                className="cursor-pointer flex-1 bg-green-600 hover:bg-green-700 text-white disabled:opacity-50"
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
