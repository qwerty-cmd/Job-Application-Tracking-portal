import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import type { InterviewType, StatsResponse } from "@/types";

interface InterviewChartProps {
  stats: StatsResponse;
}

// Ordered as a typical interview pipeline progression
const PIPELINE_STAGES: { type: InterviewType; color: string }[] = [
  { type: "Phone Screen", color: "bg-sky-500" },
  { type: "Take Home Test", color: "bg-lime-500" },
  { type: "Technical", color: "bg-indigo-500" },
  { type: "Behavioral", color: "bg-violet-500" },
  { type: "Case Study", color: "bg-teal-500" },
  { type: "Panel", color: "bg-pink-500" },
  { type: "Other", color: "bg-gray-500" },
];

export function InterviewChart({ stats }: InterviewChartProps) {
  const maxCount = Math.max(
    ...PIPELINE_STAGES.map((s) => stats.interviewsByType[s.type] ?? 0),
    1,
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Interview Pipeline</CardTitle>
        <CardDescription>
          {stats.totalInterviews} interview{stats.totalInterviews !== 1 && "s"}{" "}
          conducted
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-1">
        {PIPELINE_STAGES.map((stage, idx) => {
          const count = stats.interviewsByType[stage.type] ?? 0;
          const pct = (count / maxCount) * 100;
          const isLast = idx === PIPELINE_STAGES.length - 1;

          return (
            <div key={stage.type}>
              <div className="flex items-center gap-3">
                {/* Step indicator */}
                <div className="flex w-6 flex-col items-center">
                  <div
                    className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                      count > 0
                        ? `${stage.color} text-white`
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {idx + 1}
                  </div>
                </div>
                {/* Stage label + bar */}
                <div className="flex flex-1 items-center gap-3">
                  <span className="w-28 shrink-0 text-sm">{stage.type}</span>
                  <div className="relative h-5 flex-1 rounded bg-muted">
                    {count > 0 && (
                      <div
                        className={`h-full rounded ${stage.color}`}
                        style={{ width: `${pct}%` }}
                      />
                    )}
                  </div>
                  <span className="w-8 text-right text-sm font-medium tabular-nums">
                    {count}
                  </span>
                </div>
              </div>
              {/* Connector line */}
              {!isLast && (
                <div className="ml-3 flex h-3 justify-start">
                  <div className="w-px bg-border" />
                </div>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
