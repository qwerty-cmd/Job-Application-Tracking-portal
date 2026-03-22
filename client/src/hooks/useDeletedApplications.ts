import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { ApplicationSummary } from "@/types";

interface UseDeletedApplicationsReturn {
  items: ApplicationSummary[];
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useDeletedApplications(): UseDeletedApplicationsReturn {
  const [items, setItems] = useState<ApplicationSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setError(null);

    api
      .get<{ items: ApplicationSummary[] }>("/api/applications/deleted")
      .then((res) => {
        if (cancelled) return;
        if (res.error) {
          setError(res.error.message);
          setItems([]);
        } else if (res.data) {
          setItems(res.data.items);
        }
        setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  return {
    items,
    isLoading,
    error,
    refetch: () => setRefreshKey((k) => k + 1),
  };
}
