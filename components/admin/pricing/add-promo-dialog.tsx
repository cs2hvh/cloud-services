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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tables } from "@/lib/supabase/types";
import { toast } from "sonner";
import api from "@/lib/axios/axios";

interface AddPromoDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categories: Tables<"pricing_categories">[];
  onSuccess: () => void;
}

export default function AddPromoDialog({
  open,
  onOpenChange,
  categories,
  onSuccess,
}: AddPromoDialogProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    category_slug: "",
    badge: "",
    badge_note: "",
    title: "",
    description: "",
    subtext: "",
    price_old: "",
    price_current: "",
    link_text: "Learn More",
    link_href: "/contact",
    sort_order: 0,
    active: true,
  });

  const handleSubmit = async () => {
    if (!formData.category_slug) {
      toast.error("Category is required");
      return;
    }
    if (!formData.badge.trim()) {
      toast.error("Badge is required");
      return;
    }
    if (!formData.title.trim()) {
      toast.error("Title is required");
      return;
    }
    if (!formData.description.trim()) {
      toast.error("Description is required");
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await api.post("/admin/pricing/promos", formData);

      if (response.status === 201) {
        toast.success("Promo created successfully");
        onOpenChange(false);
        onSuccess();
        // Reset form
        setFormData({
          category_slug: "",
          badge: "",
          badge_note: "",
          title: "",
          description: "",
          subtext: "",
          price_old: "",
          price_current: "",
          link_text: "Learn More",
          link_href: "/contact",
          sort_order: 0,
          active: true,
        });
      }
    } catch (error: unknown) {
      console.error("Error creating promo:", error);
      toast.error(
        (error as { response?: { data?: { error?: string } } }).response?.data?.error ||
        "Failed to create promo"
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-neutral-900 border-neutral-800 max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-white">New Promo</DialogTitle>
          <DialogDescription className="text-neutral-400">
            Create a promotional banner for the pricing page.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label className="text-neutral-300">Category *</Label>
            <Select
              value={formData.category_slug}
              onValueChange={(value) =>
                setFormData((prev) => ({ ...prev, category_slug: value }))
              }
            >
              <SelectTrigger className="cursor-pointer bg-neutral-800 border-neutral-700 text-white">
                <SelectValue placeholder="Select a category" />
              </SelectTrigger>
              <SelectContent className="bg-neutral-900 border-neutral-800">
                {categories.map((cat) => (
                  <SelectItem
                    key={cat.slug}
                    value={cat.slug}
                    className="cursor-pointer text-white focus:bg-neutral-800 focus:text-white"
                  >
                    {cat.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-neutral-300">Badge *</Label>
              <Input
                value={formData.badge}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, badge: e.target.value }))
                }
                placeholder="e.g., Crypto Deal"
                className="bg-neutral-800 border-neutral-700 text-white"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-neutral-300">Badge Note</Label>
              <Input
                value={formData.badge_note}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, badge_note: e.target.value }))
                }
                placeholder="e.g., Limited-time"
                className="bg-neutral-800 border-neutral-700 text-white"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-neutral-300">Title *</Label>
            <Input
              value={formData.title}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, title: e.target.value }))
              }
              placeholder="Promo title..."
              className="bg-neutral-800 border-neutral-700 text-white"
            />
          </div>

          <div className="space-y-2">
            <Label className="text-neutral-300">Description *</Label>
            <Textarea
              value={formData.description}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, description: e.target.value }))
              }
              placeholder="Promo description..."
              className="bg-neutral-800 border-neutral-700 text-white min-h-[60px]"
            />
          </div>

          <div className="space-y-2">
            <Label className="text-neutral-300">Subtext</Label>
            <Input
              value={formData.subtext}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, subtext: e.target.value }))
              }
              placeholder="e.g., New purchases only. One promo per account."
              className="bg-neutral-800 border-neutral-700 text-white"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-neutral-300">Price (Old)</Label>
              <Input
                value={formData.price_old}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, price_old: e.target.value }))
                }
                placeholder="e.g., $499"
                className="bg-neutral-800 border-neutral-700 text-white"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-neutral-300">Price (Current)</Label>
              <Input
                value={formData.price_current}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, price_current: e.target.value }))
                }
                placeholder="e.g., $399"
                className="bg-neutral-800 border-neutral-700 text-white"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-neutral-300">Link Text</Label>
              <Input
                value={formData.link_text}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, link_text: e.target.value }))
                }
                placeholder="e.g., Learn More"
                className="bg-neutral-800 border-neutral-700 text-white"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-neutral-300">Link URL</Label>
              <Input
                value={formData.link_href}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, link_href: e.target.value }))
                }
                placeholder="e.g., /contact"
                className="bg-neutral-800 border-neutral-700 text-white"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
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
            <div className="flex items-center justify-between py-6">
              <div>
                <Label className="text-neutral-300">Active</Label>
              </div>
              <Switch
                checked={formData.active}
                onCheckedChange={(checked) =>
                  setFormData((prev) => ({ ...prev, active: checked }))
                }
              />
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
            className="cursor-pointer bg-green-600 hover:bg-green-700 text-white"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Creating...
              </>
            ) : (
              "Create Promo"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
