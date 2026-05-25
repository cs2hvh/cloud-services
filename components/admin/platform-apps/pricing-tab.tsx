"use client";

import { useState, useEffect } from "react";
import { motion } from "motion/react";
import { DollarSign, Loader2, Cpu, HardDrive, Server, Plus, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import axios from "axios";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";

interface PlatformAppProduct {
  id: string;
  name: string;
  description: string;
  type: string;
  sub: string;
  price: number;
  fixed_price: number;
  resources: {
    cpu: string;
    ram: string;
    replicas: number;
  };
  created_at: string;
}

const instanceSizeDefaults: Record<string, { cpu: string; ram: string; replicas: number; name: string; cpuNum: number; ramNum: number }> = {
  small:   { cpu: "250m", ram: "256Mi", replicas: 1, name: "Small",   cpuNum: 250,  ramNum: 256  },
  medium:  { cpu: "500m", ram: "512Mi", replicas: 2, name: "Medium",  cpuNum: 500,  ramNum: 512  },
  large:   { cpu: "1",    ram: "1Gi",   replicas: 3, name: "Large",   cpuNum: 1000, ramNum: 1024 },
  xlarge:  { cpu: "2",    ram: "4Gi",   replicas: 4, name: "XLarge",  cpuNum: 2000, ramNum: 4096 },
  xxlarge: { cpu: "4",    ram: "8Gi",   replicas: 6, name: "XXLarge", cpuNum: 4000, ramNum: 8192 },
};

export default function PricingTab() {
  const [products, setProducts] = useState<PlatformAppProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<PlatformAppProduct | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [productToDelete, setProductToDelete] = useState<PlatformAppProduct | null>(null);

  // Form state
  const [formData, setFormData] = useState({
    size: "small",
    price: "",
    fixedPrice: "0",
  });

  // Fetch products
  const fetchProducts = async () => {
    try {
      setLoading(true);
      const response = await axios.get("/api/admin/products?type=platform-apps");
      setProducts(response?.data?.products || []);
    } catch (error) {
      console.error("Error fetching products:", error);
      toast.error("Failed to load pricing data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProducts();
  }, []);

  const openAddDialog = (size: string) => {
    setEditingProduct(null);
    setFormData({
      size,
      price: "",
      fixedPrice: "0",
    });
    setDialogOpen(true);
  };

  const openEditDialog = (product: PlatformAppProduct) => {
    setEditingProduct(product);
    setFormData({
      size: product.sub,
      price: product.price?.toString() || "0",
      fixedPrice: (product.fixed_price ?? 0).toString(),
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!formData.price || parseFloat(formData.price) < 0) {
      toast.error("Please enter a valid monthly price");
      return;
    }

    if (parseFloat(formData.fixedPrice) < 0) {
      toast.error("Fixed price cannot be negative");
      return;
    }

    setSaving(true);
    try {
      const sizeConfig = instanceSizeDefaults[formData.size];
      
      if (editingProduct) {
        // Update existing product
        await axios.put("/api/admin/products", {
          id: editingProduct.id,
          price: parseFloat(formData.price),
          fixed_price: parseFloat(formData.fixedPrice) || 0,
        });
        toast.success(`${sizeConfig.name} plan updated successfully!`);
      } else {
        // Create new product
        await axios.post("/api/admin/products", {
          name: `Platform App - ${sizeConfig.name}`,
          description: `${sizeConfig.name} instance: ${sizeConfig.cpu} CPU, ${sizeConfig.ram} RAM, ${sizeConfig.replicas} replica(s)`,
          type: "platform-apps",
          sub: formData.size,
          price: parseFloat(formData.price),
          fixed_price: parseFloat(formData.fixedPrice) || 0,
          resources: {
            cpu: sizeConfig.cpuNum,
            ram: sizeConfig.ramNum,
            storage: 0,
          },
        });
        toast.success(`${sizeConfig.name} plan created successfully!`);
      }

      setDialogOpen(false);
      fetchProducts();
    } catch (error) {
      console.error("Error saving product:", error);
      toast.error("Failed to save pricing");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!productToDelete) return;

    setSaving(true);
    try {
      await axios.delete("/api/admin/products", {
        data: { id: productToDelete.id },
      });
      toast.success("Plan deleted successfully!");
      setDeleteDialogOpen(false);
      setProductToDelete(null);
      fetchProducts();
    } catch (error) {
      console.error("Error deleting product:", error);
      toast.error("Failed to delete plan");
    } finally {
      setSaving(false);
    }
  };

  // Calculate hourly rate from monthly price
  const getHourlyRate = (monthlyPrice: number) => {
    const hoursInMonth = 24 * 30;
    return (monthlyPrice / hoursInMonth).toFixed(4);
  };

  // Get product by size
  const getProductBySize = (size: string) => {
    return products.find((p) => p.sub === size);
  };

  if (loading) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
      >
        <div className="bg-neutral-900 border border-neutral-800 rounded-lg overflow-hidden">
          <div className="px-6 py-12 text-center">
            <Loader2 className="h-8 w-8 text-neutral-600 mx-auto mb-3 animate-spin" />
            <p className="text-neutral-400 text-sm">Loading pricing data...</p>
          </div>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.1 }}
      className="space-y-6"
    >
      {/* Header */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-lg overflow-hidden">
        <div className="px-6 py-6">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-neutral-800 rounded-lg">
              <DollarSign className="h-5 w-5 text-neutral-300" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-white">
                Platform Apps Pricing
              </h3>
              <p className="text-neutral-400 text-sm">
                Configure pricing for different instance sizes. Users will see these prices when deploying applications.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Pricing Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-5 gap-4">
        {(["small", "medium", "large", "xlarge", "xxlarge"] as const).map((size) => {
          const product = getProductBySize(size);
          const config = instanceSizeDefaults[size];

          return (
            <motion.div
              key={size}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 * (["small", "medium", "large", "xlarge", "xxlarge"].indexOf(size) + 1) }}
              className="bg-neutral-900 border border-neutral-800 rounded-lg overflow-hidden"
            >
              <div className="px-5 py-5">
                {/* Header */}
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <Server className="h-5 w-5 text-blue-400" />
                    <h4 className="text-white font-semibold capitalize">{size}</h4>
                  </div>
                  {product ? (
                    <Badge className="bg-green-500/20 text-green-400 border-green-500/30">
                      Active
                    </Badge>
                  ) : (
                    <Badge className="bg-neutral-700 text-neutral-400 border-neutral-600">
                      Not Set
                    </Badge>
                  )}
                </div>

                {/* Resources */}
                <div className="space-y-2 mb-4">
                  <div className="flex items-center gap-2 text-sm text-neutral-400">
                    <Cpu className="h-4 w-4" />
                    <span>{config.cpu} CPU</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-neutral-400">
                    <HardDrive className="h-4 w-4" />
                    <span>{config.ram} RAM</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-neutral-400">
                    <Server className="h-4 w-4" />
                    <span>{config.replicas} replica{config.replicas > 1 ? "s" : ""}</span>
                  </div>
                </div>

                {/* Pricing */}
                {product ? (
                  <div className="mb-4">
                    <div className="text-2xl font-bold text-white">
                      ${product.price?.toFixed(2) || "0.00"}
                      <span className="text-sm text-neutral-400 font-normal">/mo</span>
                    </div>
                    <div className="text-xs text-neutral-500">
                      ${getHourlyRate(product.price || 0)}/hr • 
                      {product.fixed_price > 0 && ` + $${product.fixed_price.toFixed(2)} setup`}
                    </div>
                  </div>
                ) : (
                  <div className="mb-4">
                    <div className="text-2xl font-bold text-neutral-500">
                      Not configured
                    </div>
                    <div className="text-xs text-neutral-600">
                      Click below to set pricing
                    </div>
                  </div>
                )}

                {/* Actions */}
                <div className="flex gap-2">
                  {product ? (
                    <>
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1 cursor-pointer border-neutral-700 text-neutral-300 hover:bg-neutral-800"
                        onClick={() => openEditDialog(product)}
                      >
                        <Pencil className="h-3.5 w-3.5 mr-1" />
                        Edit
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="cursor-pointer border-red-900 text-red-400 hover:bg-red-950"
                        onClick={() => {
                          setProductToDelete(product);
                          setDeleteDialogOpen(true);
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </>
                  ) : (
                    <Button
                      size="sm"
                      className="w-full cursor-pointer bg-white text-black hover:bg-gray-200"
                      onClick={() => openAddDialog(size)}
                    >
                      <Plus className="h-3.5 w-3.5 mr-1" />
                      Set Price
                    </Button>
                  )}
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* Info Card */}
      <div className="bg-blue-950/30 border border-blue-900/50 rounded-lg p-4">
        <p className="text-sm text-blue-300">
          <strong>Note:</strong> The monthly price is converted to an hourly rate for billing purposes. 
          Users are billed based on actual usage time. If a fixed/setup price is set, it will be charged 
          once when the app is first deployed.
        </p>
      </div>

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="bg-neutral-900 border-neutral-800 text-white">
          <DialogHeader>
            <DialogTitle>
              {editingProduct ? "Edit" : "Set"} {instanceSizeDefaults[formData.size]?.name} Plan Pricing
            </DialogTitle>
            <DialogDescription className="text-neutral-400">
              Configure the pricing for {formData.size} instance deployments.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {!editingProduct && (
              <div className="space-y-2">
                <Label className="text-white text-sm">Instance Size</Label>
                <Select
                  value={formData.size}
                  onValueChange={(value) => setFormData({ ...formData, size: value })}
                >
                  <SelectTrigger className="bg-neutral-800 border-neutral-700 text-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(["small", "medium", "large", "xlarge", "xxlarge"] as const).map((size) => {
                      const existing = getProductBySize(size);
                      return (
                        <SelectItem key={size} value={size} disabled={!!existing}>
                          {instanceSizeDefaults[size].name}
                          {existing && " (Already configured)"}
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-2">
              <Label className="text-white text-sm">Monthly Price (USD)</Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={formData.price}
                onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                placeholder="0.00"
                className="bg-neutral-800 border-neutral-700 text-white"
              />
              <p className="text-xs text-neutral-500">
                Hourly rate: ${formData.price ? getHourlyRate(parseFloat(formData.price)) : "0.0000"}/hr
              </p>
            </div>

            <div className="space-y-2">
              <Label className="text-white text-sm">Setup/Fixed Price (USD)</Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={formData.fixedPrice}
                onChange={(e) => setFormData({ ...formData, fixedPrice: e.target.value })}
                placeholder="0.00"
                className="bg-neutral-800 border-neutral-700 text-white"
              />
              <p className="text-xs text-neutral-500">
                One-time charge when app is first deployed (optional)
              </p>
            </div>

            {/* Preview */}
            <div className="bg-neutral-800/50 rounded-lg p-4 space-y-1">
              <p className="text-sm text-neutral-400">User will see:</p>
              <div className="flex items-baseline gap-2">
                <span className="text-xl font-bold text-white">
                  ${formData.price || "0.00"}
                </span>
                <span className="text-neutral-400">/month</span>
              </div>
              {parseFloat(formData.fixedPrice) > 0 && (
                <p className="text-xs text-neutral-500">
                  + ${formData.fixedPrice} setup fee
                </p>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDialogOpen(false)}
              className="cursor-pointer border-neutral-700 text-neutral-300 hover:bg-neutral-800"
            >
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={saving}
              className="cursor-pointer bg-white text-black hover:bg-gray-200"
            >
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                "Save"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="bg-neutral-900 border-neutral-800 text-white">
          <DialogHeader>
            <DialogTitle>Delete Pricing Plan</DialogTitle>
            <DialogDescription className="text-neutral-400">
              Are you sure you want to delete the {productToDelete?.sub} plan pricing? 
              Users will see this instance size as &quot;Free&quot; until pricing is set again.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteDialogOpen(false)}
              className="cursor-pointer border-neutral-700 text-neutral-300 hover:bg-neutral-800"
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={saving}
              className="cursor-pointer bg-red-600 hover:bg-red-700"
            >
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Deleting...
                </>
              ) : (
                "Delete"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </motion.div>
  );
}
