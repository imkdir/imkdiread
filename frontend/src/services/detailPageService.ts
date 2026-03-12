import type { Work } from "../types";
import { request } from "../utils/APIClient";

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
  const data = (await res.json()) as WorkResponse;
  return data.error ? null : data;
}

export async function updateWorkAction(
  workId: string,
  action: DetailToggleAction,
  value: boolean,
): Promise<void> {
  await request(`/api/works/${encodeURIComponent(workId)}`, {
    method: "POST",
    body: JSON.stringify({ action, value }),
  });
}

export async function updateWorkRating(
  workId: string,
  rating: number,
): Promise<void> {
  await request(`/api/works/${encodeURIComponent(workId)}`, {
    method: "POST",
    body: JSON.stringify({ action: "rating", value: rating }),
  });
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
  const data = (await res.json()) as ApiSuccessResponse;
  return !!data.success;
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
  return (await res.json()) as ProgressResponse;
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
  const data = (await res.json()) as ApiSuccessResponse;
  return !!data.success;
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
  const data = (await res.json()) as ExplainResponse;

  return {
    success: !!data.success,
    error: data.error,
    cleanedQuote: data.result?.cleaned_quote,
    explanation: data.result?.explanation,
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
