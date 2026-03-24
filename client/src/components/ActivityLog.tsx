import {
  PlusCircle,
  RefreshCw,
  Calendar,
  FileText,
  Archive,
  ArchiveRestore,
  Trash2,
} from "lucide-react";
import type { ActivityEvent, ActivityEventType } from "@/types";

interface ActivityLogProps {
  history: ActivityEvent[];
}

const ICON_MAP: Record<ActivityEventType, React.ElementType> = {
  application_created: PlusCircle,
  status_changed: RefreshCw,
  interview_added: Calendar,
  interview_updated: Calendar,
  interview_deleted: Calendar,
  file_uploaded: FileText,
  file_deleted: Trash2,
  application_deleted: Archive,
  application_restored: ArchiveRestore,
};

const COLOR_MAP: Record<ActivityEventType, string> = {
  application_created: "text-green-600",
  status_changed: "text-blue-600",
  interview_added: "text-purple-600",
  interview_updated: "text-purple-600",
  interview_deleted: "text-orange-600",
  file_uploaded: "text-teal-600",
  file_deleted: "text-red-600",
  application_deleted: "text-red-600",
  application_restored: "text-green-600",
};

function formatRelativeTime(isoTimestamp: string): string {
  const now = Date.now();
  const then = new Date(isoTimestamp).getTime();
  const diffMs = now - then;

  const seconds = Math.floor(diffMs / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

export function ActivityLog({ history }: ActivityLogProps) {
  // Most recent first
  const sorted = [...history].sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
  );

  return (
    <div className="rounded-lg border p-6">
      <h2 className="mb-4 text-lg font-semibold">Activity Log</h2>

      {sorted.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          No activity recorded yet.
        </p>
      ) : (
        <div className="relative space-y-0">
          {sorted.map((event, index) => {
            const Icon = ICON_MAP[event.type] ?? RefreshCw;
            const color = COLOR_MAP[event.type] ?? "text-muted-foreground";
            const isLast = index === sorted.length - 1;

            return (
              <div key={event.id} className="relative flex gap-3 pb-4">
                {/* Vertical connector line */}
                {!isLast && (
                  <div className="absolute left-[13px] top-7 bottom-0 w-px bg-border" />
                )}

                {/* Icon circle */}
                <div
                  className={`relative z-10 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border bg-background ${color}`}
                >
                  <Icon className="h-3.5 w-3.5" />
                </div>

                {/* Content */}
                <div className="flex-1 pt-0.5">
                  <p className="text-sm">{event.description}</p>
                  <p
                    className="text-xs text-muted-foreground"
                    title={new Date(event.timestamp).toLocaleString()}
                  >
                    {formatRelativeTime(event.timestamp)}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
