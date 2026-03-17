import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate, useParams, Link } from "react-router-dom";
import { motion } from "framer-motion";
import Masonry from "react-masonry-css";
import type { Work } from "../types";

import { AppIcon } from "../components/AppIcon";
import { GoodreadsButton } from "../components/GoodreadsButton";
import { DropboxButton } from "../components/DropboxButton";
import { ProgressBar } from "../components/ProgressBar";
import { KindleButton } from "../components/KindleButton";
import { QuoteCard } from "../components/QuoteCard";
import { FinderButton } from "../components/FinderButton";
import { DetailActionPanel } from "../components/detail/DetailActionPanel";
import { DetailQuoteModal } from "../components/detail/DetailQuoteModal";
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
  toolbarHeight: number;
  focusHeight: number;
}

const READING_FOCUS_STORAGE_KEY = "detail-reading-focus-settings";
const DEFAULT_READING_FOCUS_SETTINGS: ReadingFocusSettings = {
  enabled: false,
  maskColor: "#000000",
  maskOpacity: 0.72,
  toolbarHeight: 56,
  focusHeight: 180,
};

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

  return {
    enabled: settings.enabled,
    maskColor: normalizedColor,
    maskOpacity: clampNumber(settings.maskOpacity, 0, 1),
    toolbarHeight: clampNumber(Math.round(settings.toolbarHeight), 0, 320),
    focusHeight: clampNumber(Math.round(settings.focusHeight), 40, 520),
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

export function DetailPageWrapper() {
  const { id } = useParams<{ id: string }>();
  const location = useLocation();
  const initialWork = location.state?.work as Work | undefined;

  return <DetailPage workId={id || ""} initialWork={initialWork} />;
}

function DetailPage({ workId, initialWork }: Props) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const detail = useDetailPage({ workId, initialWork });
  const coverInputRef = useRef<HTMLInputElement | null>(null);
  const pdfFrameWrapperRef = useRef<HTMLDivElement | null>(null);
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
  const [workIdDraft, setWorkIdDraft] = useState("");
  const [titleDraft, setTitleDraft] = useState("");
  const [pageCountDraft, setPageCountDraft] = useState("");
  const [authorDrafts, setAuthorDrafts] = useState<AuthorDraft[]>([]);
  const [tagDrafts, setTagDrafts] = useState<TagDraft[]>([]);
  const [editingAuthorId, setEditingAuthorId] = useState<string | null>(null);
  const [editingTagId, setEditingTagId] = useState<string | null>(null);
  const [isSavingAuthors, setIsSavingAuthors] = useState(false);
  const [isSavingTags, setIsSavingTags] = useState(false);
  const [isSavingTitle, setIsSavingTitle] = useState(false);
  const [isSavingPageCount, setIsSavingPageCount] = useState(false);
  const [readingFocusSettings, setReadingFocusSettings] = useState(
    loadReadingFocusSettings,
  );
  const [readingFocusDraft, setReadingFocusDraft] = useState(
    loadReadingFocusSettings,
  );
  const [pdfFrameHeight, setPdfFrameHeight] = useState(0);
  const [isNarrowActionDrawerMode, setIsNarrowActionDrawerMode] = useState(
    () => window.innerWidth < 768,
  );
  const isAdmin = user?.role === "admin";

  useEffect(() => {
    const mediaQuery = window.matchMedia("(max-width: 768px)");

    const updateMatches = () => {
      setIsNarrowActionDrawerMode(mediaQuery.matches);
    };

    updateMatches();
    mediaQuery.addEventListener("change", updateMatches);

    return () => mediaQuery.removeEventListener("change", updateMatches);
  }, []);

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
    read,
    liked,
    shelved,
    isAddQuoteModalOpen,
    editingForm,
    isSavingQuote,
    isPDFViewerOpen,
    viewerInitialUrl,
    isFinderDropdownOpen,
    finderFiles,
    isActionDrawerOpen,
    isExplaining,
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
    handleQuoteInputChange,
    handleAddQuote,
    handleProgressFinished,
    closeAddQuoteModal,
    handleExplainPassage,
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
    closeUploadModal,
    handleWorkFileUpload,
  } = detail;
  const isActionPanelDrawerMode = isPDFViewerOpen || isNarrowActionDrawerMode;
  const readingFocusOverlayColor = hexToRgba(
    readingFocusSettings.maskColor,
    readingFocusSettings.maskOpacity,
  );
  const effectiveToolbarHeight = clampNumber(
    readingFocusSettings.toolbarHeight,
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
      : clampNumber(
          readingFocusSettings.focusHeight,
          Math.min(40, availableFocusHeight),
          availableFocusHeight,
        );
  const isReadingFocusVisible =
    isPDFViewerOpen &&
    readingFocusSettings.enabled &&
    pdfFrameHeight > effectiveToolbarHeight;

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

  if (loading || !work) return null;

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
        <div className="detail-main-content-pane">
          <div
            className={`detail-content-wrapper ${isPDFViewerOpen ? "pdf-open-wrap" : ""}`}
          >
            <aside className="detail-left-col">
              {work.cover_img_url ? (
                <motion.img
                  layoutId={`work-cover-${work.id}`}
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
                          layoutId={`work-cover-${work.id}`}
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
                      layoutId={`work-cover-${work.id}`}
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
              transition={{ delay: 0.4, duration: 0.5 }}
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
                        backgroundColor: "var(--detail-page-dropbox-button-bg)",
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
                      backgroundColor: "var(--detail-page-goodreads-button-bg)",
                    }}
                  />

                  {work.amazon_asin && <KindleButton asin={work.amazon_asin} />}
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
              onOpenQuoteModal={() => openEditFormModal("quote")}
              onOpenProgressModal={() => openEditFormModal("progress")}
              onOpenReadingFocusModal={openReadingFocusModal}
              onClosePDFViewer={closePDFViewer}
            />
          </div>

          {displayQuotes.length > 0 && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.4, duration: 0.8 }}
              className={`detail-quotes-section ${isPDFViewerOpen ? "detail-quotes-section--pdf-open" : ""}`}
            >
              <Masonry
                breakpointCols={
                  isPDFViewerOpen
                    ? { default: 1 }
                    : { default: 3, 1400: 2, 900: 1 }
                }
                className="my-masonry-grid"
                columnClassName="my-masonry-grid_column"
              >
                {displayQuotes.map((quote) => (
                  <QuoteCard
                    key={quote.id}
                    quote={quote}
                    onRefresh={fetchData}
                  />
                ))}
              </Masonry>
            </motion.div>
          )}
        </div>

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
                    className="detail-reading-focus-overlay__mask"
                    style={{ backgroundColor: readingFocusOverlayColor }}
                  />
                  <div
                    className="detail-reading-focus-overlay__window"
                    style={{ height: effectiveFocusHeight }}
                  />
                  <div
                    className="detail-reading-focus-overlay__mask"
                    style={{ backgroundColor: readingFocusOverlayColor }}
                  />
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      <DetailQuoteModal
        isOpen={isAddQuoteModalOpen}
        isSaving={isSavingQuote}
        isExplaining={isExplaining}
        editingForm={editingForm}
        pageCount={work.page_count}
        onClose={closeAddQuoteModal}
        onSubmit={handleAddQuote}
        onInputChange={handleQuoteInputChange}
        onProgressFinished={handleProgressFinished}
        onExplainPassage={handleExplainPassage}
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
          <label className="detail-reading-focus-field">
            <span className="detail-reading-focus-field__label">
              Mask Appearance
            </span>
            <span className="detail-reading-focus-mask-row">
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
                <span className="detail-reading-focus-field__value">
                  {readingFocusDraft.maskColor.toUpperCase()}
                </span>
              </span>
              <span className="detail-reading-focus-opacity-row">
                <span className="detail-reading-focus-opacity-label">
                  Opacity
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
                  className="detail-reading-focus-range detail-reading-focus-range--inline"
                  disabled={!readingFocusDraft.enabled}
                />
                <span className="detail-reading-focus-field__value">
                  {Math.round(readingFocusDraft.maskOpacity * 100)}%
                </span>
              </span>
            </span>
          </label>

          <label className="detail-reading-focus-field">
            <span className="detail-reading-focus-field__header">
              <span className="detail-reading-focus-field__label">
                Toolbar reserve
              </span>
              <span className="detail-reading-focus-field__value">
                {readingFocusDraft.toolbarHeight}px
              </span>
            </span>
            <input
              type="range"
              min="0"
              max="160"
              step="1"
              value={readingFocusDraft.toolbarHeight}
              onChange={(event) =>
                setReadingFocusDraft((current) => ({
                  ...current,
                  toolbarHeight: Number(event.target.value),
                }))
              }
              className="detail-reading-focus-range"
              disabled={!readingFocusDraft.enabled}
            />
          </label>

          <label className="detail-reading-focus-field">
            <span className="detail-reading-focus-field__header">
              <span className="detail-reading-focus-field__label">
                Focus window height
              </span>
              <span className="detail-reading-focus-field__value">
                {readingFocusDraft.focusHeight}px
              </span>
            </span>
            <input
              type="range"
              min="40"
              max="360"
              step="1"
              value={readingFocusDraft.focusHeight}
              onChange={(event) =>
                setReadingFocusDraft((current) => ({
                  ...current,
                  focusHeight: Number(event.target.value),
                }))
              }
              className="detail-reading-focus-range"
              disabled={!readingFocusDraft.enabled}
            />
          </label>
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
          <p className="modal-subtitle">Update the title or correct the canonical work ID.</p>
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
