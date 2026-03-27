import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";

import type { ConversationMessage, Quote } from "../types";
import { AppIcon } from "./AppIcon";
import { showToast } from "../utils/toast";
import { Modal } from "./Modal";
import { useAuth } from "./AuthContext";
import {
  deleteQuoteConversation,
  fetchQuoteChat,
  fetchQuoteChatModels,
  saveQuoteConversation,
  updateQuoteConversation,
  sendQuoteChatMessage,
  DEFAULT_QUOTE_CHAT_MODELS,
  type QuoteChatModelOption,
  type QuoteChatModel,
} from "../services/quoteConversationService";
import {
  parseAssistantMessageSections,
  renderAssistantBlocks,
} from "./quoteConversationMarkdown";
import "./QuoteConversationModal.css";

const TOOL_OPTIONS = [
  { value: "translate", label: "Translate", icon: "translate" as const },
  { value: "analyze", label: "Analyze", icon: "analyze" as const },
] as const;

const TRANSLATION_LANGUAGE_OPTIONS = [
  { value: "zh", label: "Chinese", targetLanguage: "Chinese" },
  { value: "en", label: "English", targetLanguage: "English" },
  { value: "ja", label: "Japanese", targetLanguage: "Japanese" },
  { value: "fr", label: "French", targetLanguage: "French" },
  { value: "de", label: "German", targetLanguage: "German" },
  { value: "ru", label: "Russian", targetLanguage: "Russian" },
  { value: "es", label: "Spanish", targetLanguage: "Spanish" },
] as const;

type ToolValue = (typeof TOOL_OPTIONS)[number]["value"];
type ActiveToolValue = ToolValue | null;
type TranslationLanguageValue =
  | "browser"
  | (typeof TRANSLATION_LANGUAGE_OPTIONS)[number]["value"];
type TranslationLanguageOption = {
  value: TranslationLanguageValue;
  label: string;
  targetLanguage: string;
};
type QuoteConversationTheme = "dark" | "light";

const DEFAULT_QUOTE_CHAT_MODEL = DEFAULT_QUOTE_CHAT_MODELS[0].id;
const QUOTE_CONVERSATION_THEME_STORAGE_KEY = "quote-conversation-theme";
const MAX_QUOTE_TAGS = 30;

interface QuoteConversationModalProps {
  isOpen: boolean;
  workId: string;
  quote?: Quote | null;
  initialQuoteText?: string;
  initialPageNumber?: string;
  initialDrawerOpen?: boolean;
  forceScrollToBottomOnOpen?: boolean;
  onClose: () => void;
  onRefresh?: () => void;
}

function loadQuoteConversationTheme(): QuoteConversationTheme {
  if (typeof window === "undefined") {
    return "dark";
  }

  const stored = window.localStorage.getItem(
    QUOTE_CONVERSATION_THEME_STORAGE_KEY,
  );
  return stored === "light" ? "light" : "dark";
}

function formatMessageContent(content: string) {
  return String(content || "")
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
}

function formatLanguageLabel(value: string) {
  return value
    .replace(/[-_]/g, " ")
    .replace(/\b\p{L}/gu, (letter) => letter.toUpperCase());
}

function resolveBrowserTranslationLanguage(): TranslationLanguageOption {
  const requestedLanguage =
    typeof navigator !== "undefined"
      ? navigator.languages?.[0] || navigator.language
      : "en";
  const normalizedCode = requestedLanguage.split("-")[0]?.toLowerCase() || "en";
  const matched = TRANSLATION_LANGUAGE_OPTIONS.find(
    (option) => option.value === normalizedCode,
  );

  if (matched) {
    return matched;
  }

  try {
    const displayNames = new Intl.DisplayNames(["en"], { type: "language" });
    const label = displayNames.of(normalizedCode);
    if (label) {
      return {
        value: "browser",
        label: formatLanguageLabel(label),
        targetLanguage: formatLanguageLabel(label),
      };
    }
  } catch {
    // Older browsers may not support Intl.DisplayNames.
  }

  return {
    value: "browser",
    label: "English",
    targetLanguage: "English",
  };
}

function getMergedTranslationLanguageOptions(
  browserLanguage: TranslationLanguageOption,
): TranslationLanguageOption[] {
  if (browserLanguage.value !== "browser") {
    return [...TRANSLATION_LANGUAGE_OPTIONS];
  }

  return [browserLanguage, ...TRANSLATION_LANGUAGE_OPTIONS];
}

function getDefaultTranslationLanguageValue(): TranslationLanguageValue {
  return resolveBrowserTranslationLanguage().value;
}

function normalizeConversationText(content: string) {
  return String(content || "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeQuoteTagLabel(value: string) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeQuoteTagList(tags: string[]) {
  const normalized: string[] = [];
  const seen = new Set<string>();

  for (const tag of tags) {
    const compact = normalizeQuoteTagLabel(tag);
    if (!compact) {
      continue;
    }

    const dedupeKey = compact.toLowerCase();
    if (seen.has(dedupeKey)) {
      continue;
    }

    normalized.push(compact);
    seen.add(dedupeKey);
  }

  return normalized;
}

function parsePageNumberValue(value: string) {
  const trimmed = String(value || "").trim();
  if (!trimmed) {
    return null;
  }

  if (!/^\d+$/.test(trimmed)) {
    return null;
  }

  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }

  return parsed;
}

function resizeTextarea(
  textarea: HTMLTextAreaElement | null,
  options?: { maxLines?: number },
) {
  if (!textarea) {
    return;
  }

  const computedStyle = window.getComputedStyle(textarea);
  const lineHeight = Number.parseFloat(computedStyle.lineHeight) || 24;
  const borderTop = Number.parseFloat(computedStyle.borderTopWidth) || 0;
  const borderBottom = Number.parseFloat(computedStyle.borderBottomWidth) || 0;
  const maxLines = options?.maxLines;
  const maxHeight = maxLines
    ? lineHeight * maxLines + borderTop + borderBottom
    : Number.POSITIVE_INFINITY;

  textarea.style.height = "auto";
  const nextHeight = Math.min(textarea.scrollHeight, maxHeight);
  textarea.style.height = `${nextHeight}px`;
  textarea.style.overflowY =
    textarea.scrollHeight > maxHeight ? "auto" : "hidden";
}

function getLatestConversationTurn(messages: ConversationMessage[]) {
  let assistantIndex = -1;
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index]?.role === "assistant") {
      assistantIndex = index;
      break;
    }
  }

  let userIndex = -1;
  const searchStart =
    assistantIndex >= 0 ? assistantIndex - 1 : messages.length - 1;
  for (let index = searchStart; index >= 0; index -= 1) {
    if (messages[index]?.role === "user") {
      userIndex = index;
      break;
    }
  }

  const removableIds = new Set<number>();
  if (userIndex >= 0) {
    removableIds.add(messages[userIndex].id);
  }
  if (assistantIndex > userIndex) {
    removableIds.add(messages[assistantIndex].id);
  }

  return {
    userIndex,
    assistantIndex,
    userEntry: userIndex >= 0 ? messages[userIndex] : null,
    assistantEntry:
      assistantIndex > userIndex ? messages[assistantIndex] : null,
    remaining: messages.filter((message) => !removableIds.has(message.id)),
  };
}

interface ConversationTurnReplacementTarget {
  userEntryId: number;
  assistantEntryId: number | null;
  insertionIndex: number;
}

function applyOptimisticTurnReplacement(
  messages: ConversationMessage[],
  replacementTarget: ConversationTurnReplacementTarget,
  userMessage: string,
) {
  return messages.flatMap((entry) => {
    if (
      replacementTarget.assistantEntryId !== null &&
      entry.id === replacementTarget.assistantEntryId
    ) {
      return [];
    }

    if (entry.id === replacementTarget.userEntryId) {
      return [{ ...entry, content: userMessage }];
    }

    return [entry];
  });
}

function applyResolvedTurnReplacement(
  messages: ConversationMessage[],
  replacementTarget: ConversationTurnReplacementTarget,
  replacementEntries: ConversationMessage[],
) {
  const filteredMessages = messages.filter((entry) => {
    if (entry.id === replacementTarget.userEntryId) {
      return false;
    }

    if (
      replacementTarget.assistantEntryId !== null &&
      entry.id === replacementTarget.assistantEntryId
    ) {
      return false;
    }

    return true;
  });

  const boundedInsertionIndex = Math.max(
    0,
    Math.min(replacementTarget.insertionIndex, filteredMessages.length),
  );

  return [
    ...filteredMessages.slice(0, boundedInsertionIndex),
    ...replacementEntries,
    ...filteredMessages.slice(boundedInsertionIndex),
  ];
}

function getLatestConversationEntry(messages: ConversationMessage[]) {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index]?.role !== "meta") {
      return messages[index];
    }
  }

  return null;
}

function getLatestConversationEntryId(messages: ConversationMessage[]) {
  return getLatestConversationEntry(messages)?.id || 0;
}

function createConversationMetaMessage(
  id: number,
  metaType: NonNullable<ConversationMessage["meta_type"]>,
  content: string,
): ConversationMessage {
  return {
    id,
    role: "meta",
    content,
    created_at: new Date().toISOString(),
    quote_id: 0,
    meta_type: metaType,
    meta_display: "divider",
  };
}

function mergeTrailingMetaMessage(
  messages: ConversationMessage[],
  nextMessage: ConversationMessage,
) {
  let trailingStart = messages.length;
  while (trailingStart > 0 && messages[trailingStart - 1]?.role === "meta") {
    trailingStart -= 1;
  }

  const leadingMessages = messages.slice(0, trailingStart);
  const trailingMessages = messages.slice(trailingStart).filter((message) => {
    return !(
      message.role === "meta" &&
      message.meta_type &&
      message.meta_type === nextMessage.meta_type
    );
  });

  return [...leadingMessages, ...trailingMessages, nextMessage];
}

interface FailedConversationTurn {
  userMessage: string;
  errorMessage: string;
  replaceLatestTurn: boolean;
  tool: ActiveToolValue;
  model: QuoteChatModel;
  translationLanguage: TranslationLanguageValue;
}

export function QuoteConversationModal({
  isOpen,
  workId,
  quote,
  initialQuoteText = "",
  initialPageNumber = "",
  initialDrawerOpen = false,
  forceScrollToBottomOnOpen = true,
  onClose,
  onRefresh,
}: QuoteConversationModalProps) {
  const { user } = useAuth();
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const headerRef = useRef<HTMLDivElement | null>(null);
  const composerAreaRef = useRef<HTMLDivElement | null>(null);
  const composerRef = useRef<HTMLTextAreaElement | null>(null);
  const editingTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const replyRefs = useRef(new Map<number, HTMLDivElement | null>());
  const nextClientMessageIdRef = useRef(-1);
  const lastSeenReplyIdRef = useRef(0);
  const pendingScrollBehaviorRef = useRef<ScrollBehavior | null>(null);
  const pendingUnreadCheckRef = useRef(false);
  const didForceScrollOnOpenRef = useRef(false);
  const isSendInFlightRef = useRef(false);
  const unsavedDrawerBaselineRef = useRef<{
    quoteText: string;
    pageNumber: string;
    tags: string[];
  }>({
    quoteText: "",
    pageNumber: "",
    tags: [],
  });
  const [activeQuote, setActiveQuote] = useState<Quote | null>(quote || null);
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [composer, setComposer] = useState("");
  const [pendingUserMessage, setPendingUserMessage] = useState<string | null>(
    null,
  );
  const [failedTurn, setFailedTurn] = useState<FailedConversationTurn | null>(
    null,
  );
  const [editingMessageId, setEditingMessageId] = useState<number | null>(null);
  const [editingDraft, setEditingDraft] = useState("");
  const [selectedTool, setSelectedTool] = useState<ActiveToolValue>(null);
  const [modelOptions, setModelOptions] = useState<QuoteChatModelOption[]>(
    DEFAULT_QUOTE_CHAT_MODELS,
  );
  const [selectedModel, setSelectedModel] = useState<QuoteChatModel>(
    DEFAULT_QUOTE_CHAT_MODEL,
  );
  const [selectedTranslationLanguage, setSelectedTranslationLanguage] =
    useState<TranslationLanguageValue>(getDefaultTranslationLanguageValue);
  const [theme, setTheme] = useState<QuoteConversationTheme>(
    loadQuoteConversationTheme,
  );
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [drawerQuoteText, setDrawerQuoteText] = useState("");
  const [drawerPageNumber, setDrawerPageNumber] = useState("");
  const [drawerTags, setDrawerTags] = useState<string[]>([]);
  const [tagDraft, setTagDraft] = useState("");
  const [editingTagIndex, setEditingTagIndex] = useState<number | null>(null);
  const [editingTagDraft, setEditingTagDraft] = useState("");
  const [isPageNumberInputActive, setIsPageNumberInputActive] = useState(false);
  const [isToolMenuOpen, setIsToolMenuOpen] = useState(false);
  const [isLanguageMenuOpen, setIsLanguageMenuOpen] = useState(false);
  const [isLoadingModels, setIsLoadingModels] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
  const [isMetadataSaving, setIsMetadataSaving] = useState(false);
  const [isSavingConversation, setIsSavingConversation] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);
  const [bodyInsets, setBodyInsets] = useState({ top: 94, bottom: 186 });

  const browserTranslationLanguage = useMemo(
    () => resolveBrowserTranslationLanguage(),
    [],
  );
  const translationLanguageOptions = useMemo(
    () => getMergedTranslationLanguageOptions(browserTranslationLanguage),
    [browserTranslationLanguage],
  );
  const selectedToolLabel = TOOL_OPTIONS.find(
    (option) => option.value === selectedTool,
  )?.label;
  const selectedToolOption =
    TOOL_OPTIONS.find((option) => option.value === selectedTool) || null;
  const selectedModelOption =
    modelOptions.find((option) => option.id === selectedModel) ||
    DEFAULT_QUOTE_CHAT_MODELS.find((option) => option.id === selectedModel) ||
    null;
  const selectedLanguageLabel =
    translationLanguageOptions.find(
      (option) => option.value === selectedTranslationLanguage,
    )?.label || browserTranslationLanguage.label;
  const isViewerConversationOwner =
    !activeQuote?.id ||
    !activeQuote.user_id ||
    activeQuote.user_id === user?.id;
  const latestConversationEntryId = getLatestConversationEntryId(messages);
  const shareConversationPath = activeQuote?.id
    ? `/work/${encodeURIComponent(workId)}/conversation/${activeQuote.id}`
    : null;
  const shareConversationUrl =
    typeof window !== "undefined" && shareConversationPath
      ? `${window.location.origin}${shareConversationPath}`
      : shareConversationPath;
  const debugHeaderLabel = `Q:${activeQuote?.id || "-"} · C:${latestConversationEntryId || "-"}`;
  const hasConversationId = latestConversationEntryId > 0;
  const latestTurn = useMemo(
    () => getLatestConversationTurn(messages),
    [messages],
  );
  const latestUserMessageId = latestTurn.userEntry?.id ?? null;
  const isEditingMessageUnchanged =
    editingMessageId !== null &&
    normalizeConversationText(editingDraft) ===
      normalizeConversationText(latestTurn.userEntry?.content || "");
  const isDrawerDirty = useMemo(() => {
    const currentQuoteText = String(drawerQuoteText || "");
    const currentPage = String(drawerPageNumber || "").trim();
    const currentTags = normalizeQuoteTagList(drawerTags);

    if (!activeQuote?.id) {
      const baseline = unsavedDrawerBaselineRef.current;
      const quoteChanged = currentQuoteText !== baseline.quoteText;
      const pageChanged = currentPage !== baseline.pageNumber;
      const tagsChanged =
        currentTags.length !== baseline.tags.length ||
        currentTags.some((tag, index) => tag !== baseline.tags[index]);
      return quoteChanged || pageChanged || tagsChanged;
    }

    const quoteChanged = currentQuoteText !== String(activeQuote.quote || "");
    const savedPage = activeQuote.page_number
      ? String(activeQuote.page_number)
      : "";
    const pageChanged = currentPage !== savedPage;
    const savedTags = normalizeQuoteTagList(activeQuote.tags || []);
    const tagsChanged =
      currentTags.length !== savedTags.length ||
      currentTags.some((tag, index) => tag !== savedTags[index]);

    return quoteChanged || pageChanged || tagsChanged;
  }, [activeQuote, drawerPageNumber, drawerQuoteText, drawerTags]);

  useEffect(() => {
    window.localStorage.setItem(QUOTE_CONVERSATION_THEME_STORAGE_KEY, theme);
  }, [theme]);

  const isNearBottom = () => {
    const body = bodyRef.current;
    if (!body) {
      return true;
    }

    return body.scrollHeight - (body.scrollTop + body.clientHeight) < 80;
  };

  const scrollToBottom = (behavior: ScrollBehavior = "smooth") => {
    window.requestAnimationFrame(() => {
      const body = bodyRef.current;
      if (!body) {
        return;
      }

      body.scrollTo({
        top: body.scrollHeight,
        behavior,
      });
    });
  };

  const updateUnreadReplyState = useCallback(() => {
    const latestReply = getLatestConversationEntry(messages);
    if (!latestReply) {
      setShowScrollToBottom(false);
      return;
    }

    const body = bodyRef.current;
    const replyNode = replyRefs.current.get(latestReply.id);
    if (body && replyNode) {
      const bodyRect = body.getBoundingClientRect();
      const replyRect = replyNode.getBoundingClientRect();
      const isVisible =
        replyRect.bottom > bodyRect.top + 8 &&
        replyRect.top < bodyRect.bottom - 8;

      if (isVisible) {
        lastSeenReplyIdRef.current = Math.max(
          lastSeenReplyIdRef.current,
          latestReply.id,
        );
        setShowScrollToBottom(false);
        return;
      }
    }

    setShowScrollToBottom(latestReply.id > lastSeenReplyIdRef.current);
  }, [messages]);
  useEffect(() => {
    if (!isOpen) {
      didForceScrollOnOpenRef.current = false;
      return;
    }

    setActiveQuote(quote || null);
    setMessages([]);
    setError(null);
    setPendingUserMessage(null);
    setFailedTurn(null);
    setEditingMessageId(null);
    setEditingDraft("");
    setShowScrollToBottom(false);
    setIsDrawerOpen(initialDrawerOpen);
    setDrawerQuoteText(quote?.quote || initialQuoteText || "");
    setDrawerPageNumber(
      quote?.page_number
        ? String(quote.page_number)
        : String(initialPageNumber || "").trim(),
    );
    const nextTags = normalizeQuoteTagList(quote?.tags || []);
    setDrawerTags(nextTags);
    unsavedDrawerBaselineRef.current = {
      quoteText: quote?.quote || initialQuoteText || "",
      pageNumber: quote?.page_number
        ? String(quote.page_number)
        : String(initialPageNumber || "").trim(),
      tags: nextTags,
    };
    setTagDraft("");
    setEditingTagIndex(null);
    setEditingTagDraft("");
    setIsPageNumberInputActive(false);
    setIsToolMenuOpen(false);
    setIsLanguageMenuOpen(false);
    setSelectedTool(null);
    setModelOptions(DEFAULT_QUOTE_CHAT_MODELS);
    setSelectedModel(DEFAULT_QUOTE_CHAT_MODEL);
    setSelectedTranslationLanguage(getDefaultTranslationLanguageValue());
    setComposer(quote?.id ? "" : initialQuoteText);
    setIsSavingConversation(false);
    if (!forceScrollToBottomOnOpen) {
      window.requestAnimationFrame(() => {
        bodyRef.current?.scrollTo({ top: 0, behavior: "auto" });
      });
    }

    if (!quote?.id) {
      setIsLoadingHistory(false);
      return;
    }

    setIsLoadingHistory(true);
    void fetchQuoteChat(quote.id)
      .then((data) => {
        lastSeenReplyIdRef.current = getLatestConversationEntryId(
          data.conversations,
        );
        pendingScrollBehaviorRef.current = forceScrollToBottomOnOpen
          ? "auto"
          : null;
        setShowScrollToBottom(false);
        setActiveQuote(data.quote);
        setDrawerQuoteText(data.quote.quote || "");
        setDrawerPageNumber(
          data.quote.page_number ? String(data.quote.page_number) : "",
        );
        setDrawerTags(normalizeQuoteTagList(data.quote.tags || []));
        setMessages(data.conversations);
        setFailedTurn(null);
      })
      .catch((loadError) => {
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Failed to load quote chat.",
        );
      })
      .finally(() => {
        setIsLoadingHistory(false);
      });
  }, [
    forceScrollToBottomOnOpen,
    initialDrawerOpen,
    initialPageNumber,
    initialQuoteText,
    isOpen,
    quote,
  ]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    let isCancelled = false;
    setIsLoadingModels(true);

    void fetchQuoteChatModels()
      .then((data) => {
        if (isCancelled) {
          return;
        }

        setModelOptions(data.models);
        setSelectedModel((current) => {
          const hasCurrentModel = data.models.some(
            (option) => option.id === current && !option.disabled,
          );
          return hasCurrentModel ? current : data.defaultModel;
        });
      })
      .catch((loadError) => {
        if (isCancelled) {
          return;
        }

        setModelOptions(DEFAULT_QUOTE_CHAT_MODELS);
        setSelectedModel(DEFAULT_QUOTE_CHAT_MODEL);
        showToast(
          loadError instanceof Error
            ? loadError.message
            : "Failed to load quote chat models.",
          { tone: "error" },
        );
      })
      .finally(() => {
        if (!isCancelled) {
          setIsLoadingModels(false);
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || !pendingUserMessage) {
      return;
    }

    setShowScrollToBottom(false);
    scrollToBottom("smooth");
  }, [isOpen, pendingUserMessage]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    if (pendingScrollBehaviorRef.current) {
      const behavior = pendingScrollBehaviorRef.current;
      pendingScrollBehaviorRef.current = null;
      lastSeenReplyIdRef.current = Math.max(
        lastSeenReplyIdRef.current,
        getLatestConversationEntryId(messages),
      );
      setShowScrollToBottom(false);
      scrollToBottom(behavior);
      return;
    }

    if (pendingUnreadCheckRef.current) {
      pendingUnreadCheckRef.current = false;
      updateUnreadReplyState();
    }
  }, [isOpen, messages, updateUnreadReplyState]);

  useEffect(() => {
    if (
      !isOpen ||
      !forceScrollToBottomOnOpen ||
      isLoadingHistory ||
      didForceScrollOnOpenRef.current
    ) {
      return;
    }

    didForceScrollOnOpenRef.current = true;
    lastSeenReplyIdRef.current = Math.max(
      lastSeenReplyIdRef.current,
      getLatestConversationEntryId(messages),
    );
    setShowScrollToBottom(false);
    scrollToBottom("auto");
  }, [forceScrollToBottomOnOpen, isLoadingHistory, isOpen, messages]);

  useLayoutEffect(() => {
    if (!isOpen) {
      return;
    }

    const updateInsets = () => {
      setBodyInsets({
        top: (headerRef.current?.offsetHeight || 0) + 24,
        bottom: isViewerConversationOwner
          ? (composerAreaRef.current?.offsetHeight || 0) + 44
          : 44,
      });
    };

    updateInsets();

    const resizeObserver =
      typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(() => {
            updateInsets();
          })
        : null;

    if (resizeObserver) {
      if (headerRef.current) {
        resizeObserver.observe(headerRef.current);
      }
      if (composerAreaRef.current) {
        resizeObserver.observe(composerAreaRef.current);
      }
    }

    window.addEventListener("resize", updateInsets);

    return () => {
      resizeObserver?.disconnect();
      window.removeEventListener("resize", updateInsets);
    };
  }, [isOpen, isViewerConversationOwner]);

  useEffect(() => {
    if (editingMessageId === null) {
      return;
    }

    window.requestAnimationFrame(() => {
      resizeTextarea(editingTextareaRef.current);
    });
  }, [editingDraft, editingMessageId]);

  useEffect(() => {
    window.requestAnimationFrame(() => {
      resizeTextarea(composerRef.current, { maxLines: 5 });
    });
  }, [composer, isOpen]);

  const handleSend = async ({
    messageText,
    replaceLatestTurn = false,
    toolOverride,
    modelOverride,
    translationLanguageOverride,
  }: {
    messageText?: string;
    replaceLatestTurn?: boolean;
    toolOverride?: ActiveToolValue;
    modelOverride?: QuoteChatModel;
    translationLanguageOverride?: TranslationLanguageValue;
  } = {}) => {
    if (isSendInFlightRef.current) {
      return;
    }

    if (!isViewerConversationOwner) {
      setError("This conversation is read-only for non-owners.");
      return;
    }

    const trimmedMessage = (messageText ?? composer).trim();
    const normalizedDrawerQuote = String(drawerQuoteText || "").trim();
    const effectiveTool =
      toolOverride !== undefined ? toolOverride : selectedTool;
    const effectiveModel = modelOverride ?? selectedModel;
    const effectiveTranslationLanguage =
      translationLanguageOverride ?? selectedTranslationLanguage;
    const effectiveTargetLanguage =
      translationLanguageOptions.find(
        (option) => option.value === effectiveTranslationLanguage,
      )?.targetLanguage || browserTranslationLanguage.targetLanguage;

    if (!trimmedMessage) {
      setError("Please enter a message.");
      return;
    }

    const replacementTarget =
      replaceLatestTurn && latestTurn.userEntry
        ? {
            userEntryId: latestTurn.userEntry.id,
            assistantEntryId: latestTurn.assistantEntry?.id ?? null,
            insertionIndex:
              latestTurn.userIndex >= 0
                ? latestTurn.userIndex
                : messages.length,
          }
        : null;
    const normalizedPageNumber = drawerPageNumber.trim();
    const parsedPageNumber = normalizedPageNumber
      ? Number(normalizedPageNumber)
      : null;

    setIsSending(true);
    isSendInFlightRef.current = true;
    setError(null);
    setFailedTurn(null);
    setPendingUserMessage(replaceLatestTurn ? null : trimmedMessage);
    setEditingMessageId(null);
    setEditingDraft("");
    if (replaceLatestTurn && replacementTarget) {
      setMessages((current) =>
        applyOptimisticTurnReplacement(
          current,
          replacementTarget,
          trimmedMessage,
        ),
      );
    } else {
      setComposer("");
    }

    try {
      const quoteForRequest = activeQuote;
      const isNewQuoteConversation = !quoteForRequest?.id;
      if (
        isNewQuoteConversation &&
        normalizedPageNumber &&
        (parsedPageNumber === null ||
          !Number.isInteger(parsedPageNumber) ||
          parsedPageNumber <= 0)
      ) {
        throw new Error("Page number must be a positive integer.");
      }

      const data = await sendQuoteChatMessage(workId, {
        quoteId: quoteForRequest?.id,
        quote:
          quoteForRequest?.quote || normalizedDrawerQuote || trimmedMessage,
        pageNumber: quoteForRequest?.page_number ?? parsedPageNumber,
        tags: drawerTags,
        message: trimmedMessage,
        tool: effectiveTool || "chat",
        model: effectiveModel,
        targetLanguage:
          effectiveTool === "translate" ? effectiveTargetLanguage : undefined,
        replaceLatestTurn,
      });

      const shouldStickToBottom = isNearBottom();
      if (shouldStickToBottom) {
        pendingScrollBehaviorRef.current = "smooth";
      } else {
        pendingUnreadCheckRef.current = true;
      }
      setActiveQuote(data.quote);
      setDrawerQuoteText(data.quote.quote || "");
      setDrawerPageNumber(
        data.quote.page_number ? String(data.quote.page_number) : "",
      );
      setDrawerTags(normalizeQuoteTagList(data.quote.tags || []));
      setSelectedModel(data.model);
      setFailedTurn(null);
      setMessages((prev) =>
        replaceLatestTurn && replacementTarget
          ? applyResolvedTurnReplacement(
              prev,
              replacementTarget,
              data.conversations,
            )
          : [...prev, ...data.conversations],
      );
      setComposer("");
      if (
        isNewQuoteConversation ||
        replaceLatestTurn ||
        effectiveTool === "analyze"
      ) {
        onRefresh?.();
      }
    } catch (sendError) {
      const errorMessage =
        sendError instanceof Error
          ? sendError.message
          : "Failed to send quote chat.";
      setFailedTurn({
        userMessage: trimmedMessage,
        errorMessage,
        replaceLatestTurn,
        tool: effectiveTool,
        model: effectiveModel,
        translationLanguage: effectiveTranslationLanguage,
      });
    } finally {
      isSendInFlightRef.current = false;
      setPendingUserMessage(null);
      setIsSending(false);
      setIsSavingConversation(false);
    }
  };

  const handleStartEditingLatestMessage = () => {
    if (
      !isViewerConversationOwner ||
      !latestTurn.userEntry ||
      isSending ||
      failedTurn
    ) {
      return;
    }

    setEditingMessageId(latestTurn.userEntry.id);
    setEditingDraft(latestTurn.userEntry.content);
    setError(null);
    setFailedTurn(null);
  };

  const handleCancelEditingLatestMessage = () => {
    setEditingMessageId(null);
    setEditingDraft("");
    setError(null);
  };

  const handleDoneEditingLatestMessage = async () => {
    if (!editingDraft.trim() || isEditingMessageUnchanged || isSending) {
      return;
    }

    await handleSend({
      messageText: editingDraft,
      replaceLatestTurn: true,
    });
  };

  const handleClear = async () => {
    if (!isViewerConversationOwner || !activeQuote?.id || isClearing) {
      return;
    }

    if (!window.confirm("Delete this conversation and quote?")) {
      return;
    }

    setIsClearing(true);
    setError(null);
    try {
      await deleteQuoteConversation(activeQuote.id);
      onRefresh?.();
      showToast("Conversation deleted.", { tone: "success" });
      onClose();
    } catch (clearError) {
      setError(
        clearError instanceof Error
          ? clearError.message
          : "Failed to delete conversation.",
      );
    } finally {
      setIsClearing(false);
    }
  };

  const handleCopyMessage = async (content: string) => {
    try {
      await navigator.clipboard.writeText(content);
      showToast("Copied to clipboard.", { tone: "success" });
    } catch {
      showToast("Failed to copy response.", { tone: "error" });
    }
  };

  const handleShareConversation = async () => {
    if (!isViewerConversationOwner) {
      return;
    }

    if (!shareConversationUrl) {
      showToast("Save the conversation first to share it.", { tone: "error" });
      return;
    }

    try {
      await navigator.clipboard.writeText(shareConversationUrl);
      showToast("Share link copied.", { tone: "success" });
    } catch {
      showToast("Failed to copy share link.", { tone: "error" });
    }
  };

  const persistQuoteMetadata = useCallback(
    async ({
      nextQuoteText,
      nextPageNumberText,
      nextTags,
    }: {
      nextQuoteText: string;
      nextPageNumberText: string;
      nextTags: string[];
    }) => {
      if (!isViewerConversationOwner) {
        return false;
      }

      const normalizedTags = normalizeQuoteTagList(nextTags).slice(
        0,
        MAX_QUOTE_TAGS,
      );
      const pageNumberInput = String(nextPageNumberText || "").trim();
      const parsedPageNumber = parsePageNumberValue(pageNumberInput);
      if (pageNumberInput && parsedPageNumber === null) {
        setError("Page number must be a positive integer.");
        return false;
      }

      const normalizedQuoteText = String(nextQuoteText || "").trim();
      if (!normalizedQuoteText) {
        setError("Quote text is required.");
        return false;
      }

      if (!activeQuote?.id) {
        setIsSavingConversation(true);
        setError(null);
        try {
          const savedQuote = await saveQuoteConversation(workId, {
            quote: normalizedQuoteText,
            pageNumber: pageNumberInput ? parsedPageNumber : null,
            tags: normalizedTags,
          });
          setActiveQuote(savedQuote);
          setDrawerQuoteText(savedQuote.quote || normalizedQuoteText);
          setDrawerPageNumber(
            savedQuote.page_number ? String(savedQuote.page_number) : "",
          );
          setDrawerTags(normalizeQuoteTagList(savedQuote.tags || []));
          onRefresh?.();
          return true;
        } catch (saveError) {
          setError(
            saveError instanceof Error
              ? saveError.message
              : "Failed to save quote.",
          );
          return false;
        } finally {
          setIsSavingConversation(false);
        }
      }

      const currentPageNumber = activeQuote.page_number ?? null;
      const nextPageNumber = pageNumberInput ? parsedPageNumber : null;
      const currentQuoteText = String(activeQuote.quote || "").trim();
      const currentTags = normalizeQuoteTagList(activeQuote.tags || []);
      const tagsChanged =
        currentTags.length !== normalizedTags.length ||
        currentTags.some((tag, index) => tag !== normalizedTags[index]);
      const quoteChanged = currentQuoteText !== normalizedQuoteText;

      if (
        currentPageNumber === nextPageNumber &&
        !tagsChanged &&
        !quoteChanged
      ) {
        return true;
      }

      setIsMetadataSaving(true);
      setError(null);
      try {
        const updatedQuote = await updateQuoteConversation(activeQuote.id, {
          quote: normalizedQuoteText,
          pageNumber: nextPageNumber,
          explanation: activeQuote.explanation || null,
          tags: normalizedTags,
        });

        setActiveQuote(updatedQuote);
        setDrawerQuoteText(updatedQuote.quote || normalizedQuoteText);
        setDrawerPageNumber(
          updatedQuote.page_number ? String(updatedQuote.page_number) : "",
        );
        setDrawerTags(normalizeQuoteTagList(updatedQuote.tags || []));
        onRefresh?.();
        return true;
      } catch (metadataError) {
        setError(
          metadataError instanceof Error
            ? metadataError.message
            : "Failed to update quote metadata.",
        );
        return false;
      } finally {
        setIsMetadataSaving(false);
      }
    },
    [activeQuote, isViewerConversationOwner, onRefresh, workId],
  );

  const handleDrawerAction = async () => {
    if (
      isDrawerOpen &&
      isDrawerDirty &&
      isViewerConversationOwner &&
      !isMetadataSaving &&
      !isSavingConversation
    ) {
      const didSave = await persistQuoteMetadata({
        nextQuoteText: drawerQuoteText,
        nextPageNumberText: drawerPageNumber,
        nextTags: drawerTags,
      });

      if (didSave) {
        showToast("Changes saved.", { tone: "success" });
        setIsDrawerOpen(false);
      }
      return;
    }

    setIsDrawerOpen((current) => !current);
  };

  const handleAddTag = () => {
    if (!isViewerConversationOwner) {
      return;
    }

    const normalizedTag = normalizeQuoteTagLabel(tagDraft);
    if (!normalizedTag) {
      setTagDraft("");
      return;
    }

    const existing = normalizeQuoteTagList(drawerTags);
    if (
      existing.some((tag) => tag.toLowerCase() === normalizedTag.toLowerCase())
    ) {
      setTagDraft("");
      return;
    }

    if (existing.length >= MAX_QUOTE_TAGS) {
      showToast(`You can add up to ${MAX_QUOTE_TAGS} tags.`, {
        tone: "error",
      });
      return;
    }

    const nextTags = [...existing, normalizedTag];
    setDrawerTags(nextTags);
    setTagDraft("");
  };

  const handleRemoveTag = (index: number) => {
    if (!isViewerConversationOwner) {
      return;
    }

    const previous = [...drawerTags];
    if (index < 0 || index >= previous.length) {
      return;
    }

    const nextTags = previous.filter((_, tagIndex) => tagIndex !== index);
    setDrawerTags(nextTags);
    if (editingTagIndex === index) {
      setEditingTagIndex(null);
      setEditingTagDraft("");
    }
  };

  const handleCommitTagEdit = () => {
    if (!isViewerConversationOwner || editingTagIndex === null) {
      return;
    }

    const previous = [...drawerTags];
    const compactTag = normalizeQuoteTagLabel(editingTagDraft);
    let nextTags = [...previous];
    nextTags.splice(editingTagIndex, 1, compactTag);
    nextTags = normalizeQuoteTagList(nextTags);

    if (nextTags.length > MAX_QUOTE_TAGS) {
      showToast(`You can add up to ${MAX_QUOTE_TAGS} tags.`, {
        tone: "error",
      });
      return;
    }

    setDrawerTags(nextTags);
    setEditingTagIndex(null);
    setEditingTagDraft("");
  };

  const handleCopyConversation = async () => {
    if (!isViewerConversationOwner) {
      return;
    }

    const transcript = messages
      .filter((entry) => entry.role !== "meta")
      .map((entry) => {
        const speaker = entry.role === "assistant" ? "Assistant" : "You";
        return `${speaker}: ${entry.content}`;
      })
      .join("\n\n");
    const header = [
      `Quote: ${activeQuote?.quote || "(unsaved quote)"}`,
      `Page: ${activeQuote?.page_number || "N/A"}`,
      `Tags: ${(activeQuote?.tags || []).join(", ") || "None"}`,
      shareConversationUrl ? `Share URL: ${shareConversationUrl}` : null,
    ]
      .filter(Boolean)
      .join("\n");

    try {
      await navigator.clipboard.writeText(`${header}\n\n${transcript}`.trim());
      showToast("Conversation copied.", { tone: "success" });
    } catch {
      showToast("Failed to copy conversation.", { tone: "error" });
    }
  };

  const handleBodyScroll = () => {
    updateUnreadReplyState();
  };

  const handleModelSelectionChange = (nextModel: QuoteChatModel) => {
    if (!isViewerConversationOwner) {
      return;
    }

    if (nextModel === selectedModel) {
      return;
    }

    const nextModelOption =
      modelOptions.find((option) => option.id === nextModel) ||
      DEFAULT_QUOTE_CHAT_MODELS.find((option) => option.id === nextModel) ||
      null;

    setSelectedModel(nextModel);

    if (!nextModelOption) {
      return;
    }

    setMessages((current) =>
      mergeTrailingMetaMessage(
        current,
        createConversationMetaMessage(
          nextClientMessageIdRef.current--,
          "model",
          `Switched to ${nextModelOption.label}`,
        ),
      ),
    );
  };

  const handleRetryFailedTurn = async () => {
    if (
      !isViewerConversationOwner ||
      !failedTurn ||
      isSending ||
      isSavingConversation
    ) {
      return;
    }

    setSelectedTool(failedTurn.tool);
    setSelectedModel(failedTurn.model);
    setSelectedTranslationLanguage(failedTurn.translationLanguage);

    await handleSend({
      messageText: failedTurn.userMessage,
      replaceLatestTurn: failedTurn.replaceLatestTurn,
      toolOverride: failedTurn.tool,
      modelOverride: failedTurn.model,
      translationLanguageOverride: failedTurn.translationLanguage,
    });
  };

  const handleComposerKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      if (!isSending && !isSavingConversation) {
        void handleSend();
      }
    }
  };

  const handleLatestMessageEditKeyDown = (
    event: KeyboardEvent<HTMLTextAreaElement>,
  ) => {
    if (event.key === "Escape") {
      event.preventDefault();
      handleCancelEditingLatestMessage();
      return;
    }

    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      if (!isSending && !isEditingMessageUnchanged && editingDraft.trim()) {
        void handleDoneEditingLatestMessage();
      }
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      cardClassName={`quote-chat-modal-card quote-chat-modal-card--${theme}`}
    >
      <div
        className={`quote-chat-modal quote-chat-modal--${theme} ${
          isDrawerOpen ? "quote-chat-modal--drawer-open" : ""
        }`}
        onClick={() => {
          if (isToolMenuOpen) {
            setIsToolMenuOpen(false);
          }
          if (isLanguageMenuOpen) {
            setIsLanguageMenuOpen(false);
          }
        }}
      >
        <div ref={headerRef} className="quote-chat-modal__header">
          {isViewerConversationOwner ? (
            <select
              value={selectedModel}
              disabled={isSending || isLoadingModels}
              className="quote-chat-modal__model-select"
              onClick={(event) => event.stopPropagation()}
              onChange={(event) =>
                handleModelSelectionChange(event.target.value as QuoteChatModel)
              }
            >
              {(isLoadingModels ? [] : modelOptions).map((option) => (
                <option
                  key={option.id}
                  value={option.id}
                  disabled={option.disabled}
                >
                  {option.label}
                </option>
              ))}
              {isLoadingModels ? (
                <option value={selectedModel}>
                  {selectedModelOption?.label || "Loading models..."}
                </option>
              ) : null}
            </select>
          ) : (
            <div />
          )}
          <span
            className="quote-chat-modal__header-debug-id"
            aria-hidden="true"
          >
            {debugHeaderLabel}
          </span>

          <div
            className="quote-chat-modal__header-actions"
            onClick={(event) => event.stopPropagation()}
          >
            {isViewerConversationOwner ? (
              <>
                <button
                  type="button"
                  className="quote-chat-modal__header-action"
                  onClick={() => void handleShareConversation()}
                  disabled={!shareConversationUrl || !hasConversationId}
                  aria-label="Share this conversation"
                >
                  <AppIcon name="share" size={15} />
                </button>

                <button
                  type="button"
                  className="quote-chat-modal__header-action"
                  onClick={() => void handleCopyConversation()}
                  aria-label="Copy conversation"
                  disabled={!hasConversationId}
                >
                  <AppIcon name="copy" size={15} />
                </button>
              </>
            ) : null}

            <button
              type="button"
              className="quote-chat-modal__header-action"
              onClick={() => void handleDrawerAction()}
              aria-label={
                isDrawerOpen && isDrawerDirty
                  ? "Save changes and close drawer"
                  : isDrawerOpen
                    ? "Close options drawer"
                    : "Open options drawer"
              }
              title="Conversation options"
              aria-expanded={isDrawerOpen}
              aria-controls="quote-chat-options-drawer"
              disabled={isMetadataSaving || isSavingConversation}
            >
              <AppIcon
                name={isDrawerOpen && isDrawerDirty ? "check" : "ellipsis"}
                size={18}
              />
            </button>
          </div>
        </div>

        <aside
          id="quote-chat-options-drawer"
          className={`quote-chat-modal__drawer ${
            isDrawerOpen ? "quote-chat-modal__drawer--open" : ""
          }`}
          onClick={(event) => event.stopPropagation()}
        >
          <div className="quote-chat-modal__drawer-content">
            <div className="quote-chat-modal__drawer-section">
              <p className="quote-chat-modal__drawer-label">Quote</p>
              <textarea
                className="quote-chat-modal__drawer-quote-input"
                value={drawerQuoteText}
                disabled={!isViewerConversationOwner || isMetadataSaving}
                placeholder="Quote text"
                rows={8}
                onChange={(event) => {
                  setDrawerQuoteText(event.target.value);
                  if (error) {
                    setError(null);
                  }
                }}
              />
            </div>

            <div className="quote-chat-modal__drawer-section">
              <p className="quote-chat-modal__drawer-label">Page Number</p>
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                id="quote-chat-page-number"
                name="qcm-page-number"
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck={false}
                data-1p-ignore="true"
                data-lpignore="true"
                data-bwignore="true"
                data-form-type="other"
                className="quote-chat-modal__drawer-input"
                value={drawerPageNumber}
                placeholder="Add page number"
                disabled={!isViewerConversationOwner || isMetadataSaving}
                readOnly={!isPageNumberInputActive}
                onPointerDown={() => {
                  if (isViewerConversationOwner && !isMetadataSaving) {
                    setIsPageNumberInputActive(true);
                  }
                }}
                onFocus={() => {
                  if (isViewerConversationOwner && !isMetadataSaving) {
                    setIsPageNumberInputActive(true);
                  }
                }}
                onBlur={() => setIsPageNumberInputActive(false)}
                onChange={(event) => {
                  setDrawerPageNumber(event.target.value.replace(/[^\d]/g, ""));
                  if (error) {
                    setError(null);
                  }
                }}
              />
            </div>

            <div className="quote-chat-modal__drawer-section">
              <p className="quote-chat-modal__drawer-label">Tags</p>
              <div className="quote-chat-modal__tag-list">
                {drawerTags.map((tag, index) => {
                  const isEditingTag = editingTagIndex === index;

                  return (
                    <div
                      className="quote-chat-modal__tag-chip"
                      key={`${tag}-${index}`}
                    >
                      {isEditingTag ? (
                        <input
                          type="text"
                          className="quote-chat-modal__tag-chip-input"
                          value={editingTagDraft}
                          autoFocus
                          onChange={(event) =>
                            setEditingTagDraft(event.target.value)
                          }
                          onBlur={handleCommitTagEdit}
                          onKeyDown={(event) => {
                            if (event.key === "Enter") {
                              event.preventDefault();
                              handleCommitTagEdit();
                            }
                            if (event.key === "Escape") {
                              event.preventDefault();
                              setEditingTagIndex(null);
                              setEditingTagDraft("");
                            }
                          }}
                        />
                      ) : (
                        <button
                          type="button"
                          className="quote-chat-modal__tag-chip-label"
                          onClick={() => {
                            if (!isViewerConversationOwner) {
                              return;
                            }

                            setEditingTagIndex(index);
                            setEditingTagDraft(tag);
                          }}
                        >
                          {tag}
                        </button>
                      )}
                      <button
                        type="button"
                        className="quote-chat-modal__tag-chip-remove"
                        aria-label={`Remove ${tag} tag`}
                        onClick={() => handleRemoveTag(index)}
                        disabled={
                          !isViewerConversationOwner || isMetadataSaving
                        }
                      >
                        <AppIcon name="close" size={9} />
                      </button>
                    </div>
                  );
                })}

                <input
                  type="text"
                  className="quote-chat-modal__tag-input"
                  value={tagDraft}
                  disabled={!isViewerConversationOwner || isMetadataSaving}
                  placeholder="Add tag..."
                  onChange={(event) => setTagDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      handleAddTag();
                    }
                  }}
                  onBlur={() => {
                    if (tagDraft.trim()) {
                      handleAddTag();
                    }
                  }}
                />
              </div>
            </div>
          </div>
        </aside>

        {isDrawerOpen ? (
          <div
            className="quote-chat-modal__drawer-bottom-controls"
            onClick={(event) => event.stopPropagation()}
          >
            <div
              className="quote-chat-modal__theme-toggle quote-chat-modal__theme-toggle--compact"
              role="group"
              aria-label="Theme"
            >
              <button
                type="button"
                className={`quote-chat-modal__theme-option ${
                  theme === "dark"
                    ? "quote-chat-modal__theme-option--active"
                    : ""
                }`}
                onClick={() => setTheme("dark")}
                aria-label="Dark theme"
                title="Dark theme"
              >
                <AppIcon name="moon" size={12} />
              </button>
              <button
                type="button"
                className={`quote-chat-modal__theme-option ${
                  theme === "light"
                    ? "quote-chat-modal__theme-option--active"
                    : ""
                }`}
                onClick={() => setTheme("light")}
                aria-label="Light theme"
                title="Light theme"
              >
                <AppIcon name="sun" size={12} />
              </button>
            </div>
          </div>
        ) : null}

        {activeQuote?.id && isDrawerOpen ? (
          <button
            type="button"
            className="quote-chat-modal__delete-fab"
            onClick={() => void handleClear()}
            disabled={!isViewerConversationOwner || isClearing}
            aria-label="Delete conversation"
            title="Delete conversation"
          >
            <AppIcon name="trash" size={14} />
          </button>
        ) : null}

        <div
          ref={bodyRef}
          className="quote-chat-modal__body"
          onScroll={handleBodyScroll}
          style={{
            paddingTop: `${bodyInsets.top}px`,
            paddingBottom: `${bodyInsets.bottom}px`,
          }}
        >
          {isLoadingHistory ? (
            <div className="quote-chat-modal__empty">
              Loading conversation...
            </div>
          ) : (
            <>
              {messages.map((message) => {
                if (message.role === "meta") {
                  return (
                    <div
                      key={message.id}
                      className="quote-chat-message quote-chat-message--meta"
                    >
                      <div className="quote-chat-message__meta-divider">
                        <span>{message.content}</span>
                      </div>
                    </div>
                  );
                }

                const isLatestEditableUser =
                  isViewerConversationOwner &&
                  message.role === "user" &&
                  message.id === latestUserMessageId;
                const isEditingLatestUser =
                  isLatestEditableUser && editingMessageId === message.id;
                const isAssistantMessage = message.role === "assistant";
                const assistantSections = isAssistantMessage
                  ? parseAssistantMessageSections(message.content)
                  : null;
                const rowClassName = [
                  "quote-chat-message",
                  `quote-chat-message--${message.role}`,
                  isLatestEditableUser ? "quote-chat-message--editable" : "",
                  isAssistantMessage ? "quote-chat-message--copyable" : "",
                  isEditingLatestUser ? "quote-chat-message--editing" : "",
                ]
                  .filter(Boolean)
                  .join(" ");

                return (
                  <div
                    key={message.id}
                    ref={(node) => {
                      if (node) {
                        replyRefs.current.set(message.id, node);
                      } else {
                        replyRefs.current.delete(message.id);
                      }
                    }}
                    className={rowClassName}
                  >
                    {isLatestEditableUser &&
                    !isEditingLatestUser &&
                    !pendingUserMessage &&
                    !failedTurn ? (
                      <button
                        type="button"
                        className="quote-chat-message__hover-action"
                        onClick={handleStartEditingLatestMessage}
                        disabled={isSending}
                        aria-label="Edit latest message"
                        title="Edit latest message"
                      >
                        <AppIcon name="edit" size={18} />
                      </button>
                    ) : null}
                    <div className="quote-chat-message__bubble">
                      {isEditingLatestUser ? (
                        <>
                          <div className="quote-chat-message__edit-shell">
                            <textarea
                              ref={(node) => {
                                editingTextareaRef.current = node;
                                resizeTextarea(node);
                              }}
                              value={editingDraft}
                              onChange={(event) => {
                                setEditingDraft(event.target.value);
                                resizeTextarea(event.currentTarget);
                              }}
                              onKeyDown={handleLatestMessageEditKeyDown}
                              className="quote-chat-message__edit-input"
                              autoFocus
                            />
                          </div>
                          <div className="quote-chat-message__edit-actions">
                            <button
                              type="button"
                              className="quote-chat-message__edit-button quote-chat-message__edit-button--ghost"
                              onClick={handleCancelEditingLatestMessage}
                              disabled={isSending}
                            >
                              Cancel
                            </button>
                            <button
                              type="button"
                              className="quote-chat-message__edit-button quote-chat-message__edit-button--primary"
                              onClick={() =>
                                void handleDoneEditingLatestMessage()
                              }
                              disabled={
                                isSending ||
                                !editingDraft.trim() ||
                                isEditingMessageUnchanged
                              }
                            >
                              Update
                            </button>
                          </div>
                        </>
                      ) : isAssistantMessage ? (
                        <div className="quote-chat-message__rich-content">
                          {renderAssistantBlocks(
                            assistantSections?.contentBlocks || [],
                            `${message.id}-content`,
                          )}
                          {assistantSections?.translatorNoteBlocks?.length ? (
                            <div className="quote-chat-message__note-card">
                              <p className="quote-chat-message__note-label">
                                Translator note
                              </p>
                              <div className="quote-chat-message__note-content">
                                {renderAssistantBlocks(
                                  assistantSections.translatorNoteBlocks,
                                  `${message.id}-note`,
                                )}
                              </div>
                            </div>
                          ) : null}
                        </div>
                      ) : (
                        <>
                          {formatMessageContent(message.content).map(
                            (paragraph, index) => (
                              <p
                                key={`${message.id}-${index}`}
                                className="quote-chat-message__text"
                              >
                                {paragraph}
                              </p>
                            ),
                          )}
                        </>
                      )}
                    </div>
                    {isAssistantMessage ? (
                      <button
                        type="button"
                        className="quote-chat-message__copy-action"
                        onClick={() => void handleCopyMessage(message.content)}
                        aria-label="Copy response"
                        title="Copy response"
                      >
                        <AppIcon name="copy" size={22} />
                      </button>
                    ) : null}
                  </div>
                );
              })}
              {pendingUserMessage ? (
                <div className="quote-chat-message quote-chat-message--user">
                  <div className="quote-chat-message__bubble">
                    {formatMessageContent(pendingUserMessage).map(
                      (paragraph, index) => (
                        <p
                          key={`pending-${index}`}
                          className="quote-chat-message__text"
                        >
                          {paragraph}
                        </p>
                      ),
                    )}
                  </div>
                </div>
              ) : null}
              {isSending ? (
                <div className="quote-chat-message quote-chat-message--assistant">
                  <div
                    className="quote-chat-message__loading-bubble"
                    aria-label="Generating response"
                  >
                    <span />
                    <span />
                    <span />
                  </div>
                </div>
              ) : null}
              {!isSending && failedTurn ? (
                <>
                  <div className="quote-chat-message quote-chat-message--user">
                    <div className="quote-chat-message__bubble">
                      {formatMessageContent(failedTurn.userMessage).map(
                        (paragraph, index) => (
                          <p
                            key={`failed-user-${index}`}
                            className="quote-chat-message__text"
                          >
                            {paragraph}
                          </p>
                        ),
                      )}
                    </div>
                  </div>
                  <div className="quote-chat-message quote-chat-message--assistant quote-chat-message--retryable">
                    <div className="quote-chat-message__bubble">
                      <div className="quote-chat-message__error-card">
                        {formatMessageContent(failedTurn.errorMessage).map(
                          (paragraph, index) => (
                            <p
                              key={`failed-error-${index}`}
                              className="quote-chat-message__error-text"
                            >
                              {paragraph}
                            </p>
                          ),
                        )}
                      </div>
                    </div>
                    <button
                      type="button"
                      className="quote-chat-message__retry-action"
                      onClick={() => void handleRetryFailedTurn()}
                      disabled={isSending || isSavingConversation}
                      aria-label="Try again"
                      title="Try again"
                    >
                      <AppIcon name="retry" size={20} />
                    </button>
                  </div>
                </>
              ) : null}
              {!messages.length && !pendingUserMessage && !failedTurn ? (
                <div className="quote-chat-modal__empty">
                  {activeQuote
                    ? "Start asking about this quote."
                    : "Paste a quote, choose a tool if you want one, and send."}
                </div>
              ) : null}
            </>
          )}
        </div>

        {!showScrollToBottom ? null : (
          <button
            type="button"
            className="quote-chat-modal__scroll-to-bottom"
            style={{
              bottom: `${Math.max(bodyInsets.bottom - 16, 96)}px`,
            }}
            onClick={(event) => {
              event.stopPropagation();
              lastSeenReplyIdRef.current = Math.max(
                lastSeenReplyIdRef.current,
                getLatestConversationEntryId(messages),
              );
              setShowScrollToBottom(false);
              scrollToBottom("smooth");
            }}
          >
            New replies below
          </button>
        )}

        {isViewerConversationOwner ? (
          <div ref={composerAreaRef} className="quote-chat-modal__composer">
            <div className="quote-chat-modal__composer-frame">
              <textarea
                ref={(node) => {
                  composerRef.current = node;
                  resizeTextarea(node, { maxLines: 5 });
                }}
                value={composer}
                onChange={(event) => {
                  setComposer(event.target.value);
                  setError(null);
                  if (failedTurn) {
                    setFailedTurn(null);
                  }
                  resizeTextarea(event.currentTarget, { maxLines: 5 });
                }}
                onKeyDown={handleComposerKeyDown}
                className="quote-chat-modal__textarea"
                placeholder={
                  activeQuote
                    ? "Ask a follow-up about this quote..."
                    : "Paste your quote here..."
                }
                disabled={isSending || isSavingConversation}
                autoFocus
              />

              <div className="quote-chat-modal__controls">
                <div className="quote-chat-modal__toolbox">
                  <div
                    className="quote-chat-modal__inline-menu"
                    onClick={(event) => event.stopPropagation()}
                  >
                    <button
                      type="button"
                      className="quote-chat-modal__composer-select quote-chat-modal__composer-select--icon"
                      onClick={() => {
                        setIsToolMenuOpen((current) => !current);
                        setIsLanguageMenuOpen(false);
                      }}
                      disabled={isSending || isSavingConversation}
                      aria-label="Choose tool"
                      title="Choose tool"
                    >
                      <AppIcon name="tools" size={18} />
                    </button>
                    {isToolMenuOpen && (
                      <div className="quote-chat-modal__inline-dropdown">
                        {TOOL_OPTIONS.map((option) => (
                          <button
                            key={option.value}
                            type="button"
                            className="quote-chat-modal__inline-item"
                            onClick={() => {
                              setSelectedTool(option.value);
                              if (
                                !hasConversationId &&
                                !isLoadingHistory &&
                                !composer.trim()
                              ) {
                                const quoteText = String(
                                  drawerQuoteText || "",
                                ).trim();
                                if (quoteText) {
                                  setComposer(quoteText);
                                }
                              }
                              setIsToolMenuOpen(false);
                            }}
                          >
                            <span className="quote-chat-modal__inline-item-content">
                              <AppIcon name={option.icon} size={16} />
                              <span>{option.label}</span>
                            </span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  {selectedTool && selectedTool !== "translate" && (
                    <span className="quote-chat-modal__mode-pill">
                      {selectedToolOption ? (
                        <AppIcon name={selectedToolOption.icon} size={14} />
                      ) : null}
                      {selectedToolLabel}
                      <button
                        type="button"
                        className="quote-chat-modal__mode-pill-close"
                        onClick={() => {
                          setSelectedTool(null);
                          setIsLanguageMenuOpen(false);
                        }}
                        aria-label={`Clear ${selectedToolLabel} mode`}
                      >
                        <AppIcon name="close" size={12} />
                      </button>
                    </span>
                  )}
                  {selectedTool === "translate" && (
                    <div
                      className="quote-chat-modal__inline-menu"
                      onClick={(event) => event.stopPropagation()}
                    >
                      <div className="quote-chat-modal__mode-pill quote-chat-modal__mode-pill--interactive">
                        <button
                          type="button"
                          className="quote-chat-modal__mode-pill-trigger"
                          onClick={() => {
                            setIsLanguageMenuOpen((current) => !current);
                            setIsToolMenuOpen(false);
                          }}
                          disabled={isSending || isSavingConversation}
                        >
                          <AppIcon name="translate" size={14} />
                          <span>{selectedLanguageLabel}</span>
                        </button>
                        <button
                          type="button"
                          className="quote-chat-modal__mode-pill-close"
                          onClick={() => {
                            setSelectedTool(null);
                            setIsLanguageMenuOpen(false);
                          }}
                          aria-label={`Clear ${selectedToolLabel} mode`}
                        >
                          <AppIcon name="close" size={12} />
                        </button>
                      </div>
                      {isLanguageMenuOpen && (
                        <div className="quote-chat-modal__inline-dropdown">
                          {translationLanguageOptions.map((option) => (
                            <button
                              key={option.value}
                              type="button"
                              className="quote-chat-modal__inline-item"
                              onClick={() => {
                                setSelectedTranslationLanguage(
                                  option.value as TranslationLanguageValue,
                                );
                                setIsLanguageMenuOpen(false);
                              }}
                            >
                              {option.label}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <button
                  type="button"
                  className="quote-chat-modal__send quote-chat-modal__send--icon"
                  onClick={() => void handleSend()}
                  disabled={
                    isSending || isSavingConversation || !composer.trim()
                  }
                  aria-label={isSending ? "Sending message" : "Send message"}
                  title={isSending ? "Sending..." : "Send"}
                >
                  <AppIcon name="send" size={22} />
                </button>
              </div>
            </div>

            {error && <p className="quote-chat-modal__error">{error}</p>}
          </div>
        ) : null}
      </div>
    </Modal>
  );
}
