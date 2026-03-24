// ============================================================================
// Domain Types — Frontend mirrors of backend types (api/src/shared/types.ts)
// ============================================================================
// These types reflect the API response shapes, NOT internal Cosmos fields.
// Key difference: FileMetadata here omits `blobUrl` (never returned in API).

export interface Location {
  city: string;
  country: string;
  workMode: WorkMode;
  other: string | null;
}

export interface FileInfo {
  fileName: string;
  uploadedAt: string; // ISO 8601
}

export interface Rejection {
  reason: RejectionReason;
  notes: string;
}

export interface Interview {
  id: string;
  round: number;
  type: InterviewType;
  date: string; // YYYY-MM-DD
  interviewers: string;
  notes: string;
  reflection: string;
  outcome: InterviewOutcome;
  order: number;
}

export const ACTIVITY_EVENT_TYPES = [
  "application_created",
  "status_changed",
  "interview_added",
  "interview_updated",
  "interview_deleted",
  "file_uploaded",
  "file_deleted",
  "application_deleted",
  "application_restored",
] as const;
export type ActivityEventType = (typeof ACTIVITY_EVENT_TYPES)[number];

export interface ActivityEvent {
  id: string;
  type: ActivityEventType;
  timestamp: string; // ISO 8601
  description: string;
}

export interface Application {
  id: string;
  company: string;
  role: string;
  location: Location | null;
  dateApplied: string; // YYYY-MM-DD
  jobPostingUrl: string | null;
  jobDescriptionText: string | null;
  jobDescriptionFile: FileInfo | null;
  status: ApplicationStatus;
  resume: FileInfo | null;
  coverLetter: FileInfo | null;
  rejection: Rejection | null;
  interviews: Interview[];
  history: ActivityEvent[];
  isDeleted: boolean;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

// Summary returned by list endpoints (no interviews, no JD text, no blob URLs)
export interface ApplicationSummary {
  id: string;
  company: string;
  role: string;
  location: Location | null;
  dateApplied: string;
  status: ApplicationStatus;
  jobPostingUrl: string | null;
  hasResume: boolean;
  hasCoverLetter: boolean;
  hasJobDescription: boolean;
  interviewCount: number;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string; // only in deleted list
}

export interface PaginationInfo {
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
}

export interface ApplicationListResponse {
  items: ApplicationSummary[];
  pagination: PaginationInfo;
}

export interface StatsResponse {
  period: { from: string; to: string };
  totalApplications: number;
  byStatus: Record<ApplicationStatus, number>;
  totalInterviews: number;
  interviewsByType: Record<InterviewType, number>;
  outcomesByStage: Record<string, number>;
}

// --- Enums ---

export const APPLICATION_STATUSES = [
  "Applying",
  "Application Submitted",
  "Recruiter Screening",
  "Interview Stage",
  "Pending Offer",
  "Accepted",
  "Rejected",
  "Withdrawn",
] as const;
export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];

export const REJECTION_REASONS = [
  "Ghosted",
  "Failed Technical",
  "Failed Behavioral",
  "Overqualified",
  "Underqualified",
  "Salary Mismatch",
  "Position Filled",
  "Company Freeze",
  "Other",
] as const;
export type RejectionReason = (typeof REJECTION_REASONS)[number];

export const INTERVIEW_TYPES = [
  "Phone Screen",
  "Technical",
  "Behavioral",
  "Case Study",
  "Panel",
  "Take Home Test",
  "Other",
] as const;
export type InterviewType = (typeof INTERVIEW_TYPES)[number];

export const INTERVIEW_OUTCOMES = [
  "Passed",
  "Failed",
  "Pending",
  "Cancelled",
] as const;
export type InterviewOutcome = (typeof INTERVIEW_OUTCOMES)[number];

export const WORK_MODES = ["Remote", "Hybrid", "Onsite"] as const;
export type WorkMode = (typeof WORK_MODES)[number];

export const FILE_TYPES = ["resume", "coverLetter", "jobDescription"] as const;
export type FileType = (typeof FILE_TYPES)[number];

// Allowed extensions per file type (client-side validation)
export const ALLOWED_EXTENSIONS: Record<FileType, string[]> = {
  resume: [".pdf", ".docx"],
  coverLetter: [".pdf", ".docx"],
  jobDescription: [".pdf", ".docx", ".html"],
};

// Content type mapping
export const EXTENSION_CONTENT_TYPES: Record<string, string> = {
  ".pdf": "application/pdf",
  ".docx":
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".html": "text/html",
};

// Max file size: 10 MB
export const MAX_FILE_SIZE = 10 * 1024 * 1024;

// --- API Types ---

export interface ApiError {
  code: string;
  message: string;
  details?: Array<{ field: string; message: string }>;
}

export interface ApiResponse<T> {
  data: T | null;
  error: ApiError | null;
}

// Upload SAS token response
export interface UploadSasTokenResponse {
  uploadUrl: string;
  blobPath: string;
  expiresAt: string;
}

// Download SAS token response
export interface DownloadSasTokenResponse {
  downloadUrl: string;
  fileName: string;
  expiresAt: string;
}

// SWA auth types
export interface ClientPrincipal {
  identityProvider: string;
  userId: string;
  userDetails: string;
  userRoles: string[];
}

export interface AuthMeResponse {
  clientPrincipal: ClientPrincipal | null;
}
