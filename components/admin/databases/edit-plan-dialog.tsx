"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { X, Save, Loader2, Server } from "lucide-react";
import { Tables } from "@/lib/supabase/types";
import { toast } from "sonner";
import api from "@/lib/axios/axios";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { getErrorMessage } from "@/config/functions";

interface EditPlanDialogProps {
  product: Tables<"products"> | null;
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

export default function EditPlanDialog({
  product,
  isOpen,
  onClose,
  onSuccess,
}: EditPlanDialogProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [loadingSizes, setLoadingSizes] = useState(false);
  const [doSizes, setDoSizes] = useState<{ [engine: string]: SizesByType }>({});
  const [selectedCpuType, setSelectedCpuType] = useState<'basic' | 'general_purpose' | 'storage_optimized'>('basic');
  const [showSizeSelector, setShowSizeSelector] = useState(false);
  
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
      if (response.data.success) {
        setDoSizes(response.data.data.sizesByType);
      }
    } catch (error) {
      console.error("Error fetching DO sizes:", error);
    } finally {
      setLoadingSizes(false);
    }
  };

  // Initialize form when product changes
  useEffect(() => {
    if (product) {
      const cpuType = (product as { cpu_type?: string }).cpu_type as 'basic' | 'general_purpose' | 'storage_optimized' || 'basic';
      setFormData({
        name: product.name || "",
        description: product.description || "",
        sub: product.sub || "mysql",
        slug: product.slug || "",
        cpu_type: cpuType,
        cpu: product.resources?.cpu || 1,
        ram: product.resources?.ram || 1,
        storage: product.resources?.storage || 15,
        price: product.price || 15.0,
        fixed_price: (product as { fixed_price?: number }).fixed_price || 0,
        discount: product.discount || 0,
      });
      setSelectedCpuType(cpuType);
      setShowSizeSelector(false);
    }
  }, [product]);

  const handleSizeSelect = (size: DOSize) => {
    setFormData({
      ...formData,
      slug: size.slug,
      cpu_type: size.cpu_type,
      cpu: size.cpu,
      ram: size.ram,
    });
    setShowSizeSelector(false);
  };

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

    if (formData.storage <= 0) {
      toast.error("Storage must be greater than 0");
      return;
    }

    setIsLoading(true);
    try {
      const response = await api.put("/admin/products", {
        id: product.id,
        name: formData.name,
        description: formData.description || null,
        slug: formData.slug,
        cpu_type: formData.cpu_type,
        price: formData.price,
        fixed_price: formData.fixed_price ?? 0,
        resources: {
          cpu: formData.cpu,
          ram: formData.ram,
          storage: formData.storage,
        },
        discount: formData.discount > 0 ? formData.discount : null,
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

  const cpuTypeLabels = {
    basic: 'Basic (Shared CPU)',
    general_purpose: 'General Purpose (Dedicated CPU)',
    storage_optimized: 'Storage Optimized',
  };

  if (!isOpen || !product) return null;

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
          {/* Fixed Price */}

          <form onSubmit={handleSubmit} className="p-6 space-y-6">
            {/* Plan Name */}
            <div className="space-y-2">
              <Label
                htmlFor="name"
                className="text-sm font-medium text-neutral-300"
              >
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
                className="bg-neutral-800 border-neutral-700 text-white placeholder:text-neutral-500 focus:border-blue-500 focus:ring-blue-500"
              />
            </div>

            {/* Description */}
            <div className="space-y-2">
              <Label
                htmlFor="description"
                className="text-sm font-medium text-neutral-300"
              >
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

            {/* Database Type (Read-only) */}
            <div className="space-y-2">
              <Label className="text-sm font-medium text-neutral-300">
                Database Type
              </Label>
              <div className="px-4 py-3 bg-neutral-800/50 border border-neutral-700 rounded-lg text-neutral-400 text-sm">
                {DB_TYPES.find((t) => t.value === formData.sub)?.label ||
                  formData.sub}
                <span className="ml-2 text-xs text-neutral-500">
                  (Cannot be changed)
                </span>
              </div>
            </div>

            {/* Current Size Display / Size Selector */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-white">Database Size</h3>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setShowSizeSelector(!showSizeSelector)}
                  className="text-xs bg-neutral-800 border-neutral-700 hover:bg-neutral-700"
                >
                  {showSizeSelector ? 'Cancel' : 'Change Size'}
                </Button>
              </div>

              {/* Current Size Info */}
              {formData.slug && !showSizeSelector && (
                <div className="p-3 bg-neutral-800 rounded-lg border border-neutral-700">
                  <p className="text-xs text-neutral-400">Current Size:</p>
                  <p className="text-sm text-white font-medium">{formData.slug}</p>
                  <p className="text-xs text-neutral-500 mt-1">
                    {formData.cpu} vCPU, {formData.ram} GB RAM, {cpuTypeLabels[formData.cpu_type]}
                  </p>
                </div>
              )}

              {/* Size Selector */}
              {showSizeSelector && (
                loadingSizes ? (
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
                        className="data-[state=active]:bg-blue-600 data-[state=active]:text-white"
                      >
                        Basic
                      </TabsTrigger>
                      <TabsTrigger 
                        value="general_purpose"
                        className="data-[state=active]:bg-blue-600 data-[state=active]:text-white"
                      >
                        General Purpose
                      </TabsTrigger>
                      <TabsTrigger 
                        value="storage_optimized"
                        className="data-[state=active]:bg-blue-600 data-[state=active]:text-white"
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
                                    ? "border-blue-500 bg-blue-500/10"
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
                )
              )}
            </div>

            {/* Storage (editable) */}
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
                className="bg-neutral-800 border-neutral-700 text-white focus:border-blue-500 focus:ring-blue-500"
              />
            </div>

            {/* Pricing */}
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-white">Pricing</h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Price */}
                <div className="space-y-2">
                  <Label
                    htmlFor="price"
                    className="text-sm font-medium text-neutral-300"
                  >
                    Price ($) *
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

                {/* Discount */}
                <div className="space-y-2">
                  <Label
                    htmlFor="discount"
                    className="text-sm font-medium text-neutral-300"
                  >
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
            </div>

            <div className="space-y-2">
              <Label
                htmlFor="fixed_price"
                className="text-sm font-medium text-neutral-300"
              >
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

            <div className="space-y-2">
              <Label
                htmlFor="discount"
                className="text-sm font-medium text-neutral-300"
              >
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

            {/* Action Buttons */}
            <div className="flex gap-3 pt-4 border-t border-neutral-800">
              <Button
                type="button"
                onClick={onClose}
                disabled={isLoading}
                variant="outline"
                className="cursor-pointer flex-1 bg-neutral-800 hover:bg-neutral-700 text-white border-neutral-700"
              >
                <X className="h-4 w-4 mr-2" />
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={isLoading}
                className="cursor-pointer flex-1 bg-blue-600 hover:bg-blue-700 text-white"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Save className="h-4 w-4 mr-2" />
                    Save Changes
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
