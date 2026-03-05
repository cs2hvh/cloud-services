"use client";

import { useState } from "react";
import { motion } from "motion/react";
import { Tag, Gift, Package } from "lucide-react";
import { Tables } from "@/lib/supabase/types";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import CategoriesTab from "./categories-tab";
import PromosTab from "./promos-tab";
import PlansTab from "./plans-tab";

interface PageProps {
  categories: Tables<"pricing_categories">[];
  promos: Tables<"pricing_promos">[];
  products: Tables<"products">[];
}

export default function AdminPricing({ categories, promos, products }: PageProps) {
  const [activeTab, setActiveTab] = useState("categories");

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
              <Tag className="h-6 w-6 text-neutral-300" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold text-white">
                Pricing Management
              </h1>
              <p className="text-sm text-neutral-400 mt-0.5">
                {categories.length} categories · {promos.length} promos · {products.length} plans
              </p>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="w-full grid grid-cols-3 gap-2 bg-transparent p-0 h-auto mb-6">
            <TabsTrigger
              value="categories"
              className="cursor-pointer text-sm sm:text-base font-semibold py-3 px-4 rounded-lg data-[state=active]:bg-white data-[state=active]:text-black data-[state=active]:shadow-md bg-neutral-900 text-white hover:bg-neutral-800 transition-all border border-neutral-800"
            >
              <Tag className="h-4 w-4 mr-2" />
              Categories
            </TabsTrigger>
            <TabsTrigger
              value="promos"
              className="cursor-pointer text-sm sm:text-base font-semibold py-3 px-4 rounded-lg data-[state=active]:bg-white data-[state=active]:text-black data-[state=active]:shadow-md bg-neutral-900 text-white hover:bg-neutral-800 transition-all border border-neutral-800"
            >
              <Gift className="h-4 w-4 mr-2" />
              Promos
            </TabsTrigger>
            <TabsTrigger
              value="plans"
              className="cursor-pointer text-sm sm:text-base font-semibold py-3 px-4 rounded-lg data-[state=active]:bg-white data-[state=active]:text-black data-[state=active]:shadow-md bg-neutral-900 text-white hover:bg-neutral-800 transition-all border border-neutral-800"
            >
              <Package className="h-4 w-4 mr-2" />
              Pricing Plans
            </TabsTrigger>
          </TabsList>

          <TabsContent value="categories" className="mt-0">
            <CategoriesTab categories={categories} />
          </TabsContent>

          <TabsContent value="promos" className="mt-0">
            <PromosTab promos={promos} categories={categories} />
          </TabsContent>

          <TabsContent value="plans" className="mt-0">
            <PlansTab products={products} categories={categories} />
          </TabsContent>
        </Tabs>
      </motion.div>
    </div>
  );
}
