"use client";

import { useState, useEffect } from "react";
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
import { Switch } from "@/components/ui/switch";

const couponSchema = z.object({
  amount: z.number().min(0.01, "Amount must be greater than 0"),
  valid_till: z.string().min(1, "Valid till date is required"),
  coupon_type: z.string().min(1, "Coupon type is required"),
  max_redemptions: z.number().nullable(),
  is_active: z.boolean(),
});

interface Coupon {
  id: string;
  code: string;
  amount: number;
  redeem_by: Array<{ email: string; redeemedAt: string }>;
  valid_till: string;
  coupon_type: string;
  max_redemptions: number | null;
  is_active: boolean;
  created_at: string;
  redemption_count?: number;
}

interface EditCouponDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  coupon: Coupon | null;
  onCouponUpdated: (coupon: Coupon) => void;
}

export default function EditCouponDialog({
  open,
  onOpenChange,
  coupon,
  onCouponUpdated,
}: EditCouponDialogProps) {
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    amount: "",
    valid_till: "",
    coupon_type: "one-time",
    max_redemptions: "",
    is_active: true,
  });

  useEffect(() => {
    if (coupon) {
      setFormData({
        amount: coupon.amount.toString(),
        valid_till: new Date(coupon.valid_till).toISOString().split('T')[0],
        coupon_type: coupon.coupon_type,
        max_redemptions: coupon.max_redemptions?.toString() || "",
        is_active: coupon.is_active,
      });
    }
  }, [coupon]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!coupon) return;

    const data = {
      id: coupon.id,
      amount: parseFloat(formData.amount),
      valid_till: new Date(formData.valid_till).toISOString(),
      coupon_type: formData.coupon_type,
      max_redemptions: formData.max_redemptions
        ? parseInt(formData.max_redemptions)
        : null,
      is_active: formData.is_active,
    };

    const validation = couponSchema.safeParse(data);
    if (!validation.success) {
      toast.error(validation.error.errors[0].message);
      return;
    }

    try {
      setLoading(true);
      const res = await api.put("/admin/coupons", data);

      if (res.data.success) {
        toast.success("Coupon updated successfully!");
        onCouponUpdated(res.data.data);
        onOpenChange(false);
      } else {
        toast.error(res.data.error || "Failed to update coupon");
      }
    } catch (error: unknown) {
      console.error("Error updating coupon:", error);
      toast.error((error as { response?: { data?: { error?: string } } }).response?.data?.error || "Failed to update coupon");
    } finally {
      setLoading(false);
    }
  };

  if (!coupon) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-neutral-900 border-white/10 text-white max-w-md">
        <DialogHeader>
          <DialogTitle>Edit Coupon</DialogTitle>
          <DialogDescription className="text-neutral-400">
            Update coupon details for <code className="text-white bg-white/10 px-2 py-1 rounded">{coupon.code}</code>
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 mt-4">
          <div className="space-y-2">
            <Label htmlFor="edit-amount">Amount ($)</Label>
            <Input
              id="edit-amount"
              type="number"
              step="0.01"
              min="0.01"
              value={formData.amount}
              onChange={(e) =>
                setFormData({ ...formData, amount: e.target.value })
              }
              className="bg-black/40 border-white/10 text-white"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-coupon_type">Coupon Type</Label>
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
                <SelectItem value="multi-use">Multi-Use</SelectItem>
                <SelectItem value="limited">Limited Use</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-valid_till">Valid Until</Label>
            <Input
              id="edit-valid_till"
              type="date"
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
              <Label htmlFor="edit-max_redemptions">Max Redemptions</Label>
              <Input
                id="edit-max_redemptions"
                type="number"
                min="1"
                value={formData.max_redemptions}
                onChange={(e) =>
                  setFormData({ ...formData, max_redemptions: e.target.value })
                }
                className="bg-black/40 border-white/10 text-white"
              />
            </div>
          )}

          <div className="flex items-center justify-between space-x-2 rounded-lg border border-white/10 p-3 bg-black/20">
            <Label htmlFor="edit-is_active" className="cursor-pointer flex-1">
              <div className="font-medium">Active Status</div>
              <div className="text-xs text-neutral-400">
                {formData.is_active ? "Coupon is active" : "Coupon is inactive"}
              </div>
            </Label>
            <Switch
              id="edit-is_active"
              checked={formData.is_active}
              onCheckedChange={(checked) =>
                setFormData({ ...formData, is_active: checked })
              }
            />
          </div>

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
              {loading ? "Updating..." : "Update Coupon"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
