import React, { useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import finderIcon from "../../assets/imgs/finder.png";

interface DetailFileUploadModalProps {
  isOpen: boolean;
  isUploading: boolean;
  error?: string | null;
  onUpload: (file: File) => void;
  onClose: () => void;
}

export function DetailFileUploadModal({
  isOpen,
  isUploading,
  error,
  onUpload,
  onClose,
}: DetailFileUploadModalProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] || null;
    setSelectedFile(file);
  };

  const handleClose = () => {
    setSelectedFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
    onClose();
  };

  const handleUpload = () => {
    if (!selectedFile) return;
    onUpload(selectedFile);
  };

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
            transition={{ type: "spring", stiffness: 150, damping: 22 }}
          >
            <div className="detail-inline-modal-header">
              <img src={finderIcon} alt="Finder icon" width={20} />
              <p className="detail-inline-modal-subtitle">
                Upload a PDF to our server.
              </p>
            </div>

            <div className="detail-upload-file-row">
              <button
                type="button"
                className="detail-btn detail-btn--outline"
                onClick={() => fileInputRef.current?.click()}
              >
                {selectedFile ? "Change file" : "Choose PDF"}
              </button>
              <span className="detail-upload-file-label">
                {selectedFile?.name ?? "No file selected"}
              </span>
            </div>

            {error && <p className="detail-inline-modal-error">{error}</p>}

            <div className="detail-inline-modal-actions">
              <button
                type="button"
                className="detail-btn detail-btn-inverse--cancel"
                onClick={handleClose}
                disabled={isUploading}
              >
                Cancel
              </button>
              <button
                type="button"
                className="detail-btn detail-btn-inverse--save"
                onClick={handleUpload}
                disabled={!selectedFile || isUploading}
              >
                {isUploading ? "Uploading..." : "Upload"}
              </button>
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept="application/pdf"
              hidden
              onChange={handleFileChange}
            />
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
