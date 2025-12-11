"use client";

import { useState } from "react";
import { motion } from "motion/react";
import { Ticket, Plus, Search, Pencil, Trash2, Calendar, DollarSign, Users, AlertCircle, Eye } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import CreateCouponDialog from "./create-coupon-dialog";
import EditCouponDialog from "./edit-coupon-dialog";
import { toast } from "sonner";
import api from "@/lib/axios/axios";

interface Coupon {
  id: string;
  code: string;
  amount: number;
  redeem_by: any[];
  valid_till: string;
  coupon_type: string;
  max_redemptions: number | null;
  is_active: boolean;
  created_at: string;
  redemption_count?: number;
}

interface PageProps {
  all_coupons: Coupon[];
}

export default function AdminCoupons({ all_coupons }: PageProps) {
  const [coupons, setCoupons] = useState<Coupon[]>(all_coupons);
  const [searchTerm, setSearchTerm] = useState("");
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [selectedCoupon, setSelectedCoupon] = useState<Coupon | null>(null);
  const [loading, setLoading] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [couponToDelete, setCouponToDelete] = useState<{ id: string; code: string } | null>(null);
  const [viewRedeemedDialogOpen, setViewRedeemedDialogOpen] = useState(false);
  const [selectedCouponForView, setSelectedCouponForView] = useState<Coupon | null>(null);

  const filteredCoupons = coupons.filter((coupon) =>
    coupon.code.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleDeleteClick = (id: string, code: string) => {
    setCouponToDelete({ id, code });
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!couponToDelete) return;

    try {
      setLoading(true);
      const res = await api.delete(`/admin/coupons?id=${couponToDelete.id}`);
      
      if (res.data.success) {
        setCoupons(coupons.filter((c) => c.id !== couponToDelete.id));
        toast.success("Coupon deleted successfully");
        setDeleteDialogOpen(false);
        setCouponToDelete(null);
      } else {
        toast.error(res.data.error || "Failed to delete coupon");
      }
    } catch (error: any) {
      console.error("Error deleting coupon:", error);
      toast.error(error.response?.data?.error || "Failed to delete coupon");
    } finally {
      setLoading(false);
    }
  };

  const handleViewRedeemed = (coupon: Coupon) => {
    setSelectedCouponForView(coupon);
    setViewRedeemedDialogOpen(true);
  };

  const handleEdit = (coupon: Coupon) => {
    setSelectedCoupon(coupon);
    setEditDialogOpen(true);
  };

  const handleCouponCreated = (newCoupon: Coupon) => {
    setCoupons([newCoupon, ...coupons]);
  };

  const handleCouponUpdated = (updatedCoupon: Coupon) => {
    setCoupons(
      coupons.map((c) => (c.id === updatedCoupon.id ? updatedCoupon : c))
    );
  };

  const isExpired = (validTill: string) => new Date(validTill) < new Date();

  const totalActive = coupons.filter((c) => c.is_active && !isExpired(c.valid_till)).length;
  const totalRedemptions = coupons.reduce((sum, c) => sum + (c.redemption_count || 0), 0);

  return (
    <div className="flex-1 bg-[#0a0a0a] min-h-screen p-4 sm:p-6 lg:p-8">
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-[1600px] mx-auto"
      >
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-neutral-800 rounded-lg">
              <Ticket className="h-6 w-6 text-neutral-300" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold text-white">
                Coupon Management
              </h1>
              <p className="text-sm text-neutral-400 mt-0.5">
                {coupons.length} total coupons · {totalActive} active · {totalRedemptions} redemptions
              </p>
            </div>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <StatCard
            label="Total Coupons"
            value={coupons.length}
            icon={<Ticket className="h-5 w-5" />}
          />
          <StatCard
            label="Active Coupons"
            value={totalActive}
            icon={<Calendar className="h-5 w-5" />}
            highlight
          />
          <StatCard
            label="Total Redemptions"
            value={totalRedemptions}
            icon={<Users className="h-5 w-5" />}
          />
        </div>

        {/* Main Content */}
        <div className="rounded-2xl border border-white/10 bg-black/40 backdrop-blur-xl p-4 sm:p-6">
          {/* Actions Bar */}
          <div className="flex flex-col sm:flex-row gap-3 mb-6">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-400" />
              <Input
                placeholder="Search by code..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 bg-black/40 border-white/10 text-white placeholder:text-neutral-500"
              />
            </div>
            <Button
              onClick={() => setCreateDialogOpen(true)}
              className="cursor-pointer bg-gradient-to-r from-blue-600 to-purple-600 text-white hover:from-blue-700 hover:to-purple-700"
            >
              <Plus className="h-4 w-4 mr-2" />
              Add New Coupon
            </Button>
          </div>

          {/* Coupons Table */}
          {filteredCoupons.length === 0 ? (
            <div className="text-center py-12">
              <Ticket className="h-12 w-12 text-neutral-600 mx-auto mb-3" />
              <p className="text-neutral-400">
                {searchTerm ? "No coupons found" : "No coupons yet. Create your first coupon!"}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-white/10">
                    <th className="text-left py-3 px-4 text-sm font-medium text-neutral-400">Code</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-neutral-400">Amount</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-neutral-400">Type</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-neutral-400">Valid Till</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-neutral-400">Redemptions</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-neutral-400">Status</th>
                    <th className="text-right py-3 px-4 text-sm font-medium text-neutral-400">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredCoupons.map((coupon) => {
                    const expired = isExpired(coupon.valid_till);
                    const statusColor = !coupon.is_active
                      ? "text-red-400"
                      : expired
                      ? "text-orange-400"
                      : "text-emerald-400";
                    const statusText = !coupon.is_active
                      ? "Inactive"
                      : expired
                      ? "Expired"
                      : "Active";

                    return (
                      <tr
                        key={coupon.id}
                        className="border-b border-white/5 hover:bg-white/5 transition-colors"
                      >
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-2">
                            <code className="text-sm font-mono text-white bg-white/10 px-2 py-1 rounded">
                              {coupon.code}
                            </code>
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          <span className="text-white font-semibold">
                            ${coupon.amount}
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          <span className="text-sm text-neutral-300 capitalize">
                            {coupon.coupon_type}
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          <span className="text-sm text-neutral-300">
                            {new Date(coupon.valid_till).toLocaleDateString()}
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          <span className="text-sm text-neutral-300">
                            {coupon.redemption_count || 0}
                            {coupon.max_redemptions && ` / ${coupon.max_redemptions}`}
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          <span className={`text-sm font-medium ${statusColor}`}>
                            {statusText}
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          <div className="flex items-center justify-end gap-2">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleViewRedeemed(coupon)}
                              className="text-neutral-400 hover:text-blue-400 cursor-pointer"
                              title="View redeemed users"
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleEdit(coupon)}
                              className="text-neutral-400 hover:text-white cursor-pointer"
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleDeleteClick(coupon.id, coupon.code)}
                              disabled={loading}
                              className="text-neutral-400 hover:text-red-400 cursor-pointer"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </motion.div>

      <CreateCouponDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        onCouponCreated={handleCouponCreated}
      />

      {selectedCoupon && (
        <EditCouponDialog
          open={editDialogOpen}
          onOpenChange={setEditDialogOpen}
          coupon={selectedCoupon}
          onCouponUpdated={handleCouponUpdated}
        />
      )}

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent className="bg-neutral-900 border-white/10 text-white">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Coupon</AlertDialogTitle>
            <AlertDialogDescription className="text-neutral-400">
              Are you sure you want to delete the coupon{" "}
              <code className="text-white bg-white/10 px-2 py-1 rounded font-mono">
                {couponToDelete?.code}
              </code>
              ? This action cannot be undone and will permanently remove the coupon from the database.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="cursor-pointer border-white/10 text-white hover:bg-white/5">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              disabled={loading}
              className="cursor-pointer bg-red-600 text-white hover:bg-red-700"
            >
              {loading ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Redeemed Users Dialog */}
      <Dialog open={viewRedeemedDialogOpen} onOpenChange={setViewRedeemedDialogOpen}>
        <DialogContent className="bg-neutral-900 border-white/10 text-white max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Redeemed By Users</DialogTitle>
            <DialogDescription className="text-neutral-400">
              Users who have redeemed{" "}
              <code className="text-white bg-white/10 px-2 py-1 rounded font-mono">
                {selectedCouponForView?.code}
              </code>
            </DialogDescription>
          </DialogHeader>
          <div className="mt-4">
            {selectedCouponForView && Array.isArray(selectedCouponForView.redeem_by) && selectedCouponForView.redeem_by.length > 0 ? (
              <div className="space-y-2">
                {selectedCouponForView.redeem_by.map((user: any, index: number) => (
                  <div
                    key={index}
                    className="p-3 rounded-lg bg-black/40 border border-white/10 flex items-center justify-between"
                  >
                    <div className="flex-1">
                      <div className="text-sm font-medium text-white">{user.email}</div>
                      
                    </div>
                    <div className="text-right">
                      <div className="text-xs text-neutral-400">Redeemed on</div>
                      <div className="text-sm text-white">
                        {new Date(user.redeemedAt).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-neutral-400">
                <Users className="h-12 w-12 mx-auto mb-2 text-neutral-600" />
                <p>No users have redeemed this coupon yet</p>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function StatCard({
  label,
  value,
  icon,
  highlight = false,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  highlight?: boolean;
}) {
  return (
    <div
      className={`rounded-xl border border-white/10 p-4 backdrop-blur-xl ${
        highlight ? "bg-white/5" : "bg-black/30"
      }`}
    >
      <div className="flex items-center justify-between mb-2">
        <div className="text-xs uppercase tracking-wide text-gray-400">{label}</div>
        <div className="text-neutral-400">{icon}</div>
      </div>
      <div className="text-2xl font-semibold text-white">{value}</div>
    </div>
  );
}
