import type React from "react";

import eyeIcon from "../../assets/imgs/eye.svg";
import eyeFilledIcon from "../../assets/imgs/eye-filled.svg";
import heartIcon from "../../assets/imgs/heart.svg";
import heartFilledIcon from "../../assets/imgs/heart-filled.svg";
import clockIcon from "../../assets/imgs/clock.svg";
import clockFilledIcon from "../../assets/imgs/clock-filled.svg";
import starIcon from "../../assets/imgs/star.svg";
import starHalfIcon from "../../assets/imgs/star-half.svg";
import starFilledIcon from "../../assets/imgs/star-filled.svg";

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
  onStarMouseMove: (
    e: React.MouseEvent<HTMLImageElement>,
    starIndex: number,
  ) => void;
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
            className="detail-action-icon-col"
            onClick={() => onToggleAction("read")}
          >
            <img
              src={read ? eyeFilledIcon : eyeIcon}
              alt="Read"
              className="detail-action-icon"
            />
            <span className="detail-action-label">Read</span>
          </div>
          <div
            className="detail-action-icon-col"
            onClick={() => onToggleAction("liked")}
          >
            <img
              src={liked ? heartFilledIcon : heartIcon}
              alt="Like"
              className="detail-action-icon"
            />
            <span className="detail-action-label">{liked ? "Liked" : "Like"}</span>
          </div>
          <div
            className="detail-action-icon-col"
            onClick={() => onToggleAction("shelved")}
          >
            <img
              src={shelved ? clockFilledIcon : clockIcon}
              alt="Shelve"
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
              let iconSrc = starIcon;
              if (displayRating >= starIndex * 2) {
                iconSrc = starFilledIcon;
              } else if (displayRating === starIndex * 2 - 1) {
                iconSrc = starHalfIcon;
              }

              const isActive = displayRating >= starIndex * 2 - 1;

              return (
                <img
                  key={starIndex}
                  src={iconSrc}
                  alt={`${starIndex} Star`}
                  className={`detail-star-icon ${isActive ? "detail-star-icon--active" : "detail-star-icon--inactive"}`}
                  onMouseMove={(e) => onStarMouseMove(e, starIndex)}
                  onClick={onStarClick}
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
