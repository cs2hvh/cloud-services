"use client";

import { useState, useEffect } from "react";
import { motion } from "motion/react";
import { Loader2, DollarSign } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import axios from "axios";

// interface StoragePlansTabProps {
//   all_products?: Tables<"products">[];
// }

export default function StoragePlansTab() {
  const [price, setPrice] = useState<string>("");
  const [fixedPrice, setFixedPrice] = useState<string>("0");
  const [loading, setLoading] = useState(false);
  const [fetchingPrice, setFetchingPrice] = useState(true);
  const [productId, setProductId] = useState<string | null>(null);

  // Fetch current object storage price
  useEffect(() => {
    const fetchPrice = async () => {
      try {
        const response = await axios.get("/api/admin/products?type=object-storage");
        const products = response?.data?.products;
        
        if (products && products.length > 0) {
          const storageProduct = products[0];
          setPrice(storageProduct.price?.toString() || "0");
          setFixedPrice((storageProduct.fixed_price ?? 0).toString());
          setProductId(storageProduct.id);
        } else {
          setPrice("0");
          setFixedPrice("0");
        }
      } catch (error) {
        console.error("Error fetching object storage price:", error);
        toast.error("Failed to load current price");
      } finally {
        setFetchingPrice(false);
      }
    };

    fetchPrice();
  }, []);

  const handleUpdatePrice = async () => {
    if (!price || parseFloat(price) < 0) {
      toast.error("Please enter a valid price");
      return;
    }
    if (parseFloat(fixedPrice) < 0) {
      toast.error("Fixed price cannot be negative");
      return;
    }

    setLoading(true);
    try {
      // If product doesn't exist, create it
      if (!productId) {
        await axios.post("/api/admin/products", {
          name: "Object Storage",
          description: "Bucket storage service",
          type: "object-storage",
          sub:"object-storage",
          price: parseFloat(price),
          fixed_price: parseFloat(fixedPrice) || 0,

          resources: {cpu: 1, ram: 1, storage: 1},
        });
        toast.success("Storage price created successfully!");
      } else {
        // Update existing product
        await axios.put("/api/admin/products", {
          id: productId,
          price: parseFloat(price),
          fixed_price: parseFloat(fixedPrice) || 0,
        });
        toast.success("Storage price updated successfully!");
      }
    } catch (error) {
      console.error("Error updating price:", error);
      toast.error("Failed to update price");
    } finally {
      setLoading(false);
    }
  };

  if (fetchingPrice) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
      >
        <div className="bg-card border border-border rounded-lg overflow-hidden">
          <div className="px-6 py-12 text-center">
            <Loader2 className="h-8 w-8 text-muted-foreground/50 mx-auto mb-3 animate-spin" />
            <p className="text-muted-foreground text-sm">Loading storage pricing...</p>
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
    >
      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <div className="px-6 py-6">
            <div className="flex items-center gap-3 mb-6">
            <div className="p-2 bg-white/[0.06] rounded-lg">
              <DollarSign className="h-5 w-5 text-foreground/80" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-foreground">Bucket Storage Pricing</h3>
              <p className="text-muted-foreground text-sm">Set the price for object storage buckets</p>
            </div>
          </div>

          <div className="space-y-4 max-w-md">
            <div className="space-y-2">
              <Label htmlFor="storage-price" className="text-foreground text-sm">
                Price (USD)
              </Label>
              <div className="flex gap-2">
                <Input
                  id="storage-price"
                  type="number"
                  min="0"
                  step="0.01"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  placeholder="0.00"
                  className="bg-white/10 border-white/20 text-foreground h-9 text-sm"
                  disabled={loading}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="storage-fixed-price" className="text-foreground text-sm">
                Fixed Price (USD)
              </Label>
              <div className="flex gap-2">
                <Input
                  id="storage-fixed-price"
                  type="number"
                  min="0"
                  step="0.01"
                  value={fixedPrice}
                  onChange={(e) => setFixedPrice(e.target.value)}
                  placeholder="0.00"
                  className="bg-white/10 border-white/20 text-foreground h-9 text-sm"
                  disabled={loading}
                />
              </div>
            </div>
            <div>
              <Button
                  onClick={handleUpdatePrice}
                  disabled={loading}
                  size="sm"
                  className="cursor-pointer bg-white text-black hover:bg-gray-200 h-9 px-4 text-sm"
                >
                  {loading ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                      Updating
                    </>
                  ) : (
                    "Update"
                  )}
              </Button>
            </div>
              <p className="text-muted-foreground/70 text-xs">
                This price will be shown to users when creating new buckets
              </p>
            </div>
          </div>
        </div>
     
    </motion.div>
  );
}