import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { APPLICATION_STATUSES } from "@/types";
import type { ApplicationStatus, StatsResponse } from "@/types";

interface StatusChartProps {
  stats: StatsResponse;
}

const STATUS_BAR_COLORS: Record<ApplicationStatus, string> = {
  Applying: "bg-slate-500",
  "Application Submitted": "bg-blue-500",
  "Recruiter Screening": "bg-cyan-500",
  "Interview Stage": "bg-purple-500",
  "Pending Offer": "bg-amber-500",
  Accepted: "bg-green-500",
  Rejected: "bg-red-500",
  Withdrawn: "bg-orange-500",
};

export function StatusChart({ stats }: StatusChartProps) {
  const maxCount = Math.max(
    ...APPLICATION_STATUSES.map((s) => stats.byStatus[s] ?? 0),
    1,
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Applications by Status</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {APPLICATION_STATUSES.map((status) => {
          const count = stats.byStatus[status] ?? 0;
          const pct = (count / maxCount) * 100;

          return (
            <div key={status} className="flex items-center gap-3">
              <span className="w-44 shrink-0 text-sm">{status}</span>
              <div className="relative h-5 flex-1 rounded bg-muted">
                {count > 0 && (
                  <div
                    className={`h-full rounded ${STATUS_BAR_COLORS[status]}`}
                    style={{ width: `${pct}%` }}
                  />
                )}
              </div>
              <span className="w-8 text-right text-sm font-medium tabular-nums">
                {count}
              </span>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
