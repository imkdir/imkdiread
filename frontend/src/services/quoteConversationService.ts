import type { ConversationMessage, Quote } from "../types";
import { request } from "../utils/APIClient";
import { getApiErrorMessage, readJsonSafe } from "../utils/apiResponse";

export type QuoteChatTool = "chat" | "analyze" | "translate";
export type QuoteChatModel = "gemini-2.5-flash" | "gemini-2.5-pro";

interface QuoteChatResponse {
  success?: boolean;
  error?: string;
  quote?: Quote;
  conversations?: ConversationMessage[];
  model?: QuoteChatModel;
  tool?: QuoteChatTool;
}

export async function fetchQuoteChat(quoteId: number) {
  const res = await request(`/api/quotes/${quoteId}/chat`);
  const data = await readJsonSafe<QuoteChatResponse>(res);

  if (!res.ok || !data?.success || !data.quote) {
    throw new Error(getApiErrorMessage(data, "Failed to load quote chat."));
  }

  return {
    quote: data.quote,
    conversations: data.conversations || [],
  };
}

export async function clearQuoteChat(quoteId: number) {
  const res = await request(`/api/quotes/${quoteId}/chat`, {
    method: "DELETE",
  });
  const data = await readJsonSafe<QuoteChatResponse>(res);

  if (!res.ok || !data?.success) {
    throw new Error(getApiErrorMessage(data, "Failed to clear quote chat."));
  }
}

export async function sendQuoteChatMessage(
  workId: string,
  payload: {
    quoteId?: number | null;
    quote?: string;
    pageNumber?: number | null;
    message: string;
    tool: QuoteChatTool;
    model: QuoteChatModel;
    targetLanguage?: string;
    replaceLatestTurn?: boolean;
  },
) {
  const res = await request(`/api/works/${encodeURIComponent(workId)}/quotes/chat`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
  const data = await readJsonSafe<QuoteChatResponse>(res);

  if (!res.ok || !data?.success || !data.quote) {
    throw new Error(getApiErrorMessage(data, "Failed to send quote chat."));
  }

  return {
    quote: data.quote,
    conversations: data.conversations || [],
    model: data.model || payload.model,
    tool: data.tool || payload.tool,
  };
}
