import { MapPin, Calendar, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/StatusBadge";
import type { ApplicationSummary } from "@/types";

interface DeletedApplicationCardProps {
  app: ApplicationSummary;
  onRestore: (id: string) => void;
  isRestoring: boolean;
}

export function DeletedApplicationCard({
  app,
  onRestore,
  isRestoring,
}: DeletedApplicationCardProps) {
  const locationParts: string[] = [];
  if (app.location?.workMode) locationParts.push(app.location.workMode);
  if (app.location?.city) locationParts.push(app.location.city);
  if (app.location?.country) locationParts.push(app.location.country);

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle className="text-base">
              {app.company} &middot; {app.role}
            </CardTitle>
            <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
              {locationParts.length > 0 && (
                <span>
                  <MapPin
                    className="mr-1 inline-block h-3.5 w-3.5"
                    aria-hidden="true"
                  />
                  {locationParts.join(", ")}
                </span>
              )}
              <span>
                <Calendar
                  className="mr-1 inline-block h-3.5 w-3.5"
                  aria-hidden="true"
                />
                Applied: {app.dateApplied}
              </span>
            </div>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => onRestore(app.id)}
            disabled={isRestoring}
          >
            <RotateCcw className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
            Restore
          </Button>
        </div>
      </CardHeader>
      <CardContent className="flex items-center gap-3 text-sm text-muted-foreground">
        <span>
          Status: <StatusBadge status={app.status} />
        </span>
        {app.deletedAt && (
          <span>
            Deleted: {new Date(app.deletedAt).toLocaleDateString()}{" "}
            {new Date(app.deletedAt).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </span>
        )}
      </CardContent>
    </Card>
  );
}
