"use client";

import { useState, useEffect } from "react";
import { motion } from "motion/react";
import { DollarSign, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import axios from "axios";

export default function DDoSSettingsTab() {
  const [price, setPrice] = useState<string>("");
  const [fixedPrice, setFixedPrice] = useState<string>("0");
  const [loading, setLoading] = useState(false);
  const [fetchingPrice, setFetchingPrice] = useState(true);
  const [productId, setProductId] = useState<string | null>(null);

  // Fetch current network DDoS protection price
  useEffect(() => {
    const fetchPrice = async () => {
      try {
        const response = await axios.get("/api/admin/products?type=network-ddos");
        const products = response.data.products;

        if (products && products.length > 0) {
          const ddosProduct = products[0];
          setPrice(ddosProduct.price?.toString() || "0");
          setFixedPrice((ddosProduct.fixed_price ?? 0).toString());
          setProductId(ddosProduct.id);
        } else {
          setPrice("0");
          setFixedPrice("0");
        }
      } catch (error) {
        console.error("Error fetching network DDoS price:", error);
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
          name: "Network DDoS Protection",
          description: "Layer 4 DDoS protection service",
          type: "network-ddos",
          sub: "network-ddos",
          price: parseFloat(price),
          fixed_price: parseFloat(fixedPrice) || 0,
          resources: { cpu: 1, ram: 1, storage: 1 },
        });
        toast.success("DDoS protection price created successfully!");
      } else {
        // Update existing product
        await axios.put("/api/admin/products", {
          id: productId,
          price: parseFloat(price),
          fixed_price: parseFloat(fixedPrice) || 0,
        });
        toast.success("DDoS protection price updated successfully!");
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
        <div className="bg-neutral-900 border border-neutral-800 rounded-lg overflow-hidden">
          <div className="px-6 py-12 text-center">
            <Loader2 className="h-8 w-8 text-neutral-600 mx-auto mb-3 animate-spin" />
            <p className="text-neutral-400 text-sm">
              Loading DDoS protection pricing...
            </p>
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
      <div className="bg-neutral-900 border border-neutral-800 rounded-lg overflow-hidden">
        <div className="px-6 py-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2 bg-neutral-800 rounded-lg">
              <DollarSign className="h-5 w-5 text-neutral-300" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-white">
                DDoS Protection Pricing
              </h3>
              <p className="text-neutral-400 text-sm">
                Set the price for network DDoS protection service
              </p>
            </div>
          </div>

          <div className="space-y-4 max-w-md">
            <div className="space-y-2">
              <Label htmlFor="ddos-price" className="text-white text-sm">
                Price (USD)
              </Label>
              <div className="flex gap-2">
                <Input
                  id="ddos-price"
                  type="number"
                  min="0"
                  step="0.01"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  placeholder="0.00"
                  className="bg-white/10 border-white/20 text-white h-9 text-sm"
                  disabled={loading}
                />
              </div>
              <p className="text-neutral-500 text-xs">
                This price will be shown to users when creating new DDoS
                protection apps
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="ddos-fixed-price" className="text-white text-sm">
                Fixed Price (USD)
              </Label>
              <div className="flex gap-2">
                <Input
                  id="ddos-fixed-price"
                  type="number"
                  min="0"
                  step="0.01"
                  value={fixedPrice}
                  onChange={(e) => setFixedPrice(e.target.value)}
                  placeholder="0.00"
                  className="bg-white/10 border-white/20 text-white h-9 text-sm"
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
          </div>
        </div>
      </div>
    </motion.div>
  );
}
