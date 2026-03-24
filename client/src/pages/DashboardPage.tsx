import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SummaryCards } from "@/components/SummaryCards";
import { StatusChart } from "@/components/StatusChart";
import { InterviewChart } from "@/components/InterviewChart";
import { DropoffChart } from "@/components/DropoffChart";
import { useStats } from "@/hooks/useStats";

export function DashboardPage() {
  const { stats, isLoading, error, setDateRange, dateRange } = useStats();
  const [fromInput, setFromInput] = useState(dateRange.from);
  const [toInput, setToInput] = useState(dateRange.to);

  const handleApply = () => {
    setDateRange(fromInput, toInput);
  };

  if (isLoading) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-6">
        <p className="text-muted-foreground">Loading dashboard…</p>
      </div>
    );
  }

  if (error || !stats) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-6">
        <p className="text-destructive">{error ?? "Failed to load stats"}</p>
      </div>
    );
  }

  // Quick Insights — derived client-side
  const responded =
    stats.totalApplications -
    (stats.byStatus["Applying"] ?? 0) -
    (stats.byStatus["Application Submitted"] ?? 0);
  const responseRate =
    stats.totalApplications > 0
      ? Math.round((responded / stats.totalApplications) * 100)
      : 0;

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 space-y-6">
      <div className="flex flex-wrap items-end gap-4">
        <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
        <div className="ml-auto flex items-end gap-3">
          <div className="space-y-1">
            <Label htmlFor="dash-from" className="text-xs">
              From
            </Label>
            <Input
              id="dash-from"
              type="date"
              value={fromInput}
              onChange={(e) => setFromInput(e.target.value)}
              className="w-36"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="dash-to" className="text-xs">
              To
            </Label>
            <Input
              id="dash-to"
              type="date"
              value={toInput}
              onChange={(e) => setToInput(e.target.value)}
              className="w-36"
            />
          </div>
          <Button onClick={handleApply} size="sm">
            Apply
          </Button>
        </div>
      </div>

      <SummaryCards stats={stats} />

      {stats.totalApplications === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">
              No applications in this date range. Create your first application
              to see analytics here.
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid gap-6 lg:grid-cols-2">
            <StatusChart stats={stats} />
            <InterviewChart stats={stats} />
          </div>

          <DropoffChart stats={stats} />

          <Card>
            <CardHeader>
              <CardTitle>Quick Insights</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                <li>
                  Response rate: {responded} of {stats.totalApplications} apps
                  got a response ({responseRate}%)
                </li>
                <li>Total interviews conducted: {stats.totalInterviews}</li>
                {(stats.byStatus["Accepted"] ?? 0) > 0 && (
                  <li>Offers accepted: {stats.byStatus["Accepted"]}</li>
                )}
                <li className="italic">
                  (v2: AI-powered analysis will appear here)
                </li>
              </ul>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
