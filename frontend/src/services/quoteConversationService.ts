import type { ConversationMessage, Quote } from "../types";
import { request } from "../utils/APIClient";
import { getApiErrorMessage, readJsonSafe } from "../utils/apiResponse";

const QUOTE_CHAT_REQUEST_TIMEOUT_MS = 70_000;

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
  disabled?: boolean;
}

interface QuoteChatModelWarning {
  provider: QuoteChatProvider;
  message: string;
}

export interface AIProviderOption {
  enabled: boolean;
  label: string;
}

export interface AIProviderCatalog {
  gemini: AIProviderOption;
  ollama: AIProviderOption;
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
  providers?: AIProviderCatalog;
}

interface QuoteSaveResponse {
  success?: boolean;
  error?: string;
  quote?: Quote;
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

const DEFAULT_AI_PROVIDERS: AIProviderCatalog = {
  gemini: {
    enabled: true,
    label: "Gemini",
  },
  ollama: {
    enabled: true,
    label: "Ollama",
  },
};

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
    providers: data.providers || DEFAULT_AI_PROVIDERS,
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

export async function deleteQuoteConversation(quoteId: number) {
  const res = await request(`/api/quotes/${quoteId}`, {
    method: "DELETE",
  });
  const data = await readJsonSafe<QuoteChatResponse>(res);

  if (!res.ok || !data?.success) {
    throw new Error(getApiErrorMessage(data, "Failed to delete quote."));
  }
}

export async function saveQuoteConversation(
  workId: string,
  payload: {
    quote: string;
    pageNumber?: number | null;
    explanation?: string;
    tags?: string[];
  },
) {
  const res = await request(`/api/works/${encodeURIComponent(workId)}/quotes`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
  const data = await readJsonSafe<QuoteSaveResponse>(res);

  if (!res.ok || !data?.success || !data.quote) {
    throw new Error(getApiErrorMessage(data, "Failed to save conversation."));
  }

  return data.quote;
}

export async function updateQuoteConversation(
  quoteId: number,
  payload: {
    quote: string;
    pageNumber?: number | null;
    explanation?: string | null;
    tags?: string[];
  },
) {
  const res = await request(`/api/quotes/${quoteId}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
  const data = await readJsonSafe<QuoteSaveResponse>(res);

  if (!res.ok || !data?.success || !data.quote) {
    throw new Error(getApiErrorMessage(data, "Failed to update conversation."));
  }

  return data.quote;
}

export async function sendQuoteChatMessage(
  workId: string,
  payload: {
    quoteId?: number | null;
    quote?: string;
    pageNumber?: number | null;
    tags?: string[];
    message: string;
    tool: QuoteChatTool;
    model: QuoteChatModel;
    targetLanguage?: string;
    replaceLatestTurn?: boolean;
  },
) {
  const res = await request(
    `/api/works/${encodeURIComponent(workId)}/quotes/chat`,
    {
      method: "POST",
      body: JSON.stringify(payload),
      timeoutMs: QUOTE_CHAT_REQUEST_TIMEOUT_MS,
    },
  );
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
