import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { REJECTION_REASONS } from "@/types";
import type { Application, RejectionReason } from "@/types";

interface RejectionSectionProps {
  application: Application;
  onSave: (rejection: {
    reason: RejectionReason;
    notes: string;
  }) => Promise<void>;
  isSaving: boolean;
}

export function RejectionSection({
  application,
  onSave,
  isSaving,
}: RejectionSectionProps) {
  const [reason, setReason] = useState<RejectionReason | "">(
    application.rejection?.reason ?? "",
  );
  const [notes, setNotes] = useState(application.rejection?.notes ?? "");

  if (application.status !== "Rejected") return null;

  const hasChanges =
    reason !== (application.rejection?.reason ?? "") ||
    notes !== (application.rejection?.notes ?? "");

  async function handleSave() {
    if (!reason) return;
    await onSave({ reason, notes });
  }

  return (
    <div className="rounded-lg border border-red-200 bg-red-50/50 p-6 dark:border-red-900 dark:bg-red-950/20">
      <h2 className="mb-4 text-lg font-semibold text-red-800 dark:text-red-200">
        Rejection Details
      </h2>

      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="rejection-reason">
            Reason <span className="text-destructive">*</span>
          </Label>
          <Select
            value={reason}
            onValueChange={(val) =>
              setReason((val ?? "") as RejectionReason | "")
            }
          >
            <SelectTrigger id="rejection-reason" className="w-[240px]">
              <SelectValue placeholder="Select reason..." />
            </SelectTrigger>
            <SelectContent>
              {REJECTION_REASONS.map((r) => (
                <SelectItem key={r} value={r}>
                  {r}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="rejection-notes">Notes</Label>
          <Textarea
            id="rejection-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            placeholder="Additional details..."
          />
        </div>

        <div className="flex justify-end">
          <Button
            onClick={handleSave}
            disabled={!reason || !hasChanges || isSaving}
          >
            {isSaving ? "Saving..." : "Save"}
          </Button>
        </div>
      </div>
    </div>
  );
}
