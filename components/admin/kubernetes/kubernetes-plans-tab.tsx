"use client";

import { useEffect, useState } from "react";
import { motion } from "motion/react";
import {
  Search,
  ChevronLeft,
  ChevronRight,
  Filter,
  Pencil,
  Trash2,
  Package,
  Cpu,
  HardDrive,
  DollarSign,
  Plus,
  Loader2,
} from "lucide-react";
import { Tables } from "@/lib/supabase/types";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
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

interface KubernetesPlansTabProps {
  all_products: Tables<"products">[];
}

const PRODUCTS_PER_PAGE = 10;

export default function KubernetesPlansTab({ all_products }: KubernetesPlansTabProps) {
  // Maintain local state of products list for real-time updates
  const [productsList, setProductsList] = useState<Tables<"products">[]>(all_products);
  const [products, setProducts] = useState(
    all_products.slice(0, PRODUCTS_PER_PAGE)
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(
    Math.ceil(all_products.length / PRODUCTS_PER_PAGE)
  );

  // Delete dialog state
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedProductId, setSelectedProductId] = useState<string>("");
  const [selectedProductName, setSelectedProductName] = useState<string>("");
  const [isDeleting, setIsDeleting] = useState(false);

  // Edit dialog state
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] =
    useState<Tables<"products"> | null>(null);
  const [isEditing, setIsEditing] = useState<string | null>(null);

  // Add dialog state
  const [addDialogOpen, setAddDialogOpen] = useState(false);

  // Fetch updated products list from API
  const fetchProducts = async () => {
    try {
      const response = await api.get("/admin/products?type=kubernetes");
      if (response.status === 200) {
        setProductsList(response.data.products);
        return response.data.products;
      }
    } catch (error) {
      console.error("Error fetching products:", error);
      return productsList;
    }
  };

  // Filter and search products
  const getFilteredProducts = () => {
    let filtered = [...productsList];

    // Apply search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (p) =>
          p.name?.toLowerCase().includes(query) ||
          p.description?.toLowerCase().includes(query) ||
          p.sub?.toLowerCase().includes(query)
      );
    }

    return filtered;
  };

  const updatePagination = (page: number) => {
    const filtered = getFilteredProducts();
    const startIndex = (page - 1) * PRODUCTS_PER_PAGE;
    const endIndex = startIndex + PRODUCTS_PER_PAGE;
    const paginatedProducts = filtered.slice(startIndex, endIndex);

    setProducts(paginatedProducts);
    setCurrentPage(page);
    setTotalPages(Math.ceil(filtered.length / PRODUCTS_PER_PAGE));
  };

  const handleSearch = () => {
    updatePagination(1);
  };

  const handleEditProduct = (product: Tables<"products">) => {
    setSelectedProduct(product);
    setIsEditing(product.id);
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
        toast.success("Kubernetes plan deleted successfully");
        setDeleteDialogOpen(false);

        // Refresh the products list
        const updatedProducts = await fetchProducts();
        if (updatedProducts) {
          updatePagination(1);
        }
      }
    } catch (error: any) {
      console.error("Error deleting product:", error);
      
      // Check if product is in use
      if (error.response?.data?.inUse) {
        toast.error(
          `Cannot delete: ${error.response.data.count} cluster(s) are using this plan`
        );
      } else {
        toast.error(
          error.response?.data?.error || "Failed to delete Kubernetes plan"
        );
      }
    } finally {
      setIsDeleting(false);
    }
  };

  const handleEditSuccess = async () => {
    // Refresh the products list
    const updatedProducts = await fetchProducts();
    if (updatedProducts) {
      updatePagination(currentPage);
    }
  };

  const handleAddSuccess = async () => {
    // Refresh the products list
    const updatedProducts = await fetchProducts();
    if (updatedProducts) {
      updatePagination(1);
    }
  };

  // Apply filters and pagination whenever search changes
  useEffect(() => {
    updatePagination(1);
  }, [searchQuery, productsList]);

  return (
    <>
      {/* Search, Filters, and Add Button */}
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
                    Description
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-neutral-400 uppercase tracking-wider">
                    Resources
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-neutral-400 uppercase tracking-wider">
                    Price
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-neutral-400 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-800">
                {products.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-12 text-center">
                      <Package className="h-12 w-12 text-neutral-600 mx-auto mb-3" />
                      <p className="text-neutral-400 text-sm">
                        No Kubernetes plans found
                      </p>
                    </td>
                  </tr>
                ) : (
                  products.map((product) => (
                    <tr
                      key={product.id}
                      className="hover:bg-neutral-800/30 transition-colors"
                    >
                      <td className="px-6 py-4">
                        <div className="flex flex-col gap-2">
                          <div className="flex items-center gap-2">
                            <Package className="h-4 w-4 text-neutral-500" />
                            <div>
                              <div className="font-medium text-white text-sm">
                                {product.name}
                              </div>
                              <div className="text-xs text-neutral-500 truncate max-w-[120px]">
                                {product.id}
                              </div>
                            </div>
                          </div>
                          {(product as any).slug && (
                            <Badge className="bg-blue-500/20 text-blue-300 hover:bg-blue-500/30 border-0 w-fit text-xs px-2 py-0.5">
                              {(product as any).slug}
                            </Badge>
                          )}
                        </div>
                      </td>

                      <td className="px-6 py-4">
                        <div className="text-sm text-neutral-300 max-w-[200px] truncate">
                          {product.description || (
                            <span className="text-neutral-600">
                              No description
                            </span>
                          )}
                        </div>
                      </td>

                      <td className="px-6 py-4">
                        <div className="flex flex-col gap-1">
                          <div className="flex items-center gap-1.5 text-xs text-neutral-400">
                            <Cpu className="h-3 w-3" />
                            <span>{product.resources?.cpu || 0} vCPU</span>
                          </div>
                          <div className="flex items-center gap-1.5 text-xs text-neutral-400">
                            <HardDrive className="h-3 w-3" />
                            <span>{product.resources?.ram || 0} GB RAM</span>
                          </div>
                          <div className="flex items-center gap-1.5 text-xs text-neutral-400">
                            <HardDrive className="h-3 w-3" />
                            <span>
                              {product.resources?.storage || 0} GB Storage
                            </span>
                          </div>
                        </div>
                      </td>

                      <td className="px-6 py-4">
                        <div className="flex items-center gap-1 text-sm font-semibold text-white">
                          <DollarSign className="h-4 w-4 text-green-400" />
                          {product.price?.toFixed(2) || "0.00"}
                          <span className="text-xs text-neutral-500">/mo</span>
                        </div>
                        {product.discount && product.discount > 0 && (
                          <div className="text-xs text-orange-400 mt-1">
                            {product.discount}% off
                          </div>
                        )}
                      </td>

                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleEditProduct(product)}
                            disabled={isEditing === product.id}
                            className="cursor-pointer h-8 px-3 text-xs bg-blue-900/50 hover:bg-blue-800 text-blue-300 border-0 disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {isEditing === product.id ? (
                              <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                            ) : (
                              <Pencil className="h-3.5 w-3.5 mr-1.5" />
                            )}
                            Edit
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() =>
                              handleDeleteProduct(
                                product.id,
                                product.name || "Unknown"
                              )
                            }
                            disabled={isDeleting}
                            className="cursor-pointer h-8 px-3 text-xs bg-red-900/50 hover:bg-red-800 text-red-300 border-0 disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                            Delete
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
            <div className="px-6 py-4 border-t border-neutral-800 flex items-center justify-between">
              <div className="text-sm text-neutral-400">
                Page {currentPage} of {totalPages}
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => updatePagination(currentPage - 1)}
                  disabled={currentPage === 1}
                  className="cursor-pointer h-8 px-3 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 disabled:opacity-50 disabled:cursor-not-allowed border-0"
                >
                  <ChevronLeft className="h-4 w-4 mr-1" />
                  Previous
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => updatePagination(currentPage + 1)}
                  disabled={currentPage === totalPages}
                  className="cursor-pointer h-8 px-3 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 disabled:opacity-50 disabled:cursor-not-allowed border-0"
                >
                  Next
                  <ChevronRight className="h-4 w-4 ml-1" />
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
            <AlertDialogTitle className="text-white flex items-center gap-2">
              <Trash2 className="h-5 w-5 text-red-400" />
              Delete Kubernetes Plan
            </AlertDialogTitle>
            <AlertDialogDescription className="text-neutral-300">
              Do you want to permanently delete this plan?
              <span className="mt-3 p-3 bg-neutral-800 rounded-md border border-neutral-700 block">
                <span className="text-sm text-neutral-400 block">
                  Plan Name:
                </span>
                <span className="text-base font-semibold text-white mt-1 block">
                  {selectedProductName}
                </span>
              </span>
              <span className="mt-3 text-red-400 text-sm font-medium block">
                ⚠️ This action cannot be undone. Plans in use cannot be deleted.
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              disabled={isDeleting}
              className="cursor-pointer bg-neutral-800 hover:bg-neutral-700 text-white border-neutral-700"
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              disabled={isDeleting}
              className="cursor-pointer bg-red-600 hover:bg-red-700 text-white"
            >
              {isDeleting ? (
                <>
                  <span className="animate-spin mr-2">⏳</span>
                  Deleting...
                </>
              ) : (
                "Yes, Delete"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Edit Plan Dialog */}
      <EditPlanDialog
        product={selectedProduct}
        isOpen={editDialogOpen}
        onClose={() => {
          setEditDialogOpen(false);
          setSelectedProduct(null);
          setIsEditing(null);
        }}
        onSuccess={handleEditSuccess}
      />

      {/* Add Plan Dialog */}
      <AddPlanDialog
        isOpen={addDialogOpen}
        onClose={() => setAddDialogOpen(false)}
        onSuccess={handleAddSuccess}
      />
    </>
  );
}
