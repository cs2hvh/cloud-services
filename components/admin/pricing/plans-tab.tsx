"use client";

import { useState, useEffect } from "react";
import { motion } from "motion/react";
import {
  Search,
  ChevronLeft,
  ChevronRight,
  Pencil,
  Trash2,
  Package,
  Plus,
  Loader2,
  Filter,
  Star,
  Cpu,
  HardDrive,
  DollarSign,
} from "lucide-react";
import { Tables } from "@/lib/supabase/types";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { toast } from "sonner";
import api from "@/lib/axios/axios";
import EditPlanDialog from "./edit-plan-dialog";
import AddPlanDialog from "./add-plan-dialog";

interface PlansTabProps {
  products: Tables<"products">[];
  categories: Tables<"pricing_categories">[];
}

const ITEMS_PER_PAGE = 10;

const PRODUCT_TYPES = [
  { value: "compute", label: "Compute" },
  { value: "gpu", label: "GPU" },
  { value: "object-storage", label: "Object Storage" },
  { value: "database", label: "Database" },
  { value: "security", label: "Security" },
  { value: "kubernetes", label: "Kubernetes" },
  { value: "ai-deployment", label: "AI Deployment" },
  { value: "platform-apps", label: "App Deployment" },
  { value: "network-ddos", label: "Network/DDoS" },
];

export default function PlansTab({ products: initialProducts, categories }: PlansTabProps) {
  const [productsList, setProductsList] = useState<Tables<"products">[]>(initialProducts);
  const [displayedProducts, setDisplayedProducts] = useState(
    initialProducts.slice(0, ITEMS_PER_PAGE)
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [filterType, setFilterType] = useState<string>("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(
    Math.ceil(initialProducts.length / ITEMS_PER_PAGE)
  );

  // Delete dialog state
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedProductId, setSelectedProductId] = useState<string>("");
  const [selectedProductName, setSelectedProductName] = useState<string>("");
  const [isDeleting, setIsDeleting] = useState(false);

  // Edit dialog state
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Tables<"products"> | null>(null);

  // Add dialog state
  const [addDialogOpen, setAddDialogOpen] = useState(false);

  // Fetch updated products from API
  const fetchProducts = async () => {
    try {
      const response = await api.get("/admin/products");
      if (response.status === 200) {
        // Filter for pricing-related products
        const pricingTypes = PRODUCT_TYPES.map(t => t.value);
        const pricingProducts = response.data.products.filter(
          (p: Tables<"products">) => pricingTypes.includes(p.type)
        );
        setProductsList(pricingProducts);
        return pricingProducts;
      }
    } catch (error) {
      console.error("Error fetching products:", error);
      return productsList;
    }
  };

  // Filter and search products
  const getFilteredProducts = () => {
    let filtered = [...productsList];

    if (filterType !== "all") {
      filtered = filtered.filter((p) => p.type === filterType);
    }

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (p) =>
          p.name?.toLowerCase().includes(query) ||
          p.description?.toLowerCase().includes(query) ||
          p.type?.toLowerCase().includes(query)
      );
    }

    return filtered;
  };

  const updatePagination = (page: number) => {
    const filtered = getFilteredProducts();
    const startIndex = (page - 1) * ITEMS_PER_PAGE;
    const endIndex = startIndex + ITEMS_PER_PAGE;
    const paginatedProducts = filtered.slice(startIndex, endIndex);

    setDisplayedProducts(paginatedProducts);
    setCurrentPage(page);
    setTotalPages(Math.ceil(filtered.length / ITEMS_PER_PAGE));
  };

  const handleSearch = () => {
    updatePagination(1);
  };

  const handleFilterChange = (value: string) => {
    setFilterType(value);
  };

  const handleEditProduct = (product: Tables<"products">) => {
    setSelectedProduct(product);
    setEditDialogOpen(true);
  };

  const handleDeleteProduct = (productId: string, productName: string) => {
    setSelectedProductId(productId);
    setSelectedProductName(productName);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = async () => {
    if (!selectedProductId) return;

    setIsDeleting(true);
    try {
      const response = await api.delete("/admin/products", {
        data: { id: selectedProductId },
      });

      if (response.status === 200) {
        toast.success("Plan deleted successfully");
        setDeleteDialogOpen(false);
        const updatedProducts = await fetchProducts();
        if (updatedProducts) {
          updatePagination(1);
        }
      }
    } catch (error: unknown) {
      console.error("Error deleting product:", error);
      const errorData = (error as { response?: { data?: { inUse?: boolean; count?: number; error?: string } } }).response?.data;
      if (errorData?.inUse) {
        toast.error(`Cannot delete: ${errorData.count} resources are using this plan`);
      } else {
        toast.error(errorData?.error || "Failed to delete plan");
      }
    } finally {
      setIsDeleting(false);
    }
  };

  const handleEditSuccess = async () => {
    const updatedProducts = await fetchProducts();
    if (updatedProducts) {
      updatePagination(currentPage);
    }
  };

  const handleAddSuccess = async () => {
    const updatedProducts = await fetchProducts();
    if (updatedProducts) {
      updatePagination(1);
    }
  };

  useEffect(() => {
    updatePagination(1);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery, filterType]);

  const getTypeLabel = (type: string) => {
    const typeConfig = PRODUCT_TYPES.find((t) => t.value === type);
    return typeConfig?.label || type;
  };

  const formatPrice = (price: number | null) => {
    if (price === null || price === undefined) return "-";
    return `$${price}/mo`;
  };

  return (
    <>
      {/* Search, Filter, and Add Button */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="flex-1 flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-neutral-500" />
            <Input
              placeholder="Search by name or description..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              className="pl-10 bg-neutral-900 border-neutral-800 text-white placeholder:text-neutral-500 focus:border-neutral-700 focus:ring-0"
            />
          </div>
          <Button
            onClick={handleSearch}
            className="cursor-pointer bg-neutral-800 hover:bg-neutral-700 text-white border-0"
          >
            Search
          </Button>
        </div>

        <div className="flex gap-2">
          <Select value={filterType} onValueChange={handleFilterChange}>
            <SelectTrigger className="cursor-pointer w-[180px] bg-neutral-900 border-neutral-800 text-white focus:ring-0">
              <Filter className="h-4 w-4 mr-2" />
              <SelectValue placeholder="Filter by type" />
            </SelectTrigger>
            <SelectContent className="bg-neutral-900 border-neutral-800">
              <SelectItem
                value="all"
                className="cursor-pointer text-white focus:bg-neutral-800 focus:text-white"
              >
                All Types
              </SelectItem>
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

          <Button
            onClick={() => setAddDialogOpen(true)}
            className="cursor-pointer bg-green-600 hover:bg-green-700 text-white border-0"
          >
            <Plus className="h-4 w-4 mr-2" />
            New Plan
          </Button>
        </div>
      </div>

      {/* Products Table */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
      >
        <div className="bg-neutral-900 border border-neutral-800 rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-neutral-800/50 border-b border-neutral-800">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-neutral-400 uppercase tracking-wider">
                    Name
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-neutral-400 uppercase tracking-wider">
                    Type
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-neutral-400 uppercase tracking-wider">
                    Resources
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-neutral-400 uppercase tracking-wider">
                    Price
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-neutral-400 uppercase tracking-wider">
                    Flags
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-neutral-400 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-800">
                {displayedProducts.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-12 text-center">
                      <Package className="h-12 w-12 text-neutral-600 mx-auto mb-3" />
                      <p className="text-neutral-400 text-sm">No plans found</p>
                    </td>
                  </tr>
                ) : (
                  displayedProducts.map((product) => (
                    <tr
                      key={product.id}
                      className="hover:bg-neutral-800/30 transition-colors"
                    >
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <Package className="h-4 w-4 text-neutral-500" />
                          <div>
                            <div className="font-medium text-white text-sm">
                              {product.name}
                            </div>
                            <div className="text-xs text-neutral-500 truncate max-w-[150px]">
                              {product.short_description || product.description}
                            </div>
                          </div>
                        </div>
                      </td>

                      <td className="px-6 py-4">
                        <Badge className="bg-blue-500/20 text-blue-300 hover:bg-blue-500/30 border-0 text-xs">
                          {getTypeLabel(product.type)}
                        </Badge>
                      </td>

                      <td className="px-6 py-4">
                        <div className="flex flex-col gap-1 text-xs text-neutral-400">
                          {product.resources && (
                            <>
                              <div className="flex items-center gap-1">
                                <Cpu className="h-3 w-3" />
                                {product.resources.cpu} vCPU
                              </div>
                              <div className="flex items-center gap-1">
                                <HardDrive className="h-3 w-3" />
                                {product.resources.ram}GB RAM
                              </div>
                            </>
                          )}
                        </div>
                      </td>

                      <td className="px-6 py-4">
                        <div className="flex items-center gap-1 text-sm text-white">
                          <DollarSign className="h-4 w-4 text-green-400" />
                          {formatPrice(product.price)}
                        </div>
                        {product.yearly_price && (
                          <div className="text-xs text-neutral-500">
                            ${product.yearly_price}/yr
                          </div>
                        )}
                      </td>

                      <td className="px-6 py-4">
                        <div className="flex flex-wrap gap-1">
                          {product.is_featured && (
                            <Badge className="bg-yellow-500/20 text-yellow-300 border-0 text-xs">
                              <Star className="h-3 w-3 mr-1" />
                              Featured
                            </Badge>
                          )}
                          {product.is_highlighted && (
                            <Badge className="bg-purple-500/20 text-purple-300 border-0 text-xs">
                              Highlighted
                            </Badge>
                          )}
                        </div>
                      </td>

                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleEditProduct(product)}
                            className="cursor-pointer h-8 w-8 text-neutral-400 hover:text-white hover:bg-neutral-800"
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() =>
                              handleDeleteProduct(product.id, product.name || "")
                            }
                            className="cursor-pointer h-8 w-8 text-red-400 hover:text-red-300 hover:bg-red-950/50"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-6 py-4 border-t border-neutral-800">
              <p className="text-sm text-neutral-400">
                Page {currentPage} of {totalPages}
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => updatePagination(currentPage - 1)}
                  disabled={currentPage === 1}
                  className="cursor-pointer bg-neutral-800 border-neutral-700 text-white hover:bg-neutral-700 disabled:opacity-50"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => updatePagination(currentPage + 1)}
                  disabled={currentPage === totalPages}
                  className="cursor-pointer bg-neutral-800 border-neutral-700 text-white hover:bg-neutral-700 disabled:opacity-50"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </div>
      </motion.div>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent className="bg-neutral-900 border-neutral-800">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white">Delete Plan</AlertDialogTitle>
            <AlertDialogDescription className="text-neutral-400">
              Are you sure you want to delete &quot;{selectedProductName}&quot;? This
              action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="cursor-pointer bg-neutral-800 border-neutral-700 text-white hover:bg-neutral-700 hover:text-white">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              disabled={isDeleting}
              className="cursor-pointer bg-red-600 hover:bg-red-700 text-white"
            >
              {isDeleting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Deleting...
                </>
              ) : (
                "Delete"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Edit Dialog */}
      <EditPlanDialog
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
        product={selectedProduct}
        onSuccess={handleEditSuccess}
      />

      {/* Add Dialog */}
      <AddPlanDialog
        open={addDialogOpen}
        onOpenChange={setAddDialogOpen}
        onSuccess={handleAddSuccess}
      />
    </>
  );
}
