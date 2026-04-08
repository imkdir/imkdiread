import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate, useParams, Link } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import type { Work } from "../types";

import { AppIcon } from "../components/AppIcon";
import { GoodreadsButton } from "../components/GoodreadsButton";
import { DropboxButton } from "../components/DropboxButton";
import { ProgressBar } from "../components/ProgressBar";
import { KindleButton } from "../components/KindleButton";
import { FinderButton } from "../components/FinderButton";
import { QuoteConversationWorkspace } from "../components/QuoteConversationWorkspace";
import { DetailActionPanel } from "../components/detail/DetailActionPanel";
import { DetailProgressModal } from "../components/detail/DetailProgressModal";
import { DetailDropboxLinkModal } from "../components/detail/DetailDropboxLinkModal";
import { DetailFileUploadModal } from "../components/detail/DetailFileUploadModal";
import {
  MetadataDropdown,
  MetadataDropdownItem,
  MetadataPill,
  MetadataPillSegment,
  MetadataPillWrap,
} from "../components/Metadata";
import { Modal } from "../components/Modal";
import { useAuth } from "../components/AuthContext";
import { useDetailPage } from "../hooks/useDetailPage";
import {
  createWork,
  updateWorkAuthors,
  updateWorkPageCount,
  updateWorkTags,
  updateWorkTitle,
  uploadWorkCover,
} from "../services/detailPageService";
import { formatTagLabel, isGenreTag } from "../utils/tags";
import { showToast } from "../utils/toast";

import noCover from "../assets/imgs/no_cover.png";

import "./DetailPage.css";

interface Props {
  workId: string;
  initialWork?: Work;
  useEntrySharedLayout?: boolean;
  initialConversationQuoteId?: number | null;
}

interface TagDraft {
  id: string;
  value: string;
  isGenre: boolean;
}

interface AuthorDraft {
  id: string;
  value: string;
}

interface ReadingFocusSettings {
  enabled: boolean;
  maskColor: string;
  maskOpacity: number;
  focusTopRatio: number;
  focusHeightRatio: number;
}

interface QuoteConversationDraftIntent {
  token: number;
  quote: string;
  tool?: "analyze" | "translate";
}

const READING_FOCUS_STORAGE_KEY = "detail-reading-focus-settings";
const CHROME_PDF_TOOLBAR_RESERVE_PX = 56;
const MIN_READING_FOCUS_HEIGHT_RATIO = 0.12;
const MAX_READING_FOCUS_HEIGHT_RATIO = 0.7;
const DEFAULT_READING_FOCUS_SETTINGS: ReadingFocusSettings = {
  enabled: false,
  maskColor: "#000000",
  maskOpacity: 0.72,
  focusTopRatio: 0.38,
  focusHeightRatio: 0.24,
};
const READING_FOCUS_PREVIEW_TEXT = [
  "When in the Course of human events, it becomes necessary for one people to dissolve the political bands which have connected them with another, and to assume among the powers of the earth, the separate and equal station to which the Laws of Nature and of Nature's God entitle them, a decent respect to the opinions of mankind requires that they should declare the causes which impel them to the separation.",
  "We hold these truths to be self-evident, that all men are created equal, that they are endowed by their Creator with certain unalienable Rights, that among these are Life, Liberty and the pursuit of Happiness.",
];

const coverTransition = {
  type: "tween" as const,
  duration: 0.42,
  ease: [0.16, 1, 0.3, 1] as const,
};

function clampNumber(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function sanitizeReadingFocusSettings(
  settings: ReadingFocusSettings,
): ReadingFocusSettings {
  const normalizedColor = /^#[0-9a-f]{6}$/i.test(settings.maskColor)
    ? settings.maskColor
    : DEFAULT_READING_FOCUS_SETTINGS.maskColor;
  const normalizedHeightRatio = clampNumber(
    Number.isFinite(settings.focusHeightRatio)
      ? settings.focusHeightRatio
      : DEFAULT_READING_FOCUS_SETTINGS.focusHeightRatio,
    MIN_READING_FOCUS_HEIGHT_RATIO,
    MAX_READING_FOCUS_HEIGHT_RATIO,
  );
  const normalizedTopRatio = clampNumber(
    Number.isFinite(settings.focusTopRatio)
      ? settings.focusTopRatio
      : DEFAULT_READING_FOCUS_SETTINGS.focusTopRatio,
    0,
    1 - normalizedHeightRatio,
  );

  return {
    enabled: settings.enabled,
    maskColor: normalizedColor,
    maskOpacity: clampNumber(settings.maskOpacity, 0, 1),
    focusTopRatio: normalizedTopRatio,
    focusHeightRatio: normalizedHeightRatio,
  };
}

function loadReadingFocusSettings(): ReadingFocusSettings {
  if (typeof window === "undefined") {
    return DEFAULT_READING_FOCUS_SETTINGS;
  }

  try {
    const raw = window.localStorage.getItem(READING_FOCUS_STORAGE_KEY);
    if (!raw) return DEFAULT_READING_FOCUS_SETTINGS;

    return sanitizeReadingFocusSettings({
      ...DEFAULT_READING_FOCUS_SETTINGS,
      ...JSON.parse(raw),
    });
  } catch {
    return DEFAULT_READING_FOCUS_SETTINGS;
  }
}

function hexToRgba(hex: string, opacity: number) {
  const normalized = hex.replace("#", "");
  const r = Number.parseInt(normalized.slice(0, 2), 16);
  const g = Number.parseInt(normalized.slice(2, 4), 16);
  const b = Number.parseInt(normalized.slice(4, 6), 16);

  return `rgba(${r}, ${g}, ${b}, ${clampNumber(opacity, 0, 1)})`;
}

function getPdfViewerToolbarReserve(): number {
  if (typeof navigator === "undefined") {
    return CHROME_PDF_TOOLBAR_RESERVE_PX;
  }

  const userAgent = navigator.userAgent;
  const isSafari =
    /Safari/i.test(userAgent) &&
    !/Chrome|Chromium|CriOS|Edg|OPR|OPiOS|FxiOS/i.test(userAgent);

  return isSafari ? 0 : CHROME_PDF_TOOLBAR_RESERVE_PX;
}

function buildTagDrafts(tags: string[]): TagDraft[] {
  return tags.map((tag, index) => ({
    id: `${tag}-${index}`,
    value: formatTagLabel(tag),
    isGenre: isGenreTag(tag),
  }));
}

function normalizeTagValue(tag: TagDraft): string {
  const trimmed = tag.value.trim().toLowerCase();
  if (!trimmed) return "";

  if (tag.isGenre) {
    return `genre:${trimmed.replace(/\s+/g, "-")}`;
  }

  return trimmed;
}

function buildAuthorDrafts(authors: string[]): AuthorDraft[] {
  return authors.map((author, index) => ({
    id: `${author}-${index}`,
    value: author,
  }));
}

function parseDraftList(value: string): string[] {
  return value
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function DetailPageWrapper() {
  const { id, quoteId } = useParams<{ id: string; quoteId?: string }>();
  const location = useLocation();
  const initialWork = location.state?.work as Work | undefined;
  const useEntrySharedLayout = location.state?.from === "search-drawer";
  const parsedQuoteId = quoteId ? Number.parseInt(quoteId, 10) : null;
  const initialConversationQuoteId =
    parsedQuoteId && Number.isInteger(parsedQuoteId) && parsedQuoteId > 0
      ? parsedQuoteId
      : null;

  return (
    <DetailPage
      workId={id || ""}
      initialWork={initialWork}
      useEntrySharedLayout={useEntrySharedLayout}
      initialConversationQuoteId={initialConversationQuoteId}
    />
  );
}

function DetailPage({
  workId,
  initialWork,
  useEntrySharedLayout = false,
  initialConversationQuoteId = null,
}: Props) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const detail = useDetailPage({ workId, initialWork });
  const isDraftConversationRequested = detail.isAddQuoteModalOpen;
  const draftConversationQuote = detail.addQuoteWithTool.quote;
  const draftConversationTool = detail.addQuoteWithTool.tool;
  const closeDetailEditFormModal = detail.closeEditFormModal;
  const coverInputRef = useRef<HTMLInputElement | null>(null);
  const pdfFrameWrapperRef = useRef<HTMLDivElement | null>(null);
  const readingFocusPreviewRef = useRef<HTMLDivElement | null>(null);
  const authorDropdownRef = useRef<HTMLDivElement | null>(null);
  const finderDropdownRef = useRef<HTMLDivElement | null>(null);
  const tagDropdownRef = useRef<HTMLDivElement | null>(null);
  const [isUploadingCover, setIsUploadingCover] = useState(false);
  const [coverUploadError, setCoverUploadError] = useState<string | null>(null);
  const [isAuthorsModalOpen, setIsAuthorsModalOpen] = useState(false);
  const [isAuthorDropdownOpen, setIsAuthorDropdownOpen] = useState(false);
  const [isTagsModalOpen, setIsTagsModalOpen] = useState(false);
  const [isTagDropdownOpen, setIsTagDropdownOpen] = useState(false);
  const [isTitleModalOpen, setIsTitleModalOpen] = useState(false);
  const [isPageCountModalOpen, setIsPageCountModalOpen] = useState(false);
  const [isReadingFocusModalOpen, setIsReadingFocusModalOpen] = useState(false);
  const [isReportPdfIssueModalOpen, setIsReportPdfIssueModalOpen] =
    useState(false);
  const [reportIssueType, setReportIssueType] = useState<
    "blank_or_missing_pages" | "other_issue"
  >("blank_or_missing_pages");
  const [workIdDraft, setWorkIdDraft] = useState("");
  const [titleDraft, setTitleDraft] = useState("");
  const [pageCountDraft, setPageCountDraft] = useState("");
  const [reportPdfPageDraft, setReportPdfPageDraft] = useState("");
  const [reportIssueDetailsDraft, setReportIssueDetailsDraft] = useState("");
  const [reportPdfPageError, setReportPdfPageError] = useState<string | null>(
    null,
  );
  const [authorDrafts, setAuthorDrafts] = useState<AuthorDraft[]>([]);
  const [tagDrafts, setTagDrafts] = useState<TagDraft[]>([]);
  const [editingAuthorId, setEditingAuthorId] = useState<string | null>(null);
  const [editingTagId, setEditingTagId] = useState<string | null>(null);
  const [isSavingAuthors, setIsSavingAuthors] = useState(false);
  const [isSavingTags, setIsSavingTags] = useState(false);
  const [isSavingTitle, setIsSavingTitle] = useState(false);
  const [isSavingPageCount, setIsSavingPageCount] = useState(false);
  const [missingWorkTitleDraft, setMissingWorkTitleDraft] = useState("");
  const [missingWorkPageCountDraft, setMissingWorkPageCountDraft] =
    useState("0");
  const [missingWorkAuthorsDraft, setMissingWorkAuthorsDraft] = useState("");
  const [missingWorkTagsDraft, setMissingWorkTagsDraft] = useState("");
  const [isCreatingMissingWork, setIsCreatingMissingWork] = useState(false);
  const [readingFocusSettings, setReadingFocusSettings] = useState(
    loadReadingFocusSettings,
  );
  const [readingFocusDraft, setReadingFocusDraft] = useState(
    loadReadingFocusSettings,
  );
  const [conversationDraftIntent, setConversationDraftIntent] =
    useState<QuoteConversationDraftIntent | null>(null);
  const [isSharedLayoutActive, setIsSharedLayoutActive] =
    useState(useEntrySharedLayout);
  const [pdfFrameHeight, setPdfFrameHeight] = useState(0);
  const [readingFocusPreviewHeight, setReadingFocusPreviewHeight] = useState(0);
  const [isNarrowActionDrawerMode, setIsNarrowActionDrawerMode] = useState(
    () => window.innerWidth < 768,
  );
  const isAdmin = user?.role === "admin";
  const pdfToolbarReserve = getPdfViewerToolbarReserve();

  useEffect(() => {
    if (!useEntrySharedLayout) {
      setIsSharedLayoutActive(false);
      return;
    }

    setIsSharedLayoutActive(true);
    const timer = window.setTimeout(() => {
      setIsSharedLayoutActive(false);
    }, 450);

    return () => window.clearTimeout(timer);
  }, [useEntrySharedLayout, workId]);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(max-width: 768px)");

    const updateMatches = () => {
      setIsNarrowActionDrawerMode(mediaQuery.matches);
    };

    updateMatches();
    mediaQuery.addEventListener("change", updateMatches);

    return () => mediaQuery.removeEventListener("change", updateMatches);
  }, []);

  useEffect(() => {
    setConversationDraftIntent(null);
  }, [workId]);

  useEffect(() => {
    if (!isDraftConversationRequested) {
      return;
    }

    setConversationDraftIntent({
      token: Date.now(),
      quote: draftConversationQuote || "",
      tool: draftConversationTool,
    });
    closeDetailEditFormModal("quote");
  }, [
    closeDetailEditFormModal,
    draftConversationQuote,
    draftConversationTool,
    isDraftConversationRequested,
  ]);

  const openSearchDrawer = (query: string) => {
    window.dispatchEvent(
      new CustomEvent("open-search-drawer", {
        detail: { query },
      }),
    );
  };

  const {
    work,
    loading,
    notFound,
    read,
    liked,
    shelved,
    isProgressModalOpen,
    progressEditingForm,
    isSavingProgress,
    isPDFViewerOpen,
    viewerInitialUrl,
    isFinderDropdownOpen,
    finderFiles,
    isActionDrawerOpen,
    displayRating,
    displayQuotes,
    fetchData,
    toggleActionDrawer,
    closeActionDrawer,
    toggleAction,
    handleStarMouseMove,
    handleStarClick,
    setHoverRating,
    openEditFormModal,
    handleProgressInputChange,
    handleUpdateProgress,
    handleProgressFinished,
    triggerClipboardQuoteCapture,
    togglePDFViewer,
    closePDFViewer,
    handleFinderButtonClick,
    handleFinderFileSelect,
    closeFinderDropdown,
    isDropboxLinkModalOpen,
    dropboxLinkDraft,
    dropboxLinkError,
    isDropboxSaving,
    handleDropboxLinkChange,
    handleDropboxLinkSubmit,
    closeDropboxLinkModal,
    isUploadModalOpen,
    uploadModalVersion,
    uploadError,
    isUploadingFile,
    isReportingFileIssue,
    closeUploadModal,
    handleWorkFileUpload,
    handleReportWorkIssue,
  } = detail;
  const isActionPanelDrawerMode = isPDFViewerOpen || isNarrowActionDrawerMode;
  const readingFocusOverlayColor = hexToRgba(
    readingFocusSettings.maskColor,
    readingFocusSettings.maskOpacity,
  );
  const previewReadingFocusOverlayColor = hexToRgba(
    readingFocusDraft.maskColor,
    readingFocusDraft.maskOpacity,
  );
  const effectiveToolbarHeight = clampNumber(
    pdfToolbarReserve,
    0,
    pdfFrameHeight,
  );
  const availableFocusHeight = Math.max(
    0,
    pdfFrameHeight - effectiveToolbarHeight,
  );
  const effectiveFocusHeight =
    availableFocusHeight <= 0
      ? 0
      : availableFocusHeight * readingFocusSettings.focusHeightRatio;
  const effectiveFocusTop =
    availableFocusHeight <= 0
      ? effectiveToolbarHeight
      : effectiveToolbarHeight +
        availableFocusHeight * readingFocusSettings.focusTopRatio;
  const effectiveFocusBottom = Math.max(
    0,
    pdfFrameHeight - effectiveFocusTop - effectiveFocusHeight,
  );
  const isReadingFocusVisible =
    isPDFViewerOpen &&
    readingFocusSettings.enabled &&
    pdfFrameHeight > effectiveToolbarHeight;
  const previewToolbarHeight = clampNumber(
    pdfFrameHeight > 0 && readingFocusPreviewHeight > 0
      ? (effectiveToolbarHeight / pdfFrameHeight) * readingFocusPreviewHeight
      : 0,
    0,
    readingFocusPreviewHeight,
  );
  const previewAvailableFocusHeight = Math.max(
    0,
    readingFocusPreviewHeight - previewToolbarHeight,
  );
  const previewFocusTop =
    previewAvailableFocusHeight <= 0
      ? previewToolbarHeight
      : previewToolbarHeight +
        previewAvailableFocusHeight * readingFocusDraft.focusTopRatio;
  const previewFocusHeight =
    previewAvailableFocusHeight <= 0
      ? 0
      : previewAvailableFocusHeight * readingFocusDraft.focusHeightRatio;
  const previewFocusBottom = Math.max(
    0,
    readingFocusPreviewHeight - previewFocusTop - previewFocusHeight,
  );

  useEffect(() => {
    window.localStorage.setItem(
      READING_FOCUS_STORAGE_KEY,
      JSON.stringify(readingFocusSettings),
    );
  }, [readingFocusSettings]);

  useEffect(() => {
    if (!isPDFViewerOpen || !pdfFrameWrapperRef.current) {
      setPdfFrameHeight(0);
      return;
    }

    const element = pdfFrameWrapperRef.current;
    const updateHeight = () => {
      setPdfFrameHeight(element.clientHeight);
    };

    updateHeight();

    const observer = new ResizeObserver(updateHeight);
    observer.observe(element);

    return () => observer.disconnect();
  }, [isPDFViewerOpen]);

  useEffect(() => {
    if (!isReadingFocusModalOpen || !readingFocusPreviewRef.current) {
      setReadingFocusPreviewHeight(0);
      return;
    }

    const element = readingFocusPreviewRef.current;
    const updateHeight = () => {
      setReadingFocusPreviewHeight(element.clientHeight);
    };

    updateHeight();

    const observer = new ResizeObserver(updateHeight);
    observer.observe(element);

    return () => observer.disconnect();
  }, [isReadingFocusModalOpen]);

  useEffect(() => {
    if (!isPDFViewerOpen) {
      setIsReportPdfIssueModalOpen(false);
      setReportPdfPageError(null);
    }
  }, [isPDFViewerOpen]);

  useEffect(() => {
    if (!work) return;
    setAuthorDrafts(buildAuthorDrafts(work.authors || []));
    setEditingAuthorId(null);
    setIsAuthorDropdownOpen(false);
    setTagDrafts(buildTagDrafts(work.tags || []));
    setEditingTagId(null);
    setIsTagDropdownOpen(false);
    setWorkIdDraft(work.id || "");
    setTitleDraft(work.title || "");
    setPageCountDraft(String(work.page_count || 0));
  }, [work]);

  useEffect(() => {
    if (!notFound) return;

    setMissingWorkTitleDraft("");
    setMissingWorkPageCountDraft("0");
    setMissingWorkAuthorsDraft("");
    setMissingWorkTagsDraft("");
  }, [notFound, workId]);

  const openReportPdfIssueModal = () => {
    setReportIssueType("blank_or_missing_pages");
    setReportPdfPageDraft(work?.current_page ? String(work.current_page) : "");
    setReportIssueDetailsDraft("");
    setReportPdfPageError(null);
    setIsReportPdfIssueModalOpen(true);
  };

  const closeReportPdfIssueModal = () => {
    if (isReportingFileIssue) return;
    setReportPdfPageError(null);
    setIsReportPdfIssueModalOpen(false);
  };

  const submitReportPdfIssue = async () => {
    let success = false;
    if (reportIssueType === "blank_or_missing_pages") {
      const pageNumber = Number.parseInt(reportPdfPageDraft.trim(), 10);
      if (!Number.isInteger(pageNumber) || pageNumber <= 0) {
        setReportPdfPageError("Please enter a valid PDF page number.");
        return;
      }

      success = await handleReportWorkIssue({
        issueType: "blank_or_missing_pages",
        pageNumber,
      });
    } else {
      const details = reportIssueDetailsDraft.trim();
      if (!details) {
        setReportPdfPageError("Please describe the issue.");
        return;
      }

      success = await handleReportWorkIssue({
        issueType: "other_issue",
        details,
      });
    }

    if (success) {
      closeReportPdfIssueModal();
    }
  };

  useEffect(() => {
    if (!isAuthorDropdownOpen) return;

    const handlePointerDown = (event: MouseEvent) => {
      if (
        authorDropdownRef.current &&
        !authorDropdownRef.current.contains(event.target as Node)
      ) {
        setIsAuthorDropdownOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [isAuthorDropdownOpen]);

  useEffect(() => {
    if (!isFinderDropdownOpen) return;

    const handlePointerDown = (event: MouseEvent) => {
      if (
        finderDropdownRef.current &&
        !finderDropdownRef.current.contains(event.target as Node)
      ) {
        closeFinderDropdown();
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [closeFinderDropdown, isFinderDropdownOpen]);

  useEffect(() => {
    if (!isTagDropdownOpen) return;

    const handlePointerDown = (event: MouseEvent) => {
      if (
        tagDropdownRef.current &&
        !tagDropdownRef.current.contains(event.target as Node)
      ) {
        setIsTagDropdownOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [isTagDropdownOpen]);

  useEffect(() => {
    const handleAppEscape = (event: Event) => {
      if (isActionDrawerOpen) {
        closeActionDrawer();
        event.preventDefault();
        return;
      }

      if (isPDFViewerOpen) {
        event.preventDefault();
      }
    };

    window.addEventListener("app-escape", handleAppEscape);
    return () => window.removeEventListener("app-escape", handleAppEscape);
  }, [closeActionDrawer, isActionDrawerOpen, isPDFViewerOpen]);

  const handleCoverUpload = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) return;

    setCoverUploadError(null);
    setIsUploadingCover(true);

    try {
      const result = await uploadWorkCover(workId, file);
      if (!result.success) {
        setCoverUploadError(result.error || "Failed to upload cover.");
        return;
      }

      await fetchData();
    } catch (error) {
      console.error("Failed to upload cover:", error);
      setCoverUploadError("Failed to upload cover.");
      showToast(
        error instanceof Error ? error.message : "Failed to upload cover.",
        { tone: "error" },
      );
    } finally {
      setIsUploadingCover(false);
    }
  };

  const openTagsModal = () => {
    if (!work) return;
    setTagDrafts(buildTagDrafts(work.tags || []));
    setEditingTagId(null);
    setIsTagsModalOpen(true);
  };

  const closeTagsModal = () => {
    if (!work) return;
    if (isSavingTags) return;
    setTagDrafts(buildTagDrafts(work.tags || []));
    setEditingTagId(null);
    setIsTagsModalOpen(false);
  };

  const openAuthorsModal = () => {
    if (!work) return;
    setAuthorDrafts(buildAuthorDrafts(work.authors || []));
    setEditingAuthorId(null);
    setIsAuthorsModalOpen(true);
  };

  const closeAuthorsModal = () => {
    if (!work || isSavingAuthors) return;
    setAuthorDrafts(buildAuthorDrafts(work.authors || []));
    setEditingAuthorId(null);
    setIsAuthorsModalOpen(false);
  };

  const addAuthorDraft = () => {
    const draft: AuthorDraft = {
      id: `new-author-${Date.now()}`,
      value: "",
    };
    setAuthorDrafts((prev) => [...prev, draft]);
    setEditingAuthorId(draft.id);
  };

  const updateAuthorDraftValue = (authorId: string, value: string) => {
    setAuthorDrafts((prev) =>
      prev.map((author) =>
        author.id === authorId ? { ...author, value } : author,
      ),
    );
  };

  const removeAuthorDraft = (authorId: string) => {
    setAuthorDrafts((prev) => prev.filter((author) => author.id !== authorId));
    setEditingAuthorId((current) => (current === authorId ? null : current));
  };

  const addTagDraft = () => {
    const draft: TagDraft = {
      id: `new-${Date.now()}`,
      value: "",
      isGenre: false,
    };
    setTagDrafts((prev) => [...prev, draft]);
    setEditingTagId(draft.id);
  };

  const updateTagDraftValue = (tagId: string, value: string) => {
    setTagDrafts((prev) =>
      prev.map((tag) => (tag.id === tagId ? { ...tag, value } : tag)),
    );
  };

  const removeTagDraft = (tagId: string) => {
    setTagDrafts((prev) => prev.filter((tag) => tag.id !== tagId));
    setEditingTagId((current) => (current === tagId ? null : current));
  };

  const handleSaveTags = async () => {
    if (!work) return;
    const normalizedTags = tagDrafts.map(normalizeTagValue).filter(Boolean);
    const uniqueTags = Array.from(new Set(normalizedTags));

    if (normalizedTags.length !== uniqueTags.length) {
      showToast("Tags must be unique.", { tone: "error" });
      return;
    }

    setIsSavingTags(true);

    try {
      await updateWorkTags(work, uniqueTags);
      await fetchData();
      setIsTagsModalOpen(false);
      setEditingTagId(null);
      showToast("Tags updated.", { tone: "success" });
    } catch (error) {
      showToast(
        error instanceof Error ? error.message : "Failed to update tags.",
        { tone: "error" },
      );
    } finally {
      setIsSavingTags(false);
    }
  };

  const handleSaveAuthors = async () => {
    if (!work) return;

    const normalizedAuthors = authorDrafts
      .map((author) => author.value.trim())
      .filter(Boolean);
    const uniqueAuthors = Array.from(
      new Map(
        normalizedAuthors.map((author) => [author.toLowerCase(), author]),
      ).values(),
    );

    if (normalizedAuthors.length !== uniqueAuthors.length) {
      showToast("Authors must be unique.", { tone: "error" });
      return;
    }

    setIsSavingAuthors(true);

    try {
      await updateWorkAuthors(work, uniqueAuthors);
      await fetchData();
      setIsAuthorsModalOpen(false);
      setEditingAuthorId(null);
      showToast("Authors updated.", { tone: "success" });
    } catch (error) {
      showToast(
        error instanceof Error ? error.message : "Failed to update authors.",
        { tone: "error" },
      );
    } finally {
      setIsSavingAuthors(false);
    }
  };

  const openPageCountModal = () => {
    if (!work) return;
    setPageCountDraft(String(work.page_count || 0));
    setIsPageCountModalOpen(true);
  };

  const openTitleModal = () => {
    if (!work) return;
    setWorkIdDraft(work.id || "");
    setTitleDraft(work.title || "");
    setIsTitleModalOpen(true);
  };

  const closeTitleModal = () => {
    if (!work || isSavingTitle) return;
    setWorkIdDraft(work.id || "");
    setTitleDraft(work.title || "");
    setIsTitleModalOpen(false);
  };

  const handleSaveTitle = async () => {
    if (!work) return;

    const nextId = workIdDraft.trim();
    const nextTitle = titleDraft.trim();
    if (!nextId) {
      showToast("Work ID is required.", { tone: "error" });
      return;
    }
    if (!nextTitle) {
      showToast("Title is required.", { tone: "error" });
      return;
    }

    setIsSavingTitle(true);

    try {
      await updateWorkTitle(work, nextTitle, nextId);
      setIsTitleModalOpen(false);
      if (nextId !== work.id) {
        navigate(`/work/${encodeURIComponent(nextId)}`, {
          replace: true,
          state: {
            work: {
              ...work,
              id: nextId,
              title: nextTitle,
            },
          },
        });
      } else {
        await fetchData();
      }
      showToast("Work metadata updated.", { tone: "success" });
    } catch (error) {
      showToast(
        error instanceof Error ? error.message : "Failed to update work.",
        { tone: "error" },
      );
    } finally {
      setIsSavingTitle(false);
    }
  };

  const closePageCountModal = () => {
    if (!work || isSavingPageCount) return;
    setPageCountDraft(String(work.page_count || 0));
    setIsPageCountModalOpen(false);
  };

  const handleSavePageCount = async () => {
    if (!work) return;

    const nextPageCount = Number(pageCountDraft.trim());
    if (!Number.isInteger(nextPageCount) || nextPageCount < 0) {
      showToast("Page count must be a non-negative whole number.", {
        tone: "error",
      });
      return;
    }

    setIsSavingPageCount(true);

    try {
      await updateWorkPageCount(work, nextPageCount);
      await fetchData();
      setIsPageCountModalOpen(false);
      showToast("Page count updated.", { tone: "success" });
    } catch (error) {
      showToast(
        error instanceof Error ? error.message : "Failed to update page count.",
        { tone: "error" },
      );
    } finally {
      setIsSavingPageCount(false);
    }
  };

  const handleAdjustPageCount = (delta: number) => {
    setPageCountDraft((current) => {
      const parsed = Number(current.trim());
      const baseValue =
        Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : 0;
      return String(Math.max(0, baseValue + delta));
    });
  };

  const setReadingFocusDraftWindow = useCallback(
    (nextTopRatio: number, nextHeightRatio: number) => {
      setReadingFocusDraft((current) =>
        sanitizeReadingFocusSettings({
          ...current,
          focusTopRatio: nextTopRatio,
          focusHeightRatio: nextHeightRatio,
        }),
      );
    },
    [],
  );

  const startReadingFocusPreviewDrag = useCallback(
    (
      event: React.PointerEvent<HTMLElement>,
      mode: "move" | "resize-top" | "resize-bottom",
    ) => {
      if (!readingFocusDraft.enabled || !readingFocusPreviewRef.current) {
        return;
      }

      if (event.button !== 0 || !event.isPrimary) {
        return;
      }

      event.preventDefault();

      const previewElement = readingFocusPreviewRef.current;
      const usableHeight = Math.max(
        previewElement.clientHeight - previewToolbarHeight,
        1,
      );
      const minWindowHeight = usableHeight * MIN_READING_FOCUS_HEIGHT_RATIO;
      const startY = event.clientY;
      const startTop = usableHeight * readingFocusDraft.focusTopRatio;
      const startHeight = usableHeight * readingFocusDraft.focusHeightRatio;
      const startBottom = startTop + startHeight;

      const handlePointerMove = (moveEvent: PointerEvent) => {
        const deltaY = moveEvent.clientY - startY;

        if (mode === "move") {
          const nextTop = clampNumber(
            startTop + deltaY,
            0,
            usableHeight - startHeight,
          );
          setReadingFocusDraftWindow(
            nextTop / usableHeight,
            startHeight / usableHeight,
          );
          return;
        }

        if (mode === "resize-top") {
          const nextTop = clampNumber(
            startTop + deltaY,
            0,
            startBottom - minWindowHeight,
          );
          const nextHeight = startBottom - nextTop;
          setReadingFocusDraftWindow(
            nextTop / usableHeight,
            nextHeight / usableHeight,
          );
          return;
        }

        const nextBottom = clampNumber(
          startBottom + deltaY,
          startTop + minWindowHeight,
          usableHeight,
        );
        const nextHeight = nextBottom - startTop;
        setReadingFocusDraftWindow(
          startTop / usableHeight,
          nextHeight / usableHeight,
        );
      };

      const handlePointerUp = () => {
        window.removeEventListener("pointermove", handlePointerMove);
        window.removeEventListener("pointerup", handlePointerUp);
        window.removeEventListener("pointercancel", handlePointerUp);
      };

      window.addEventListener("pointermove", handlePointerMove);
      window.addEventListener("pointerup", handlePointerUp);
      window.addEventListener("pointercancel", handlePointerUp);
    },
    [
      previewToolbarHeight,
      readingFocusDraft.enabled,
      readingFocusDraft.focusHeightRatio,
      readingFocusDraft.focusTopRatio,
      setReadingFocusDraftWindow,
    ],
  );

  const openReadingFocusModal = () => {
    setReadingFocusDraft(readingFocusSettings);
    setIsReadingFocusModalOpen(true);
  };

  const closeReadingFocusModal = () => {
    setReadingFocusDraft(readingFocusSettings);
    setIsReadingFocusModalOpen(false);
  };

  const handleSaveReadingFocus = () => {
    setReadingFocusSettings(sanitizeReadingFocusSettings(readingFocusDraft));
    setIsReadingFocusModalOpen(false);
    showToast("Reading focus updated.", { tone: "success" });
  };

  const handleCreateMissingWork = async () => {
    const title = missingWorkTitleDraft.trim();
    const pageCount = Number.parseInt(missingWorkPageCountDraft.trim(), 10);

    if (!title) {
      showToast("Title is required.", { tone: "error" });
      return;
    }

    if (!Number.isInteger(pageCount) || pageCount < 0) {
      showToast("Page count must be a non-negative whole number.", {
        tone: "error",
      });
      return;
    }

    setIsCreatingMissingWork(true);

    try {
      await createWork({
        id: workId,
        title,
        page_count: pageCount,
        authors: parseDraftList(missingWorkAuthorsDraft),
        tags: parseDraftList(missingWorkTagsDraft),
      });
      await fetchData();
      showToast("Work created.", { tone: "success" });
    } catch (error) {
      showToast(
        error instanceof Error ? error.message : "Failed to create work.",
        { tone: "error" },
      );
    } finally {
      setIsCreatingMissingWork(false);
    }
  };

  if (loading) return null;

  if (!work) {
    return (
      <div className="detail-page">
        <div className="detail-split-view-container detail-split-view-container--centered">
          <div className="detail-main-content-pane">
            <section className="detail-missing-work">
              <p className="detail-label">Missing work</p>
              <h1 className="detail-title detail-missing-work__title">
                {isAdmin ? "Create this work" : "Work not found"}
              </h1>
              <p className="detail-missing-work__body">
                {isAdmin && notFound
                  ? `There is no work at /work/${workId} yet. You can insert it now with this id.`
                  : "We couldn't find a work for this id."}
              </p>

              {isAdmin && notFound ? (
                <div className="detail-missing-work__form detail-quote-form">
                  <label className="detail-page-count-modal__field">
                    <span className="detail-label">Work ID</span>
                    <input className="detail-input" value={workId} readOnly />
                  </label>

                  <label className="detail-page-count-modal__field">
                    <span className="detail-label">Title</span>
                    <input
                      className="detail-input"
                      value={missingWorkTitleDraft}
                      onChange={(event) =>
                        setMissingWorkTitleDraft(event.target.value)
                      }
                      placeholder="Untitled work"
                    />
                  </label>

                  <label className="detail-page-count-modal__field">
                    <span className="detail-label">Page count</span>
                    <input
                      className="detail-input"
                      inputMode="numeric"
                      value={missingWorkPageCountDraft}
                      onChange={(event) =>
                        setMissingWorkPageCountDraft(event.target.value)
                      }
                      placeholder="0"
                    />
                  </label>

                  <label className="detail-page-count-modal__field">
                    <span className="detail-label">Authors</span>
                    <textarea
                      className="detail-input detail-missing-work__textarea"
                      value={missingWorkAuthorsDraft}
                      onChange={(event) =>
                        setMissingWorkAuthorsDraft(event.target.value)
                      }
                      placeholder="Comma or line separated"
                    />
                  </label>

                  <label className="detail-page-count-modal__field">
                    <span className="detail-label">Tags</span>
                    <textarea
                      className="detail-input detail-missing-work__textarea"
                      value={missingWorkTagsDraft}
                      onChange={(event) =>
                        setMissingWorkTagsDraft(event.target.value)
                      }
                      placeholder="Comma or line separated"
                    />
                  </label>

                  <div className="detail-form-actions detail-missing-work__actions">
                    <button
                      type="button"
                      className="detail-btn detail-btn--cancel"
                      onClick={() => navigate(-1)}
                    >
                      Back
                    </button>
                    <button
                      type="button"
                      className="detail-btn detail-btn--save"
                      onClick={() => void handleCreateMissingWork()}
                      disabled={isCreatingMissingWork}
                    >
                      {isCreatingMissingWork ? "Creating..." : "Create work"}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="detail-form-actions detail-missing-work__actions">
                  <button
                    type="button"
                    className="detail-btn detail-btn--cancel"
                    onClick={() => navigate(-1)}
                  >
                    Back
                  </button>
                </div>
              )}
            </section>
          </div>
        </div>
      </div>
    );
  }

  const canUseDropbox = Boolean(work.dropbox_link) || isAdmin;
  const canUseFinder = finderFiles.length > 0 || isAdmin;
  const visibleAuthors = work.authors || [];
  const firstAuthor = visibleAuthors[0];
  const extraAuthors = visibleAuthors.slice(1);
  const extraAuthorCount = Math.max(0, visibleAuthors.length - 1);
  const visibleTags = work.tags || [];
  const firstTag = visibleTags[0];
  const extraTags = visibleTags.slice(1);
  const extraTagCount = Math.max(0, visibleTags.length - 1);
  const detailCoverLayoutId = isSharedLayoutActive
    ? `work-cover-${work.id}`
    : undefined;

  return (
    <div
      className="detail-page"
      style={
        {
          "--detail-page-border-image": work.background_img_url
            ? `url("${work.background_img_url}")`
            : "none",
        } as React.CSSProperties
      }
    >
      <div className="detail-split-view-container">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={work.id}
            className="detail-main-content-pane"
            initial={{ opacity: 0, y: 18, scale: 0.992 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -12, scale: 1.006 }}
            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
          >
            <div
              className={`detail-content-wrapper ${isPDFViewerOpen ? "pdf-open-wrap" : ""}`}
            >
              <aside className="detail-left-col">
                {work.cover_img_url ? (
                  <motion.img
                    layoutId={detailCoverLayoutId}
                    src={work.cover_img_url as string}
                    alt={work.id}
                    className="goodreads-cover"
                    transition={coverTransition}
                  />
                ) : (
                  <div className="detail-cover-upload">
                    {user?.role === "admin" ? (
                      <>
                        <button
                          type="button"
                          className="detail-cover-upload-trigger"
                          onClick={() => coverInputRef.current?.click()}
                          disabled={isUploadingCover}
                        >
                          <motion.img
                            layoutId={detailCoverLayoutId}
                            src={noCover}
                            alt={work.id}
                            className="goodreads-cover"
                            transition={coverTransition}
                          />
                        </button>
                        <input
                          ref={coverInputRef}
                          type="file"
                          accept="image/png"
                          hidden
                          onChange={handleCoverUpload}
                        />
                      </>
                    ) : (
                      <motion.img
                        layoutId={detailCoverLayoutId}
                        src={noCover}
                        alt={work.id}
                        className="goodreads-cover"
                        transition={coverTransition}
                      />
                    )}
                    {coverUploadError && (
                      <p className="detail-cover-upload-error">
                        {coverUploadError}
                      </p>
                    )}
                  </div>
                )}
              </aside>

              <motion.main
                className="detail-middle-col"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.15, duration: 0.35 }}
              >
                <div>
                  <h1 className="detail-title">
                    {isAdmin ? (
                      <button
                        type="button"
                        className="detail-title-button"
                        onClick={openTitleModal}
                      >
                        <span className="detail-title-button__text">
                          {work.title || "Untitled Work"}
                        </span>
                        <span
                          className="detail-title-button__icon"
                          aria-hidden="true"
                        >
                          <AppIcon name="edit" title="Edit title" size={18} />
                        </span>
                      </button>
                    ) : (
                      work.title || "Untitled Work"
                    )}
                  </h1>

                  <div className="detail-metadata">
                    {firstAuthor && (
                      <MetadataPillWrap
                        className="detail-author-pill-wrap"
                        ref={authorDropdownRef}
                      >
                        <MetadataPill className="detail-author-pill">
                          <>
                            {isAdmin && (
                              <MetadataPillSegment
                                as="button"
                                type="button"
                                className="detail-author-pill__icon-button"
                                onClick={openAuthorsModal}
                                aria-label="Edit authors"
                              >
                                <AppIcon
                                  name="edit"
                                  title="Edit authors"
                                  size={13}
                                />
                              </MetadataPillSegment>
                            )}
                            <MetadataPillSegment
                              as={Link}
                              divided={isAdmin}
                              to={`/collection/${encodeURIComponent(firstAuthor)}`}
                              className="detail-author-pill__link"
                            >
                              {firstAuthor}
                            </MetadataPillSegment>
                            {extraAuthorCount > 0 && (
                              <MetadataPillSegment
                                as="button"
                                type="button"
                                divided
                                className="detail-author-pill__more-button"
                                onClick={() =>
                                  setIsAuthorDropdownOpen((current) => !current)
                                }
                                aria-label={`Show ${extraAuthorCount} more authors`}
                                aria-expanded={isAuthorDropdownOpen}
                              >
                                {extraAuthorCount}+
                              </MetadataPillSegment>
                            )}
                          </>
                        </MetadataPill>
                        {extraAuthorCount > 0 && isAuthorDropdownOpen && (
                          <MetadataDropdown className="detail-author-dropdown">
                            {extraAuthors.map((author) => (
                              <MetadataDropdownItem
                                as={Link}
                                key={author}
                                to={`/collection/${encodeURIComponent(author)}`}
                                className="detail-author-dropdown__item"
                                onClick={() => setIsAuthorDropdownOpen(false)}
                              >
                                {author}
                              </MetadataDropdownItem>
                            ))}
                          </MetadataDropdown>
                        )}
                      </MetadataPillWrap>
                    )}

                    {isAdmin ? (
                      <MetadataPill className="detail-page-count-pill">
                        <>
                          <MetadataPillSegment
                            as="button"
                            type="button"
                            className="detail-page-count-pill__edit-button"
                            onClick={openPageCountModal}
                            aria-label="Edit page count"
                          >
                            <AppIcon
                              name="edit"
                              title="Edit page count"
                              size={13}
                            />
                          </MetadataPillSegment>
                          <MetadataPillSegment
                            as="button"
                            type="button"
                            divided
                            className="detail-page-count-pill__content"
                            onClick={openPageCountModal}
                          >
                            {work.page_count} pages
                          </MetadataPillSegment>
                        </>
                      </MetadataPill>
                    ) : (
                      <MetadataPill className="detail-page-count-pill">
                        <MetadataPillSegment>
                          {work.page_count} pages
                        </MetadataPillSegment>
                      </MetadataPill>
                    )}

                    {firstTag ? (
                      <MetadataPillWrap
                        className="detail-tag-pill-wrap"
                        ref={tagDropdownRef}
                      >
                        <MetadataPill className="detail-tag-pill">
                          <>
                            {isAdmin && (
                              <MetadataPillSegment
                                as="button"
                                type="button"
                                className="detail-tag-pill__icon-button"
                                onClick={openTagsModal}
                                aria-label="Edit tags"
                              >
                                <AppIcon
                                  name="edit"
                                  title="Edit tags"
                                  size={13}
                                />
                              </MetadataPillSegment>
                            )}
                            <MetadataPillSegment
                              as="button"
                              type="button"
                              divided={isAdmin}
                              className="detail-tag-pill__link detail-tag-pill__link-button"
                              onClick={() =>
                                openSearchDrawer(formatTagLabel(firstTag))
                              }
                            >
                              {formatTagLabel(firstTag)}
                            </MetadataPillSegment>
                            {extraTagCount > 0 && (
                              <MetadataPillSegment
                                as="button"
                                type="button"
                                divided
                                className="detail-tag-pill__more-button"
                                onClick={() =>
                                  setIsTagDropdownOpen((current) => !current)
                                }
                                aria-label={`Show ${extraTagCount} more tags`}
                                aria-expanded={isTagDropdownOpen}
                              >
                                {extraTagCount}+
                              </MetadataPillSegment>
                            )}
                          </>
                        </MetadataPill>
                        {extraTagCount > 0 && isTagDropdownOpen && (
                          <MetadataDropdown className="detail-tag-dropdown">
                            {extraTags.map((tag) => (
                              <MetadataDropdownItem
                                as="button"
                                type="button"
                                key={tag}
                                className="detail-tag-dropdown__item"
                                onClick={() => {
                                  setIsTagDropdownOpen(false);
                                  openSearchDrawer(formatTagLabel(tag));
                                }}
                              >
                                {formatTagLabel(tag)}
                              </MetadataDropdownItem>
                            ))}
                          </MetadataDropdown>
                        )}
                      </MetadataPillWrap>
                    ) : (
                      isAdmin && (
                        <MetadataPill
                          className="detail-tag-pill detail-tag-pill--empty"
                          onClick={openTagsModal}
                        >
                          <MetadataPillSegment className="detail-tag-pill__empty-content">
                            <AppIcon
                              name="close"
                              title="Add tag"
                              size={12}
                              style={{ transform: "rotate(45deg)" }}
                            />
                            <span>Add tag</span>
                          </MetadataPillSegment>
                        </MetadataPill>
                      )
                    )}
                  </div>
                  <div className="detail-urls">
                    {canUseFinder && (
                      <MetadataPillWrap
                        className="detail-finder-pill-wrap"
                        ref={finderDropdownRef}
                      >
                        <FinderButton
                          onClick={handleFinderButtonClick}
                          aria-expanded={
                            finderFiles.length > 1
                              ? isFinderDropdownOpen
                              : undefined
                          }
                          aria-haspopup={
                            finderFiles.length > 1 ? "menu" : undefined
                          }
                          aria-label={
                            finderFiles.length > 1
                              ? "Choose a file version"
                              : "Open in Finder"
                          }
                        />
                        {finderFiles.length > 1 && isFinderDropdownOpen && (
                          <MetadataDropdown className="detail-finder-dropdown">
                            {finderFiles.map(({ label, url }) => (
                              <MetadataDropdownItem
                                key={label}
                                as="button"
                                type="button"
                                className="detail-finder-dropdown__item"
                                onClick={() => handleFinderFileSelect(url)}
                              >
                                {label}
                              </MetadataDropdownItem>
                            ))}
                          </MetadataDropdown>
                        )}
                      </MetadataPillWrap>
                    )}

                    {canUseDropbox && (
                      <DropboxButton
                        onClick={() => togglePDFViewer("dropbox")}
                        style={{
                          backgroundColor:
                            "var(--detail-page-dropbox-button-bg)",
                        }}
                      />
                    )}

                    <GoodreadsButton
                      category="book"
                      goodreadsId={work.goodreads_id}
                      resourceId={work.id}
                      onSavedId={() => {
                        void fetchData();
                      }}
                      style={{
                        backgroundColor:
                          "var(--detail-page-goodreads-button-bg)",
                      }}
                    />

                    {work.amazon_asin && (
                      <KindleButton asin={work.amazon_asin} />
                    )}
                  </div>
                </div>
              </motion.main>

              <DetailActionPanel
                read={read}
                liked={liked}
                shelved={shelved}
                displayRating={displayRating}
                isPDFViewerOpen={isPDFViewerOpen}
                isDrawerMode={isActionPanelDrawerMode}
                isActionDrawerOpen={isActionDrawerOpen}
                isReadingFocusEnabled={readingFocusSettings.enabled}
                progressContent={<ProgressBar work={work} />}
                onToggleDrawer={toggleActionDrawer}
                onToggleAction={toggleAction}
                onResetHoverRating={() => setHoverRating(0)}
                onStarMouseMove={handleStarMouseMove}
                onStarClick={handleStarClick}
                onOpenProgressModal={() => openEditFormModal("progress")}
                onOpenReadingFocusModal={openReadingFocusModal}
                onClosePDFViewer={closePDFViewer}
                onReportIssue={openReportPdfIssueModal}
                isReportingPdfIssue={isReportingFileIssue}
              />
            </div>

            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.18, duration: 0.45 }}
              className={`detail-quotes-section ${isPDFViewerOpen ? "detail-quotes-section--pdf-open" : ""}`}
            >
              <div className="detail-quotes-workspace">
                <QuoteConversationWorkspace
                  key={`detail-quote-workspace-${work.id}-${initialConversationQuoteId || "none"}-${conversationDraftIntent?.token || 0}`}
                  workId={work.id}
                  quotes={displayQuotes}
                  initialQuoteId={initialConversationQuoteId}
                  incomingDraft={conversationDraftIntent}
                  onRefresh={fetchData}
                />
              </div>
            </motion.div>
          </motion.div>
        </AnimatePresence>

        {isPDFViewerOpen && (
          <div className="pdf-viewer-pane">
            <div className="detail-pdf-frame-wrapper" ref={pdfFrameWrapperRef}>
              <iframe
                src={viewerInitialUrl as string}
                width="100%"
                height="100%"
                className="detail-pdf-iframe"
              />
              {isReadingFocusVisible && (
                <div
                  className="detail-reading-focus-overlay"
                  aria-hidden="true"
                >
                  <div
                    className="detail-reading-focus-overlay__toolbar"
                    style={{ height: effectiveToolbarHeight }}
                  />
                  <div
                    className="detail-reading-focus-overlay__mask detail-reading-focus-overlay__mask--top"
                    style={{
                      top: effectiveToolbarHeight,
                      height: Math.max(
                        0,
                        effectiveFocusTop - effectiveToolbarHeight,
                      ),
                      backgroundColor: readingFocusOverlayColor,
                    }}
                  />
                  <div
                    className="detail-reading-focus-overlay__window"
                    style={{
                      top: effectiveFocusTop,
                      height: effectiveFocusHeight,
                    }}
                  >
                    <div className="detail-reading-focus-overlay__action-zone">
                      <button
                        type="button"
                        className="detail-reading-focus-overlay__action"
                        onClick={() => {
                          void triggerClipboardQuoteCapture("analyze");
                        }}
                      >
                        <AppIcon name="analyze" size={14} />
                      </button>
                      <button
                        type="button"
                        className="detail-reading-focus-overlay__action"
                        onClick={() => {
                          void triggerClipboardQuoteCapture("translate");
                        }}
                      >
                        <AppIcon name="translate" size={14} />
                      </button>
                    </div>
                  </div>
                  <div
                    className="detail-reading-focus-overlay__mask detail-reading-focus-overlay__mask--bottom"
                    style={{
                      bottom: 0,
                      height: effectiveFocusBottom,
                      backgroundColor: readingFocusOverlayColor,
                    }}
                  />
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      <DetailProgressModal
        isOpen={isProgressModalOpen}
        isSaving={isSavingProgress}
        editingForm={progressEditingForm}
        pageCount={work.page_count}
        onClose={() => closeDetailEditFormModal("progress")}
        onSubmit={handleUpdateProgress}
        onInputChange={handleProgressInputChange}
        onProgressFinished={handleProgressFinished}
      />
      <DetailDropboxLinkModal
        isOpen={isDropboxLinkModalOpen}
        value={dropboxLinkDraft}
        error={dropboxLinkError}
        isSaving={isDropboxSaving}
        onClose={closeDropboxLinkModal}
        onChange={handleDropboxLinkChange}
        onSubmit={handleDropboxLinkSubmit}
      />
      <DetailFileUploadModal
        key={uploadModalVersion}
        isOpen={isUploadModalOpen}
        isUploading={isUploadingFile}
        error={uploadError}
        onUpload={handleWorkFileUpload}
        onClose={closeUploadModal}
      />

      <Modal
        isOpen={isPDFViewerOpen && isReadingFocusModalOpen}
        onClose={closeReadingFocusModal}
        cardClassName="detail-reading-focus-modal"
      >
        <div className="detail-reading-focus-form">
          <label className="detail-reading-focus-toggle">
            <span className="detail-reading-focus-toggle__text">
              <span className="detail-reading-focus-toggle__title">
                Reading focus
              </span>
              <span className="detail-reading-focus-toggle__description">
                Dim the page around a centered reading window.
              </span>
            </span>
            <input
              type="checkbox"
              checked={readingFocusDraft.enabled}
              onChange={(event) =>
                setReadingFocusDraft((current) => ({
                  ...current,
                  enabled: event.target.checked,
                }))
              }
              className="detail-reading-focus-toggle__input"
            />
          </label>
          <div className="detail-reading-focus-layout">
            <div className="detail-reading-focus-preview-panel">
              <div
                ref={readingFocusPreviewRef}
                className={[
                  "detail-reading-focus-preview",
                  !readingFocusDraft.enabled
                    ? "detail-reading-focus-preview--disabled"
                    : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
              >
                {previewToolbarHeight > 0 ? (
                  <div
                    className="detail-reading-focus-preview__toolbar"
                    style={{ height: previewToolbarHeight }}
                  />
                ) : null}
                <div className="detail-reading-focus-preview__page">
                  {READING_FOCUS_PREVIEW_TEXT.map((paragraph) => (
                    <p
                      key={paragraph}
                      className="detail-reading-focus-preview__text"
                    >
                      {paragraph}
                    </p>
                  ))}
                </div>
                <div className="detail-reading-focus-overlay detail-reading-focus-overlay--preview">
                  <div
                    className="detail-reading-focus-overlay__mask detail-reading-focus-overlay__mask--top"
                    style={{
                      top: previewToolbarHeight,
                      height: Math.max(
                        0,
                        previewFocusTop - previewToolbarHeight,
                      ),
                      backgroundColor: previewReadingFocusOverlayColor,
                    }}
                  />
                  <div
                    className="detail-reading-focus-overlay__window detail-reading-focus-overlay__window--interactive"
                    style={{
                      top: previewFocusTop,
                      height: previewFocusHeight,
                      borderColor: previewReadingFocusOverlayColor,
                    }}
                    onPointerDown={(event) =>
                      startReadingFocusPreviewDrag(event, "move")
                    }
                  >
                    <button
                      type="button"
                      className="detail-reading-focus-overlay__handle detail-reading-focus-overlay__handle--top"
                      aria-label="Adjust reading focus top edge"
                      onPointerDown={(event) => {
                        event.stopPropagation();
                        startReadingFocusPreviewDrag(event, "resize-top");
                      }}
                      disabled={!readingFocusDraft.enabled}
                    />
                    <button
                      type="button"
                      className="detail-reading-focus-overlay__handle detail-reading-focus-overlay__handle--bottom"
                      aria-label="Adjust reading focus bottom edge"
                      onPointerDown={(event) => {
                        event.stopPropagation();
                        startReadingFocusPreviewDrag(event, "resize-bottom");
                      }}
                      disabled={!readingFocusDraft.enabled}
                    />
                  </div>
                  <div
                    className="detail-reading-focus-overlay__mask detail-reading-focus-overlay__mask--bottom"
                    style={{
                      bottom: 0,
                      height: previewFocusBottom,
                      backgroundColor: previewReadingFocusOverlayColor,
                    }}
                  />
                </div>
              </div>
            </div>

            <div className="detail-reading-focus-controls">
              <div className="detail-reading-focus-controls__header">Mask</div>
              <label className="detail-reading-focus-field">
                <span className="detail-reading-focus-field__row">
                  <span className="detail-reading-focus-field__label">
                    Color
                  </span>
                  <span className="detail-reading-focus-field__value">
                    {readingFocusDraft.maskColor.toUpperCase()}
                  </span>
                </span>
                <span className="detail-reading-focus-color-row">
                  <input
                    type="color"
                    value={readingFocusDraft.maskColor}
                    onChange={(event) =>
                      setReadingFocusDraft((current) => ({
                        ...current,
                        maskColor: event.target.value,
                      }))
                    }
                    className="detail-reading-focus-color-input"
                    disabled={!readingFocusDraft.enabled}
                  />
                </span>
              </label>

              <label className="detail-reading-focus-field">
                <span className="detail-reading-focus-field__row">
                  <span className="detail-reading-focus-field__label">
                    Opacity
                  </span>
                  <span className="detail-reading-focus-field__value">
                    {Math.round(readingFocusDraft.maskOpacity * 100)}%
                  </span>
                </span>
                <input
                  type="range"
                  min="0"
                  max="100"
                  step="1"
                  value={Math.round(readingFocusDraft.maskOpacity * 100)}
                  onChange={(event) =>
                    setReadingFocusDraft((current) => ({
                      ...current,
                      maskOpacity: Number(event.target.value) / 100,
                    }))
                  }
                  className="detail-reading-focus-range"
                  disabled={!readingFocusDraft.enabled}
                />
              </label>

              <p className="detail-reading-focus-instruction">
                Drag the clear window to move it. Drag the top or bottom edge to
                resize the reading band.
              </p>
            </div>
          </div>
        </div>

        <div className="modal-actions">
          <button
            type="button"
            onClick={closeReadingFocusModal}
            className="modal-btn modal-btn--cancel"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSaveReadingFocus}
            className="modal-btn modal-btn--save"
          >
            Save
          </button>
        </div>
      </Modal>

      <Modal
        isOpen={isPDFViewerOpen && isReportPdfIssueModalOpen}
        onClose={closeReportPdfIssueModal}
        cardClassName="detail-page-count-modal"
      >
        <div className="modal-header">
          <AppIcon name="inbox" title="Report issues" size={16} />
          <p className="modal-subtitle">
            Report a PDF problem or another issue with this work.
          </p>
        </div>

        <div className="detail-report-issue-type-toggle" role="tablist">
          <button
            type="button"
            className={`detail-report-issue-type-toggle__button ${reportIssueType === "blank_or_missing_pages" ? "detail-report-issue-type-toggle__button--active" : ""}`}
            onClick={() => {
              setReportIssueType("blank_or_missing_pages");
              setReportPdfPageError(null);
            }}
          >
            PDF
          </button>
          <button
            type="button"
            className={`detail-report-issue-type-toggle__button ${reportIssueType === "other_issue" ? "detail-report-issue-type-toggle__button--active" : ""}`}
            onClick={() => {
              setReportIssueType("other_issue");
              setReportPdfPageError(null);
            }}
          >
            Other
          </button>
        </div>

        {reportIssueType === "blank_or_missing_pages" ? (
          <label className="detail-page-count-modal__field">
            <span className="detail-title-modal__label">PDF page number</span>
            <input
              type="number"
              min="1"
              max={work.page_count || undefined}
              step="1"
              inputMode="numeric"
              value={reportPdfPageDraft}
              onChange={(event) => {
                setReportPdfPageDraft(event.target.value);
                setReportPdfPageError(null);
              }}
              className="modal-input detail-title-modal__input"
              placeholder="Enter the affected PDF page"
              autoFocus
            />
          </label>
        ) : (
          <label className="detail-title-modal__field">
            <span className="detail-title-modal__label">Issue details</span>
            <textarea
              value={reportIssueDetailsDraft}
              onChange={(event) => {
                setReportIssueDetailsDraft(event.target.value);
                setReportPdfPageError(null);
              }}
              className="modal-input detail-title-modal__input detail-report-issue-modal__textarea"
              placeholder="Describe the problem you noticed"
              rows={4}
              autoFocus
            />
          </label>
        )}

        {reportPdfPageError && (
          <p className="modal-error">{reportPdfPageError}</p>
        )}

        <div className="modal-actions">
          <button
            type="button"
            onClick={closeReportPdfIssueModal}
            className="modal-btn modal-btn--cancel"
            disabled={isReportingFileIssue}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => {
              void submitReportPdfIssue();
            }}
            className="modal-btn modal-btn--primary"
            disabled={isReportingFileIssue}
          >
            {isReportingFileIssue ? "Sending..." : "Send report"}
          </button>
        </div>
      </Modal>

      <Modal
        isOpen={isAdmin && isAuthorsModalOpen}
        onClose={closeAuthorsModal}
        cardClassName="modal-card--wide detail-authors-modal"
      >
        <div className="modal-header">
          <AppIcon name="users" title="Authors" size={16} />
          <p className="modal-subtitle">Authors</p>
        </div>

        <div className="detail-tag-editor">
          {authorDrafts.map((author) => (
            <div
              key={author.id}
              className={`detail-tag-editor__pill ${editingAuthorId === author.id ? "detail-tag-editor__pill--editing" : ""}`}
              onClick={() => setEditingAuthorId(author.id)}
              role="button"
              tabIndex={0}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  setEditingAuthorId(author.id);
                }
              }}
            >
              {editingAuthorId === author.id ? (
                <input
                  value={author.value}
                  onChange={(event) =>
                    updateAuthorDraftValue(author.id, event.target.value)
                  }
                  onClick={(event) => event.stopPropagation()}
                  onBlur={() => setEditingAuthorId(null)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      setEditingAuthorId(null);
                    }
                  }}
                  className="detail-tag-editor__input"
                  autoFocus
                />
              ) : (
                <span className="detail-tag-editor__label">
                  {author.value || "Untitled author"}
                </span>
              )}
              <button
                type="button"
                className="detail-tag-editor__remove"
                onClick={(event) => {
                  event.stopPropagation();
                  removeAuthorDraft(author.id);
                }}
                aria-label={`Delete ${author.value || "author"}`}
              >
                <AppIcon name="close" title="Delete author" size={12} />
              </button>
            </div>
          ))}
          <button
            type="button"
            className="detail-tag-editor__pill detail-tag-editor__pill--add"
            onClick={addAuthorDraft}
          >
            <AppIcon
              name="close"
              title="Add author"
              size={12}
              style={{ transform: "rotate(45deg)" }}
            />
          </button>
        </div>

        <div className="modal-actions">
          <button
            type="button"
            onClick={closeAuthorsModal}
            className="modal-btn modal-btn--cancel"
            disabled={isSavingAuthors}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => {
              void handleSaveAuthors();
            }}
            className="modal-btn modal-btn--save"
            disabled={isSavingAuthors}
          >
            {isSavingAuthors ? "Saving..." : "Save"}
          </button>
        </div>
      </Modal>

      <Modal
        isOpen={isAdmin && isTagsModalOpen}
        onClose={closeTagsModal}
        cardClassName="modal-card--wide detail-tags-modal"
      >
        <div className="modal-header">
          <AppIcon name="tag" title="Tags" size={16} />
          <p className="modal-subtitle">Tags</p>
        </div>

        <div className="detail-tag-editor">
          {tagDrafts.map((tag) => (
            <div
              key={tag.id}
              className={`detail-tag-editor__pill ${editingTagId === tag.id ? "detail-tag-editor__pill--editing" : ""}`}
              onClick={() => setEditingTagId(tag.id)}
              role="button"
              tabIndex={0}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  setEditingTagId(tag.id);
                }
              }}
            >
              {editingTagId === tag.id ? (
                <input
                  value={tag.value}
                  onChange={(event) =>
                    updateTagDraftValue(tag.id, event.target.value)
                  }
                  onClick={(event) => event.stopPropagation()}
                  onBlur={() => setEditingTagId(null)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      setEditingTagId(null);
                    }
                  }}
                  className="detail-tag-editor__input"
                  autoFocus
                />
              ) : (
                <span className="detail-tag-editor__label">
                  {tag.value || "Untitled tag"}
                </span>
              )}
              <button
                type="button"
                className="detail-tag-editor__remove"
                onClick={(event) => {
                  event.stopPropagation();
                  removeTagDraft(tag.id);
                }}
                aria-label={`Delete ${tag.value || "tag"}`}
              >
                <AppIcon name="close" title="Delete tag" size={12} />
              </button>
            </div>
          ))}
          <button
            type="button"
            className="detail-tag-editor__pill detail-tag-editor__pill--add"
            onClick={addTagDraft}
          >
            <AppIcon
              name="close"
              title="Add tag"
              size={12}
              style={{ transform: "rotate(45deg)" }}
            />
          </button>
        </div>

        <div className="modal-actions">
          <button
            type="button"
            onClick={closeTagsModal}
            className="modal-btn modal-btn--cancel"
            disabled={isSavingTags}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => {
              void handleSaveTags();
            }}
            className="modal-btn modal-btn--save"
            disabled={isSavingTags}
          >
            {isSavingTags ? "Saving..." : "Save"}
          </button>
        </div>
      </Modal>

      <Modal
        isOpen={isAdmin && isTitleModalOpen}
        onClose={closeTitleModal}
        cardClassName="detail-title-modal"
      >
        <div className="modal-header">
          <AppIcon name="edit" title="Title" size={16} />
          <p className="modal-subtitle">
            Update the title or correct the canonical work ID.
          </p>
        </div>

        <div className="detail-title-modal__fields">
          <label className="detail-title-modal__field">
            <span className="detail-title-modal__label">Work ID</span>
            <input
              type="text"
              value={workIdDraft}
              onChange={(event) => setWorkIdDraft(event.target.value)}
              className="modal-input detail-title-modal__input detail-title-modal__input--id"
              placeholder="Enter work ID"
              autoFocus
              spellCheck={false}
              autoCapitalize="none"
              autoCorrect="off"
            />
          </label>

          <label className="detail-title-modal__field">
            <span className="detail-title-modal__label">Title</span>
            <input
              type="text"
              value={titleDraft}
              onChange={(event) => setTitleDraft(event.target.value)}
              className="modal-input detail-title-modal__input"
              placeholder="Enter title"
            />
          </label>
        </div>

        <div className="modal-actions">
          <button
            type="button"
            onClick={closeTitleModal}
            className="modal-btn modal-btn--cancel"
            disabled={isSavingTitle}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => {
              void handleSaveTitle();
            }}
            className="modal-btn modal-btn--primary"
            disabled={isSavingTitle}
          >
            {isSavingTitle ? "Saving..." : "Save"}
          </button>
        </div>
      </Modal>

      <Modal
        isOpen={isAdmin && isPageCountModalOpen}
        onClose={closePageCountModal}
        cardClassName="detail-page-count-modal"
      >
        <div className="modal-header">
          <AppIcon name="edit" title="Page count" size={16} />
          <p className="modal-subtitle">Page count</p>
        </div>

        <label className="detail-page-count-modal__field">
          <div className="detail-page-count-stepper">
            <button
              type="button"
              className="detail-page-count-stepper__button"
              onClick={() => handleAdjustPageCount(-1)}
              aria-label="Decrease page count"
            >
              <span
                className="detail-page-count-stepper__symbol"
                aria-hidden="true"
              >
                -
              </span>
            </button>
            <input
              type="number"
              min="0"
              step="1"
              inputMode="numeric"
              value={pageCountDraft}
              onChange={(event) => setPageCountDraft(event.target.value)}
              className="modal-input detail-page-count-stepper__input"
              placeholder="Enter page count"
              autoFocus
            />
            <button
              type="button"
              className="detail-page-count-stepper__button"
              onClick={() => handleAdjustPageCount(1)}
              aria-label="Increase page count"
            >
              <AppIcon
                name="close"
                size={12}
                title="Increase page count"
                style={{ transform: "rotate(45deg)" }}
              />
            </button>
          </div>
        </label>

        <div className="modal-actions">
          <button
            type="button"
            onClick={closePageCountModal}
            className="modal-btn modal-btn--cancel"
            disabled={isSavingPageCount}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSavePageCount}
            className="modal-btn modal-btn--primary"
            disabled={isSavingPageCount}
          >
            {isSavingPageCount ? "Saving..." : "Save"}
          </button>
        </div>
      </Modal>
    </div>
  );
}
