import { useEffect, useRef, useState } from "react";
import { useLocation, useParams, Link } from "react-router-dom";
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
import { DetailFilePickerModal } from "../components/detail/DetailFilePickerModal";
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
  const detail = useDetailPage({ workId, initialWork });
  const coverInputRef = useRef<HTMLInputElement | null>(null);
  const authorDropdownRef = useRef<HTMLDivElement | null>(null);
  const tagDropdownRef = useRef<HTMLDivElement | null>(null);
  const [isUploadingCover, setIsUploadingCover] = useState(false);
  const [coverUploadError, setCoverUploadError] = useState<string | null>(null);
  const [isAuthorsModalOpen, setIsAuthorsModalOpen] = useState(false);
  const [isAuthorDropdownOpen, setIsAuthorDropdownOpen] = useState(false);
  const [isTagsModalOpen, setIsTagsModalOpen] = useState(false);
  const [isTagDropdownOpen, setIsTagDropdownOpen] = useState(false);
  const [isPageCountModalOpen, setIsPageCountModalOpen] = useState(false);
  const [pageCountDraft, setPageCountDraft] = useState("");
  const [authorDrafts, setAuthorDrafts] = useState<AuthorDraft[]>([]);
  const [tagDrafts, setTagDrafts] = useState<TagDraft[]>([]);
  const [editingAuthorId, setEditingAuthorId] = useState<string | null>(null);
  const [editingTagId, setEditingTagId] = useState<string | null>(null);
  const [isSavingAuthors, setIsSavingAuthors] = useState(false);
  const [isSavingTags, setIsSavingTags] = useState(false);
  const [isSavingPageCount, setIsSavingPageCount] = useState(false);
  const isAdmin = user?.role === "admin";

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
    isFilePickerOpen,
    filePickerOptions,
    isActionDrawerOpen,
    isExplaining,
    displayRating,
    displayQuotes,
    fetchData,
    toggleActionDrawer,
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
    handleFilePickerSelect,
    closeFilePicker,
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

  useEffect(() => {
    if (!work) return;
    setAuthorDrafts(buildAuthorDrafts(work.authors || []));
    setEditingAuthorId(null);
    setIsAuthorDropdownOpen(false);
    setTagDrafts(buildTagDrafts(work.tags || []));
    setEditingTagId(null);
    setIsTagDropdownOpen(false);
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
    setAuthorDrafts((prev) =>
      prev.filter((author) => author.id !== authorId),
    );
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
    const normalizedTags = tagDrafts
      .map(normalizeTagValue)
      .filter(Boolean);
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

  if (loading || !work) return null;

  const canUseDropbox = Boolean(work.dropbox_link) || isAdmin;
  const canUseFinder = Boolean(work.file_urls?.length) || isAdmin;
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
                  transition={{ type: "spring", stiffness: 300, damping: 30 }}
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
                        <img
                          src={noCover}
                          alt={work.id}
                          className="goodreads-cover"
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
                    <img
                      src={noCover}
                      alt={work.id}
                      className="goodreads-cover"
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
                  {work.title || "Untitled Work"}
                </h1>

                <div className="detail-metadata">
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
                              <AppIcon name="edit" title="Edit authors" size={13} />
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
                          <AppIcon name="edit" title="Edit page count" size={13} />
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
                              <AppIcon name="edit" title="Edit tags" size={13} />
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

                  {canUseFinder && (
                    <FinderButton onClick={handleFinderButtonClick} />
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
              isActionDrawerOpen={isActionDrawerOpen}
              progressContent={<ProgressBar work={work} />}
              onToggleDrawer={toggleActionDrawer}
              onToggleAction={toggleAction}
              onResetHoverRating={() => setHoverRating(0)}
              onStarMouseMove={handleStarMouseMove}
              onStarClick={handleStarClick}
              onOpenQuoteModal={() => openEditFormModal("quote")}
              onOpenProgressModal={() => openEditFormModal("progress")}
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
            <div className="detail-pdf-frame-wrapper">
              <iframe
                src={viewerInitialUrl as string}
                width="100%"
                height="100%"
                className="detail-pdf-iframe"
              />
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

      <DetailFilePickerModal
        isOpen={isFilePickerOpen}
        options={filePickerOptions}
        onSelect={handleFilePickerSelect}
        onClose={closeFilePicker}
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
        isOpen={isAdmin && isAuthorsModalOpen}
        onClose={closeAuthorsModal}
        cardClassName="modal-card--wide detail-authors-modal"
      >
        <div className="modal-header">
          <AppIcon name="users" title="Authors" size={16} />
          <p className="modal-subtitle">Edit this work&apos;s authors</p>
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
          <p className="modal-subtitle">
            Edit this work's tags
          </p>
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
        isOpen={isAdmin && isPageCountModalOpen}
        onClose={closePageCountModal}
        cardClassName="detail-page-count-modal"
      >
        <div className="modal-header">
          <AppIcon name="pdf" title="Page count" size={16} />
          <p className="modal-subtitle">Update this work&apos;s page count</p>
        </div>

        <label className="detail-page-count-modal__field">
          <span className="detail-page-count-modal__label">Pages</span>
          <input
            type="number"
            min="0"
            step="1"
            inputMode="numeric"
            value={pageCountDraft}
            onChange={(event) => setPageCountDraft(event.target.value)}
            className="modal-input"
            placeholder="Enter page count"
            autoFocus
          />
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
