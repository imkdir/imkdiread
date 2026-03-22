import type { ConversationMessage, Quote } from "../types";
import { request } from "../utils/APIClient";
import { getApiErrorMessage, readJsonSafe } from "../utils/apiResponse";

export type QuoteChatTool = "chat" | "analyze" | "translate";
export type QuoteChatProvider = "gemini" | "ollama";
export type QuoteChatModel = string;

export interface QuoteChatModelOption {
  id: QuoteChatModel;
  provider: QuoteChatProvider;
  provider_label: string;
  name: string;
  label: string;
  short_label: string;
}

interface QuoteChatModelWarning {
  provider: QuoteChatProvider;
  message: string;
}

interface QuoteChatResponse {
  success?: boolean;
  error?: string;
  quote?: Quote;
  conversations?: ConversationMessage[];
  model?: QuoteChatModel;
  tool?: QuoteChatTool;
  models?: QuoteChatModelOption[];
  default_model?: QuoteChatModel;
  warnings?: QuoteChatModelWarning[];
}

export const DEFAULT_QUOTE_CHAT_MODELS: QuoteChatModelOption[] = [
  {
    id: "gemini:gemini-2.5-flash",
    provider: "gemini",
    provider_label: "Gemini",
    name: "gemini-2.5-flash",
    label: "Gemini Flash",
    short_label: "Flash",
  },
  {
    id: "gemini:gemini-2.5-pro",
    provider: "gemini",
    provider_label: "Gemini",
    name: "gemini-2.5-pro",
    label: "Gemini Pro",
    short_label: "Pro",
  },
];

export async function fetchQuoteChatModels() {
  const res = await request("/api/quote-chat/models");
  const data = await readJsonSafe<QuoteChatResponse>(res);

  if (!res.ok || !data?.success) {
    throw new Error(
      getApiErrorMessage(data, "Failed to load quote chat models."),
    );
  }

  return {
    models: data.models?.length ? data.models : DEFAULT_QUOTE_CHAT_MODELS,
    defaultModel: data.default_model || DEFAULT_QUOTE_CHAT_MODELS[0].id,
    warnings: data.warnings || [],
  };
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
