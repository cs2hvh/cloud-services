"use client";

import { useEffect, useState } from "react";
import { motion } from "motion/react";
import {
  Search,
  Database as DatabaseIcon,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  Filter,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { Admin_Database } from "@/lib/supabase/types";
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
import { dbLocations } from "@/config/locations";

interface PageProps {
  all_databases: Admin_Database[];
}

const DATABASES_PER_PAGE = 10;

export default function AdminDatabases({ all_databases }: PageProps) {
  const router = useRouter();

  const [databases, setDatabases] = useState(all_databases.slice(0, DATABASES_PER_PAGE));
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<"email" | "engine" | "region">("email");
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(
    Math.ceil(all_databases.length / DATABASES_PER_PAGE)
  );
  const [totalDatabases, setTotalDatabases] = useState(all_databases.length);

  // Filter and sort databases
  const getFilteredAndSortedDatabases = () => {
    let filtered = [...all_databases];

    // Apply search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (db) =>
          db.name?.toLowerCase().includes(query) ||
          dbLocations?.find((location) => location.short === db.region)?.city.toLowerCase().includes(query) ||
          db.cluster_id?.toLowerCase().includes(query) ||
          db.owner_email?.toLowerCase().includes(query) ||
          db.owner_username?.toLowerCase().includes(query) ||
          getEngineDisplay(db.engine)?.toLowerCase().includes(query)
      );
    }

    // Apply sorting
    filtered.sort((a, b) => {
      if (sortBy === "email") {
        return (a.owner_email || "").localeCompare(b.owner_email || "");
      } else if (sortBy === "engine") {
        return (a.engine || "").localeCompare(b.engine || "");
      } else if (sortBy === "region") {
        return (a.region || "").localeCompare(b.region || "");
      }
      return 0;
    });

    return filtered;
  };

  const updatePagination = (page: number) => {
    const filtered = getFilteredAndSortedDatabases();
    const startIndex = (page - 1) * DATABASES_PER_PAGE;
    const endIndex = startIndex + DATABASES_PER_PAGE;
    const paginatedDatabases = filtered.slice(startIndex, endIndex);

    setDatabases(paginatedDatabases);
    setCurrentPage(page);
    setTotalPages(Math.ceil(filtered.length / DATABASES_PER_PAGE));
    setTotalDatabases(filtered.length);
  };

  const handleSearch = () => {
    updatePagination(1);
  };

  const handleSortChange = (value: "email" | "engine" | "region") => {
    setSortBy(value);
  };

  const handleViewDatabase = (clusterId: string) => {
    router.push(`/dashboard/services/database/clusters/${clusterId}`);
  };

  // Apply filters and pagination whenever search or sort changes
  useEffect(() => {
    updatePagination(1);
  }, [searchQuery, sortBy]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case "online":
        return "bg-emerald-950/50 text-emerald-400 border-emerald-900";
      case "creating":
        return "bg-yellow-950/50 text-yellow-400 border-yellow-900";
      case "pending":
        return "bg-blue-950/50 text-blue-400 border-blue-900";
      case "migrating":
        return "bg-purple-950/50 text-purple-400 border-purple-900";
      default:
        return "bg-neutral-800 text-neutral-400 border-neutral-700";
    }
  };

  const getEngineDisplay = (engine: string) => {
    const engineMap: { [key: string]: string } = {
      pg: "PostgreSQL",
      mysql: "MySQL",
      mongodb: "MongoDB",
      redis: "Redis",
    };
    return engineMap[engine.toLowerCase()] || engine;
  };

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
              <DatabaseIcon className="h-6 w-6 text-neutral-300" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold text-white">
                Database Management
              </h1>
              <p className="text-sm text-neutral-400 mt-0.5">
                {totalDatabases} database clusters
              </p>
            </div>
          </div>
        </div>

        {/* Search and Filters */}
        <div className="flex flex-col sm:flex-row gap-3 mb-6">
          <div className="flex-1 flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-neutral-500" />
              <Input
                placeholder="Search by name, cluster ID, owner email..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                className="pl-10 bg-neutral-900 border-neutral-800 text-white placeholder:text-neutral-500 focus:border-neutral-700 focus:ring-0"
              />
            </div>
            <Button
              onClick={handleSearch}
              className="bg-neutral-800 hover:bg-neutral-700 text-white border-0"
            >
              Search
            </Button>
          </div>

          <Select value={sortBy} onValueChange={handleSortChange}>
            <SelectTrigger className="w-[180px] bg-neutral-900 border-neutral-800 text-white focus:ring-0">
              <Filter className="h-4 w-4 mr-2" />
              <SelectValue placeholder="Sort by" />
            </SelectTrigger>
            <SelectContent className="bg-neutral-900 border-neutral-800">
              <SelectItem
                value="email"
                className="text-white focus:bg-neutral-800 focus:text-white"
              >
                Sort by Email
              </SelectItem>
              <SelectItem
                value="engine"
                className="text-white focus:bg-neutral-800 focus:text-white"
              >
                Sort by Db_type
              </SelectItem>
              <SelectItem
                value="region"
                className="text-white focus:bg-neutral-800 focus:text-white"
              >
                Sort by Region
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
      </motion.div>

      {/* Databases Table */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="max-w-[1600px] mx-auto"
      >
        <div className="bg-neutral-900 border border-neutral-800 rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-neutral-800/50 border-b border-neutral-800">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-neutral-400 uppercase tracking-wider">
                    Email
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-neutral-400 uppercase tracking-wider">
                    Db_Name
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-neutral-400 uppercase tracking-wider">
                    DB_type
                  </th>
                   <th className="px-6 py-3 text-left text-xs font-medium text-neutral-400 uppercase tracking-wider">
                    Version
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-neutral-400 uppercase tracking-wider">
                    Region
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
                {databases.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-12 text-center">
                      <DatabaseIcon className="h-12 w-12 text-neutral-600 mx-auto mb-3" />
                      <p className="text-neutral-400 text-sm">
                        No databases found
                      </p>
                    </td>
                  </tr>
                ) : (
                  databases.map((db) => (
                    <tr
                      key={db.id}
                      className="hover:bg-neutral-800/30 transition-colors"
                    >
                      <td className="px-6 py-4">
                        <div className="text-sm text-neutral-300">
                          {db.owner_email || (
                            <span className="text-neutral-600">No email</span>
                          )}
                        </div>
                        {db.owner_username && (
                          <div className="text-xs text-neutral-500">
                            @{db.owner_username}
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <DatabaseIcon className="h-4 w-4 text-neutral-500" />
                          <div>
                            <div className="font-medium text-white text-sm">
                              {db.name}
                            </div>
                            <div className="text-xs text-neutral-500 truncate max-w-[150px]">
                              {db.id}
                            </div>
                          </div>
                        </div>
                      </td>
                      
                      <td className="px-6 py-4">
                        <Badge
                          variant="outline"
                          className="bg-neutral-800 text-neutral-300 border-neutral-700"
                        >
                          {getEngineDisplay(db.engine)}
                        </Badge>
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-sm text-neutral-300">
                          {db.version || (
                            <span className="text-neutral-600">N/A</span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-sm text-neutral-300">
                          {dbLocations.find(
                            (location) => location.short === db.region
                          )?.city || (
                            <span className="text-neutral-600">N/A</span>
                          )}
                        </div>
                      </td>

                      <td className="px-6 py-4">
                        <Badge
                          className={`inline-flex items-center px-2 py-1 rounded text-xs font-medium border ${getStatusColor(
                            db.status
                          )}`}
                        >
                          {db.status}
                        </Badge>
                      </td>
                      <td className="px-6 py-4">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleViewDatabase(db.cluster_id)}
                          className="h-8 px-3 text-xs bg-neutral-800 hover:bg-neutral-700 text-neutral-300 border-0"
                        >
                          <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
                          View
                        </Button>
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
                  className="h-8 px-3 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 disabled:opacity-50 disabled:cursor-not-allowed border-0"
                >
                  <ChevronLeft className="h-4 w-4 mr-1" />
                  Previous
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => updatePagination(currentPage + 1)}
                  disabled={currentPage === totalPages}
                  className="h-8 px-3 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 disabled:opacity-50 disabled:cursor-not-allowed border-0"
                >
                  Next
                  <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              </div>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}
