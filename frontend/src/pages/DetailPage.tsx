import { useRef, useState } from "react";
import { useLocation, useParams, Link } from "react-router-dom";
import { motion } from "framer-motion";
import Masonry from "react-masonry-css";
import type { Work } from "../types";

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
import { useAuth } from "../components/AuthContext";
import { useDetailPage } from "../hooks/useDetailPage";
import { uploadWorkCover } from "../services/detailPageService";

import noCover from "../assets/imgs/no_cover.png";

import "./DetailPage.css";

interface Props {
  workId: string;
  initialWork?: Work;
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
  const [isUploadingCover, setIsUploadingCover] = useState(false);
  const [coverUploadError, setCoverUploadError] = useState<string | null>(null);
  const isAdmin = user?.role === "admin";

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
    } finally {
      setIsUploadingCover(false);
    }
  };

  if (loading || !work) return null;

  const canUseDropbox = Boolean(work.dropbox_link) || isAdmin;
  const canUseFinder = Boolean(work.file_urls?.length) || isAdmin;

  return (
    <div className="detail-page">
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

                  {work.authors.map((author) => (
                    <Link
                      key={author}
                      to={`/collection/${encodeURIComponent(author)}`}
                      className="pill-button detail-author-pill"
                    >
                      {author}
                    </Link>
                  ))}

                  {work.tags.map((tag) => (
                    <Link
                      key={tag}
                      to={`/search?q=${encodeURIComponent(tag)}`}
                      className="pill-button detail-tag-pill"
                    >
                      {tag}
                    </Link>
                  ))}

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
    </div>
  );
}
