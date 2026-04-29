import { useNavigate } from "react-router-dom";
import { StatusBadge } from "@/components/StatusBadge";
import type { ApplicationSummary } from "@/types";

interface ApplicationCardProps {
  item: ApplicationSummary;
}

export function ApplicationCard({ item }: ApplicationCardProps) {
  const navigate = useNavigate();

  const locationParts = [item.location?.city, item.location?.country].filter(Boolean);
  const locationText = locationParts.length > 0 ? locationParts.join(", ") : null;

  return (
    <article
      role="article"
      className="cursor-pointer rounded-lg border bg-card p-4 transition-colors hover:bg-accent/50 active:bg-accent"
      onClick={() => navigate(`/applications/${item.id}`)}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">{item.company}</p>
          <p className="truncate text-sm text-muted-foreground">{item.role}</p>
        </div>
        <StatusBadge status={item.status} />
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
        {locationText ? (
          <span>{locationText}</span>
        ) : (
          <span>—</span>
        )}
        {item.location?.workMode && locationText && (
          <span aria-hidden="true">·</span>
        )}
        {item.location?.workMode && (
          <span>{item.location.workMode}</span>
        )}
      </div>

      <p className="mt-1 text-xs text-muted-foreground">{item.dateApplied}</p>
    </article>
  );
}
