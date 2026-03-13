import { AnimatePresence, motion } from "framer-motion";
import { AppIcon } from "../AppIcon";

interface DetailDropboxLinkModalProps {
  isOpen: boolean;
  value: string;
  error?: string | null;
  isSaving?: boolean;
  onClose: () => void;
  onChange: (value: string) => void;
  onSubmit: () => void;
}

export function DetailDropboxLinkModal({
  isOpen,
  value,
  error,
  isSaving = false,
  onClose,
  onChange,
  onSubmit,
}: DetailDropboxLinkModalProps) {
  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="detail-modal-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <motion.div
            className="detail-inline-modal-card"
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            transition={{ type: "spring", stiffness: 150, damping: 20 }}
          >
            <div className="detail-inline-modal-header">
              <AppIcon name="dropbox" />
              <p className="detail-inline-modal-subtitle">
                Paste a Dropbox share link here
              </p>
            </div>

            <input
              type="text"
              value={value}
              onChange={(event) => onChange(event.target.value)}
              className="detail-inline-input"
              placeholder="https://www.dropbox.com/s/…?dl=0"
              autoFocus
            />

            {error && <p className="detail-inline-modal-error">{error}</p>}

            <div className="detail-inline-modal-actions">
              <button
                type="button"
                className="detail-btn detail-btn-inverse--cancel"
                onClick={onClose}
              >
                Cancel
              </button>
              <button
                type="button"
                className="detail-btn detail-btn-inverse--save"
                onClick={onSubmit}
                disabled={isSaving}
              >
                {isSaving ? "Saving..." : "Save & Open"}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
