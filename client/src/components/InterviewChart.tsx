import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { INTERVIEW_TYPES } from "@/types";
import type { InterviewType, StatsResponse } from "@/types";

interface InterviewChartProps {
  stats: StatsResponse;
}

const INTERVIEW_BAR_COLORS: Record<InterviewType, string> = {
  "Phone Screen": "bg-sky-500",
  Technical: "bg-indigo-500",
  Behavioral: "bg-violet-500",
  "Case Study": "bg-teal-500",
  Panel: "bg-pink-500",
  "Take Home Test": "bg-lime-500",
  Other: "bg-gray-500",
};

export function InterviewChart({ stats }: InterviewChartProps) {
  const maxCount = Math.max(
    ...INTERVIEW_TYPES.map((t) => stats.interviewsByType[t] ?? 0),
    1,
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Interviews by Type</CardTitle>
        <CardDescription>
          Total Interviews: {stats.totalInterviews}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {INTERVIEW_TYPES.map((type) => {
          const count = stats.interviewsByType[type] ?? 0;
          const pct = (count / maxCount) * 100;

          return (
            <div key={type} className="flex items-center gap-3">
              <span className="w-32 shrink-0 text-sm">{type}</span>
              <div className="relative h-5 flex-1 rounded bg-muted">
                {count > 0 && (
                  <div
                    className={`h-full rounded ${INTERVIEW_BAR_COLORS[type]}`}
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
