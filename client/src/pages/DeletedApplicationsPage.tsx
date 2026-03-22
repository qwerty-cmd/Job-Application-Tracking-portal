import { useState } from "react";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { formatApiError } from "@/lib/utils";
import { DeletedApplicationCard } from "@/components/DeletedApplicationCard";
import { useDeletedApplications } from "@/hooks/useDeletedApplications";
import { useRestoreApplication } from "@/hooks/useMutations";

export function DeletedApplicationsPage() {
  const { items, isLoading, error, refetch } = useDeletedApplications();
  const { restore } = useRestoreApplication();
  const [restoringId, setRestoringId] = useState<string | null>(null);

  const handleRestore = async (id: string) => {
    setRestoringId(id);
    const res = await restore(id);
    setRestoringId(null);
    if (res.data) {
      toast.success("Application restored");
      refetch();
    } else {
      toast.error(formatApiError(res.error, "Failed to restore"));
    }
  };

  if (isLoading) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-6">
        <p className="text-muted-foreground">Loading…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-6">
        <p className="text-destructive">{error}</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Trash2 className="h-6 w-6" aria-hidden="true" />
          Recently Deleted
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          These applications have been soft-deleted. You can restore them or
          they will remain hidden from your main list and stats.
        </p>
      </div>

      {items.length === 0 ? (
        <p className="py-12 text-center text-muted-foreground">
          No deleted applications.
        </p>
      ) : (
        <div className="space-y-4">
          {items.map((app) => (
            <DeletedApplicationCard
              key={app.id}
              app={app}
              onRestore={handleRestore}
              isRestoring={restoringId === app.id}
            />
          ))}
        </div>
      )}
    </div>
  );
}
