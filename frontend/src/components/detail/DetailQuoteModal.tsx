import type React from "react";
import { AnimatePresence, motion } from "framer-motion";
import "../QuoteCard.css";

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
  editingForm: DetailEditingForm;
  pageCount?: number;
  onClose: () => void;
  onSubmit: (e: React.FormEvent) => void;
  onInputChange: (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => void;
  onProgressFinished: () => void;
}

export function DetailQuoteModal({
  isOpen,
  isSaving,
  editingForm,
  pageCount,
  onClose,
  onSubmit,
  onInputChange,
  onProgressFinished,
}: DetailQuoteModalProps) {
  const isEditProgress = editingForm.target === "progress";

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="modal-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <div
            className={`detail-quote-modal-shell ${isEditProgress ? "detail-quote-modal-shell--progress" : "detail-quote-modal-shell--quote"}`}
          >
            <motion.div
              className="detail-quote-modal-panel detail-modal-quote-face detail-modal-quote-face--relative"
              initial={{ scale: 0.92, y: 24, opacity: 0 }}
              animate={{ scale: 1, y: 0, opacity: 1 }}
              exit={{ scale: 0.96, y: 12, opacity: 0 }}
              transition={{
                type: "spring",
                stiffness: 180,
                damping: 22,
                mass: 0.9,
              }}
            >
              <div className="detail-modal-quote-face detail-modal-quote-face--relative">
                <form
                  onSubmit={onSubmit}
                  className={`detail-quote-form${isEditProgress ? " detail-quote-form--progress" : ""}`}
                >
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

                  {editingForm.explanation && (
                    <div className="detail-explanation-panel">
                      <p className="detail-explanation-text">
                        {editingForm.explanation}
                      </p>
                    </div>
                  )}

                  <div className="detail-quote-meta-row">
                    {!isEditProgress && (
                      <>
                        <div className="detail-page-field">
                          <label className="detail-label">Pg.</label>
                          <input
                            name="pageNumber"
                            value={editingForm.pageNumber}
                            onChange={onInputChange}
                            className="detail-input detail-input--page"
                          />
                        </div>
                      </>
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
                      {isSaving
                        ? "Saving..."
                        : isEditProgress
                          ? "Update"
                          : "Add"}
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
