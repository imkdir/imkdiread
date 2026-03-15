import type { Work } from "../types";
import { request } from "../utils/APIClient";
import { getApiErrorMessage, readJsonSafe } from "../utils/apiResponse";

export type DetailToggleAction = "read" | "liked" | "shelved";

interface ApiSuccessResponse {
  success?: boolean;
  error?: string;
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
  if (!res.ok || data?.error) {
    return null;
  }
  return data;
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
  const res = await request(`/api/works/${workId}/dictionary/explain`, {
    method: "POST",
    body: JSON.stringify({ text }),
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

export function buildFinderLabel(fileUrl: string, workId: string): string {
  let filename = fileUrl.split("/").pop() || "";
  filename = filename.replace(/\.[^/.]+$/, "");
  const lowerFilename = filename.toLowerCase();
  const lowerPrefix = workId.toLowerCase();

  if (lowerFilename.startsWith(`${lowerPrefix}_`)) {
    filename = filename.slice(workId.length + 1);
  } else if (lowerFilename.startsWith(lowerPrefix)) {
    filename = filename.slice(workId.length);
  }

  filename = filename.replace(/^_+/, "");
  const segments = filename.split(/[_\s-]+/).filter(Boolean);
  const mapped = segments.map((segment) => {
    const lower = segment.toLowerCase();
    if (lower === "lec") return "Limited Editions Club";
    if (lower === "ppp") return "Peter Pauper Press";
    if (lower === "ml") return "Modern Library";
    if (lower === "hp") return "Heritage Press";
    if (/^\d+$/.test(lower)) return `Vol.${Number(segment)}`;
    return segment;
  });

  return mapped.join(" ") || "Edition";
}

interface DropboxLinkResponse extends ApiSuccessResponse {
  dropbox_link?: string;
}

interface WorkFileUploadResponse extends ApiSuccessResponse {
  url?: string;
}

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

  const res = await request(
    `/api/works/${encodeURIComponent(workId)}/files`,
    {
      method: "POST",
      body: formData,
    },
  );
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

  const res = await request(
    `/api/works/${encodeURIComponent(workId)}/cover`,
    {
      method: "POST",
      body: formData,
    },
  );
  const data = await readJsonSafe<WorkFileUploadResponse>(res);
  if (!res.ok || !data) {
    throw new Error(getApiErrorMessage(data, "Failed to upload cover."));
  }
  return data;
}

export async function updateWorkTags(
  work: Work,
  tags: string[],
): Promise<void> {
  const res = await request(`/api/works/${encodeURIComponent(work.id)}`, {
    method: "PUT",
    body: JSON.stringify({
      id: work.id,
      title: work.title,
      goodreads_id: work.goodreads_id || "",
      page_count: work.page_count,
      dropbox_link: work.dropbox_link || "",
      amazon_asin: work.amazon_asin || "",
      authors: work.authors || [],
      tags,
    }),
  });
  const data = await readJsonSafe<ApiSuccessResponse>(res);
  if (!res.ok || !data?.success) {
    throw new Error(getApiErrorMessage(data, "Failed to update tags."));
  }
}

export async function updateWorkPageCount(
  work: Work,
  pageCount: number,
): Promise<void> {
  const res = await request(`/api/works/${encodeURIComponent(work.id)}`, {
    method: "PUT",
    body: JSON.stringify({
      id: work.id,
      title: work.title,
      goodreads_id: work.goodreads_id || "",
      page_count: pageCount,
      dropbox_link: work.dropbox_link || "",
      amazon_asin: work.amazon_asin || "",
      authors: work.authors || [],
      tags: work.tags || [],
    }),
  });
  const data = await readJsonSafe<ApiSuccessResponse>(res);
  if (!res.ok || !data?.success) {
    throw new Error(getApiErrorMessage(data, "Failed to update page count."));
  }
}
