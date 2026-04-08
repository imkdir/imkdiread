import type React from "react";
import { AnimatePresence, motion } from "framer-motion";

export interface DetailProgressEdtingForm {
  pageNumber: string;
  note: string;
}

interface Props {
  isOpen: boolean;
  isSaving: boolean;
  editingForm: DetailProgressEdtingForm;
  pageCount?: number;
  onClose: () => void;
  onSubmit: (e: React.FormEvent) => void;
  onInputChange: (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => void;
  onProgressFinished: () => void;
}

export function DetailProgressModal({
  isOpen,
  isSaving,
  editingForm,
  pageCount,
  onClose,
  onSubmit,
  onInputChange,
  onProgressFinished,
}: Props) {
  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="modal-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <div className="detail-progress-modal-shell">
            <motion.div
              className="detail-progress-modal-panel"
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
              <form onSubmit={onSubmit} className="detail-progress-form">
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

                <textarea
                  name="note"
                  value={editingForm.note}
                  onChange={onInputChange}
                  className="detail-input detail-input--quote"
                  placeholder={"Type your notes here..."}
                />

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
                    {isSaving ? "Saving..." : "Update"}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
