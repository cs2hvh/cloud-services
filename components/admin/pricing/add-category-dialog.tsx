"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
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
import { toast } from "sonner";
import api from "@/lib/axios/axios";

interface AddCategoryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export default function AddCategoryDialog({
  open,
  onOpenChange,
  onSuccess,
}: AddCategoryDialogProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    label: "",
    slug: "",
    description: "",
    starting_price_label: "",
    starting_price_description: "",
    sort_order: 0,
    active: true,
  });

  const handleLabelChange = (value: string) => {
    setFormData((prev) => ({
      ...prev,
      label: value,
      // Auto-generate slug from label if slug is empty or was auto-generated
      slug: prev.slug === "" || prev.slug === generateSlug(prev.label)
        ? generateSlug(value)
        : prev.slug,
    }));
  };

  const generateSlug = (text: string) => {
    return text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  };

  const handleSubmit = async () => {
    if (!formData.label.trim()) {
      toast.error("Label is required");
      return;
    }
    if (!formData.slug.trim()) {
      toast.error("Slug is required");
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await api.post("/admin/pricing/categories", formData);

      if (response.status === 201) {
        toast.success("Category created successfully");
        onOpenChange(false);
        onSuccess();
        // Reset form
        setFormData({
          label: "",
          slug: "",
          description: "",
          starting_price_label: "",
          starting_price_description: "",
          sort_order: 0,
          active: true,
        });
      }
    } catch (error: unknown) {
      console.error("Error creating category:", error);
      toast.error(
        (error as { response?: { data?: { error?: string } } }).response?.data?.error ||
        "Failed to create category"
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-neutral-900 border-neutral-800 max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-white">New Pricing Category</DialogTitle>
          <DialogDescription className="text-neutral-400">
            Create a new pricing category for the pricing page.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-neutral-300">Label *</Label>
              <Input
                value={formData.label}
                onChange={(e) => handleLabelChange(e.target.value)}
                placeholder="e.g., Compute"
                className="bg-neutral-800 border-neutral-700 text-white"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-neutral-300">Slug *</Label>
              <Input
                value={formData.slug}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, slug: e.target.value }))
                }
                placeholder="e.g., compute"
                className="bg-neutral-800 border-neutral-700 text-white"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-neutral-300">Description</Label>
            <Textarea
              value={formData.description}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, description: e.target.value }))
              }
              placeholder="Brief description of this category..."
              className="bg-neutral-800 border-neutral-700 text-white min-h-[80px]"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-neutral-300">Starting Price Label</Label>
              <Input
                value={formData.starting_price_label}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    starting_price_label: e.target.value,
                  }))
                }
                placeholder="e.g., Starting at $9/mo"
                className="bg-neutral-800 border-neutral-700 text-white"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-neutral-300">Sort Order</Label>
              <Input
                type="number"
                value={formData.sort_order}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    sort_order: parseInt(e.target.value) || 0,
                  }))
                }
                className="bg-neutral-800 border-neutral-700 text-white"
              />
            </div>
          </div>

          <div className="flex items-center justify-between py-2">
            <div>
              <Label className="text-neutral-300">Active</Label>
              <p className="text-xs text-neutral-500">
                Show this category on the pricing page
              </p>
            </div>
            <Switch
              checked={formData.active}
              onCheckedChange={(checked) =>
                setFormData((prev) => ({ ...prev, active: checked }))
              }
            />
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
            className="cursor-pointer bg-green-600 hover:bg-green-700 text-white"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Creating...
              </>
            ) : (
              "Create Category"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
