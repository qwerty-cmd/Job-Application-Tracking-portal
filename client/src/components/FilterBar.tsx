import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { APPLICATION_STATUSES } from "@/types";
import type { ApplicationFilters } from "@/hooks/useApplications";

interface FilterBarProps {
  filters: ApplicationFilters;
  onApply: (filters: ApplicationFilters) => void;
}

export function FilterBar({ filters, onApply }: FilterBarProps) {
  const [local, setLocal] = useState<ApplicationFilters>({ ...filters });

  function handleApply() {
    // Reset to page 1 when filters change
    onApply({ ...local, page: 1 });
  }

  function handleReset() {
    const reset: ApplicationFilters = {
      status: undefined,
      from: undefined,
      to: undefined,
      sortBy: "dateApplied",
      sortOrder: "desc",
      page: 1,
      pageSize: filters.pageSize,
    };
    setLocal(reset);
    onApply(reset);
  }

  return (
    <div className="flex flex-wrap items-end gap-3 rounded-lg border bg-muted/30 p-3">
      {/* Status filter */}
      <div className="flex flex-col gap-1">
        <Label htmlFor="filter-status">Status</Label>
        <Select
          value={local.status ?? "all"}
          onValueChange={(val) =>
            setLocal((prev) => ({
              ...prev,
              status:
                !val || val === "all"
                  ? undefined
                  : (val as ApplicationFilters["status"]),
            }))
          }
        >
          <SelectTrigger id="filter-status" className="w-[160px]">
            <SelectValue placeholder="All Statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            {APPLICATION_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Date range */}
      <div className="flex flex-col gap-1">
        <Label htmlFor="filter-from">From</Label>
        <Input
          id="filter-from"
          type="date"
          value={local.from ?? ""}
          onChange={(e) =>
            setLocal((prev) => ({
              ...prev,
              from: e.target.value || undefined,
            }))
          }
          className="w-[140px]"
        />
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="filter-to">To</Label>
        <Input
          id="filter-to"
          type="date"
          value={local.to ?? ""}
          onChange={(e) =>
            setLocal((prev) => ({
              ...prev,
              to: e.target.value || undefined,
            }))
          }
          className="w-[140px]"
        />
      </div>

      {/* Sort field */}
      <div className="flex flex-col gap-1">
        <Label htmlFor="filter-sort">Sort By</Label>
        <Select
          value={local.sortBy ?? "dateApplied"}
          onValueChange={(val) =>
            setLocal((prev) => ({
              ...prev,
              sortBy: (val ?? "dateApplied") as ApplicationFilters["sortBy"],
            }))
          }
        >
          <SelectTrigger id="filter-sort" className="w-[150px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="dateApplied">Date Applied</SelectItem>
            <SelectItem value="company">Company</SelectItem>
            <SelectItem value="status">Status</SelectItem>
            <SelectItem value="updatedAt">Last Updated</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Sort order */}
      <div className="flex flex-col gap-1">
        <Label htmlFor="filter-order">Order</Label>
        <Select
          value={local.sortOrder ?? "desc"}
          onValueChange={(val) =>
            setLocal((prev) => ({
              ...prev,
              sortOrder: (val ?? "desc") as ApplicationFilters["sortOrder"],
            }))
          }
        >
          <SelectTrigger id="filter-order" className="w-[100px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="desc">Desc</SelectItem>
            <SelectItem value="asc">Asc</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Action buttons */}
      <div className="flex gap-2">
        <Button onClick={handleApply}>Apply</Button>
        <Button variant="outline" onClick={handleReset}>
          Reset
        </Button>
      </div>
    </div>
  );
}
