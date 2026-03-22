import { useCallback, useState } from "react";
import { api } from "@/lib/api";
import type {
  Application,
  FileType,
  UploadSasTokenResponse,
  DownloadSasTokenResponse,
} from "@/types";
import { EXTENSION_CONTENT_TYPES } from "@/types";

interface MutationState {
  isLoading: boolean;
  error: string | null;
}

// --- Application mutations ---

export function useCreateApplication() {
  const [state, setState] = useState<MutationState>({
    isLoading: false,
    error: null,
  });

  const create = useCallback(async (body: Record<string, unknown>) => {
    setState({ isLoading: true, error: null });
    const res = await api.post<Application>("/api/applications", body);
    setState({ isLoading: false, error: res.error?.message ?? null });
    return res;
  }, []);

  return { ...state, create };
}

export function useUpdateApplication() {
  const [state, setState] = useState<MutationState>({
    isLoading: false,
    error: null,
  });

  const update = useCallback(
    async (id: string, body: Record<string, unknown>) => {
      setState({ isLoading: true, error: null });
      const res = await api.patch<Application>(`/api/applications/${id}`, body);
      setState({ isLoading: false, error: res.error?.message ?? null });
      return res;
    },
    [],
  );

  return { ...state, update };
}

export function useDeleteApplication() {
  const [state, setState] = useState<MutationState>({
    isLoading: false,
    error: null,
  });

  const remove = useCallback(async (id: string) => {
    setState({ isLoading: true, error: null });
    const res = await api.delete<{ id: string; deleted: boolean }>(
      `/api/applications/${id}`,
    );
    setState({ isLoading: false, error: res.error?.message ?? null });
    return res;
  }, []);

  return { ...state, remove };
}

export function useRestoreApplication() {
  const [state, setState] = useState<MutationState>({
    isLoading: false,
    error: null,
  });

  const restore = useCallback(async (id: string) => {
    setState({ isLoading: true, error: null });
    const res = await api.patch<Application>(
      `/api/applications/${id}/restore`,
      {},
    );
    setState({ isLoading: false, error: res.error?.message ?? null });
    return res;
  }, []);

  return { ...state, restore };
}

// --- Interview mutations ---

export function useAddInterview() {
  const [state, setState] = useState<MutationState>({
    isLoading: false,
    error: null,
  });

  const addInterview = useCallback(
    async (applicationId: string, body: Record<string, unknown>) => {
      setState({ isLoading: true, error: null });
      const res = await api.post<Application>(
        `/api/applications/${applicationId}/interviews`,
        body,
      );
      setState({ isLoading: false, error: res.error?.message ?? null });
      return res;
    },
    [],
  );

  return { ...state, addInterview };
}

export function useUpdateInterview() {
  const [state, setState] = useState<MutationState>({
    isLoading: false,
    error: null,
  });

  const updateInterview = useCallback(
    async (
      applicationId: string,
      interviewId: string,
      body: Record<string, unknown>,
    ) => {
      setState({ isLoading: true, error: null });
      const res = await api.patch<Application>(
        `/api/applications/${applicationId}/interviews/${interviewId}`,
        body,
      );
      setState({ isLoading: false, error: res.error?.message ?? null });
      return res;
    },
    [],
  );

  return { ...state, updateInterview };
}

export function useDeleteInterview() {
  const [state, setState] = useState<MutationState>({
    isLoading: false,
    error: null,
  });

  const deleteInterview = useCallback(
    async (applicationId: string, interviewId: string) => {
      setState({ isLoading: true, error: null });
      const res = await api.delete<Application>(
        `/api/applications/${applicationId}/interviews/${interviewId}`,
      );
      setState({ isLoading: false, error: res.error?.message ?? null });
      return res;
    },
    [],
  );

  return { ...state, deleteInterview };
}

export function useReorderInterviews() {
  const [state, setState] = useState<MutationState>({
    isLoading: false,
    error: null,
  });

  const reorder = useCallback(
    async (applicationId: string, order: string[]) => {
      setState({ isLoading: true, error: null });
      const res = await api.patch<Application>(
        `/api/applications/${applicationId}/interviews/reorder`,
        { order },
      );
      setState({ isLoading: false, error: res.error?.message ?? null });
      return res;
    },
    [],
  );

  return { ...state, reorder };
}

// --- File operations ---

export function useUploadFile() {
  const [state, setState] = useState<MutationState>({
    isLoading: false,
    error: null,
  });
  const [progress, setProgress] = useState(0);

  const upload = useCallback(
    async (
      applicationId: string,
      fileType: FileType,
      file: File,
    ): Promise<boolean> => {
      setState({ isLoading: true, error: null });
      setProgress(0);

      // Get the file extension
      const ext = `.${file.name.split(".").pop()?.toLowerCase()}`;
      const contentType =
        EXTENSION_CONTENT_TYPES[ext] ?? "application/octet-stream";

      // 1. Request SAS token
      const sasRes = await api.post<UploadSasTokenResponse>(
        "/api/upload/sas-token",
        {
          applicationId,
          fileType,
          fileName: file.name,
          contentType,
        },
      );

      if (sasRes.error || !sasRes.data) {
        setState({
          isLoading: false,
          error: sasRes.error?.message ?? "Failed to get upload URL",
        });
        return false;
      }

      // 2. Upload to blob via XHR (for progress tracking)
      try {
        await new Promise<void>((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhr.open("PUT", sasRes.data!.uploadUrl, true);
          xhr.setRequestHeader("x-ms-blob-type", "BlockBlob");
          xhr.setRequestHeader("Content-Type", contentType);

          xhr.upload.onprogress = (e) => {
            if (e.lengthComputable) {
              setProgress(Math.round((e.loaded / e.total) * 100));
            }
          };

          xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) {
              resolve();
            } else {
              reject(new Error(`Upload failed with status ${xhr.status}`));
            }
          };

          xhr.onerror = () => reject(new Error("Upload failed"));
          xhr.send(file);
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Upload failed";
        setState({ isLoading: false, error: message });
        setProgress(0);
        return false;
      }

      setProgress(100);
      setState({ isLoading: false, error: null });
      return true;
    },
    [],
  );

  return { ...state, progress, upload };
}

export function useDownloadFile() {
  const download = useCallback(
    async (applicationId: string, fileType: FileType) => {
      const res = await api.get<DownloadSasTokenResponse>(
        "/api/download/sas-token",
        { applicationId, fileType },
      );

      if (
        res.data?.downloadUrl &&
        res.data.downloadUrl.startsWith("https://")
      ) {
        window.open(res.data.downloadUrl, "_blank", "noopener,noreferrer");
        return true;
      }
      return false;
    },
    [],
  );

  return { download };
}

export function useDeleteFile() {
  const [state, setState] = useState<MutationState>({
    isLoading: false,
    error: null,
  });

  const deleteFile = useCallback(
    async (applicationId: string, fileType: FileType) => {
      setState({ isLoading: true, error: null });
      const res = await api.delete<{
        id: string;
        fileType: string;
        deleted: boolean;
      }>(`/api/applications/${applicationId}/files/${fileType}`);
      setState({ isLoading: false, error: res.error?.message ?? null });
      return res;
    },
    [],
  );

  return { ...state, deleteFile };
}
