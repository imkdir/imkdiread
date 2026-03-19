import type React from "react";
import { AppIcon } from "../AppIcon";

export type DetailActionType = "read" | "liked" | "shelved";

interface DetailActionPanelProps {
  read: boolean;
  liked: boolean;
  shelved: boolean;
  displayRating: number;
  isPDFViewerOpen: boolean;
  isDrawerMode: boolean;
  isActionDrawerOpen: boolean;
  isReadingFocusEnabled: boolean;
  progressContent: React.ReactNode;
  onToggleDrawer: () => void;
  onToggleAction: (action: DetailActionType) => void;
  onResetHoverRating: () => void;
  onStarMouseMove: (e: React.MouseEvent<Element>, starIndex: number) => void;
  onStarClick: () => void;
  onOpenQuoteModal: () => void;
  onOpenProgressModal: () => void;
  onOpenReadingFocusModal: () => void;
  onClosePDFViewer: () => void;
  onReportIssue: () => void;
  isReportingPdfIssue: boolean;
}

export function DetailActionPanel({
  read,
  liked,
  shelved,
  displayRating,
  isPDFViewerOpen,
  isDrawerMode,
  isActionDrawerOpen,
  isReadingFocusEnabled,
  progressContent,
  onToggleDrawer,
  onToggleAction,
  onResetHoverRating,
  onStarMouseMove,
  onStarClick,
  onOpenQuoteModal,
  onOpenProgressModal,
  onOpenReadingFocusModal,
  onClosePDFViewer,
  onReportIssue,
  isReportingPdfIssue,
}: DetailActionPanelProps) {
  return (
    <aside
      className={`detail-right-col ${isDrawerMode ? "detail-right-col--drawer-mode" : ""} ${isActionDrawerOpen ? "drawer-open" : "drawer-closed"}`}
    >
      <button
        className="drawer-handle"
        onClick={onToggleDrawer}
        aria-expanded={isActionDrawerOpen}
      >
        <span className="drawer-handle-arrow">
          {isActionDrawerOpen ? "▶" : "◀"}
        </span>
        <span>Menu</span>
      </button>

      <div className="detail-action-panel">
        <div className="detail-action-icons-row">
          <div
            className={`detail-action-icon-col ${read ? "detail-action-icon-col--read-active" : ""}`}
            onClick={() => onToggleAction("read")}
          >
            <AppIcon
              name={read ? "eye-filled" : "eye"}
              className="detail-action-icon"
            />
            <span className="detail-action-label">Read</span>
          </div>
          <div
            className={`detail-action-icon-col ${liked ? "detail-action-icon-col--liked-active" : ""}`}
            onClick={() => onToggleAction("liked")}
          >
            <AppIcon
              name={liked ? "heart-filled" : "heart"}
              className="detail-action-icon"
            />
            <span className="detail-action-label">
              {liked ? "Liked" : "Like"}
            </span>
          </div>
          <div
            className={`detail-action-icon-col ${shelved ? "detail-action-icon-col--shelved-active" : ""}`}
            onClick={() => onToggleAction("shelved")}
          >
            <AppIcon
              name={shelved ? "clock-filled" : "clock"}
              className="detail-action-icon"
            />
            <span className="detail-action-label">
              {shelved ? "Shelved" : "Shelve"}
            </span>
          </div>
        </div>

        <hr className="detail-divider" />

        <div className="detail-rating-section">
          <span className="detail-action-label">Rate</span>
          <div className="detail-stars-row" onMouseLeave={onResetHoverRating}>
            {[1, 2, 3, 4, 5].map((starIndex) => {
              let variant: "outline" | "half" | "filled" = "outline";
              if (displayRating >= starIndex * 2) {
                variant = "filled";
              } else if (displayRating === starIndex * 2 - 1) {
                variant = "half";
              }

              const isActive = displayRating >= starIndex * 2 - 1;

              return (
                <AppIcon
                  key={starIndex}
                  name={
                    variant === "filled"
                      ? "star-filled"
                      : variant === "half"
                        ? "star-half"
                        : "star"
                  }
                  className={`detail-star-icon ${isActive ? "detail-star-icon--active" : "detail-star-icon--inactive"}`}
                  onMouseMove={(e) => onStarMouseMove(e, starIndex)}
                  onClick={onStarClick}
                  aria-label={`${starIndex} Star`}
                />
              );
            })}
          </div>
        </div>

        <hr className="detail-divider" />

        <div className="detail-action-row">
          <button onClick={onOpenQuoteModal} className="detail-action-button">
            <span className="detail-action-label">Add quotes...</span>
          </button>
        </div>

        <hr className="detail-divider" />

        <div className="detail-action-row">
          {progressContent}
          <button
            onClick={onOpenProgressModal}
            className="detail-action-button"
          >
            <span className="detail-action-label">Update progress</span>
          </button>
        </div>

        {isPDFViewerOpen && (
          <>
            <hr className="detail-divider" />
            <div className="detail-action-row">
              <button
                onClick={onOpenReadingFocusModal}
                className="detail-action-button detail-action-button--with-icon"
              >
                <span className="detail-action-button__content">
                  <span className="detail-action-label">
                    {`Reading Focus ${isReadingFocusEnabled ? "On" : "Off"} `}
                  </span>
                </span>
              </button>
            </div>
            <hr className="detail-divider" />
            <div className="detail-action-row">
              <button
                onClick={onReportIssue}
                className="detail-action-button"
                disabled={isReportingPdfIssue}
              >
                <span className="detail-action-label">
                  {isReportingPdfIssue
                    ? "Reporting issue..."
                    : "Report issues..."}
                </span>
              </button>
            </div>
            <hr className="detail-divider" />
            <div className="detail-action-row">
              <button
                onClick={onClosePDFViewer}
                className="detail-action-button"
              >
                <span className="detail-action-label">Exit PDF Viewer</span>
              </button>
            </div>
          </>
        )}
      </div>
    </aside>
  );
}
