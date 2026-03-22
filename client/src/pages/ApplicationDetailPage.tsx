import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { toast } from "sonner";
import { formatApiError } from "@/lib/utils";
import { Separator } from "@/components/ui/separator";
import { DetailHeader } from "@/components/DetailHeader";
import { DetailFields } from "@/components/DetailFields";
import { RejectionSection } from "@/components/RejectionSection";
import { FileSection } from "@/components/FileSection";
import { InterviewList } from "@/components/InterviewList";
import { InterviewModal } from "@/components/InterviewModal";
import { useApplication } from "@/hooks/useApplication";
import {
  useUpdateApplication,
  useDeleteApplication,
  useAddInterview,
  useUpdateInterview,
  useDeleteInterview,
  useUploadFile,
  useDownloadFile,
  useDeleteFile,
} from "@/hooks/useMutations";
import type {
  ApplicationStatus,
  RejectionReason,
  FileType,
  Interview,
} from "@/types";

export function ApplicationDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { application, isLoading, error, refetch } = useApplication(id);

  // Mutations
  const { isLoading: isUpdating, update } = useUpdateApplication();
  const { remove } = useDeleteApplication();
  const { isLoading: isAddingInterview, addInterview } = useAddInterview();
  const { isLoading: isUpdatingInterview, updateInterview } =
    useUpdateInterview();
  const { deleteInterview } = useDeleteInterview();
  const {
    isLoading: isUploading,
    progress: uploadProgress,
    upload,
  } = useUploadFile();
  const { download } = useDownloadFile();
  const { deleteFile } = useDeleteFile();

  // Interview modal state
  const [interviewModalOpen, setInterviewModalOpen] = useState(false);
  const [editingInterview, setEditingInterview] = useState<
    Interview | undefined
  >();

  // Cleanup polling interval on unmount
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    };
  }, []);

  // --- Handlers ---

  const handleStatusChange = async (status: ApplicationStatus) => {
    if (!application) return;
    const res = await update(application.id, { status });
    if (res.data) {
      toast.success(`Status updated to ${status}`);
      refetch();
    } else {
      toast.error(formatApiError(res.error, "Failed to update status"));
    }
  };

  const handleDelete = async () => {
    if (!application) return;
    const res = await remove(application.id);
    if (res.data) {
      toast.success("Application deleted");
      // Navigation handled by DetailHeader
    } else {
      toast.error(formatApiError(res.error, "Failed to delete"));
    }
  };

  const handleFieldsSave = async (fields: Record<string, unknown>) => {
    if (!application) return;
    const res = await update(application.id, fields);
    if (res.data) {
      toast.success("Changes saved");
      refetch();
    } else {
      toast.error(formatApiError(res.error, "Failed to save"));
    }
  };

  const handleRejectionSave = async (rejection: {
    reason: RejectionReason;
    notes: string;
  }) => {
    if (!application) return;
    const res = await update(application.id, { rejection });
    if (res.data) {
      toast.success("Rejection details saved");
      refetch();
    } else {
      toast.error(formatApiError(res.error, "Failed to save rejection"));
    }
  };

  // File handlers
  const handleUpload = async (
    fileType: FileType,
    file: File,
  ): Promise<boolean> => {
    if (!application) return false;
    const success = await upload(application.id, fileType, file);
    if (success) {
      toast.success("File uploaded — processing…");
      // Poll for Cosmos update (processUpload is async via Event Grid)
      // Refetch a few times over ~15s to pick up the new file metadata
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
      let attempts = 0;
      pollIntervalRef.current = setInterval(() => {
        attempts++;
        refetch();
        if (attempts >= 7) {
          clearInterval(pollIntervalRef.current!);
          pollIntervalRef.current = null;
        }
      }, 2000);
    }
    return success;
  };

  const handleDownload = async (fileType: FileType): Promise<boolean> => {
    if (!application) return false;
    return download(application.id, fileType);
  };

  const handleDeleteFile = async (fileType: FileType) => {
    if (!application) return;
    const res = await deleteFile(application.id, fileType);
    if (res.data) {
      toast.success("File deleted");
      refetch();
    } else {
      toast.error(formatApiError(res.error, "Failed to delete file"));
    }
  };

  // Interview handlers
  const handleAddInterview = () => {
    setEditingInterview(undefined);
    setInterviewModalOpen(true);
  };

  const handleEditInterview = (interview: Interview) => {
    setEditingInterview(interview);
    setInterviewModalOpen(true);
  };

  const handleDeleteInterview = async (interviewId: string) => {
    if (!application) return;
    const res = await deleteInterview(application.id, interviewId);
    if (res.data) {
      toast.success("Interview removed");
      refetch();
    } else {
      toast.error(formatApiError(res.error, "Failed to delete interview"));
    }
  };

  const handleInterviewSubmit = async (data: Record<string, unknown>) => {
    if (!application) return;

    if (editingInterview) {
      const res = await updateInterview(
        application.id,
        editingInterview.id,
        data,
      );
      if (res.data) {
        toast.success("Interview updated");
        setInterviewModalOpen(false);
        refetch();
      } else {
        toast.error(formatApiError(res.error, "Failed to update interview"));
      }
    } else {
      const res = await addInterview(application.id, data);
      if (res.data) {
        toast.success("Interview added");
        setInterviewModalOpen(false);
        refetch();
      } else {
        toast.error(formatApiError(res.error, "Failed to add interview"));
      }
    }
  };

  // --- Render ---

  if (isLoading) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-6">
        <p className="text-muted-foreground">Loading…</p>
      </div>
    );
  }

  if (error || !application) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-6">
        <p className="text-destructive">{error ?? "Application not found"}</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 space-y-6">
      <DetailHeader
        application={application}
        onStatusChange={handleStatusChange}
        onDelete={handleDelete}
        isUpdating={isUpdating}
      />

      <Separator />

      <DetailFields
        key={application.updatedAt}
        application={application}
        onSave={handleFieldsSave}
        isSaving={isUpdating}
      />

      {application.status === "Rejected" && (
        <>
          <Separator />
          <RejectionSection
            key={application.updatedAt}
            application={application}
            onSave={handleRejectionSave}
            isSaving={isUpdating}
          />
        </>
      )}

      <Separator />

      <FileSection
        application={application}
        onUpload={handleUpload}
        onDownload={handleDownload}
        onDeleteFile={handleDeleteFile}
        uploadProgress={uploadProgress}
        isUploading={isUploading}
      />

      <Separator />

      <InterviewList
        interviews={application.interviews ?? []}
        onAdd={handleAddInterview}
        onEdit={handleEditInterview}
        onDelete={handleDeleteInterview}
      />

      <InterviewModal
        key={editingInterview?.id ?? "new"}
        open={interviewModalOpen}
        onOpenChange={setInterviewModalOpen}
        onSubmit={handleInterviewSubmit}
        isLoading={editingInterview ? isUpdatingInterview : isAddingInterview}
        interview={editingInterview}
      />
    </div>
  );
}
