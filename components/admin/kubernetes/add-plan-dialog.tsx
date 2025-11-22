"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { X, Plus, Loader2 } from "lucide-react";
import { toast } from "sonner";
import api from "@/lib/axios/axios";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { getErrorMessage } from "@/config/functions";

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
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    cpu: 2,
    ram: 4,
    storage: 50,
    price: 25.0,
    discount: 0,
  });

  const resetForm = () => {
    setFormData({
      name: "",
      description: "",
      cpu: 2,
      ram: 4,
      storage: 50,
      price: 25.0,
      discount: 0,
    });
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
      const response = await api.post("/admin/products", {
        name: formData.name,
        description: formData.description || null,
        type: "kubernetes",
        sub: "kubernetes",
        price: formData.price,
        resources: {
          cpu: formData.cpu,
          ram: formData.ram,
          storage: formData.storage,
        },
        discount: formData.discount > 0 ? formData.discount : null,
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
                    className="bg-neutral-800 border-neutral-700 text-white focus:border-green-500 focus:ring-green-500"
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
                    className="bg-neutral-800 border-neutral-700 text-white focus:border-green-500 focus:ring-green-500"
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
                    className="bg-neutral-800 border-neutral-700 text-white focus:border-green-500 focus:ring-green-500"
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
                    className="bg-neutral-800 border-neutral-700 text-white focus:border-green-500 focus:ring-green-500"
                  />
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
                disabled={isLoading}
                className="cursor-pointer bg-green-600 hover:bg-green-700 text-white"
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
