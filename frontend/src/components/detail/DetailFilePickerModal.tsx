import { AnimatePresence, motion } from "framer-motion";

export interface DetailFilePickerOption {
  url: string;
  label: string;
}

interface DetailFilePickerModalProps {
  isOpen: boolean;
  options: DetailFilePickerOption[];
  onSelect: (option: DetailFilePickerOption) => void;
  onClose: () => void;
}

export function DetailFilePickerModal({
  isOpen,
  options,
  onSelect,
  onClose,
}: DetailFilePickerModalProps) {
  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="file-picker-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <motion.div
            className="file-picker-card"
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
          >
            <h3>Choose a version</h3>
            <div className="file-picker-list">
              {options.map((option) => (
                <button
                  key={option.url}
                  type="button"
                  className="file-picker-option"
                  onClick={() => onSelect(option)}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <button
              type="button"
              className="file-picker-close"
              onClick={onClose}
            >
              Cancel
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
