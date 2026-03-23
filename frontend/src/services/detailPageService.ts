import type { Work } from "../types";
import { request } from "../utils/APIClient";
import { getApiErrorMessage, readJsonSafe } from "../utils/apiResponse";

const AI_REQUEST_TIMEOUT_MS = 70_000;
const FILE_UPLOAD_REQUEST_TIMEOUT_MS = 120_000;

export type DetailToggleAction = "read" | "liked" | "shelved";

interface ApiSuccessResponse {
  success?: boolean;
  error?: string;
}

interface WorkMetadataUpdate {
  id?: string;
  title?: string;
  page_count?: number;
  authors?: string[];
  tags?: string[];
}

interface CreateWorkPayload {
  id: string;
  title: string;
  page_count: number;
  authors?: string[];
  tags?: string[];
}

interface ProgressResponse extends ApiSuccessResponse {
  read?: boolean;
}

interface ExplainResponse extends ApiSuccessResponse {
  result?: {
    cleaned_quote?: string;
    explanation?: string;
  };
}

type WorkResponse = Work & {
  error?: string;
};

export async function fetchWorkById(workId: string): Promise<Work | null> {
  const res = await request(`/api/works/${encodeURIComponent(workId)}`);
  const data = await readJsonSafe<WorkResponse>(res);
  if (res.status === 404) {
    return null;
  }

  if (!res.ok || data?.error) {
    throw new Error(getApiErrorMessage(data, "Failed to load work."));
  }

  return data;
}

export async function createWork(payload: CreateWorkPayload): Promise<void> {
  const res = await request("/api/works", {
    method: "POST",
    body: JSON.stringify({
      id: payload.id,
      title: payload.title,
      goodreads_id: "",
      page_count: payload.page_count,
      dropbox_link: "",
      amazon_asin: "",
      authors: payload.authors || [],
      tags: payload.tags || [],
    }),
  });
  const data = await readJsonSafe<ApiSuccessResponse>(res);
  if (!res.ok || !data?.success) {
    throw new Error(getApiErrorMessage(data, "Failed to create work."));
  }
}

export async function updateWorkAction(
  workId: string,
  action: DetailToggleAction,
  value: boolean,
): Promise<void> {
  const res = await request(`/api/works/${encodeURIComponent(workId)}`, {
    method: "POST",
    body: JSON.stringify({ action, value }),
  });
  const data = await readJsonSafe<ApiSuccessResponse>(res);
  if (!res.ok || !data?.success) {
    throw new Error(getApiErrorMessage(data, `Failed to update ${action}.`));
  }
}

export async function updateWorkRating(
  workId: string,
  rating: number,
): Promise<void> {
  const res = await request(`/api/works/${encodeURIComponent(workId)}`, {
    method: "POST",
    body: JSON.stringify({ action: "rating", value: rating }),
  });
  const data = await readJsonSafe<ApiSuccessResponse>(res);
  if (!res.ok || !data?.success) {
    throw new Error(getApiErrorMessage(data, "Failed to update rating."));
  }
}

export async function saveQuote(
  workId: string,
  payload: {
    quote: string;
    pageNumber: number | null;
    explanation: string;
  },
): Promise<boolean> {
  const res = await request(`/api/works/${encodeURIComponent(workId)}/quotes`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
  const data = await readJsonSafe<ApiSuccessResponse>(res);
  if (!res.ok) {
    throw new Error(getApiErrorMessage(data, "Failed to save quote."));
  }
  return !!data?.success;
}

export async function saveProgress(
  workId: string,
  payload: {
    note: string;
    pageNumber: number;
  },
): Promise<ProgressResponse> {
  const res = await request(
    `/api/works/${encodeURIComponent(workId)}/progress`,
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
  );
  const data = await readJsonSafe<ProgressResponse>(res);
  if (!res.ok || !data) {
    throw new Error(getApiErrorMessage(data, "Failed to save progress."));
  }
  return data;
}

export async function finishWorkProgress(
  workId: string,
  note: string,
): Promise<boolean> {
  const res = await request(
    `/api/works/${encodeURIComponent(workId)}/progress/finish`,
    {
      method: "POST",
      body: JSON.stringify({ note }),
    },
  );
  const data = await readJsonSafe<ApiSuccessResponse>(res);
  if (!res.ok) {
    throw new Error(getApiErrorMessage(data, "Failed to finish work."));
  }
  return !!data?.success;
}

export async function explainPassage(
  workId: string,
  text: string,
): Promise<{
  success: boolean;
  error?: string;
  cleanedQuote?: string;
  explanation?: string;
}> {
  const res = await request(`/api/works/${workId}/quotes/analyze`, {
    method: "POST",
    body: JSON.stringify({ text }),
    timeoutMs: AI_REQUEST_TIMEOUT_MS,
  });
  const data = await readJsonSafe<ExplainResponse>(res);

  return {
    success: !!data?.success && res.ok,
    error: getApiErrorMessage(data, "Failed to analyze passage."),
    cleanedQuote: data?.result?.cleaned_quote,
    explanation: data?.result?.explanation,
  };
}

export function buildLocalPdfUrl(
  fileUrl: string,
  currentPage?: number | null,
): string {
  const pdfParams = ["view=FitH"];
  if (currentPage) {
    pdfParams.unshift(`page=${currentPage}`);
  }
  return `${fileUrl}#${pdfParams.join("&")}`;
}

interface DropboxLinkResponse extends ApiSuccessResponse {
  dropbox_link?: string;
}

interface WorkFileUploadResponse extends ApiSuccessResponse {
  url?: string;
}

interface ReportWorkFileIssueResponse extends ApiSuccessResponse {
  notified_admins?: number;
}

export type WorkFileIssueType = "blank_or_missing_pages" | "other_issue";

export async function saveDropboxLink(
  workId: string,
  link: string,
): Promise<DropboxLinkResponse> {
  const res = await request(
    `/api/works/${encodeURIComponent(workId)}/dropbox-link`,
    {
      method: "POST",
      body: JSON.stringify({ link }),
    },
  );
  const data = await readJsonSafe<DropboxLinkResponse>(res);
  if (!res.ok || !data) {
    throw new Error(getApiErrorMessage(data, "Failed to save Dropbox link."));
  }
  return data;
}

export async function uploadWorkFile(
  workId: string,
  file: File,
): Promise<WorkFileUploadResponse> {
  const formData = new FormData();
  formData.append("file", file);

  const res = await request(`/api/works/${encodeURIComponent(workId)}/files`, {
    method: "POST",
    body: formData,
    timeoutMs: FILE_UPLOAD_REQUEST_TIMEOUT_MS,
  });
  const data = await readJsonSafe<WorkFileUploadResponse>(res);
  if (!res.ok || !data) {
    throw new Error(getApiErrorMessage(data, "Failed to upload file."));
  }
  return data;
}

export async function uploadWorkCover(
  workId: string,
  file: File,
): Promise<WorkFileUploadResponse> {
  const formData = new FormData();
  formData.append("file", file);

  const res = await request(`/api/works/${encodeURIComponent(workId)}/cover`, {
    method: "POST",
    body: formData,
    timeoutMs: FILE_UPLOAD_REQUEST_TIMEOUT_MS,
  });
  const data = await readJsonSafe<WorkFileUploadResponse>(res);
  if (!res.ok || !data) {
    throw new Error(getApiErrorMessage(data, "Failed to upload cover."));
  }
  return data;
}

export async function reportWorkFileIssue(
  workId: string,
  payload: {
    issueType: WorkFileIssueType;
    pageNumber?: number;
    details?: string;
  },
): Promise<ReportWorkFileIssueResponse> {
  const res = await request(
    `/api/works/${encodeURIComponent(workId)}/report-file-issue`,
    {
      method: "POST",
      body: JSON.stringify({
        issue_type: payload.issueType,
        page_number: payload.pageNumber,
        details: payload.details,
      }),
    },
  );
  const data = await readJsonSafe<ReportWorkFileIssueResponse>(res);
  if (!res.ok || !data) {
    throw new Error(getApiErrorMessage(data, "Failed to report PDF issue."));
  }
  return data;
}

export async function updateWorkTags(
  work: Work,
  tags: string[],
): Promise<void> {
  await updateWorkMetadata(work, { tags });
}

export async function updateWorkPageCount(
  work: Work,
  pageCount: number,
): Promise<void> {
  await updateWorkMetadata(work, { page_count: pageCount });
}

export async function updateWorkMetadata(
  work: Work,
  updates: WorkMetadataUpdate,
): Promise<void> {
  const res = await request(`/api/works/${encodeURIComponent(work.id)}`, {
    method: "PUT",
    body: JSON.stringify({
      id: updates.id ?? work.id,
      title: updates.title ?? work.title,
      goodreads_id: work.goodreads_id || "",
      page_count: updates.page_count ?? work.page_count,
      dropbox_link: work.dropbox_link || "",
      amazon_asin: work.amazon_asin || "",
      authors: updates.authors ?? (work.authors || []),
      tags: updates.tags ?? (work.tags || []),
    }),
  });
  const data = await readJsonSafe<ApiSuccessResponse>(res);
  if (!res.ok || !data?.success) {
    throw new Error(getApiErrorMessage(data, "Failed to update work."));
  }
}

export async function updateWorkTitle(
  work: Work,
  title: string,
  id?: string,
): Promise<void> {
  await updateWorkMetadata(work, { title, id });
}

export async function updateWorkAuthors(
  work: Work,
  authors: string[],
): Promise<void> {
  await updateWorkMetadata(work, { authors });
}
