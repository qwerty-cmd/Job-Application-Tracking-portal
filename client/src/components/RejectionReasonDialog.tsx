// Shown when the user selects "Rejected" from the status dropdown.
// Collects reason (required) and notes before the PATCH is sent, because
// the API enforces that rejection.reason is present in the same request
// as the status change — it cannot be added in a separate call.
import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
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
import type { RejectionReason } from "@/types";

interface RejectionReasonDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (data: { reason: RejectionReason; notes: string }) => Promise<void>;
  isLoading: boolean;
}

export function RejectionReasonDialog({
  open,
  onOpenChange,
  onConfirm,
  isLoading,
}: RejectionReasonDialogProps) {
  const [reason, setReason] = useState<RejectionReason | "">("");
  const [notes, setNotes] = useState("");

  function handleClose(isOpen: boolean) {
    if (!isOpen) {
      setReason("");
      setNotes("");
    }
    onOpenChange(isOpen);
  }

  async function handleConfirm() {
    if (!reason) return;
    await onConfirm({ reason, notes });
    setReason("");
    setNotes("");
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Mark as Rejected</DialogTitle>
          <DialogDescription>
            Please provide a reason for the rejection before saving.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="dialog-rejection-reason">
              Reason <span className="text-destructive">*</span>
            </Label>
            <Select
              value={reason}
              onValueChange={(val) => setReason((val ?? "") as RejectionReason | "")}
            >
              <SelectTrigger id="dialog-rejection-reason">
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
            <Label htmlFor="dialog-rejection-notes">Notes</Label>
            <Textarea
              id="dialog-rejection-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder="Additional details..."
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => handleClose(false)}
            disabled={isLoading}
          >
            Cancel
          </Button>
          <Button onClick={handleConfirm} disabled={!reason || isLoading}>
            {isLoading ? "Saving..." : "Confirm Rejection"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
