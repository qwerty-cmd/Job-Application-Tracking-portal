// ============================================================================
// Domain Types — Job Application Tracking Portal
// ============================================================================
// Matches the Cosmos DB data model defined in CLAUDE.md.

export interface Location {
  city: string;
  country: string;
  workMode: WorkMode;
  other: string | null;
}

export interface FileMetadata {
  blobUrl: string;
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

export interface Application {
  id: string;
  company: string;
  role: string;
  location: Location | null;
  dateApplied: string; // YYYY-MM-DD
  jobPostingUrl: string | null;
  jobDescriptionText: string | null;
  jobDescriptionFile: FileMetadata | null;
  status: ApplicationStatus;
  resume: FileMetadata | null;
  coverLetter: FileMetadata | null;
  rejection: Rejection | null;
  interviews: Interview[];
  isDeleted: boolean;
  deletedAt: string | null; // ISO 8601
  createdAt: string; // ISO 8601
  updatedAt: string; // ISO 8601
}

// --- Enums ---

export const APPLICATION_STATUSES = [
  'Applying',
  'Application Submitted',
  'Recruiter Screening',
  'Interview Stage',
  'Pending Offer',
  'Accepted',
  'Rejected',
  'Withdrawn',
] as const;
export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];

export const REJECTION_REASONS = [
  'Ghosted',
  'Failed Technical',
  'Failed Behavioral',
  'Overqualified',
  'Underqualified',
  'Salary Mismatch',
  'Position Filled',
  'Company Freeze',
  'Other',
] as const;
export type RejectionReason = (typeof REJECTION_REASONS)[number];

export const INTERVIEW_TYPES = [
  'Phone Screen',
  'Technical',
  'Behavioral',
  'Case Study',
  'Panel',
  'Take Home Test',
  'Other',
] as const;
export type InterviewType = (typeof INTERVIEW_TYPES)[number];

export const INTERVIEW_OUTCOMES = [
  'Passed',
  'Failed',
  'Pending',
  'Cancelled',
] as const;
export type InterviewOutcome = (typeof INTERVIEW_OUTCOMES)[number];

export const WORK_MODES = ['Remote', 'Hybrid', 'Onsite'] as const;
export type WorkMode = (typeof WORK_MODES)[number];

export const FILE_TYPES = ['resume', 'coverLetter', 'jobDescription'] as const;
export type FileType = (typeof FILE_TYPES)[number];

// Status ordering for "before Interview Stage" check
export const STATUS_ORDER: Record<ApplicationStatus, number> = {
  'Applying': 0,
  'Application Submitted': 1,
  'Recruiter Screening': 2,
  'Interview Stage': 3,
  'Pending Offer': 4,
  'Accepted': 5,
  'Rejected': 6,
  'Withdrawn': 7,
};

// --- API Response Types ---

export interface ApiError {
  code: string;
  message: string;
  details?: Array<{ field: string; message: string }>;
}

export interface ApiResponse<T> {
  data: T | null;
  error: ApiError | null;
}

// List response for GET /api/applications
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

// Stats response
export interface StatsResponse {
  period: { from: string; to: string };
  totalApplications: number;
  byStatus: Record<ApplicationStatus, number>;
  totalInterviews: number;
  interviewsByType: Record<InterviewType, number>;
}

// File content type mapping
export const EXTENSION_CONTENT_TYPES: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.html': 'text/html',
};

// Allowed extensions per file type
export const ALLOWED_EXTENSIONS: Record<FileType, string[]> = {
  resume: ['.pdf', '.docx'],
  coverLetter: ['.pdf', '.docx'],
  jobDescription: ['.pdf', '.docx', '.html'],
};

// Max file size: 10 MB
export const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10485760 bytes
