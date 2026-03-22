import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { StatsResponse } from "@/types";

interface SummaryCardsProps {
  stats: StatsResponse;
}

export function SummaryCards({ stats }: SummaryCardsProps) {
  const active =
    (stats.byStatus["Applying"] ?? 0) +
    (stats.byStatus["Application Submitted"] ?? 0) +
    (stats.byStatus["Recruiter Screening"] ?? 0) +
    (stats.byStatus["Interview Stage"] ?? 0) +
    (stats.byStatus["Pending Offer"] ?? 0);

  const cards = [
    {
      title: "Total Apps",
      value: stats.totalApplications,
      className: "text-foreground",
    },
    {
      title: "Active",
      value: active,
      className: "text-blue-600",
    },
    {
      title: "Rejected",
      value: stats.byStatus["Rejected"] ?? 0,
      className: "text-red-600",
    },
    {
      title: "Accepted",
      value: stats.byStatus["Accepted"] ?? 0,
      className: "text-green-600",
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
      {cards.map((card) => (
        <Card key={card.title}>
          <CardHeader className="pb-0">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {card.title}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className={`text-3xl font-bold ${card.className}`}>
              {card.value}
            </p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
