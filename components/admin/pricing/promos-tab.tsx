"use client";

import { useState, useEffect } from "react";
import { motion } from "motion/react";
import {
  Search,
  ChevronLeft,
  ChevronRight,
  Pencil,
  Trash2,
  Gift,
  Plus,
  Loader2,
  Eye,
  EyeOff,
  Filter,
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
import EditPromoDialog from "./edit-promo-dialog";
import AddPromoDialog from "./add-promo-dialog";

interface PromosTabProps {
  promos: Tables<"pricing_promos">[];
  categories: Tables<"pricing_categories">[];
}

const ITEMS_PER_PAGE = 10;

export default function PromosTab({ promos: initialPromos, categories: initialCategories }: PromosTabProps) {
  const [promosList, setPromosList] = useState<Tables<"pricing_promos">[]>(initialPromos);
  const [categoriesList, setCategoriesList] = useState<Tables<"pricing_categories">[]>(initialCategories);
  const [displayedPromos, setDisplayedPromos] = useState(
    initialPromos.slice(0, ITEMS_PER_PAGE)
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [filterCategory, setFilterCategory] = useState<string>("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(
    Math.ceil(initialPromos.length / ITEMS_PER_PAGE)
  );

  // Delete dialog state
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedPromoId, setSelectedPromoId] = useState<string>("");
  const [selectedPromoTitle, setSelectedPromoTitle] = useState<string>("");
  const [isDeleting, setIsDeleting] = useState(false);

  // Edit dialog state
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [selectedPromo, setSelectedPromo] = useState<Tables<"pricing_promos"> | null>(null);

  // Add dialog state
  const [addDialogOpen, setAddDialogOpen] = useState(false);

  // Fetch categories when dialog opens
  const fetchCategories = async () => {
    try {
      const response = await api.get("/admin/pricing/categories");
      if (response.status === 200 && response.data.categories) {
        setCategoriesList(response.data.categories);
      }
    } catch (error) {
      console.error("Error fetching categories:", error);
    }
  };

  // Fetch updated promos from API
  const fetchPromos = async () => {
    try {
      const response = await api.get("/admin/pricing/promos");
      if (response.status === 200) {
        setPromosList(response.data.promos);
        return response.data.promos;
      }
    } catch (error) {
      console.error("Error fetching promos:", error);
      return promosList;
    }
  };

  // Filter and search promos
  const getFilteredPromos = () => {
    let filtered = [...promosList];

    if (filterCategory !== "all") {
      filtered = filtered.filter((p) => p.category_slug === filterCategory);
    }

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (p) =>
          p.title?.toLowerCase().includes(query) ||
          p.description?.toLowerCase().includes(query) ||
          p.badge?.toLowerCase().includes(query)
      );
    }

    return filtered;
  };

  const updatePagination = (page: number) => {
    const filtered = getFilteredPromos();
    const startIndex = (page - 1) * ITEMS_PER_PAGE;
    const endIndex = startIndex + ITEMS_PER_PAGE;
    const paginatedPromos = filtered.slice(startIndex, endIndex);

    setDisplayedPromos(paginatedPromos);
    setCurrentPage(page);
    setTotalPages(Math.ceil(filtered.length / ITEMS_PER_PAGE));
  };

  const handleSearch = () => {
    updatePagination(1);
  };

  const handleFilterChange = (value: string) => {
    setFilterCategory(value);
  };

  const handleEditPromo = (promo: Tables<"pricing_promos">) => {
    fetchCategories();
    setSelectedPromo(promo);
    setEditDialogOpen(true);
  };

  const handleDeletePromo = (promoId: string, promoTitle: string) => {
    setSelectedPromoId(promoId);
    setSelectedPromoTitle(promoTitle);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = async () => {
    if (!selectedPromoId) return;

    setIsDeleting(true);
    try {
      const response = await api.delete("/admin/pricing/promos", {
        data: { id: selectedPromoId },
      });

      if (response.status === 200) {
        toast.success("Promo deleted successfully");
        setDeleteDialogOpen(false);
        const updatedPromos = await fetchPromos();
        if (updatedPromos) {
          updatePagination(1);
        }
      }
    } catch (error: unknown) {
      console.error("Error deleting promo:", error);
      toast.error(
        (error as { response?: { data?: { error?: string } } }).response?.data?.error ||
        "Failed to delete promo"
      );
    } finally {
      setIsDeleting(false);
    }
  };

  const handleEditSuccess = async () => {
    const updatedPromos = await fetchPromos();
    if (updatedPromos) {
      updatePagination(currentPage);
    }
  };

  const handleAddSuccess = async () => {
    const updatedPromos = await fetchPromos();
    if (updatedPromos) {
      updatePagination(1);
    }
  };

  useEffect(() => {
    updatePagination(1);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery, filterCategory]);

  // Fetch categories on mount
  useEffect(() => {
    fetchCategories();
  }, []);

  const getCategoryLabel = (slug: string) => {
    const category = categoriesList.find((c) => c.slug === slug);
    return category?.label || slug;
  };

  return (
    <>
      {/* Search, Filter, and Add Button */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="flex-1 flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-neutral-500" />
            <Input
              placeholder="Search by title, description, or badge..."
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
          <Select value={filterCategory} onValueChange={handleFilterChange}>
            <SelectTrigger className="cursor-pointer w-[180px] bg-neutral-900 border-neutral-800 text-white focus:ring-0">
              <Filter className="h-4 w-4 mr-2" />
              <SelectValue placeholder="Filter by category" />
            </SelectTrigger>
            <SelectContent className="bg-neutral-900 border-neutral-800">
              <SelectItem
                value="all"
                className="cursor-pointer text-white focus:bg-neutral-800 focus:text-white"
              >
                All Categories
              </SelectItem>
              {categoriesList.map((cat) => (
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

          <Button
            onClick={() => {
              fetchCategories();
              setAddDialogOpen(true);
            }}
            className="cursor-pointer bg-green-600 hover:bg-green-700 text-white border-0"
          >
            <Plus className="h-4 w-4 mr-2" />
            New Promo
          </Button>
        </div>
      </div>

      {/* Promos Table */}
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
                    Badge
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-neutral-400 uppercase tracking-wider">
                    Title
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-neutral-400 uppercase tracking-wider">
                    Category
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-neutral-400 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-neutral-400 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-800">
                {displayedPromos.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-12 text-center">
                      <Gift className="h-12 w-12 text-neutral-600 mx-auto mb-3" />
                      <p className="text-neutral-400 text-sm">No promos found</p>
                    </td>
                  </tr>
                ) : (
                  displayedPromos.map((promo) => (
                    <tr
                      key={promo.id}
                      className="hover:bg-neutral-800/30 transition-colors"
                    >
                      <td className="px-6 py-4">
                        <div className="flex flex-col gap-1">
                          <Badge className="bg-white text-black w-fit text-xs">
                            {promo.badge}
                          </Badge>
                          {promo.badge_note && (
                            <span className="text-xs text-neutral-500">
                              {promo.badge_note}
                            </span>
                          )}
                        </div>
                      </td>

                      <td className="px-6 py-4">
                        <div className="max-w-[250px]">
                          <div className="font-medium text-white text-sm truncate">
                            {promo.title}
                          </div>
                          <div className="text-xs text-neutral-500 truncate">
                            {promo.description}
                          </div>
                        </div>
                      </td>

                      <td className="px-6 py-4">
                        <Badge className="bg-blue-500/20 text-blue-300 hover:bg-blue-500/30 border-0 text-xs">
                          {getCategoryLabel(promo.category_slug)}
                        </Badge>
                      </td>

                      <td className="px-6 py-4">
                        {promo.active ? (
                          <Badge className="bg-green-500/20 text-green-300 hover:bg-green-500/30 border-0">
                            <Eye className="h-3 w-3 mr-1" />
                            Active
                          </Badge>
                        ) : (
                          <Badge className="bg-neutral-700/50 text-neutral-400 hover:bg-neutral-700 border-0">
                            <EyeOff className="h-3 w-3 mr-1" />
                            Hidden
                          </Badge>
                        )}
                      </td>

                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleEditPromo(promo)}
                            className="cursor-pointer h-8 w-8 text-neutral-400 hover:text-white hover:bg-neutral-800"
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() =>
                              handleDeletePromo(promo.id, promo.title)
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
            <AlertDialogTitle className="text-white">Delete Promo</AlertDialogTitle>
            <AlertDialogDescription className="text-neutral-400">
              Are you sure you want to delete &quot;{selectedPromoTitle}&quot;? This
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
      <EditPromoDialog
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
        promo={selectedPromo}
        categories={categoriesList}
        onSuccess={handleEditSuccess}
      />

      {/* Add Dialog */}
      <AddPromoDialog
        open={addDialogOpen}
        onOpenChange={setAddDialogOpen}
        categories={categoriesList}
        onSuccess={handleAddSuccess}
      />
    </>
  );
}
