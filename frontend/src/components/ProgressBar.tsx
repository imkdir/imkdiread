import React, { useRef, useState } from "react";
import type { Work } from "../types";
import "./ProgressBar.css";

interface Props {
  work: Work;
  style?: React.CSSProperties;
  isSaving?: boolean;
  onSavePage?: (pageNumber: number) => Promise<boolean>;
}

export function ProgressBar({
  work,
  style,
  isSaving = false,
  onSavePage,
}: Props) {
  const { page_count, current_page } = work;
  const [isEditing, setIsEditing] = useState(false);
  const [draftValue, setDraftValue] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);

  if (!page_count) return null;

  const resolvedCurrentPage = current_page ?? 0;
  const progress = Math.max(
    0,
    Math.min(100, (resolvedCurrentPage / page_count) * 100),
  );

  const beginEditing = () => {
    setDraftValue(String(resolvedCurrentPage));
    setIsEditing(true);

    requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });
  };

  const resetEditing = () => {
    setDraftValue("");
    setIsEditing(false);
  };

  const commitDraft = async () => {
    const trimmed = draftValue.trim();

    if (!trimmed) {
      resetEditing();
      return;
    }

    const nextPage = Number.parseInt(trimmed, 10);

    if (!Number.isInteger(nextPage) || nextPage <= 0) {
      resetEditing();
      return;
    }

    if (nextPage === resolvedCurrentPage) {
      resetEditing();
      return;
    }

    if (!onSavePage) {
      resetEditing();
      return;
    }

    const success = await onSavePage(nextPage);

    if (!success) {
      setDraftValue(String(resolvedCurrentPage));
    }

    setIsEditing(false);
  };

  const cancelEditing = () => {
    resetEditing();
  };

  return (
    <div className="progress-bar" style={style}>
      <div className="progress-bar__track">
        <div className="progress-bar__fill" style={{ width: `${progress}%` }} />
      </div>

      <div className="progress-bar__controls">
        {isEditing ? (
          <input
            ref={inputRef}
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            value={draftValue}
            disabled={isSaving}
            className="progress-bar__input"
            aria-label="Current page"
            onChange={(event) => {
              setDraftValue(event.target.value.replace(/[^\d]/g, ""));
            }}
            onBlur={() => {
              void commitDraft();
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                void commitDraft();
              } else if (event.key === "Escape") {
                event.preventDefault();
                cancelEditing();
              }
            }}
          />
        ) : (
          <button
            type="button"
            className="progress-bar__label progress-bar__label-button"
            onClick={beginEditing}
            disabled={isSaving}
            title="Edit current page"
          >
            {`${resolvedCurrentPage} / ${page_count}`}
          </button>
        )}
      </div>
    </div>
  );
}
