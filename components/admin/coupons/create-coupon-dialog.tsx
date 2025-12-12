"use client";

import { useState } from "react";
import { z } from "zod";
import { toast } from "sonner";
import api from "@/lib/axios/axios";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";

const couponSchema = z.object({
  code: z.string().min(3, "Code must be at least 3 characters").max(50),
  amount: z.number().min(0.01, "Amount must be greater than 0"),
  valid_till: z.string().min(1, "Valid till date is required"),
  coupon_type: z.string().min(1, "Coupon type is required"),
  max_redemptions: z.number().nullable(),
});

interface Coupon {
  id: string;
  code: string;
  amount: number;
  redeem_by: Array<{ email: string; redeemed_at: string }>;
  valid_till: string;
  coupon_type: string;
  max_redemptions: number | null;
  is_active: boolean;
  created_at: string;
  redemption_count?: number;
}

interface CreateCouponDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCouponCreated: (coupon: Coupon) => void;
}

export default function CreateCouponDialog({
  open,
  onOpenChange,
  onCouponCreated,
}: CreateCouponDialogProps) {
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    code: "",
    amount: "",
    valid_till: "",
    coupon_type: "one-time",
    max_redemptions: "",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const data = {
      code: formData.code.toUpperCase().trim(),
      amount: parseFloat(formData.amount),
      valid_till: new Date(formData.valid_till).toISOString(),
      coupon_type: formData.coupon_type,
      max_redemptions: formData.max_redemptions
        ? parseInt(formData.max_redemptions)
        : null,
    };

    const validation = couponSchema.safeParse(data);
    if (!validation.success) {
      toast.error(validation.error.errors[0].message);
      return;
    }

    try {
      setLoading(true);
      const res = await api.post("/admin/coupons", data);

      if (res.data.success) {
        toast.success("Coupon created successfully!");
        onCouponCreated(res.data.data);
        onOpenChange(false);
        setFormData({
          code: "",
          amount: "",
          valid_till: "",
          coupon_type: "one-time",
          max_redemptions: "",
        });
      } else {
        toast.error(res.data.error || "Failed to create coupon");
      }
    } catch (error: unknown) {
      console.error("Error creating coupon:", error);
      toast.error((error as { response?: { data?: { error?: string } } }).response?.data?.error || "Failed to create coupon");
    } finally {
      setLoading(false);
    }
  };

  const getTomorrowDate = () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    return tomorrow.toISOString().split('T')[0];
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-neutral-900 border-white/10 text-white max-w-md">
        <DialogHeader>
          <DialogTitle>Create New Coupon</DialogTitle>
          <DialogDescription className="text-neutral-400">
            Add a new promotional coupon code
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 mt-4">
          <div className="space-y-2">
            <Label htmlFor="code">Coupon Code</Label>
            <Input
              id="code"
              value={formData.code}
              onChange={(e) =>
                setFormData({ ...formData, code: e.target.value.toUpperCase() })
              }
              placeholder="e.g., WELCOME2024"
              className="bg-black/40 border-white/10 text-white placeholder:text-neutral-500"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="amount">Amount ($)</Label>
            <Input
              id="amount"
              type="number"
              step="0.01"
              min="0.01"
              value={formData.amount}
              onChange={(e) =>
                setFormData({ ...formData, amount: e.target.value })
              }
              placeholder="e.g., 10.00"
              className="bg-black/40 border-white/10 text-white placeholder:text-neutral-500"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="coupon_type">Coupon Type</Label>
            <Select
              value={formData.coupon_type}
              onValueChange={(value) =>
                setFormData({ ...formData, coupon_type: value })
              }
            >
              <SelectTrigger className="bg-black/40 border-white/10 text-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-neutral-900 border-white/10">
                <SelectItem value="one-time">One-Time Use</SelectItem>
                {/* <SelectItem value="multi-use">Multi-Use</SelectItem> */}
                <SelectItem value="limited">Limited Use</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="valid_till">Valid Until</Label>
            <Input
              id="valid_till"
              type="date"
              min={getTomorrowDate()}
              value={formData.valid_till}
              onChange={(e) =>
                setFormData({ ...formData, valid_till: e.target.value })
              }
              className="bg-black/40 border-white/10 text-white"
              required
            />
          </div>

          {formData.coupon_type === "limited" && (
            <div className="space-y-2">
              <Label htmlFor="max_redemptions">Max Redemptions</Label>
              <Input
                id="max_redemptions"
                type="number"
                min="1"
                value={formData.max_redemptions}
                onChange={(e) =>
                  setFormData({ ...formData, max_redemptions: e.target.value })
                }
                placeholder="e.g., 100"
                className="bg-black/40 border-white/10 text-white placeholder:text-neutral-500"
              />
            </div>
          )}

          <div className="flex gap-3 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="flex-1 border-white/10 text-white hover:bg-white/5"
              disabled={loading}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              className="flex-1 bg-gradient-to-r from-blue-600 to-purple-600 text-white hover:from-blue-700 hover:to-purple-700"
              disabled={loading}
            >
              {loading ? "Creating..." : "Create Coupon"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
