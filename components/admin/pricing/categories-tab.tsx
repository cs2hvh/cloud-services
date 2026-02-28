"use client";

import { useState, useEffect } from "react";
import { motion } from "motion/react";
import {
  Search,
  ChevronLeft,
  ChevronRight,
  Pencil,
  Trash2,
  Tag,
  Plus,
  Loader2,
  Eye,
  EyeOff,
  ArrowUp,
  ArrowDown,
} from "lucide-react";
import { Tables } from "@/lib/supabase/types";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
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
import EditCategoryDialog from "./edit-category-dialog";
import AddCategoryDialog from "./add-category-dialog";

interface CategoriesTabProps {
  categories: Tables<"pricing_categories">[];
}

const ITEMS_PER_PAGE = 10;

export default function CategoriesTab({ categories: initialCategories }: CategoriesTabProps) {
  const [categoriesList, setCategoriesList] = useState<Tables<"pricing_categories">[]>(initialCategories);
  const [displayedCategories, setDisplayedCategories] = useState(
    initialCategories.slice(0, ITEMS_PER_PAGE)
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(
    Math.ceil(initialCategories.length / ITEMS_PER_PAGE)
  );

  // Delete dialog state
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | string>("");
  const [selectedCategoryName, setSelectedCategoryName] = useState<string>("");
  const [isDeleting, setIsDeleting] = useState(false);

  // Edit dialog state
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<Tables<"pricing_categories"> | null>(null);

  // Add dialog state
  const [addDialogOpen, setAddDialogOpen] = useState(false);

  // Fetch updated categories from API
  const fetchCategories = async () => {
    try {
      const response = await api.get("/admin/pricing/categories");
      if (response.status === 200) {
        setCategoriesList(response.data.categories);
        return response.data.categories;
      }
    } catch (error) {
      console.error("Error fetching categories:", error);
      return categoriesList;
    }
  };

  // Filter and search categories
  const getFilteredCategories = () => {
    let filtered = [...categoriesList];

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (c) =>
          c.label?.toLowerCase().includes(query) ||
          c.slug?.toLowerCase().includes(query) ||
          c.description?.toLowerCase().includes(query)
      );
    }

    return filtered;
  };

  const updatePagination = (page: number) => {
    const filtered = getFilteredCategories();
    const startIndex = (page - 1) * ITEMS_PER_PAGE;
    const endIndex = startIndex + ITEMS_PER_PAGE;
    const paginatedCategories = filtered.slice(startIndex, endIndex);

    setDisplayedCategories(paginatedCategories);
    setCurrentPage(page);
    setTotalPages(Math.ceil(filtered.length / ITEMS_PER_PAGE));
  };

  const handleSearch = () => {
    updatePagination(1);
  };

  const handleEditCategory = (category: Tables<"pricing_categories">) => {
    setSelectedCategory(category);
    setEditDialogOpen(true);
  };

  const handleDeleteCategory = (categoryId: number | string, categoryName: string) => {
    setSelectedCategoryId(categoryId);
    setSelectedCategoryName(categoryName);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = async () => {
    if (!selectedCategoryId) return;

    setIsDeleting(true);
    try {
      const response = await api.delete("/admin/pricing/categories", {
        data: { id: selectedCategoryId },
      });

      if (response.status === 200) {
        toast.success("Category deleted successfully");
        setDeleteDialogOpen(false);
        const updatedCategories = await fetchCategories();
        if (updatedCategories) {
          updatePagination(1);
        }
      }
    } catch (error: unknown) {
      console.error("Error deleting category:", error);
      toast.error(
        (error as { response?: { data?: { error?: string } } }).response?.data?.error || 
        "Failed to delete category"
      );
    } finally {
      setIsDeleting(false);
    }
  };

  const handleEditSuccess = async () => {
    const updatedCategories = await fetchCategories();
    if (updatedCategories) {
      updatePagination(currentPage);
    }
  };

  const handleAddSuccess = async () => {
    const updatedCategories = await fetchCategories();
    if (updatedCategories) {
      updatePagination(1);
    }
  };

  useEffect(() => {
    updatePagination(1);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery]);

  return (
    <>
      {/* Search and Add Button */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="flex-1 flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-neutral-500" />
            <Input
              placeholder="Search by name, slug, or description..."
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

        <Button
          onClick={() => setAddDialogOpen(true)}
          className="cursor-pointer bg-green-600 hover:bg-green-700 text-white border-0"
        >
          <Plus className="h-4 w-4 mr-2" />
          New Category
        </Button>
      </div>

      {/* Categories Table */}
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
                    Order
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-neutral-400 uppercase tracking-wider">
                    Label
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-neutral-400 uppercase tracking-wider">
                    Slug
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-neutral-400 uppercase tracking-wider">
                    Description
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
                {displayedCategories.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-12 text-center">
                      <Tag className="h-12 w-12 text-neutral-600 mx-auto mb-3" />
                      <p className="text-neutral-400 text-sm">
                        No categories found
                      </p>
                    </td>
                  </tr>
                ) : (
                  displayedCategories.map((category) => (
                    <tr
                      key={category.id}
                      className="hover:bg-neutral-800/30 transition-colors"
                    >
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-white font-mono">
                            {category.sort_order}
                          </span>
                        </div>
                      </td>

                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <Tag className="h-4 w-4 text-neutral-500" />
                          <span className="font-medium text-white text-sm">
                            {category.label}
                          </span>
                        </div>
                      </td>

                      <td className="px-6 py-4">
                        <Badge className="bg-blue-500/20 text-blue-300 hover:bg-blue-500/30 border-0 text-xs px-2 py-0.5">
                          {category.slug}
                        </Badge>
                      </td>

                      <td className="px-6 py-4">
                        <div className="text-sm text-neutral-300 max-w-[200px] truncate">
                          {category.description || (
                            <span className="text-neutral-600">No description</span>
                          )}
                        </div>
                      </td>

                      <td className="px-6 py-4">
                        {category.active ? (
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
                            onClick={() => handleEditCategory(category)}
                            className="cursor-pointer h-8 w-8 text-neutral-400 hover:text-white hover:bg-neutral-800"
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() =>
                              handleDeleteCategory(category.id, category.label)
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
            <AlertDialogTitle className="text-white">
              Delete Category
            </AlertDialogTitle>
            <AlertDialogDescription className="text-neutral-400">
              Are you sure you want to delete &quot;{selectedCategoryName}&quot;? This
              action cannot be undone. Products and promos using this category
              will need to be updated.
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
      <EditCategoryDialog
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
        category={selectedCategory}
        onSuccess={handleEditSuccess}
      />

      {/* Add Dialog */}
      <AddCategoryDialog
        open={addDialogOpen}
        onOpenChange={setAddDialogOpen}
        onSuccess={handleAddSuccess}
      />
    </>
  );
}
