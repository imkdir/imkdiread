import { useEffect, useMemo, useState } from "react";

import type { Quote } from "../types";
import { AppIcon } from "./AppIcon";
import {
  QuoteConversation,
  type QuoteConversationTheme,
} from "./QuoteConversation";
import {
  deleteQuoteConversation,
  updateQuoteConversation,
} from "../services/quoteConversationService";
import { showToast } from "../utils/toast";
import "./QuoteConversationWorkspace.css";

const QUOTE_CONVERSATION_THEME_STORAGE_KEY = "quote-conversation-theme";

type WorkspaceDrawerView = "closed" | "quotes" | "quoteInfo";

interface QuoteConversationDraftIntent {
  token: number;
  quote: string;
  tool?: "translate" | "analyze";
}

interface QuoteConversationWorkspaceProps {
  workId: string;
  quotes: Quote[];
  initialQuoteId?: number | null;
  onRefresh?: () => void;
  incomingDraft?: QuoteConversationDraftIntent | null;
}

function getQuoteFirstLinePreview(text: string) {
  const lines = String(text || "")
    .split(/\r?\n/)
    .map((line) => line.trim());
  const firstContentLine = lines.find(Boolean) || "";
  return firstContentLine || "(Empty quote)";
}

function loadTheme(): QuoteConversationTheme {
  if (typeof window === "undefined") {
    return "dark";
  }

  const stored = window.localStorage.getItem(
    QUOTE_CONVERSATION_THEME_STORAGE_KEY,
  );
  return stored === "light" ? "light" : "dark";
}

function buildFallbackQuote(workId: string, quoteId: number): Quote {
  return {
    id: quoteId,
    work_id: workId,
    user_id: "__unknown_owner__",
    quote: "",
    page_number: null,
    created_at: new Date().toISOString(),
  };
}

export function QuoteConversationWorkspace({
  workId,
  quotes,
  initialQuoteId = null,
  onRefresh,
  incomingDraft = null,
}: QuoteConversationWorkspaceProps) {
  const initialDraftSeed = incomingDraft
    ? {
        token: incomingDraft.token,
        quote: incomingDraft.quote || "",
        tool: incomingDraft.tool || null,
      }
    : {
        token: 0,
        quote: "",
        tool: null,
      };

  const [theme, setTheme] = useState<QuoteConversationTheme>(loadTheme);
  const [drawerView, setDrawerView] = useState<WorkspaceDrawerView>("closed");
  const [drawerInfoQuoteId, setDrawerInfoQuoteId] = useState<number | null>(
    null,
  );
  const [selectedQuoteId, setSelectedQuoteId] = useState<number | null>(
    initialQuoteId || null,
  );
  const [filterValue, setFilterValue] = useState("");
  const [draftSeed, setDraftSeed] = useState<{
    token: number;
    quote: string;
    tool: "translate" | "analyze" | null;
  }>(initialDraftSeed);
  const [quoteOverrides, setQuoteOverrides] = useState<
    Record<number, { quote: string; page_number: number | null }>
  >({});
  const [infoQuoteDraft, setInfoQuoteDraft] = useState("");
  const [infoPageDraft, setInfoPageDraft] = useState("");
  const [isSavingInfo, setIsSavingInfo] = useState(false);
  const [pendingDeleteQuoteId, setPendingDeleteQuoteId] = useState<
    number | null
  >(null);
  const [isDeletingQuoteId, setIsDeletingQuoteId] = useState<number | null>(
    null,
  );

  useEffect(() => {
    setQuoteOverrides((current) => {
      const quoteIds = new Set(quotes.map((quote) => quote.id));
      const entries = Object.entries(current).filter(([quoteId]) =>
        quoteIds.has(Number(quoteId)),
      );
      if (entries.length === Object.keys(current).length) {
        return current;
      }
      return Object.fromEntries(entries);
    });
  }, [quotes]);

  const effectiveQuotes = useMemo(() => {
    return quotes.map((quote) => {
      const override = quoteOverrides[quote.id];
      if (!override) {
        return quote;
      }

      return {
        ...quote,
        quote: override.quote,
        page_number: override.page_number,
      };
    });
  }, [quoteOverrides, quotes]);

  const selectedFromList =
    selectedQuoteId !== null
      ? effectiveQuotes.find((quote) => quote.id === selectedQuoteId) || null
      : null;
  const activeQuote =
    selectedFromList ||
    (initialQuoteId && selectedQuoteId === initialQuoteId && !selectedFromList
      ? buildFallbackQuote(workId, initialQuoteId)
      : null);

  const resolvedWorkId =
    activeQuote?.work_id || workId || quotes[0]?.work_id || "";

  useEffect(() => {
    if (pendingDeleteQuoteId === null) {
      return;
    }
    if (!activeQuote?.id || activeQuote.id !== pendingDeleteQuoteId) {
      setPendingDeleteQuoteId(null);
    }
  }, [activeQuote?.id, pendingDeleteQuoteId]);

  const filteredQuotes = useMemo(() => {
    const query = filterValue.trim().toLowerCase();
    if (!query) {
      return effectiveQuotes;
    }

    return effectiveQuotes.filter((quote) => {
      const preview = getQuoteFirstLinePreview(quote.quote).toLowerCase();
      const title = String(quote.work?.title || "").toLowerCase();
      return preview.includes(query) || title.includes(query);
    });
  }, [effectiveQuotes, filterValue]);

  const drawerInfoQuote =
    drawerInfoQuoteId !== null
      ? effectiveQuotes.find((quote) => quote.id === drawerInfoQuoteId) || null
      : null;

  const conversationKey = activeQuote?.id
    ? `quote-${activeQuote.id}`
    : `draft-${draftSeed.token}`;

  const isDrawerOpen = drawerView !== "closed" && effectiveQuotes.length > 0;
  const isInfoDirty =
    drawerView === "quoteInfo" &&
    drawerInfoQuote !== null &&
    (infoQuoteDraft.trim() !== String(drawerInfoQuote.quote || "").trim() ||
      infoPageDraft.trim() !==
        String(drawerInfoQuote.page_number ? drawerInfoQuote.page_number : ""));
  const isToolbarDeleteArmed =
    Boolean(activeQuote?.id) && pendingDeleteQuoteId === activeQuote?.id;

  const openConversationPanel = (quote: Quote) => {
    setPendingDeleteQuoteId(null);
    setSelectedQuoteId(quote.id);
    setDraftSeed((current) => ({
      ...current,
      token: quote.id,
      quote: "",
      tool: null,
    }));
    setDrawerView("closed");
  };

  const startNewConversation = () => {
    setPendingDeleteQuoteId(null);
    setSelectedQuoteId(null);
    setDraftSeed({
      token: Date.now(),
      quote: "",
      tool: null,
    });
    setDrawerView("closed");
  };

  const openQuotesDrawer = () => {
    if (!effectiveQuotes.length) {
      return;
    }
    setPendingDeleteQuoteId(null);
    setDrawerInfoQuoteId(null);
    setDrawerView("quotes");
  };

  const toggleWorkspaceDrawer = () => {
    if (!effectiveQuotes.length) {
      return;
    }

    if (drawerView === "closed") {
      setDrawerInfoQuoteId(null);
      setDrawerView("quotes");
      return;
    }

    setDrawerInfoQuoteId(null);
    setDrawerView("closed");
  };

  const openQuoteInfoDrawer = (quote: Quote) => {
    setPendingDeleteQuoteId(null);
    setDrawerInfoQuoteId(quote.id);
    setInfoQuoteDraft(String(quote.quote || ""));
    setInfoPageDraft(String(quote.page_number ? quote.page_number : ""));
    setDrawerView("quoteInfo");
  };

  const handleDeleteQuoteAction = async () => {
    if (!activeQuote?.id) {
      return;
    }

    const quoteId = activeQuote.id;
    if (isDeletingQuoteId !== null) {
      return;
    }

    if (pendingDeleteQuoteId !== quoteId) {
      setPendingDeleteQuoteId(quoteId);
      return;
    }

    setIsDeletingQuoteId(quoteId);
    try {
      await deleteQuoteConversation(quoteId);
      setPendingDeleteQuoteId(null);
      setQuoteOverrides((current) => {
        if (!(quoteId in current)) {
          return current;
        }
        const next = { ...current };
        delete next[quoteId];
        return next;
      });
      if (selectedQuoteId === quoteId) {
        setSelectedQuoteId(null);
        setDraftSeed({
          token: Date.now(),
          quote: "",
          tool: null,
        });
      }
      if (drawerInfoQuoteId === quoteId) {
        setDrawerInfoQuoteId(null);
        setDrawerView("quotes");
      }
      onRefresh?.();
      showToast("Conversation deleted.", { tone: "success" });
    } catch (error) {
      showToast(
        error instanceof Error
          ? error.message
          : "Failed to delete conversation.",
        { tone: "error" },
      );
    } finally {
      setIsDeletingQuoteId(null);
    }
  };

  const handleWorkspaceInfoAction = () => {
    if (!activeQuote?.id) {
      return;
    }
    if (drawerView === "quoteInfo") {
      setDrawerView("closed");
      return;
    }

    openQuoteInfoDrawer(activeQuote);
  };

  const saveInfoDrawer = async () => {
    if (!drawerInfoQuote?.id || isSavingInfo) {
      return;
    }

    const nextQuoteText = infoQuoteDraft.trim();
    const pageInput = infoPageDraft.trim();

    if (!nextQuoteText) {
      showToast("Quote text is required.", { tone: "error" });
      return;
    }

    let nextPageNumber: number | null = null;
    if (pageInput) {
      if (!/^\d+$/.test(pageInput)) {
        showToast("Page number must be a positive integer.", { tone: "error" });
        return;
      }
      const parsed = Number(pageInput);
      if (!Number.isFinite(parsed) || parsed <= 0) {
        showToast("Page number must be a positive integer.", { tone: "error" });
        return;
      }
      nextPageNumber = parsed;
    }

    setIsSavingInfo(true);
    try {
      const updatedQuote = await updateQuoteConversation(drawerInfoQuote.id, {
        quote: nextQuoteText,
        pageNumber: nextPageNumber,
        explanation: drawerInfoQuote.explanation || null,
        tags: drawerInfoQuote.tags || [],
      });
      setQuoteOverrides((current) => ({
        ...current,
        [updatedQuote.id]: {
          quote: updatedQuote.quote || nextQuoteText,
          page_number: updatedQuote.page_number ?? nextPageNumber,
        },
      }));
      setInfoQuoteDraft(updatedQuote.quote || nextQuoteText);
      setInfoPageDraft(
        updatedQuote.page_number ? String(updatedQuote.page_number) : "",
      );
      setDrawerView("closed");
      onRefresh?.();
      showToast("Changes saved.", { tone: "success" });
    } catch (error) {
      showToast(
        error instanceof Error
          ? error.message
          : "Failed to update quote metadata.",
        { tone: "error" },
      );
    } finally {
      setIsSavingInfo(false);
    }
  };

  const handleWorkspaceDrawerAction = () => {
    if (drawerView === "quoteInfo") {
      if (isInfoDirty) {
        void saveInfoDrawer();
      } else {
        setDrawerView("quotes");
      }
    } else {
      toggleWorkspaceDrawer();
    }
  };

  return (
    <div
      className={`quote-conversation-workspace quote-conversation-workspace--${theme} ${
        isDrawerOpen ? "quote-conversation-workspace--list-open" : ""
      }`}
    >
      {effectiveQuotes.length ? (
        <aside
          className={`quote-conversation-workspace__list-drawer ${
            isDrawerOpen
              ? "quote-conversation-workspace__list-drawer--open"
              : ""
          }`}
        >
          <div className="quote-conversation-workspace__list-panel">
            {drawerView === "quotes" ? (
              <>
                <div className="quote-conversation-workspace__list-toolbar">
                  <input
                    type="text"
                    className="quote-conversation-workspace__filter-input"
                    value={filterValue}
                    onChange={(event) => setFilterValue(event.target.value)}
                    placeholder="Filter quotes..."
                    aria-label="Filter quotes"
                  />
                  <button
                    type="button"
                    className="quote-conversation-workspace__new-button"
                    onClick={startNewConversation}
                    aria-label="Start a new conversation"
                    title="Start a new conversation"
                  >
                    <AppIcon name="edit" size={15} />
                  </button>
                </div>

                <div className="quote-conversation-workspace__list-scroll">
                  {filteredQuotes.length ? (
                    filteredQuotes.map((quote) => (
                      <div
                        key={quote.id}
                        className="quote-conversation-workspace__quote-row"
                      >
                        <button
                          type="button"
                          className="quote-conversation-workspace__quote-item"
                          onClick={() => openConversationPanel(quote)}
                        >
                          <p className="quote-conversation-workspace__quote-preview">
                            {getQuoteFirstLinePreview(quote.quote)}
                          </p>
                        </button>
                      </div>
                    ))
                  ) : (
                    <p className="quote-conversation-workspace__list-empty">
                      No quotes match your filter.
                    </p>
                  )}
                </div>

                <div className="quote-conversation-workspace__theme-row">
                  <div
                    className="quote-conversation-workspace__theme-toggle"
                    role="group"
                    aria-label="Theme"
                  >
                    <button
                      type="button"
                      className={`quote-conversation-workspace__theme-option ${
                        theme === "dark"
                          ? "quote-conversation-workspace__theme-option--active"
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
                      className={`quote-conversation-workspace__theme-option ${
                        theme === "light"
                          ? "quote-conversation-workspace__theme-option--active"
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
              </>
            ) : (
              <>
                <div className="quote-conversation-workspace__info-header">
                  <button
                    type="button"
                    className="quote-conversation-workspace__info-back"
                    onClick={openQuotesDrawer}
                    aria-label="Back to quotes"
                    title="Back to quotes"
                  >
                    <AppIcon name="arrow-left" size={14} />
                    <span>{activeQuote?.work?.title || "Quotes"}</span>
                  </button>
                </div>

                <div className="quote-conversation-workspace__info-content">
                  <div className="quote-conversation-workspace__info-section">
                    <p className="quote-conversation-workspace__info-label">
                      Quote
                    </p>
                    <textarea
                      className="quote-conversation-workspace__info-input quote-conversation-workspace__info-input--quote"
                      value={infoQuoteDraft}
                      onChange={(event) =>
                        setInfoQuoteDraft(event.target.value)
                      }
                      rows={8}
                      placeholder="Quote text"
                      disabled={!drawerInfoQuote || isSavingInfo}
                    />
                  </div>
                  <div className="quote-conversation-workspace__info-section">
                    <p className="quote-conversation-workspace__info-label">
                      Page Number
                    </p>
                    <input
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      className="quote-conversation-workspace__info-input"
                      value={infoPageDraft}
                      onChange={(event) =>
                        setInfoPageDraft(
                          event.target.value.replace(/[^\d]/g, ""),
                        )
                      }
                      placeholder="Add page number"
                      disabled={!drawerInfoQuote || isSavingInfo}
                    />
                  </div>
                </div>
              </>
            )}
          </div>
        </aside>
      ) : null}

      <section className="quote-conversation-workspace__conversation-panel">
        <QuoteConversation
          key={conversationKey}
          workId={resolvedWorkId}
          quote={activeQuote}
          initialQuoteText={activeQuote ? "" : draftSeed.quote}
          initialSelectedTool={activeQuote ? null : draftSeed.tool}
          onRefresh={onRefresh}
          theme={theme}
          onThemeChange={setTheme}
          useExternalWorkspaceDrawer={true}
          onWorkspaceDrawerToggle={handleWorkspaceDrawerAction}
          onWorkspaceInfoAction={handleWorkspaceInfoAction}
          onWorkspaceDeleteAction={() => void handleDeleteQuoteAction()}
          workspaceDeleteArmed={isToolbarDeleteArmed}
          workspaceDeleteBusy={isDeletingQuoteId !== null}
          workspaceDrawerHasPendingChanges={isInfoDirty}
          workspaceDrawerActionDisabled={isSavingInfo}
        />
      </section>
    </div>
  );
}
