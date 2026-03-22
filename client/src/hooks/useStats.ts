import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { StatsResponse } from "@/types";

interface UseStatsReturn {
  stats: StatsResponse | null;
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
  setDateRange: (from: string, to: string) => void;
  dateRange: { from: string; to: string };
}

function defaultDateRange(): { from: string; to: string } {
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth(), 1)
    .toISOString()
    .slice(0, 10);
  const to = now.toISOString().slice(0, 10);
  return { from, to };
}

export function useStats(): UseStatsReturn {
  const [dateRange, setDateRangeState] = useState(defaultDateRange);
  const [stats, setStats] = useState<StatsResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setError(null);

    api
      .get<StatsResponse>("/api/applications/stats", {
        from: dateRange.from,
        to: dateRange.to,
      })
      .then((res) => {
        if (cancelled) return;
        if (res.error) {
          setError(res.error.message);
          setStats(null);
        } else {
          setStats(res.data);
        }
        setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [dateRange, refreshKey]);

  function setDateRange(from: string, to: string) {
    setDateRangeState({ from, to });
  }

  return {
    stats,
    isLoading,
    error,
    refetch: () => setRefreshKey((k) => k + 1),
    setDateRange,
    dateRange,
  };
}
