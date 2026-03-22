import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import type { StatsResponse } from "@/types";

interface DropoffChartProps {
  stats: StatsResponse;
}

// Ordered from earliest to latest stage
const DROPOFF_STAGES = [
  { key: "No Response", label: "No Response", color: "bg-gray-400" },
  { key: "Pre-Interview", label: "Pre-Interview", color: "bg-slate-500" },
  { key: "Phone Screen", label: "Phone Screen", color: "bg-sky-500" },
  { key: "Take Home Test", label: "Take Home Test", color: "bg-lime-500" },
  { key: "Technical", label: "Technical", color: "bg-indigo-500" },
  { key: "Behavioral", label: "Behavioral", color: "bg-violet-500" },
  { key: "Case Study", label: "Case Study", color: "bg-teal-500" },
  { key: "Panel", label: "Panel", color: "bg-pink-500" },
  { key: "Other", label: "Other", color: "bg-orange-400" },
] as const;

export function DropoffChart({ stats }: DropoffChartProps) {
  const outcomes = stats.outcomesByStage;
  const total = DROPOFF_STAGES.reduce(
    (sum, s) => sum + (outcomes[s.key] ?? 0),
    0,
  );
  const maxCount = Math.max(
    ...DROPOFF_STAGES.map((s) => outcomes[s.key] ?? 0),
    1,
  );

  if (total === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Where Applications Ended</CardTitle>
          <CardDescription>
            No ended or stalled applications yet
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Where Applications Ended</CardTitle>
        <CardDescription>
          {total} application{total !== 1 && "s"} rejected, withdrawn, or
          awaiting response
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {DROPOFF_STAGES.map((stage) => {
          const count = outcomes[stage.key] ?? 0;
          if (count === 0) return null;
          const pct = (count / maxCount) * 100;

          return (
            <div key={stage.key} className="flex items-center gap-3">
              <span className="w-28 shrink-0 text-sm">{stage.label}</span>
              <div className="relative h-5 flex-1 rounded bg-muted">
                <div
                  className={`h-full rounded ${stage.color}`}
                  style={{ width: `${pct}%` }}
                />
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
