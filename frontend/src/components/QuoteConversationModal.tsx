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
  clearQuoteChat,
  fetchQuoteChat,
  fetchQuoteChatModels,
  saveQuoteConversation,
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

interface QuoteConversationModalProps {
  isOpen: boolean;
  workId: string;
  quote?: Quote | null;
  initialQuoteText?: string;
  initialPageNumber?: string;
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
  return String(content || "").replace(/\s+/g, " ").trim();
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
  const [selectedModel, setSelectedModel] =
    useState<QuoteChatModel>(DEFAULT_QUOTE_CHAT_MODEL);
  const [selectedTranslationLanguage, setSelectedTranslationLanguage] =
    useState<TranslationLanguageValue>(getDefaultTranslationLanguageValue);
  const [theme, setTheme] = useState<QuoteConversationTheme>(
    loadQuoteConversationTheme,
  );
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isToolMenuOpen, setIsToolMenuOpen] = useState(false);
  const [isLanguageMenuOpen, setIsLanguageMenuOpen] = useState(false);
  const [isLoadingModels, setIsLoadingModels] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
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
  const selectedLanguageLabel = translationLanguageOptions.find(
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
  const latestTurn = useMemo(() => getLatestConversationTurn(messages), [messages]);
  const latestUserMessageId = latestTurn.userEntry?.id ?? null;
  const isEditingMessageUnchanged =
    editingMessageId !== null &&
    normalizeConversationText(editingDraft) ===
      normalizeConversationText(latestTurn.userEntry?.content || "");

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
    setIsMenuOpen(false);
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
  }, [forceScrollToBottomOnOpen, initialPageNumber, initialQuoteText, isOpen, quote]);

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

    if (!activeQuote && !trimmedMessage) {
      setError("Quote text is required.");
      return;
    }

    const replacementTarget =
      replaceLatestTurn && latestTurn.userEntry
        ? {
            userEntryId: latestTurn.userEntry.id,
            assistantEntryId: latestTurn.assistantEntry?.id ?? null,
            insertionIndex:
              latestTurn.userIndex >= 0 ? latestTurn.userIndex : messages.length,
          }
        : null;
    const normalizedPageNumber = initialPageNumber.trim();
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
        applyOptimisticTurnReplacement(current, replacementTarget, trimmedMessage),
      );
    } else {
      setComposer("");
    }

    try {
      let quoteForRequest = activeQuote;
      if (!quoteForRequest?.id) {
        if (
          normalizedPageNumber &&
          (parsedPageNumber === null ||
            !Number.isInteger(parsedPageNumber) ||
            parsedPageNumber <= 0)
        ) {
          throw new Error("Page number must be a positive integer.");
        }

        setIsSavingConversation(true);
        try {
          const savedQuote = await saveQuoteConversation(workId, {
            quote: trimmedMessage,
            pageNumber: parsedPageNumber,
          });
          quoteForRequest = savedQuote;
          setActiveQuote(savedQuote);
          onRefresh?.();
        } finally {
          setIsSavingConversation(false);
        }
      }

      const data = await sendQuoteChatMessage(workId, {
        quoteId: quoteForRequest?.id,
        quote: quoteForRequest?.quote || trimmedMessage,
        pageNumber: quoteForRequest?.page_number || null,
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
      if (replaceLatestTurn || effectiveTool === "analyze") {
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
    if (!isViewerConversationOwner || !latestTurn.userEntry || isSending || failedTurn) {
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
    if (!isViewerConversationOwner || !activeQuote?.id || !messages.length || isClearing) {
      return;
    }

    if (!window.confirm("Clear this quote conversation history?")) {
      return;
    }

    setIsClearing(true);
    setError(null);
    try {
      await clearQuoteChat(activeQuote.id);
      lastSeenReplyIdRef.current = 0;
      setMessages([]);
      setPendingUserMessage(null);
      setFailedTurn(null);
      setEditingMessageId(null);
      setEditingDraft("");
      setShowScrollToBottom(false);
      onRefresh?.();
      showToast("Conversation cleared.", { tone: "success" });
    } catch (clearError) {
      setError(
        clearError instanceof Error
          ? clearError.message
          : "Failed to clear conversation.",
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

  const handleCopyConversationDebug = async () => {
    if (!isViewerConversationOwner) {
      return;
    }

    const debugPayload = {
      generated_at: new Date().toISOString(),
      current_url:
        typeof window !== "undefined"
          ? `${window.location.origin}${window.location.pathname}${window.location.search}`
          : null,
      share_url: shareConversationUrl,
      work_id: workId,
      quote: activeQuote
        ? {
            id: activeQuote.id,
            page_number: activeQuote.page_number ?? null,
            quote: activeQuote.quote,
            explanation: activeQuote.explanation ?? null,
            created_at: activeQuote.created_at,
          }
        : null,
      ui_state: {
        model: selectedModel,
        tool: selectedTool || "chat",
        translation_language: selectedTranslationLanguage,
        theme,
        is_loading_history: isLoadingHistory,
        is_sending: isSending,
        is_saving_conversation: isSavingConversation,
      },
      conversation_state: {
        latest_conversation_id: latestConversationEntryId || null,
        latest_user_id: latestTurn.userEntry?.id ?? null,
        latest_assistant_id: latestTurn.assistantEntry?.id ?? null,
        pending_user_message: pendingUserMessage,
        failed_turn: failedTurn,
      },
      messages: messages.map((entry) => ({
        id: entry.id,
        role: entry.role,
        content: entry.content,
        created_at: entry.created_at,
        quote_id: entry.quote_id,
        meta_type: entry.meta_type || null,
        meta_display: entry.meta_display || null,
      })),
    };

    try {
      await navigator.clipboard.writeText(JSON.stringify(debugPayload, null, 2));
      showToast("Conversation debug payload copied.", { tone: "success" });
    } catch {
      showToast("Failed to copy conversation debug payload.", { tone: "error" });
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
    if (!isViewerConversationOwner || !failedTurn || isSending || isSavingConversation) {
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
        className={`quote-chat-modal quote-chat-modal--${theme}`}
        onClick={() => {
          if (isMenuOpen) {
            setIsMenuOpen(false);
          }
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
                <option key={option.id} value={option.id} disabled={option.disabled}>
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
          <span className="quote-chat-modal__header-debug-id" aria-hidden="true">
            {debugHeaderLabel}
          </span>

          <div
            className="quote-chat-modal__menu-wrap"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              className="quote-chat-modal__menu-button"
              onClick={() => setIsMenuOpen((current) => !current)}
              aria-label="Conversation options"
            >
              ...
            </button>
            {isMenuOpen && (
              <div className="quote-chat-modal__menu-dropdown">
                <button
                  type="button"
                  className="quote-chat-modal__menu-item"
                  onClick={() => {
                    setTheme((current) =>
                      current === "dark" ? "light" : "dark",
                    );
                    setIsMenuOpen(false);
                  }}
                >
                  {theme === "dark"
                    ? "Switch to light theme"
                    : "Switch to dark theme"}
                </button>
                {isViewerConversationOwner ? (
                  <button
                    type="button"
                    className="quote-chat-modal__menu-item"
                    onClick={() => {
                      setIsMenuOpen(false);
                      void handleShareConversation();
                    }}
                    disabled={!shareConversationUrl}
                  >
                    Share this conversation
                  </button>
                ) : null}
                {isViewerConversationOwner ? (
                  <button
                    type="button"
                    className="quote-chat-modal__menu-item"
                    onClick={() => {
                      setIsMenuOpen(false);
                      void handleCopyConversationDebug();
                    }}
                  >
                    Copy conversation (debug)
                  </button>
                ) : null}
                {isViewerConversationOwner && !!activeQuote?.id && !!messages.length && (
                  <button
                    type="button"
                    className="quote-chat-modal__menu-item quote-chat-modal__menu-item--danger"
                    onClick={() => {
                      setIsMenuOpen(false);
                      void handleClear();
                    }}
                  >
                    {isClearing ? "Clearing..." : "Clear conversation"}
                  </button>
                )}
                <button
                  type="button"
                  className="quote-chat-modal__menu-item"
                  onClick={() => {
                    setIsMenuOpen(false);
                    onClose();
                  }}
                >
                  Close
                </button>
              </div>
            )}
          </div>
        </div>

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
            <div className="quote-chat-modal__empty">Loading conversation...</div>
          ) : (
            <>
              {messages.map((message) => {
                if (message.role === "meta") {
                  return (
                    <div key={message.id} className="quote-chat-message quote-chat-message--meta">
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
                              onClick={() => void handleDoneEditingLatestMessage()}
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
                    {formatMessageContent(pendingUserMessage).map((paragraph, index) => (
                      <p key={`pending-${index}`} className="quote-chat-message__text">
                        {paragraph}
                      </p>
                    ))}
                  </div>
                </div>
              ) : null}
              {isSending ? (
                <div className="quote-chat-message quote-chat-message--assistant">
                  <div className="quote-chat-message__loading-bubble" aria-label="Generating response">
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
                  disabled={isSending || isSavingConversation || !composer.trim()}
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
