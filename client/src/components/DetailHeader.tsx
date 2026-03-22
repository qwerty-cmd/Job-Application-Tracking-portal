import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, MapPin, Calendar, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { StatusBadge } from "@/components/StatusBadge";
import { APPLICATION_STATUSES } from "@/types";
import type { Application, ApplicationStatus } from "@/types";

interface DetailHeaderProps {
  application: Application;
  onStatusChange: (status: ApplicationStatus) => Promise<void>;
  onDelete: () => Promise<void>;
  isUpdating: boolean;
}

export function DetailHeader({
  application,
  onStatusChange,
  onDelete,
  isUpdating,
}: DetailHeaderProps) {
  const navigate = useNavigate();
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const loc = application.location;
  const locationText = [loc?.city, loc?.country].filter(Boolean).join(", ");

  return (
    <div className="rounded-lg border bg-card p-6">
      {/* Back link */}
      <Button
        variant="link"
        className="mb-4 -ml-2 px-2"
        onClick={() => navigate("/")}
      >
        <ArrowLeft className="mr-1 h-4 w-4" aria-hidden="true" />
        Back to Applications
      </Button>

      {/* Company + Role */}
      <h1 className="text-2xl font-bold">{application.company}</h1>
      <p className="mt-1 text-lg text-muted-foreground">{application.role}</p>

      {/* Location + Date */}
      <div className="mt-2 flex flex-wrap items-center gap-x-4 text-sm text-muted-foreground">
        {(locationText || loc?.workMode) && (
          <span>
            <MapPin
              className="mr-1 inline-block h-3.5 w-3.5"
              aria-hidden="true"
            />
            {locationText}
            {locationText && loc?.workMode ? " · " : ""}
            {loc?.workMode}
          </span>
        )}
        <span>
          <Calendar
            className="mr-1 inline-block h-3.5 w-3.5"
            aria-hidden="true"
          />
          Applied: {application.dateApplied}
        </span>
      </div>

      {/* Status + Delete */}
      <div className="mt-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium">Status:</span>
          <Select
            value={application.status}
            onValueChange={(val) => {
              if (val) void onStatusChange(val as ApplicationStatus);
            }}
            disabled={isUpdating}
          >
            <SelectTrigger className="w-[200px]">
              <SelectValue>
                <StatusBadge status={application.status} />
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {APPLICATION_STATUSES.map((s) => (
                <SelectItem key={s} value={s}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Button
          variant="destructive"
          onClick={() => setShowDeleteConfirm(true)}
        >
          <Trash2 className="mr-1 h-4 w-4" aria-hidden="true" />
          Delete
        </Button>
      </div>

      {/* Timestamps */}
      <div className="mt-4 text-xs text-muted-foreground">
        Updated: {new Date(application.updatedAt).toLocaleString()} · Created:{" "}
        {new Date(application.createdAt).toLocaleString()}
      </div>

      {/* Delete confirmation */}
      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Application</AlertDialogTitle>
            <AlertDialogDescription>
              This will move the application for{" "}
              <strong>{application.company}</strong> to trash. You can restore
              it later from the Trash page.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={async () => {
                await onDelete();
                navigate("/");
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
