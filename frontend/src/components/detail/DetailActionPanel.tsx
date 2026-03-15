import type React from "react";
import { AppIcon } from "../AppIcon";

export type DetailActionType = "read" | "liked" | "shelved";

interface DetailActionPanelProps {
  read: boolean;
  liked: boolean;
  shelved: boolean;
  displayRating: number;
  isPDFViewerOpen: boolean;
  isActionDrawerOpen: boolean;
  progressContent: React.ReactNode;
  onToggleDrawer: () => void;
  onToggleAction: (action: DetailActionType) => void;
  onResetHoverRating: () => void;
  onStarMouseMove: (e: React.MouseEvent<Element>, starIndex: number) => void;
  onStarClick: () => void;
  onOpenQuoteModal: () => void;
  onOpenProgressModal: () => void;
  onClosePDFViewer: () => void;
}

export function DetailActionPanel({
  read,
  liked,
  shelved,
  displayRating,
  isPDFViewerOpen,
  isActionDrawerOpen,
  progressContent,
  onToggleDrawer,
  onToggleAction,
  onResetHoverRating,
  onStarMouseMove,
  onStarClick,
  onOpenQuoteModal,
  onOpenProgressModal,
  onClosePDFViewer,
}: DetailActionPanelProps) {
  return (
    <aside
      className={`detail-right-col ${isActionDrawerOpen ? "drawer-open" : "drawer-closed"}`}
    >
      <button className="drawer-handle" onClick={onToggleDrawer}>
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
            <span className="detail-action-label">{liked ? "Liked" : "Like"}</span>
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
