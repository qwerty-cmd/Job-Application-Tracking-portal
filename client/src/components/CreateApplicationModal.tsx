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
import { WORK_MODES } from "@/types";

const today = () => new Date().toLocaleDateString("en-CA");

const schema = z.object({
  company: z.string().min(1, "Company is required").max(200),
  role: z.string().min(1, "Role is required").max(200),
  city: z.string().max(200).optional().or(z.literal("")),
  country: z.string().max(200).optional().or(z.literal("")),
  workMode: z.enum(["Remote", "Hybrid", "Onsite"]).optional(),
  other: z.string().max(500).optional().or(z.literal("")),
  dateApplied: z
    .string()
    .min(1, "Date is required")
    .refine(
      (val) => {
        const d = new Date(val);
        const now = new Date();
        now.setHours(23, 59, 59, 999);
        return !isNaN(d.getTime()) && d <= now;
      },
      { message: "Date cannot be in the future" },
    ),
  jobPostingUrl: z
    .string()
    .url("Must be a valid URL")
    .optional()
    .or(z.literal("")),
  jobDescriptionText: z.string().max(50000).optional().or(z.literal("")),
});

type FormValues = z.infer<typeof schema>;

interface CreateApplicationModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: Record<string, unknown>) => Promise<void>;
  isLoading: boolean;
}

export function CreateApplicationModal({
  open,
  onOpenChange,
  onSubmit,
  isLoading,
}: CreateApplicationModalProps) {
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      company: "",
      role: "",
      city: "",
      country: "",
      workMode: undefined,
      other: "",
      dateApplied: today(),
      jobPostingUrl: "",
      jobDescriptionText: "",
    },
  });

  const {
    register,
    reset,
    setValue,
    watch,
    formState: { errors },
  } = form;

  const workModeValue = watch("workMode");

  async function handleFormSubmit(values: FormValues) {
    const hasLocation = values.city || values.country || values.workMode;

    const body: Record<string, unknown> = {
      company: values.company,
      role: values.role,
      dateApplied: values.dateApplied,
    };

    if (hasLocation) {
      body.location = {
        city: values.city || "",
        country: values.country || "",
        workMode: values.workMode || "Remote",
        other: values.other || null,
      };
    }

    if (values.jobPostingUrl) {
      body.jobPostingUrl = values.jobPostingUrl;
    }

    if (values.jobDescriptionText) {
      body.jobDescriptionText = values.jobDescriptionText;
    }

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
          <DialogTitle>New Application</DialogTitle>
          <DialogDescription>
            Create a new job application. Files can be uploaded after creation.
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={form.handleSubmit(handleFormSubmit)}
          className="flex flex-col gap-4"
        >
          {/* Company */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="company">
              Company <span className="text-destructive">*</span>
            </Label>
            <Input
              id="company"
              placeholder="e.g. Contoso Ltd"
              {...register("company")}
              aria-invalid={!!errors.company}
            />
            {errors.company && (
              <p className="text-xs text-destructive">
                {errors.company.message}
              </p>
            )}
          </div>

          {/* Role */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="role">
              Role / Title <span className="text-destructive">*</span>
            </Label>
            <Input
              id="role"
              placeholder="e.g. Senior Cloud Engineer"
              {...register("role")}
              aria-invalid={!!errors.role}
            />
            {errors.role && (
              <p className="text-xs text-destructive">{errors.role.message}</p>
            )}
          </div>

          {/* Location section */}
          <fieldset className="flex flex-col gap-3 rounded-lg border p-3">
            <legend className="px-1 text-sm font-medium text-muted-foreground">
              Location
            </legend>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="city">City</Label>
                <Input
                  id="city"
                  placeholder="e.g. Sydney"
                  {...register("city")}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="country">Country</Label>
                <Input
                  id="country"
                  placeholder="e.g. Australia"
                  {...register("country")}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="workMode">Work Mode</Label>
                <Select
                  value={workModeValue ?? ""}
                  onValueChange={(val) =>
                    setValue(
                      "workMode",
                      (val ?? undefined) as FormValues["workMode"],
                    )
                  }
                >
                  <SelectTrigger id="workMode">
                    <SelectValue placeholder="Select..." />
                  </SelectTrigger>
                  <SelectContent>
                    {WORK_MODES.map((mode) => (
                      <SelectItem key={mode} value={mode}>
                        {mode}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="other">Other</Label>
                <Input
                  id="other"
                  placeholder="e.g. Flexible"
                  {...register("other")}
                />
              </div>
            </div>
          </fieldset>

          {/* Date Applied */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="dateApplied">
              Date Applied <span className="text-destructive">*</span>
            </Label>
            <Input
              id="dateApplied"
              type="date"
              {...register("dateApplied")}
              aria-invalid={!!errors.dateApplied}
            />
            {errors.dateApplied && (
              <p className="text-xs text-destructive">
                {errors.dateApplied.message}
              </p>
            )}
          </div>

          {/* Job Description section */}
          <fieldset className="flex flex-col gap-3 rounded-lg border p-3">
            <legend className="px-1 text-sm font-medium text-muted-foreground">
              Job Description
            </legend>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="jobPostingUrl">Job Posting URL</Label>
              <Input
                id="jobPostingUrl"
                type="url"
                placeholder="https://..."
                {...register("jobPostingUrl")}
                aria-invalid={!!errors.jobPostingUrl}
              />
              {errors.jobPostingUrl && (
                <p className="text-xs text-destructive">
                  {errors.jobPostingUrl.message}
                </p>
              )}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="jobDescriptionText">Paste JD Text</Label>
              <Textarea
                id="jobDescriptionText"
                placeholder="Paste the job description here (optional)"
                rows={4}
                {...register("jobDescriptionText")}
              />
              {errors.jobDescriptionText && (
                <p className="text-xs text-destructive">
                  {errors.jobDescriptionText.message}
                </p>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              JD file upload is available on the detail page after creation.
            </p>
          </fieldset>

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
              {isLoading ? "Creating..." : "Create Application"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
