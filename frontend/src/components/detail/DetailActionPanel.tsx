import React, { useRef, useState } from "react";
import { AppIcon } from "../AppIcon";
import { showToast } from "../../utils/toast";
import { uploadWorkCover } from "../../services/detailPageService";

export type DetailActionType = "read" | "liked" | "shelved";

interface DetailActionPanelProps {
  workId: string;
  coverImageUrl: string | null | undefined;
  isAdmin: boolean;
  onCoverUploadSuccess: () => Promise<void>;
  read: boolean;
  liked: boolean;
  shelved: boolean;
  displayRating: number;
  isPDFViewerOpen: boolean;
  isActionDrawerOpen: boolean;
  isReadingFocusEnabled: boolean;
  progressContent: React.ReactNode;
  onToggleDrawer: () => void;
  onToggleAction: (action: DetailActionType) => void;
  onResetHoverRating: () => void;
  onStarMouseMove: (e: React.MouseEvent<Element>, starIndex: number) => void;
  onStarClick: () => void;
  onOpenProgressModal: () => void;
  onOpenReadingFocusModal: () => void;
  onClosePDFViewer: () => void;
  onReportIssue: () => void;
  isReportingPdfIssue: boolean;
}

export function DetailActionPanel({
  workId,
  coverImageUrl,
  isAdmin,
  onCoverUploadSuccess,
  read,
  liked,
  shelved,
  displayRating,
  isPDFViewerOpen,
  isActionDrawerOpen,
  isReadingFocusEnabled,
  progressContent,
  onToggleDrawer,
  onToggleAction,
  onResetHoverRating,
  onStarMouseMove,
  onStarClick,
  onOpenProgressModal,
  onOpenReadingFocusModal,
  onClosePDFViewer,
  onReportIssue,
  isReportingPdfIssue,
}: DetailActionPanelProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    try {
      await uploadWorkCover(workId, file);
      showToast("Cover updated.", { tone: "success" });
      await onCoverUploadSuccess();
    } catch (error) {
      showToast(
        error instanceof Error ? error.message : "Failed to upload cover.",
        { tone: "error" },
      );
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  return (
    <aside
      className={`detail-action-panel ${isActionDrawerOpen ? "drawer-open" : "drawer-closed"}`}
    >
      <button
        className="detail-action-drawer-handle"
        onClick={onToggleDrawer}
        aria-expanded={isActionDrawerOpen}
      >
        <span className="drawer-handle-arrow">
          {isActionDrawerOpen ? "▶" : "◀"}
        </span>
        <span>Menu</span>
      </button>

      <div className="detail-action-main-content">
        {coverImageUrl ? (
          <img
            src={coverImageUrl}
            alt={"cover"}
            className="detail-action-cover"
          />
        ) : isAdmin ? (
          <div className="detail-action-row">
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              accept="image/png"
              hidden
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              className="detail-action-button"
              disabled={isUploading}
            >
              <AppIcon name="edit" size={16} />
              <span className="detail-action-label">
                {isUploading ? "Uploading..." : "Upload cover..."}
              </span>
            </button>
          </div>
        ) : null}

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
