import { useNavigate } from "react-router-dom";
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  createColumnHelper,
} from "@tanstack/react-table";
import {
  Check,
  X,
  ChevronUp,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/StatusBadge";
import type { ApplicationSummary, PaginationInfo } from "@/types";
import type { ApplicationFilters } from "@/hooks/useApplications";

interface ApplicationsTableProps {
  items: ApplicationSummary[];
  pagination: PaginationInfo | null;
  filters: ApplicationFilters;
  onFiltersChange: (filters: ApplicationFilters) => void;
  onCreateClick?: () => void;
}

const columnHelper = createColumnHelper<ApplicationSummary>();

function FileIndicator({ has }: { has: boolean }) {
  return has ? (
    <Check
      className="inline-block h-3.5 w-3.5 text-green-600"
      aria-hidden="true"
    />
  ) : (
    <X
      className="inline-block h-3.5 w-3.5 text-muted-foreground/40"
      aria-hidden="true"
    />
  );
}

function SortIndicator({
  column,
  currentSort,
  currentOrder,
}: {
  column: string;
  currentSort?: string;
  currentOrder?: string;
}) {
  if (currentSort !== column) return null;
  return currentOrder === "asc" ? (
    <ChevronUp className="ml-1 inline-block h-3.5 w-3.5" aria-hidden="true" />
  ) : (
    <ChevronDown className="ml-1 inline-block h-3.5 w-3.5" aria-hidden="true" />
  );
}

const SORTABLE_COLUMNS = new Set([
  "company",
  "dateApplied",
  "status",
  "updatedAt",
]);

export function ApplicationsTable({
  items,
  pagination,
  filters,
  onFiltersChange,
  onCreateClick,
}: ApplicationsTableProps) {
  const navigate = useNavigate();

  function handleSort(columnId: string) {
    if (!SORTABLE_COLUMNS.has(columnId)) return;
    const sortBy = columnId as ApplicationFilters["sortBy"];
    const sortOrder =
      filters.sortBy === columnId && filters.sortOrder === "asc"
        ? "desc"
        : "asc";
    onFiltersChange({ ...filters, sortBy, sortOrder, page: 1 });
  }

  const columns = [
    columnHelper.accessor("company", {
      header: "Company",
      cell: (info) => <span className="font-medium">{info.getValue()}</span>,
    }),
    columnHelper.accessor("role", {
      header: "Role",
      cell: (info) => (
        <span className="max-w-[200px] truncate block">{info.getValue()}</span>
      ),
    }),
    columnHelper.display({
      id: "location",
      header: "Location",
      cell: ({ row }) => {
        const loc = row.original.location;
        if (!loc?.city && !loc?.country) return "—";
        return [loc.city, loc.country].filter(Boolean).join(", ");
      },
    }),
    columnHelper.display({
      id: "workMode",
      header: "Work Mode",
      cell: ({ row }) => row.original.location?.workMode ?? "—",
    }),
    columnHelper.accessor("dateApplied", {
      header: "Applied",
    }),
    columnHelper.accessor("status", {
      header: "Status",
      cell: (info) => <StatusBadge status={info.getValue()} />,
    }),
    columnHelper.display({
      id: "files",
      header: "Files",
      cell: ({ row }) => (
        <div className="flex gap-1 text-xs">
          <span
            title="Resume"
            aria-label={
              row.original.hasResume ? "Resume uploaded" : "No resume"
            }
          >
            <FileIndicator has={row.original.hasResume} />
          </span>
          <span
            title="Cover Letter"
            aria-label={
              row.original.hasCoverLetter
                ? "Cover letter uploaded"
                : "No cover letter"
            }
          >
            <FileIndicator has={row.original.hasCoverLetter} />
          </span>
          <span
            title="Job Description"
            aria-label={
              row.original.hasJobDescription
                ? "Job description uploaded"
                : "No job description"
            }
          >
            <FileIndicator has={row.original.hasJobDescription} />
          </span>
        </div>
      ),
    }),
  ];

  const table = useReactTable({
    data: items,
    columns,
    getCoreRowModel: getCoreRowModel(),
    manualSorting: true,
    manualPagination: true,
    rowCount: pagination?.totalItems ?? 0,
  });

  return (
    <div>
      <Table>
        <TableHeader>
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow key={headerGroup.id}>
              {headerGroup.headers.map((header) => {
                const isSortable = SORTABLE_COLUMNS.has(header.id);
                const ariaSortValue = !isSortable
                  ? undefined
                  : filters.sortBy === header.id
                    ? filters.sortOrder === "asc"
                      ? ("ascending" as const)
                      : ("descending" as const)
                    : ("none" as const);

                return (
                  <TableHead
                    key={header.id}
                    className={
                      isSortable
                        ? "cursor-pointer select-none hover:bg-muted/80"
                        : ""
                    }
                    onClick={() => handleSort(header.id)}
                    onKeyDown={
                      isSortable
                        ? (e: React.KeyboardEvent) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              handleSort(header.id);
                            }
                          }
                        : undefined
                    }
                    tabIndex={isSortable ? 0 : undefined}
                    role="columnheader"
                    aria-sort={ariaSortValue}
                  >
                    {flexRender(
                      header.column.columnDef.header,
                      header.getContext(),
                    )}
                    {isSortable && (
                      <SortIndicator
                        column={header.id}
                        currentSort={filters.sortBy}
                        currentOrder={filters.sortOrder}
                      />
                    )}
                  </TableHead>
                );
              })}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {items.length === 0 ? (
            <TableRow>
              <TableCell colSpan={columns.length} className="h-32 text-center">
                <div className="flex flex-col items-center gap-2">
                  <p className="font-medium text-muted-foreground">
                    No applications yet
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Start tracking your job search by adding your first
                    application.
                  </p>
                  {onCreateClick && (
                    <Button size="sm" className="mt-2" onClick={onCreateClick}>
                      + New Application
                    </Button>
                  )}
                </div>
              </TableCell>
            </TableRow>
          ) : (
            table.getRowModel().rows.map((row) => (
              <TableRow
                key={row.id}
                className="cursor-pointer"
                onClick={() => navigate(`/applications/${row.original.id}`)}
              >
                {row.getVisibleCells().map((cell) => (
                  <TableCell key={cell.id}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>

      {/* Pagination */}
      {pagination && pagination.totalPages > 1 && (
        <div className="flex items-center justify-between border-t px-2 py-3">
          <div className="text-sm text-muted-foreground">
            Showing {(pagination.page - 1) * pagination.pageSize + 1}–
            {Math.min(
              pagination.page * pagination.pageSize,
              pagination.totalItems,
            )}{" "}
            of {pagination.totalItems} applications
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={pagination.page <= 1}
              onClick={() =>
                onFiltersChange({ ...filters, page: pagination.page - 1 })
              }
            >
              <ChevronLeft className="mr-1 h-4 w-4" aria-hidden="true" />
              Prev
            </Button>
            <span className="text-sm text-muted-foreground">
              Page {pagination.page} of {pagination.totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={pagination.page >= pagination.totalPages}
              onClick={() =>
                onFiltersChange({ ...filters, page: pagination.page + 1 })
              }
            >
              Next
              <ChevronRight className="ml-1 h-4 w-4" aria-hidden="true" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
