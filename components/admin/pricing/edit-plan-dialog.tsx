"use client";

import { useState, useEffect } from "react";
import { Loader2, Plus, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Tables } from "@/lib/supabase/types";
import { toast } from "sonner";
import api from "@/lib/axios/axios";

interface EditPlanDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  product: Tables<"products"> | null;
  onSuccess: () => void;
}

const PRODUCT_TYPES = [
  { value: "compute", label: "Compute" },
  { value: "gpu", label: "GPU" },
  { value: "object-storage", label: "Object Storage" },
  { value: "database", label: "Database" },
  { value: "security", label: "Security" },
  { value: "kubernetes", label: "Kubernetes" },
  { value: "ai-deployment", label: "AI Deployment" },
  { value: "app-deployment", label: "App Deployment" },
  { value: "network-ddos", label: "Network/DDoS" },
];

export default function EditPlanDialog({
  open,
  onOpenChange,
  product,
  onSuccess,
}: EditPlanDialogProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [newSpec, setNewSpec] = useState("");
  const [newFeature, setNewFeature] = useState("");
  
  const [formData, setFormData] = useState({
    name: "",
    type: "",
    sub: "",
    description: "",
    short_description: "",
    price: 0,
    yearly_price: 0,
    billing_period: "per month",
    resources: { cpu: 0, ram: 0, storage: 0 },
    specs: [] as string[],
    features: [] as string[],
    summary: {
      billing: "Monthly",
      support: "Standard",
      provisioning: "Instant",
      guarantee: "60 Days",
      buttonText: "Get Started",
    },
    is_featured: false,
    is_highlighted: false,
    cta_text: "Get Started",
    cta_link: "/signup",
    sort_order: 0,
  });

  useEffect(() => {
    if (product) {
      setFormData({
        name: product.name || "",
        type: product.type || "",
        sub: product.sub || "",
        description: product.description || "",
        short_description: product.short_description || "",
        price: product.price || 0,
        yearly_price: product.yearly_price || 0,
        billing_period: product.billing_period || "per month",
        resources: product.resources || { cpu: 0, ram: 0, storage: 0 },
        specs: product.specs || [],
        features: product.features || [],
        summary: product.summary || {
          billing: "Monthly",
          support: "Standard",
          provisioning: "Instant",
          guarantee: "60 Days",
          buttonText: "Get Started",
        },
        is_featured: product.is_featured || false,
        is_highlighted: product.is_highlighted || false,
        cta_text: product.cta_text || "Get Started",
        cta_link: product.cta_link || "/signup",
        sort_order: product.sort_order || 0,
      });
    }
  }, [product]);

  const addSpec = () => {
    if (newSpec.trim() && !formData.specs.includes(newSpec.trim())) {
      setFormData((prev) => ({
        ...prev,
        specs: [...prev.specs, newSpec.trim()],
      }));
      setNewSpec("");
    }
  };

  const removeSpec = (spec: string) => {
    setFormData((prev) => ({
      ...prev,
      specs: prev.specs.filter((s) => s !== spec),
    }));
  };

  const addFeature = () => {
    if (newFeature.trim() && !formData.features.includes(newFeature.trim())) {
      setFormData((prev) => ({
        ...prev,
        features: [...prev.features, newFeature.trim()],
      }));
      setNewFeature("");
    }
  };

  const removeFeature = (feature: string) => {
    setFormData((prev) => ({
      ...prev,
      features: prev.features.filter((f) => f !== feature),
    }));
  };

  const handleSubmit = async () => {
    if (!product) return;

    if (!formData.name.trim()) {
      toast.error("Name is required");
      return;
    }
    if (!formData.type) {
      toast.error("Type is required");
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await api.put("/admin/products", {
        id: product.id,
        ...formData,
      });

      if (response.status === 200) {
        toast.success("Plan updated successfully");
        onOpenChange(false);
        onSuccess();
      }
    } catch (error: unknown) {
      console.error("Error updating plan:", error);
      toast.error(
        (error as { response?: { data?: { error?: string } } }).response?.data?.error ||
        "Failed to update plan"
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-neutral-900 border-neutral-800 max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-white">Edit Plan</DialogTitle>
          <DialogDescription className="text-neutral-400">
            Update the pricing tier details.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Basic Info */}
          <div className="space-y-4">
            <h3 className="text-sm font-medium text-neutral-300 border-b border-neutral-800 pb-2">
              Basic Information
            </h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-neutral-300">Name *</Label>
                <Input
                  value={formData.name}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, name: e.target.value }))
                  }
                  placeholder="e.g., Professional"
                  className="bg-neutral-800 border-neutral-700 text-white"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-neutral-300">Type *</Label>
                <Select
                  value={formData.type}
                  onValueChange={(value) =>
                    setFormData((prev) => ({ ...prev, type: value }))
                  }
                >
                  <SelectTrigger className="cursor-pointer bg-neutral-800 border-neutral-700 text-white">
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                  <SelectContent className="bg-neutral-900 border-neutral-800">
                    {PRODUCT_TYPES.map((type) => (
                      <SelectItem
                        key={type.value}
                        value={type.value}
                        className="cursor-pointer text-white focus:bg-neutral-800 focus:text-white"
                      >
                        {type.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-neutral-300">Short Description</Label>
              <Input
                value={formData.short_description}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, short_description: e.target.value }))
                }
                placeholder="Brief tagline..."
                className="bg-neutral-800 border-neutral-700 text-white"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-neutral-300">Description</Label>
              <Textarea
                value={formData.description}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, description: e.target.value }))
                }
                placeholder="Full description..."
                className="bg-neutral-800 border-neutral-700 text-white min-h-[60px]"
              />
            </div>
          </div>

          {/* Pricing */}
          <div className="space-y-4">
            <h3 className="text-sm font-medium text-neutral-300 border-b border-neutral-800 pb-2">
              Pricing
            </h3>
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label className="text-neutral-300">Monthly Price *</Label>
                <Input
                  type="number"
                  value={formData.price}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, price: parseFloat(e.target.value) || 0 }))
                  }
                  className="bg-neutral-800 border-neutral-700 text-white"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-neutral-300">Yearly Price</Label>
                <Input
                  type="number"
                  value={formData.yearly_price}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, yearly_price: parseFloat(e.target.value) || 0 }))
                  }
                  className="bg-neutral-800 border-neutral-700 text-white"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-neutral-300">Billing Period</Label>
                <Input
                  value={formData.billing_period}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, billing_period: e.target.value }))
                  }
                  placeholder="e.g., per month"
                  className="bg-neutral-800 border-neutral-700 text-white"
                />
              </div>
            </div>
          </div>

          {/* Resources */}
          <div className="space-y-4">
            <h3 className="text-sm font-medium text-neutral-300 border-b border-neutral-800 pb-2">
              Resources
            </h3>
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label className="text-neutral-300">CPU (vCPU)</Label>
                <Input
                  type="number"
                  value={formData.resources.cpu}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      resources: { ...prev.resources, cpu: parseInt(e.target.value) || 0 },
                    }))
                  }
                  className="bg-neutral-800 border-neutral-700 text-white"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-neutral-300">RAM (GB)</Label>
                <Input
                  type="number"
                  value={formData.resources.ram}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      resources: { ...prev.resources, ram: parseInt(e.target.value) || 0 },
                    }))
                  }
                  className="bg-neutral-800 border-neutral-700 text-white"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-neutral-300">Storage (GB)</Label>
                <Input
                  type="number"
                  value={formData.resources.storage}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      resources: { ...prev.resources, storage: parseInt(e.target.value) || 0 },
                    }))
                  }
                  className="bg-neutral-800 border-neutral-700 text-white"
                />
              </div>
            </div>
          </div>

          {/* Specs */}
          <div className="space-y-4">
            <h3 className="text-sm font-medium text-neutral-300 border-b border-neutral-800 pb-2">
              Specs (displayed on pricing card)
            </h3>
            <div className="flex gap-2">
              <Input
                value={newSpec}
                onChange={(e) => setNewSpec(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addSpec())}
                placeholder="e.g., 8 vCPU"
                className="bg-neutral-800 border-neutral-700 text-white"
              />
              <Button onClick={addSpec} variant="outline" className="cursor-pointer bg-neutral-800 border-neutral-700 text-white">
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            <div className="flex flex-wrap gap-2">
              {formData.specs.map((spec) => (
                <Badge key={spec} className="bg-neutral-700 text-white">
                  {spec}
                  <button onClick={() => removeSpec(spec)} className="ml-1">
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
            </div>
          </div>

          {/* Features */}
          <div className="space-y-4">
            <h3 className="text-sm font-medium text-neutral-300 border-b border-neutral-800 pb-2">
              Features
            </h3>
            <div className="flex gap-2">
              <Input
                value={newFeature}
                onChange={(e) => setNewFeature(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addFeature())}
                placeholder="e.g., Root access"
                className="bg-neutral-800 border-neutral-700 text-white"
              />
              <Button onClick={addFeature} variant="outline" className="cursor-pointer bg-neutral-800 border-neutral-700 text-white">
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            <div className="flex flex-wrap gap-2">
              {formData.features.map((feature) => (
                <Badge key={feature} className="bg-neutral-700 text-white">
                  {feature}
                  <button onClick={() => removeFeature(feature)} className="ml-1">
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
            </div>
          </div>

          {/* CTA & Display */}
          <div className="space-y-4">
            <h3 className="text-sm font-medium text-neutral-300 border-b border-neutral-800 pb-2">
              Call to Action & Display
            </h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-neutral-300">CTA Text</Label>
                <Input
                  value={formData.cta_text}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, cta_text: e.target.value }))
                  }
                  placeholder="e.g., Get Started"
                  className="bg-neutral-800 border-neutral-700 text-white"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-neutral-300">CTA Link</Label>
                <Input
                  value={formData.cta_link}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, cta_link: e.target.value }))
                  }
                  placeholder="e.g., /signup"
                  className="bg-neutral-800 border-neutral-700 text-white"
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label className="text-neutral-300">Sort Order</Label>
                <Input
                  type="number"
                  value={formData.sort_order}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, sort_order: parseInt(e.target.value) || 0 }))
                  }
                  className="bg-neutral-800 border-neutral-700 text-white"
                />
              </div>
              <div className="flex items-center justify-between py-6">
                <Label className="text-neutral-300">Featured</Label>
                <Switch
                  checked={formData.is_featured}
                  onCheckedChange={(checked) =>
                    setFormData((prev) => ({ ...prev, is_featured: checked }))
                  }
                />
              </div>
              <div className="flex items-center justify-between py-6">
                <Label className="text-neutral-300">Highlighted</Label>
                <Switch
                  checked={formData.is_highlighted}
                  onCheckedChange={(checked) =>
                    setFormData((prev) => ({ ...prev, is_highlighted: checked }))
                  }
                />
              </div>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="cursor-pointer bg-neutral-800 border-neutral-700 text-white hover:bg-neutral-700 hover:text-white"
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={isSubmitting}
            className="cursor-pointer bg-blue-600 hover:bg-blue-700 text-white"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : (
              "Save Changes"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
