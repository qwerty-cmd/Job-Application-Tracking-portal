import { useRef, useState } from "react";
import { Download, RefreshCw, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
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
import { ALLOWED_EXTENSIONS, MAX_FILE_SIZE } from "@/types";
import type { Application, FileType, FileInfo } from "@/types";

interface FileSectionProps {
  application: Application;
  onUpload: (fileType: FileType, file: File) => Promise<boolean>;
  onDownload: (fileType: FileType) => Promise<boolean>;
  onDeleteFile: (fileType: FileType) => Promise<void>;
  uploadProgress: number;
  isUploading: boolean;
}

const FILE_LABELS: Record<FileType, string> = {
  resume: "Resume",
  coverLetter: "Cover Letter",
  jobDescription: "Job Description",
};

const FILE_TYPE_KEYS: FileType[] = ["resume", "coverLetter", "jobDescription"];

function getAcceptString(fileType: FileType): string {
  return ALLOWED_EXTENSIONS[fileType].join(",");
}

function FileRow({
  fileType,
  fileInfo,
  onUpload,
  onDownload,
  onDeleteFile,
  isUploading,
  uploadProgress,
  activeUploadType,
}: {
  fileType: FileType;
  fileInfo: FileInfo | null;
  onUpload: (fileType: FileType, file: File) => Promise<boolean>;
  onDownload: (fileType: FileType) => Promise<boolean>;
  onDeleteFile: (fileType: FileType) => Promise<void>;
  isUploading: boolean;
  uploadProgress: number;
  activeUploadType: FileType | null;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isThisUploading = isUploading && activeUploadType === fileType;

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);

    // Client-side validation
    const ext = `.${file.name.split(".").pop()?.toLowerCase()}`;
    if (!ALLOWED_EXTENSIONS[fileType].includes(ext)) {
      setError(
        `Invalid file type. Allowed: ${ALLOWED_EXTENSIONS[fileType].join(", ")}`,
      );
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      setError("File exceeds 10 MB limit");
      return;
    }

    void onUpload(fileType, file);
    // Reset input so re-uploading the same file works
    if (inputRef.current) inputRef.current.value = "";
  }

  return (
    <div className="flex flex-col gap-2 rounded-md border p-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">{FILE_LABELS[fileType]}</span>
        {fileInfo && (
          <span className="text-xs text-muted-foreground">
            Uploaded: {new Date(fileInfo.uploadedAt).toLocaleString()}
          </span>
        )}
      </div>

      {fileInfo ? (
        <>
          <p className="text-sm">{fileInfo.fileName}</p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => void onDownload(fileType)}
            >
              <Download className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
              Download
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => inputRef.current?.click()}
              disabled={isUploading}
            >
              <RefreshCw className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
              Re-upload
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => setShowDeleteConfirm(true)}
            >
              <Trash2 className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
              Remove
            </Button>
          </div>
        </>
      ) : (
        <div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => inputRef.current?.click()}
            disabled={isUploading}
          >
            <Upload className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
            Upload File
          </Button>
          <p className="mt-1 text-xs text-muted-foreground">
            Accepts: {ALLOWED_EXTENSIONS[fileType].join(", ")} · Max 10 MB
          </p>
        </div>
      )}

      {/* Upload progress */}
      {isThisUploading && (
        <div className="flex items-center gap-2">
          <Progress value={uploadProgress} className="flex-1" />
          <span className="text-xs text-muted-foreground">
            {uploadProgress}%
          </span>
        </div>
      )}

      {error && <p className="text-xs text-destructive">{error}</p>}

      {/* Hidden file input */}
      <input
        ref={inputRef}
        type="file"
        className="hidden"
        accept={getAcceptString(fileType)}
        onChange={handleFileSelect}
      />

      {/* Delete confirmation */}
      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove File</AlertDialogTitle>
            <AlertDialogDescription>
              Remove {FILE_LABELS[fileType].toLowerCase()} &ldquo;
              {fileInfo?.fileName}&rdquo;? This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => void onDeleteFile(fileType)}
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export function FileSection({
  application,
  onUpload,
  onDownload,
  onDeleteFile,
  uploadProgress,
  isUploading,
}: FileSectionProps) {
  const [activeUploadType, setActiveUploadType] = useState<FileType | null>(
    null,
  );

  async function handleUpload(
    fileType: FileType,
    file: File,
  ): Promise<boolean> {
    setActiveUploadType(fileType);
    const result = await onUpload(fileType, file);
    setActiveUploadType(null);
    return result;
  }

  const fileMap: Record<FileType, FileInfo | null> = {
    resume: application.resume,
    coverLetter: application.coverLetter,
    jobDescription: application.jobDescriptionFile,
  };

  return (
    <div className="rounded-lg border p-6">
      <h2 className="mb-4 text-lg font-semibold">Files</h2>
      <div className="flex flex-col gap-3">
        {FILE_TYPE_KEYS.map((ft) => (
          <FileRow
            key={ft}
            fileType={ft}
            fileInfo={fileMap[ft]}
            onUpload={handleUpload}
            onDownload={onDownload}
            onDeleteFile={onDeleteFile}
            isUploading={isUploading}
            uploadProgress={uploadProgress}
            activeUploadType={activeUploadType}
          />
        ))}
      </div>
    </div>
  );
}
