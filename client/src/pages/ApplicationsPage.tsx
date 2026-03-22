import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { FilterBar } from "@/components/FilterBar";
import { ApplicationsTable } from "@/components/ApplicationsTable";
import { CreateApplicationModal } from "@/components/CreateApplicationModal";
import { useApplications } from "@/hooks/useApplications";
import { useCreateApplication } from "@/hooks/useMutations";
import { toast } from "sonner";
import { formatApiError } from "@/lib/utils";

export function ApplicationsPage() {
  const { items, pagination, isLoading, error, setFilters, filters, refetch } =
    useApplications();
  const { create, isLoading: isCreating } = useCreateApplication();
  const [createOpen, setCreateOpen] = useState(false);
  const navigate = useNavigate();

  async function handleCreate(data: Record<string, unknown>) {
    const res = await create(data);
    if (res.data) {
      setCreateOpen(false);
      toast.success("Application created");
      navigate(`/applications/${res.data.id}`);
    } else if (res.error) {
      toast.error(formatApiError(res.error, "Failed to create application"));
    }
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Applications</h1>
        <Button onClick={() => setCreateOpen(true)}>+ New Application</Button>
      </div>

      {/* Filters */}
      <div className="mt-4">
        <FilterBar filters={filters} onApply={setFilters} />
      </div>

      {/* Content */}
      <div className="mt-4">
        {error && (
          <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
            {error}
            <Button
              variant="outline"
              size="sm"
              className="ml-2"
              onClick={refetch}
            >
              Retry
            </Button>
          </div>
        )}

        {isLoading ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground">
            Loading applications...
          </div>
        ) : (
          <ApplicationsTable
            items={items}
            pagination={pagination}
            filters={filters}
            onFiltersChange={setFilters}
            onCreateClick={() => setCreateOpen(true)}
          />
        )}
      </div>

      {/* Create modal */}
      <CreateApplicationModal
        open={createOpen}
        onOpenChange={setCreateOpen}
        onSubmit={handleCreate}
        isLoading={isCreating}
      />
    </div>
  );
}
