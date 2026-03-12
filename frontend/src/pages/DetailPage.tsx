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
import { useDetailPage } from "../hooks/useDetailPage";

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
  const detail = useDetailPage({ workId, initialWork });

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
    hasLocalFiles,
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
  } = detail;

  if (loading || !work) return null;

  return (
    <div className="detail-page">
      <div className="detail-split-view-container">
        <div className="detail-main-content-pane">
          <div
            className={`detail-content-wrapper ${isPDFViewerOpen ? "pdf-open-wrap" : ""}`}
          >
            <aside className="detail-left-col">
              <motion.img
                layoutId={`work-cover-${work.id}`}
                src={work.cover_img_url as string}
                alt={work.id}
                className="work-cover-img"
                transition={{ type: "spring", stiffness: 300, damping: 30 }}
              />
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
                  {work.goodreads_id && (
                    <GoodreadsButton
                      category="book"
                      goodreadsId={work.goodreads_id}
                    />
                  )}

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

                  {hasLocalFiles && (
                    <FinderButton onClick={handleFinderButtonClick} />
                  )}

                  {work.dropbox_link && (
                    <DropboxButton onClick={() => togglePDFViewer("dropbox")} />
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
    </div>
  );
}
