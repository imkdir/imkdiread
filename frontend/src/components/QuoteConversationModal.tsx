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
import {
  clearQuoteChat,
  fetchQuoteChat,
  fetchQuoteChatModels,
  sendQuoteChatMessage,
  DEFAULT_QUOTE_CHAT_MODELS,
  type QuoteChatModelOption,
  type QuoteChatModel,
} from "../services/quoteConversationService";
import "./QuoteConversationModal.css";

const TOOL_OPTIONS = [
  { value: "translate", label: "Translate" },
  { value: "analyze", label: "Analyze" },
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

const DEFAULT_QUOTE_CHAT_MODEL = DEFAULT_QUOTE_CHAT_MODELS[0].id;

interface QuoteConversationModalProps {
  isOpen: boolean;
  workId: string;
  quote?: Quote | null;
  initialQuoteText?: string;
  initialPageNumber?: string;
  onClose: () => void;
  onRefresh?: () => void;
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

function resolveBrowserTranslationLanguage() {
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
    userEntry: userIndex >= 0 ? messages[userIndex] : null,
    assistantEntry:
      assistantIndex > userIndex ? messages[assistantIndex] : null,
    remaining: messages.filter((message) => !removableIds.has(message.id)),
  };
}

function getLatestConversationEntry(messages: ConversationMessage[]) {
  return messages[messages.length - 1] || null;
}

type AssistantMessageBlock =
  | { type: "paragraph"; text: string }
  | { type: "list"; ordered: boolean; items: string[] };

interface AssistantMessageSections {
  contentBlocks: AssistantMessageBlock[];
  translatorNoteBlocks: AssistantMessageBlock[] | null;
}

function parseAssistantMessageBlocks(content: string): AssistantMessageBlock[] {
  const lines = String(content || "").replace(/\r\n/g, "\n").split("\n");
  const blocks: AssistantMessageBlock[] = [];
  let paragraphLines: string[] = [];
  let listBlock: AssistantMessageBlock | null = null;

  const flushParagraph = () => {
    if (!paragraphLines.length) {
      return;
    }

    blocks.push({
      type: "paragraph",
      text: paragraphLines.map((line) => line.trim()).join(" "),
    });
    paragraphLines = [];
  };

  const flushList = () => {
    if (!listBlock) {
      return;
    }

    blocks.push(listBlock);
    listBlock = null;
  };

  for (const rawLine of lines) {
    const trimmedLine = rawLine.trim();

    if (!trimmedLine) {
      flushParagraph();
      flushList();
      continue;
    }

    const unorderedMatch = trimmedLine.match(/^[-*+]\s+(.+)$/);
    const orderedMatch = trimmedLine.match(/^\d+\.\s+(.+)$/);
    if (unorderedMatch || orderedMatch) {
      flushParagraph();
      const ordered = Boolean(orderedMatch);
      const itemText = (orderedMatch?.[1] || unorderedMatch?.[1] || "").trim();

      if (!listBlock || listBlock.type !== "list" || listBlock.ordered !== ordered) {
        flushList();
        listBlock = { type: "list", ordered, items: [] };
      }

      listBlock.items.push(itemText);
      continue;
    }

    flushList();
    paragraphLines.push(rawLine);
  }

  flushParagraph();
  flushList();

  return blocks.length ? blocks : [{ type: "paragraph", text: String(content || "").trim() }];
}

function stripLeadingSectionLabel(content: string, label: string) {
  const labelPattern = new RegExp(
    `^\\s*${label}\\s*:?\\s*(?:\\n+)?`,
    "i",
  );

  return String(content || "").replace(labelPattern, "").trim();
}

function splitAssistantMessageAtSeparator(content: string) {
  const normalizedContent = String(content || "").replace(/\r\n/g, "\n").trim();
  if (!normalizedContent) {
    return null;
  }

  const blockSeparatorMatch = normalizedContent.match(
    /(?:^|\n)\s*---+\s*(?:\n|$)/,
  );
  if (blockSeparatorMatch && typeof blockSeparatorMatch.index === "number") {
    const separatorStart = blockSeparatorMatch.index;
    const separatorEnd = separatorStart + blockSeparatorMatch[0].length;

    return {
      primaryContent: normalizedContent.slice(0, separatorStart).trim(),
      secondaryContent: normalizedContent.slice(separatorEnd).trim(),
    };
  }

  const inlineSeparatorIndex = normalizedContent.indexOf("---");
  if (inlineSeparatorIndex >= 0) {
    return {
      primaryContent: normalizedContent.slice(0, inlineSeparatorIndex).trim(),
      secondaryContent: normalizedContent
        .slice(inlineSeparatorIndex + 3)
        .trim(),
    };
  }

  return null;
}

function parseAssistantMessageSections(content: string): AssistantMessageSections {
  const normalizedContent = String(content || "").replace(/\r\n/g, "\n").trim();
  if (!normalizedContent) {
    return {
      contentBlocks: [],
      translatorNoteBlocks: null,
    };
  }

  const translatorNoteMatch = normalizedContent.match(
    /(?:^|\n{2,})(?:translator(?:'|’)s?\s+note|translator\s+note)\s*:?\s*(?:\n+)?/i,
  );

  let primaryContent = normalizedContent;
  let translatorNoteContent: string | null = null;

  const separatorSplit = splitAssistantMessageAtSeparator(normalizedContent);
  if (separatorSplit && separatorSplit.secondaryContent) {
    primaryContent = separatorSplit.primaryContent;
    translatorNoteContent = separatorSplit.secondaryContent;
  } else if (
    translatorNoteMatch &&
    typeof translatorNoteMatch.index === "number"
  ) {
    primaryContent = normalizedContent
      .slice(0, translatorNoteMatch.index)
      .trim();
    translatorNoteContent = normalizedContent
      .slice(translatorNoteMatch.index + translatorNoteMatch[0].length)
      .trim();
  }

  const cleanedPrimaryContent = stripLeadingSectionLabel(
    primaryContent,
    "translation",
  );
  const cleanedTranslatorNoteContent = translatorNoteContent
    ? stripLeadingSectionLabel(
        stripLeadingSectionLabel(
          translatorNoteContent,
          "translator(?:'|’)s?\\s+note",
        ),
        "note",
      )
    : "";

  return {
    contentBlocks: parseAssistantMessageBlocks(
      cleanedPrimaryContent || primaryContent || normalizedContent,
    ),
    translatorNoteBlocks: cleanedTranslatorNoteContent
      ? parseAssistantMessageBlocks(cleanedTranslatorNoteContent)
      : null,
  };
}

function renderAssistantInlineFormatting(text: string) {
  return text.split(/(\*\*.*?\*\*)/g).filter(Boolean).map((part, index) => {
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
      return (
        <strong key={`strong-${index}`} className="quote-chat-message__strong">
          {part.slice(2, -2)}
        </strong>
      );
    }

    return <span key={`text-${index}`}>{part}</span>;
  });
}

function renderAssistantBlocks(
  blocks: AssistantMessageBlock[],
  keyPrefix: string,
) {
  return blocks.map((block, index) =>
    block.type === "paragraph" ? (
      <p
        key={`${keyPrefix}-paragraph-${index}`}
        className="quote-chat-message__text quote-chat-message__paragraph"
      >
        {renderAssistantInlineFormatting(block.text)}
      </p>
    ) : block.ordered ? (
      <ol
        key={`${keyPrefix}-list-${index}`}
        className="quote-chat-message__list quote-chat-message__list--ordered"
      >
        {block.items.map((item, itemIndex) => (
          <li
            key={`${keyPrefix}-list-item-${itemIndex}`}
            className="quote-chat-message__list-item"
          >
            {renderAssistantInlineFormatting(item)}
          </li>
        ))}
      </ol>
    ) : (
      <ul
        key={`${keyPrefix}-list-${index}`}
        className="quote-chat-message__list"
      >
        {block.items.map((item, itemIndex) => (
          <li
            key={`${keyPrefix}-list-item-${itemIndex}`}
            className="quote-chat-message__list-item"
          >
            {renderAssistantInlineFormatting(item)}
          </li>
        ))}
      </ul>
    ),
  );
}

export function QuoteConversationModal({
  isOpen,
  workId,
  quote,
  initialQuoteText = "",
  initialPageNumber = "",
  onClose,
  onRefresh,
}: QuoteConversationModalProps) {
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const headerRef = useRef<HTMLDivElement | null>(null);
  const composerAreaRef = useRef<HTMLDivElement | null>(null);
  const composerRef = useRef<HTMLTextAreaElement | null>(null);
  const editingTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const replyRefs = useRef(new Map<number, HTMLDivElement | null>());
  const lastSeenReplyIdRef = useRef(0);
  const pendingScrollBehaviorRef = useRef<ScrollBehavior | null>(null);
  const pendingUnreadCheckRef = useRef(false);
  const [activeQuote, setActiveQuote] = useState<Quote | null>(quote || null);
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [composer, setComposer] = useState("");
  const [pendingUserMessage, setPendingUserMessage] = useState<string | null>(
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
    useState<TranslationLanguageValue>("browser");
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isToolMenuOpen, setIsToolMenuOpen] = useState(false);
  const [isLanguageMenuOpen, setIsLanguageMenuOpen] = useState(false);
  const [isLoadingModels, setIsLoadingModels] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);
  const [bodyInsets, setBodyInsets] = useState({ top: 94, bottom: 186 });

  const browserTranslationLanguage = useMemo(
    () => resolveBrowserTranslationLanguage(),
    [],
  );
  const translationLanguageOptions = useMemo(
    () => [
      {
        value: "browser",
        label: `Auto (${browserTranslationLanguage.label})`,
        targetLanguage: browserTranslationLanguage.targetLanguage,
      },
      ...TRANSLATION_LANGUAGE_OPTIONS,
    ],
    [browserTranslationLanguage],
  );
  const selectedToolLabel = TOOL_OPTIONS.find(
    (option) => option.value === selectedTool,
  )?.label;
  const selectedModelOption =
    modelOptions.find((option) => option.id === selectedModel) ||
    DEFAULT_QUOTE_CHAT_MODELS.find((option) => option.id === selectedModel) ||
    null;
  const selectedLanguageLabel = translationLanguageOptions.find(
    (option) => option.value === selectedTranslationLanguage,
  )?.label;
  const resolvedTargetLanguage =
    translationLanguageOptions.find(
      (option) => option.value === selectedTranslationLanguage,
    )?.targetLanguage || browserTranslationLanguage.targetLanguage;
  const shouldRenderQuoteBubble = useMemo(() => {
    if (!activeQuote?.quote) {
      return false;
    }

    const firstMessage = messages[0];
    if (!firstMessage || firstMessage.role !== "user") {
      return true;
    }

    return (
      normalizeConversationText(firstMessage.content) !==
      normalizeConversationText(activeQuote.quote)
    );
  }, [activeQuote?.quote, messages]);
  const latestTurn = useMemo(() => getLatestConversationTurn(messages), [messages]);
  const latestUserMessageId = latestTurn.userEntry?.id ?? null;
  const isEditingMessageUnchanged =
    editingMessageId !== null &&
    normalizeConversationText(editingDraft) ===
      normalizeConversationText(latestTurn.userEntry?.content || "");

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
      return;
    }

    setActiveQuote(quote || null);
    setMessages([]);
    setError(null);
    setPendingUserMessage(null);
    setEditingMessageId(null);
    setEditingDraft("");
    setShowScrollToBottom(false);
    setIsMenuOpen(false);
    setIsToolMenuOpen(false);
    setIsLanguageMenuOpen(false);
    setSelectedTool(null);
    setModelOptions(DEFAULT_QUOTE_CHAT_MODELS);
    setSelectedModel(DEFAULT_QUOTE_CHAT_MODEL);
    setSelectedTranslationLanguage("browser");
    setComposer(quote?.id ? "" : initialQuoteText);

    if (!quote?.id) {
      setIsLoadingHistory(false);
      return;
    }

    setIsLoadingHistory(true);
    void fetchQuoteChat(quote.id)
      .then((data) => {
        const latestReply = getLatestConversationEntry(data.conversations);
        lastSeenReplyIdRef.current = latestReply?.id || 0;
        pendingScrollBehaviorRef.current = "auto";
        setShowScrollToBottom(false);
        setActiveQuote(data.quote);
        setMessages(data.conversations);
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
  }, [initialPageNumber, initialQuoteText, isOpen, quote]);

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
            (option) => option.id === current,
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
      const latestReply = getLatestConversationEntry(messages);
      if (latestReply) {
        lastSeenReplyIdRef.current = Math.max(
          lastSeenReplyIdRef.current,
          latestReply.id,
        );
      }
      setShowScrollToBottom(false);
      scrollToBottom(behavior);
      return;
    }

    if (pendingUnreadCheckRef.current) {
      pendingUnreadCheckRef.current = false;
      updateUnreadReplyState();
    }
  }, [isOpen, messages, updateUnreadReplyState]);

  useLayoutEffect(() => {
    if (!isOpen) {
      return;
    }

    const updateInsets = () => {
      setBodyInsets({
        top: (headerRef.current?.offsetHeight || 0) + 24,
        bottom: (composerAreaRef.current?.offsetHeight || 0) + 44,
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
  }, [isOpen]);

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
  }: {
    messageText?: string;
    replaceLatestTurn?: boolean;
  } = {}) => {
    const trimmedMessage = (messageText ?? composer).trim();

    if (!trimmedMessage) {
      setError("Please enter a message.");
      return;
    }

    if (!activeQuote && !trimmedMessage) {
      setError("Quote text is required.");
      return;
    }

    const wasNewQuote = !activeQuote?.id;
    const previousMessages = messages;
    const nextVisibleMessages =
      replaceLatestTurn && latestTurn.userEntry ? latestTurn.remaining : messages;

    setIsSending(true);
    setError(null);
    setPendingUserMessage(trimmedMessage);
    setEditingMessageId(null);
    setEditingDraft("");
    if (replaceLatestTurn) {
      setMessages(nextVisibleMessages);
    } else {
      setComposer("");
    }

    try {
      const data = await sendQuoteChatMessage(workId, {
        quoteId: activeQuote?.id,
        quote: activeQuote?.quote || trimmedMessage,
        pageNumber: activeQuote?.page_number || null,
        message: trimmedMessage,
        tool: selectedTool || "chat",
        model: selectedModel,
        targetLanguage:
          selectedTool === "translate" ? resolvedTargetLanguage : undefined,
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
      setMessages((prev) =>
        replaceLatestTurn ? [...nextVisibleMessages, ...data.conversations] : [...prev, ...data.conversations],
      );
      setComposer("");
      if (wasNewQuote || replaceLatestTurn || selectedTool === "analyze") {
        onRefresh?.();
      }
    } catch (sendError) {
      if (replaceLatestTurn) {
        setMessages(previousMessages);
        if (latestTurn.userEntry?.id) {
          setEditingMessageId(latestTurn.userEntry.id);
          setEditingDraft(trimmedMessage);
        }
      } else {
        setComposer(trimmedMessage);
      }
      setError(
        sendError instanceof Error
          ? sendError.message
          : "Failed to send quote chat.",
      );
    } finally {
      setPendingUserMessage(null);
      setIsSending(false);
    }
  };

  const handleStartEditingLatestMessage = () => {
    if (!latestTurn.userEntry || isSending) {
      return;
    }

    setEditingMessageId(latestTurn.userEntry.id);
    setEditingDraft(latestTurn.userEntry.content);
    setError(null);
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
    if (!activeQuote?.id || !messages.length || isClearing) {
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

  const handleBodyScroll = () => {
    updateUnreadReplyState();
  };

  const handleComposerKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      if (!isSending) {
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
      cardClassName="quote-chat-modal-card"
    >
      <div
        className="quote-chat-modal"
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
          <select
            value={selectedModel}
            disabled={isSending || isLoadingModels}
            className="quote-chat-modal__model-select"
            onClick={(event) => event.stopPropagation()}
            onChange={(event) =>
              setSelectedModel(event.target.value as QuoteChatModel)
            }
          >
            {(isLoadingModels ? [] : modelOptions).map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
            {isLoadingModels ? (
              <option value={selectedModel}>
                {selectedModelOption?.label || "Loading models..."}
              </option>
            ) : null}
          </select>

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
                {!!activeQuote?.id && !!messages.length && (
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
              {shouldRenderQuoteBubble && activeQuote?.quote ? (
                <div className="quote-chat-message quote-chat-message--user">
                  <div className="quote-chat-message__bubble">
                    {formatMessageContent(activeQuote.quote).map(
                      (paragraph, index) => (
                        <p
                          key={`quote-empty-${index}`}
                          className="quote-chat-message__text"
                        >
                          {paragraph}
                        </p>
                      ),
                    )}
                  </div>
                </div>
              ) : null}
              {messages.map((message) => {
                const isLatestEditableUser =
                  message.role === "user" && message.id === latestUserMessageId;
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
                    {isLatestEditableUser && !isEditingLatestUser && !pendingUserMessage ? (
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
              {!messages.length && !pendingUserMessage ? (
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
              const latestReply = getLatestConversationEntry(messages);
              if (latestReply) {
                lastSeenReplyIdRef.current = Math.max(
                  lastSeenReplyIdRef.current,
                  latestReply.id,
                );
              }
              setShowScrollToBottom(false);
              scrollToBottom("smooth");
            }}
          >
            New replies below
          </button>
        )}

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
                resizeTextarea(event.currentTarget, { maxLines: 5 });
              }}
              onKeyDown={handleComposerKeyDown}
              className="quote-chat-modal__textarea"
              placeholder={
                activeQuote
                  ? "Ask a follow-up about this quote..."
                  : "Paste your quote here..."
              }
              disabled={isSending}
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
                    disabled={isSending}
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
                          {option.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                {selectedTool && (
                  <span className="quote-chat-modal__mode-pill">
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
                    <button
                      type="button"
                      className="quote-chat-modal__composer-select"
                      onClick={() => {
                        setIsLanguageMenuOpen((current) => !current);
                        setIsToolMenuOpen(false);
                      }}
                      disabled={isSending}
                    >
                      {selectedLanguageLabel}
                    </button>
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
                disabled={isSending || !composer.trim()}
                aria-label={isSending ? "Sending message" : "Send message"}
                title={isSending ? "Sending..." : "Send"}
              >
                <AppIcon name="send" size={22} />
              </button>
            </div>
          </div>

          {error && <p className="quote-chat-modal__error">{error}</p>}
        </div>
      </div>
    </Modal>
  );
}
