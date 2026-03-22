import { useState } from "react";
import { ExternalLink } from "lucide-react";
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
import type { Application, WorkMode } from "@/types";

interface DetailFieldsProps {
  application: Application;
  onSave: (fields: Record<string, unknown>) => Promise<void>;
  isSaving: boolean;
}

export function DetailFields({
  application,
  onSave,
  isSaving,
}: DetailFieldsProps) {
  const [company, setCompany] = useState(application.company);
  const [role, setRole] = useState(application.role);
  const [city, setCity] = useState(application.location?.city ?? "");
  const [country, setCountry] = useState(application.location?.country ?? "");
  const [workMode, setWorkMode] = useState<WorkMode | "">(
    application.location?.workMode ?? "",
  );
  const [other, setOther] = useState(application.location?.other ?? "");
  const [dateApplied, setDateApplied] = useState(application.dateApplied);
  const [jobPostingUrl, setJobPostingUrl] = useState(
    application.jobPostingUrl ?? "",
  );
  const [jobDescriptionText, setJobDescriptionText] = useState(
    application.jobDescriptionText ?? "",
  );

  const hasChanges =
    company !== application.company ||
    role !== application.role ||
    city !== (application.location?.city ?? "") ||
    country !== (application.location?.country ?? "") ||
    workMode !== (application.location?.workMode ?? "") ||
    other !== (application.location?.other ?? "") ||
    dateApplied !== application.dateApplied ||
    jobPostingUrl !== (application.jobPostingUrl ?? "") ||
    jobDescriptionText !== (application.jobDescriptionText ?? "");

  async function handleSave() {
    const fields: Record<string, unknown> = {};

    if (company !== application.company) fields.company = company;
    if (role !== application.role) fields.role = role;
    if (dateApplied !== application.dateApplied)
      fields.dateApplied = dateApplied;
    if (jobPostingUrl !== (application.jobPostingUrl ?? ""))
      fields.jobPostingUrl = jobPostingUrl || null;
    if (jobDescriptionText !== (application.jobDescriptionText ?? ""))
      fields.jobDescriptionText = jobDescriptionText || null;

    const locChanged =
      city !== (application.location?.city ?? "") ||
      country !== (application.location?.country ?? "") ||
      workMode !== (application.location?.workMode ?? "") ||
      other !== (application.location?.other ?? "");

    if (locChanged) {
      fields.location = {
        city: city || "",
        country: country || "",
        workMode: workMode || "Remote",
        other: other || null,
      };
    }

    if (Object.keys(fields).length > 0) {
      await onSave(fields);
    }
  }

  return (
    <div className="rounded-lg border p-6">
      <h2 className="mb-4 text-lg font-semibold">Details</h2>

      <div className="grid gap-4 sm:grid-cols-2">
        {/* Company */}
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="detail-company">Company</Label>
          <Input
            id="detail-company"
            value={company}
            onChange={(e) => setCompany(e.target.value)}
            maxLength={200}
          />
        </div>

        {/* Role */}
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="detail-role">Role</Label>
          <Input
            id="detail-role"
            value={role}
            onChange={(e) => setRole(e.target.value)}
            maxLength={200}
          />
        </div>

        {/* City */}
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="detail-city">City</Label>
          <Input
            id="detail-city"
            value={city}
            onChange={(e) => setCity(e.target.value)}
          />
        </div>

        {/* Country */}
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="detail-country">Country</Label>
          <Input
            id="detail-country"
            value={country}
            onChange={(e) => setCountry(e.target.value)}
          />
        </div>

        {/* Work Mode */}
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="detail-workMode">Work Mode</Label>
          <Select
            value={workMode}
            onValueChange={(val) => setWorkMode((val ?? "") as WorkMode | "")}
          >
            <SelectTrigger id="detail-workMode">
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

        {/* Other */}
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="detail-other">Other (location)</Label>
          <Input
            id="detail-other"
            value={other}
            onChange={(e) => setOther(e.target.value)}
          />
        </div>

        {/* Date Applied */}
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="detail-dateApplied">Date Applied</Label>
          <Input
            id="detail-dateApplied"
            type="date"
            value={dateApplied}
            onChange={(e) => setDateApplied(e.target.value)}
          />
        </div>

        {/* Job Posting URL */}
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="detail-url">Job Posting URL</Label>
          <div className="flex gap-2">
            <Input
              id="detail-url"
              type="url"
              value={jobPostingUrl}
              onChange={(e) => setJobPostingUrl(e.target.value)}
              placeholder="https://..."
            />
            {jobPostingUrl && (
              <Button
                variant="outline"
                size="icon"
                onClick={() =>
                  window.open(jobPostingUrl, "_blank", "noopener,noreferrer")
                }
                title="Open URL"
              >
                <ExternalLink className="h-4 w-4" aria-hidden="true" />
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* JD Text */}
      <div className="mt-4 flex flex-col gap-1.5">
        <Label htmlFor="detail-jdText">Job Description Text</Label>
        <Textarea
          id="detail-jdText"
          value={jobDescriptionText}
          onChange={(e) => setJobDescriptionText(e.target.value)}
          rows={6}
          placeholder="Paste job description here..."
          maxLength={50000}
        />
      </div>

      {/* Save button */}
      <div className="mt-4 flex justify-end">
        <Button onClick={handleSave} disabled={!hasChanges || isSaving}>
          {isSaving ? "Saving..." : "Save Changes"}
        </Button>
      </div>
    </div>
  );
}
