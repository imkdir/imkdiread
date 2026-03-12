import type React from "react";
import { AnimatePresence, motion } from "framer-motion";

import geminiIcon from "../../assets/imgs/gemini.svg";

export type DetailEditTarget = "quote" | "progress";

export interface DetailEditingForm {
  target: DetailEditTarget;
  quote: string;
  pageNumber: string;
  explanation: string;
}

interface DetailQuoteModalProps {
  isOpen: boolean;
  isSaving: boolean;
  isExplaining: boolean;
  editingForm: DetailEditingForm;
  pageCount?: number;
  onClose: () => void;
  onSubmit: (e: React.FormEvent) => void;
  onInputChange: (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => void;
  onProgressFinished: () => void;
  onExplainPassage: (e: React.MouseEvent) => void;
}

export function DetailQuoteModal({
  isOpen,
  isSaving,
  isExplaining,
  editingForm,
  pageCount,
  onClose,
  onSubmit,
  onInputChange,
  onProgressFinished,
  onExplainPassage,
}: DetailQuoteModalProps) {
  const isEditProgress = editingForm.target === "progress";

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="detail-modal-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <div className="detail-quote-modal-shell">
            <motion.div
              className="quote-card-flipper detail-quote-modal-flipper"
              initial={{ scale: 0.8, rotateY: 180, y: 50 }}
              animate={{ scale: 1, rotateY: isSaving ? 0 : 180, y: 0 }}
              exit={
                isSaving
                  ? { scale: 0.3, y: 400, opacity: 0 }
                  : { scale: 0.9, opacity: 0, transition: { duration: 0.2 } }
              }
              transition={{
                type: "spring",
                stiffness: 90,
                damping: 15,
                mass: 1.2,
              }}
            >
              <div
                className={`quote-face-front detail-modal-quote-face ${isSaving ? "detail-modal-quote-face--relative" : "detail-modal-quote-face--absolute"}`}
              >
                <blockquote className="quote-text">{editingForm.quote}</blockquote>
                {editingForm.pageNumber && (
                  <div className="quote-meta">
                    <span className="quote-number">P{editingForm.pageNumber}</span>
                  </div>
                )}
              </div>

              <div
                className={`quote-face-back detail-modal-quote-face ${isSaving ? "detail-modal-quote-face--absolute" : "detail-modal-quote-face--relative"}`}
              >
                <form onSubmit={onSubmit} className="detail-quote-form">
                  {isEditProgress ? (
                    <div className="detail-progress-header">
                      <div className="detail-progress-inline">
                        <label className="detail-secondary-label">
                          Currently on
                        </label>

                        <input
                          name="pageNumber"
                          required
                          value={editingForm.pageNumber}
                          placeholder="p."
                          onChange={onInputChange}
                          className="detail-input detail-input--page-inline"
                          autoFocus
                        />

                        <label className="detail-secondary-label">
                          {`of ${pageCount ?? "-"}`}
                        </label>
                      </div>
                      <button
                        type="button"
                        className="detail-finished-btn"
                        onClick={onProgressFinished}
                      >
                        I'm finished!
                      </button>
                    </div>
                  ) : (
                    <h3 className="detail-modal-title">Add Quote</h3>
                  )}

                  <textarea
                    name="quote"
                    value={editingForm.quote}
                    onChange={onInputChange}
                    className="detail-input detail-input--quote"
                    placeholder={
                      isEditProgress
                        ? "Type your notes here..."
                        : "Paste your quote here..."
                    }
                    autoFocus={!isEditProgress}
                    required={!isEditProgress}
                  />

                  {!isEditProgress && (
                    <div className="detail-explain-row">
                      <button
                        type="button"
                        onClick={onExplainPassage}
                        disabled={isExplaining || !editingForm.quote}
                        className="detail-explain-btn"
                      >
                        <img src={geminiIcon} alt="Gemini" width="14" height="14" />
                        {isExplaining
                          ? "Thinking..."
                          : editingForm.explanation
                            ? "Regenerate Explanation"
                            : "Explain Passage"}
                      </button>
                    </div>
                  )}

                  {editingForm.explanation && (
                    <div className="detail-explanation-panel">
                      <label className="detail-label detail-label--explanation">
                        Gemini says:
                      </label>

                      <div className="detail-explanation-scroll">
                        <p className="detail-explanation-text">
                          {editingForm.explanation}
                        </p>
                      </div>
                    </div>
                  )}

                  <div className="detail-quote-meta-row">
                    {!isEditProgress && (
                      <div className="detail-page-field">
                        <label className="detail-label">Pg.</label>
                        <input
                          name="pageNumber"
                          value={editingForm.pageNumber}
                          onChange={onInputChange}
                          className="detail-input detail-input--page"
                        />
                      </div>
                    )}
                  </div>

                  <div className="detail-form-actions">
                    <button
                      type="button"
                      onClick={onClose}
                      className="detail-btn detail-btn--cancel"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={isSaving}
                      className="detail-btn detail-btn--save"
                    >
                      {isSaving ? "Saving..." : isEditProgress ? "Update" : "Add"}
                    </button>
                  </div>
                </form>
              </div>
            </motion.div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
