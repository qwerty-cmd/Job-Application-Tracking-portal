import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { INTERVIEW_TYPES, INTERVIEW_OUTCOMES } from "@/types";
import type { Interview } from "@/types";

const schema = z.object({
  type: z.enum(INTERVIEW_TYPES, { message: "Type is required" }),
  date: z.string().min(1, "Date is required"),
  interviewers: z.string().max(500).optional().or(z.literal("")),
  outcome: z.enum(INTERVIEW_OUTCOMES, {
    message: "Outcome is required",
  }),
  notes: z.string().max(10000).optional().or(z.literal("")),
  reflection: z.string().max(10000).optional().or(z.literal("")),
});

type FormValues = z.infer<typeof schema>;

interface InterviewModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: Record<string, unknown>) => Promise<void>;
  isLoading: boolean;
  interview?: Interview | null;
}

export function InterviewModal({
  open,
  onOpenChange,
  onSubmit,
  isLoading,
  interview,
}: InterviewModalProps) {
  const isEditing = !!interview;

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      type: interview?.type ?? undefined,
      date: interview?.date ?? "",
      interviewers: interview?.interviewers ?? "",
      outcome: interview?.outcome ?? "Pending",
      notes: interview?.notes ?? "",
      reflection: interview?.reflection ?? "",
    },
  });

  const {
    register,
    reset,
    setValue,
    watch,
    formState: { errors },
  } = form;

  const typeValue = watch("type");
  const outcomeValue = watch("outcome");

  async function handleFormSubmit(values: FormValues) {
    const body: Record<string, unknown> = {
      type: values.type,
      date: values.date,
      outcome: values.outcome,
      interviewers: values.interviewers || "",
      notes: values.notes || "",
      reflection: values.reflection || "",
    };
    await onSubmit(body);
    reset();
  }

  function handleClose(isOpen: boolean) {
    if (!isOpen) reset();
    onOpenChange(isOpen);
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {isEditing ? "Edit Interview" : "Add Interview Round"}
          </DialogTitle>
          <DialogDescription>
            {isEditing
              ? `Editing Round ${interview.round} (${interview.type})`
              : "Add a new interview round to this application."}
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={form.handleSubmit(handleFormSubmit)}
          className="flex flex-col gap-4"
        >
          {/* Type */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="interview-type">
              Type <span className="text-destructive">*</span>
            </Label>
            <Select
              value={typeValue ?? ""}
              onValueChange={(val) => {
                if (val)
                  setValue("type", val as FormValues["type"], {
                    shouldValidate: true,
                  });
              }}
            >
              <SelectTrigger id="interview-type">
                <SelectValue placeholder="Select type..." />
              </SelectTrigger>
              <SelectContent>
                {INTERVIEW_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.type && (
              <p className="text-xs text-destructive">{errors.type.message}</p>
            )}
          </div>

          {/* Date */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="interview-date">
              Date <span className="text-destructive">*</span>
            </Label>
            <Input
              id="interview-date"
              type="date"
              {...register("date")}
              aria-invalid={!!errors.date}
            />
            {errors.date && (
              <p className="text-xs text-destructive">{errors.date.message}</p>
            )}
          </div>

          {/* Interviewers */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="interview-interviewers">Interviewer(s)</Label>
            <Input
              id="interview-interviewers"
              placeholder="e.g. Jane Smith, Senior Manager"
              {...register("interviewers")}
              maxLength={500}
            />
          </div>

          {/* Outcome */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="interview-outcome">
              Outcome <span className="text-destructive">*</span>
            </Label>
            <Select
              value={outcomeValue ?? ""}
              onValueChange={(val) => {
                if (val)
                  setValue("outcome", val as FormValues["outcome"], {
                    shouldValidate: true,
                  });
              }}
            >
              <SelectTrigger id="interview-outcome">
                <SelectValue placeholder="Select outcome..." />
              </SelectTrigger>
              <SelectContent>
                {INTERVIEW_OUTCOMES.map((o) => (
                  <SelectItem key={o} value={o}>
                    {o}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.outcome && (
              <p className="text-xs text-destructive">
                {errors.outcome.message}
              </p>
            )}
          </div>

          {/* Notes */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="interview-notes">Notes</Label>
            <Textarea
              id="interview-notes"
              rows={3}
              placeholder="Interview notes..."
              {...register("notes")}
              maxLength={10000}
            />
          </div>

          {/* Reflection */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="interview-reflection">Reflection</Label>
            <Textarea
              id="interview-reflection"
              rows={3}
              placeholder="Your reflections on the interview..."
              {...register("reflection")}
              maxLength={10000}
            />
            <p className="text-xs text-muted-foreground">
              AI-powered feedback will be available in v2.
            </p>
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
            <Button type="submit" disabled={isLoading}>
              {isLoading
                ? "Saving..."
                : isEditing
                  ? "Save Changes"
                  : "Add Interview"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
