"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Search, X } from "lucide-react";

export interface AuditLogFilters {
  user_id?: string;
  service_type?: string;
  action?: string;
  start_date?: string;
  end_date?: string;
}

interface AuditLogFiltersProps {
  filters: AuditLogFilters;
  onFiltersChange: (filters: AuditLogFilters) => void;
  onSearch: () => void;
}

export function AuditLogFilters({
  filters,
  onFiltersChange,
  onSearch,
}: AuditLogFiltersProps) {
  const [localFilters, setLocalFilters] = useState<AuditLogFilters>(filters);

  const handleFilterChange = (key: keyof AuditLogFilters, value: string) => {
    const newFilters = { ...localFilters, [key]: value === "all" || !value ? undefined : value };
    setLocalFilters(newFilters);
    onFiltersChange(newFilters);
  };

  const handleClearFilters = () => {
    const emptyFilters: AuditLogFilters = {};
    setLocalFilters(emptyFilters);
    onFiltersChange(emptyFilters);
  };

  const hasActiveFilters = Object.values(localFilters).some(
    (value) => value !== undefined && value !== ""
  );

  return (
    <div className="space-y-4 rounded-lg border bg-card p-6">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Filters</h3>
        {hasActiveFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={handleClearFilters}
            className="h-8 px-2"
          >
            <X className="mr-1 h-4 w-4" />
            Clear all
          </Button>
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {/* User ID */}
        <div className="space-y-2">
          <Label htmlFor="user_id">User ID</Label>
          <Input
            id="user_id"
            placeholder="Enter user UUID..."
            value={localFilters.user_id || ""}
            onChange={(e) => handleFilterChange("user_id", e.target.value)}
          />
        </div>

        {/* Service Type */}
        <div className="space-y-2">
          <Label htmlFor="service_type">Service Type</Label>
          <Select
            value={localFilters.service_type || "all"}
            onValueChange={(value) => handleFilterChange("service_type", value)}
          >
            <SelectTrigger id="service_type">
              <SelectValue placeholder="All services" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All services</SelectItem>
              <SelectItem value="auth">Authentication</SelectItem>
              <SelectItem value="database">Database</SelectItem>
              <SelectItem value="kubernetes">Kubernetes</SelectItem>
              <SelectItem value="compute">Compute</SelectItem>
              <SelectItem value="platform_apps">Platform Apps</SelectItem>
              <SelectItem value="network_ddos">Network/DDoS</SelectItem>
              <SelectItem value="object_storage">Object Storage</SelectItem>
              <SelectItem value="domain">Domains</SelectItem>
              <SelectItem value="ai_agent">AI Agents</SelectItem>
              <SelectItem value="pricing">Pricing</SelectItem>
              <SelectItem value="discount">Discounts</SelectItem>
              <SelectItem value="billing">Billing</SelectItem>
              <SelectItem value="gpu">GPU</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Action */}
        <div className="space-y-2">
          <Label htmlFor="action">Action</Label>
          <Select
            value={localFilters.action || "all"}
            onValueChange={(value) => handleFilterChange("action", value)}
          >
            <SelectTrigger id="action">
              <SelectValue placeholder="All actions" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All actions</SelectItem>
              <SelectItem value="login">Login</SelectItem>
              <SelectItem value="logout">Logout</SelectItem>
              <SelectItem value="create">Create</SelectItem>
              <SelectItem value="update">Update</SelectItem>
              <SelectItem value="delete">Delete</SelectItem>
              <SelectItem value="access">Access (customer-data read)</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Start Date */}
        <div className="space-y-2">
          <Label htmlFor="start_date">Start Date</Label>
          <Input
            id="start_date"
            type="datetime-local"
            value={localFilters.start_date || ""}
            onChange={(e) => handleFilterChange("start_date", e.target.value)}
          />
        </div>

        {/* End Date */}
        <div className="space-y-2">
          <Label htmlFor="end_date">End Date</Label>
          <Input
            id="end_date"
            type="datetime-local"
            value={localFilters.end_date || ""}
            onChange={(e) => handleFilterChange("end_date", e.target.value)}
          />
        </div>
      </div>

      <div className="flex justify-end">
        <Button onClick={onSearch} className="gap-2">
          <Search className="h-4 w-4" />
          Search
        </Button>
      </div>
    </div>
  );
}
