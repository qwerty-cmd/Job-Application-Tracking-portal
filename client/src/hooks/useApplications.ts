import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type {
  ApplicationListResponse,
  ApplicationSummary,
  PaginationInfo,
  ApplicationStatus,
} from "@/types";

export interface ApplicationFilters {
  status?: ApplicationStatus;
  from?: string;
  to?: string;
  sortBy?: "dateApplied" | "company" | "status" | "updatedAt";
  sortOrder?: "asc" | "desc";
  page?: number;
  pageSize?: number;
}

interface UseApplicationsReturn {
  items: ApplicationSummary[];
  pagination: PaginationInfo | null;
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
  setFilters: (filters: ApplicationFilters) => void;
  filters: ApplicationFilters;
}

const DEFAULT_FILTERS: ApplicationFilters = {
  sortBy: "dateApplied",
  sortOrder: "desc",
  page: 1,
  pageSize: 20,
};

export function useApplications(
  initialFilters?: ApplicationFilters,
): UseApplicationsReturn {
  const [filters, setFilters] = useState<ApplicationFilters>({
    ...DEFAULT_FILTERS,
    ...initialFilters,
  });
  const [items, setItems] = useState<ApplicationSummary[]>([]);
  const [pagination, setPagination] = useState<PaginationInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setError(null);

    const params: Record<string, string> = {};
    if (filters.status) params.status = filters.status;
    if (filters.from) params.from = filters.from;
    if (filters.to) params.to = filters.to;
    if (filters.sortBy) params.sortBy = filters.sortBy;
    if (filters.sortOrder) params.sortOrder = filters.sortOrder;
    if (filters.page) params.page = String(filters.page);
    if (filters.pageSize) params.pageSize = String(filters.pageSize);

    api
      .get<ApplicationListResponse>("/api/applications", params)
      .then((res) => {
        if (cancelled) return;
        if (res.error) {
          setError(res.error.message);
          setItems([]);
          setPagination(null);
        } else if (res.data) {
          setItems(res.data.items);
          setPagination(res.data.pagination);
        }
        setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [filters, refreshKey]);

  return {
    items,
    pagination,
    isLoading,
    error,
    refetch: () => setRefreshKey((k) => k + 1),
    setFilters,
    filters,
  };
}
