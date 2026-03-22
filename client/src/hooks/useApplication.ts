import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { Application } from "@/types";

interface UseApplicationReturn {
  application: Application | null;
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useApplication(id: string | undefined): UseApplicationReturn {
  const [application, setApplication] = useState<Application | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    if (!id) {
      setApplication(null);
      setIsLoading(false);
      return;
    }

    let cancelled = false;
    setIsLoading(true);
    setError(null);

    api.get<Application>(`/api/applications/${id}`).then((res) => {
      if (cancelled) return;
      if (res.error) {
        setError(res.error.message);
        setApplication(null);
      } else {
        setApplication(res.data);
      }
      setIsLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [id, refreshKey]);

  return {
    application,
    isLoading,
    error,
    refetch: () => setRefreshKey((k) => k + 1),
  };
}
