import type { ApplicationStatus } from "@/types";
import { Badge } from "@/components/ui/badge";

const statusConfig: Record<
  ApplicationStatus,
  { label: string; className: string }
> = {
  Applying: {
    label: "Applying",
    className: "bg-slate-100 text-slate-700 border-slate-200",
  },
  "Application Submitted": {
    label: "Submitted",
    className: "bg-blue-100 text-blue-700 border-blue-200",
  },
  "Recruiter Screening": {
    label: "Screening",
    className: "bg-cyan-100 text-cyan-700 border-cyan-200",
  },
  "Interview Stage": {
    label: "Interview",
    className: "bg-purple-100 text-purple-700 border-purple-200",
  },
  "Pending Offer": {
    label: "Pending Offer",
    className: "bg-amber-100 text-amber-700 border-amber-200",
  },
  Accepted: {
    label: "Accepted",
    className: "bg-green-100 text-green-700 border-green-200",
  },
  Rejected: {
    label: "Rejected",
    className: "bg-red-100 text-red-700 border-red-200",
  },
  Withdrawn: {
    label: "Withdrawn",
    className: "bg-orange-100 text-orange-700 border-orange-200",
  },
};

interface StatusBadgeProps {
  status: ApplicationStatus;
}

export function StatusBadge({ status }: StatusBadgeProps) {
  const config = statusConfig[status];

  return (
    <Badge variant="outline" className={config.className}>
      {config.label}
    </Badge>
  );
}
